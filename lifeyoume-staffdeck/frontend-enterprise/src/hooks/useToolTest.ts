import { useEffect, useRef, useState } from 'react';

import { api, TENANT_ID } from '../api/client';
import { getEnterpriseAuthSession } from '../auth';

const terminal = new Set([
  'completed',
  'failed',
  'cancelled',
  'expired',
  'outcome_unknown',
  'tracking_blocked',
]);

type Receipt = {
  success?: boolean;
  data?: {
    accepted?: boolean;
    detached?: boolean;
    task_id?: string;
    [key: string]: unknown;
  };
};

type Task = {
  id: string;
  status: string;
  result?: unknown;
  error?: unknown;
};

type PendingSubmission = {
  path: string;
  body: Record<string, unknown>;
};

type StoredTask = {
  taskId?: string;
  pendingSubmission?: PendingSubmission;
};

const statusLabels: Record<string, string> = {
  submitting: '正在提交',
  queued: '执行中',
  accepted: '执行中',
  working: '执行中',
  completed: '已完成',
  returned: '已返回',
  failed: '执行失败',
  cancelled: '已取消',
  expired: '已过期',
  outcome_unknown: '提交结果待核实',
  tracking_blocked: '跟踪已暂停',
};

function makeRequestId(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // HTTP origins and hardened browsers may not expose crypto.randomUUID.
  }
  return `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function storageKey(toolId: string): string {
  const userId = getEnterpriseAuthSession()?.user.id || 'anonymous';
  return `staffdeck-tool-test:${TENANT_ID}:${userId}:${toolId}`;
}

function readStoredTask(toolId: string): StoredTask {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(toolId)) || '{}') as StoredTask;
  } catch {
    return {};
  }
}

function writeStoredTask(toolId: string, value: StoredTask | null): void {
  try {
    if (value) sessionStorage.setItem(storageKey(toolId), JSON.stringify(value));
    else sessionStorage.removeItem(storageKey(toolId));
  } catch {
    // Tracking still works for this page lifetime when storage is unavailable.
  }
}

/**
 * Submit once and poll only the returned internal task ID.
 *
 * The current interface is `(toolId)` + `submit(path, arguments)`. Optional
 * arguments retain the older test surface while sharing the same recovery path.
 */
export function useToolTest(toolId: string, defaultPath?: string, pollSeconds = 2) {
  const legacyInterface = defaultPath !== undefined;
  const initial = readStoredTask(toolId);
  const [result, setResult] = useState<unknown>(null);
  const [rawStatus, setRawStatus] = useState(initial.taskId ? 'queued' : '');
  const [busy, setBusy] = useState(Boolean(initial.taskId));
  const [queryError, setQueryError] = useState('');
  const [taskId, setTaskId] = useState<string | null>(initial.taskId || null);
  const lock = useRef(Boolean(initial.taskId));
  const generation = useRef(0);
  const pollNow = useRef<null | (() => void)>(null);
  const pendingSubmission = useRef<PendingSubmission | undefined>(
    initial.pendingSubmission,
  );

  useEffect(() => {
    generation.current += 1;
    const stored = readStoredTask(toolId);
    pendingSubmission.current = stored.pendingSubmission;
    lock.current = Boolean(stored.taskId);
    setResult(null);
    setRawStatus(stored.taskId ? 'queued' : '');
    setBusy(Boolean(stored.taskId));
    setTaskId(stored.taskId || null);
    setQueryError('');
    return () => {
      generation.current += 1;
    };
  }, [toolId]);

  useEffect(() => {
    if (!taskId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const current = generation.current;
    const active = () => !disposed && current === generation.current;

    async function poll() {
      controller?.abort();
      controller = new AbortController();
      try {
        const query = new URLSearchParams({
          tenant_id: TENANT_ID,
          tool_id: toolId,
        });
        const path = `/api/enterprise/external-business-tasks/${encodeURIComponent(taskId!)}?${query}`;
        const getTask: (
          nextPath: string,
          signal?: AbortSignal,
        ) => Promise<Task> =
          api.getWithSignal ||
          ((nextPath: string) => api.get<Task>(nextPath));
        const task = await getTask(path, controller.signal);
        if (!active()) return;
        if (task.id !== taskId) {
          throw new Error('任务状态与查询回执不一致');
        }
        setResult(legacyInterface ? JSON.stringify(task.result ?? task) : task);
        setRawStatus(task.status);
        setQueryError('');
        if (terminal.has(task.status)) {
          lock.current =
            task.status === 'tracking_blocked' ||
            task.status === 'outcome_unknown';
          setBusy(lock.current);
          setTaskId(null);
          pendingSubmission.current = undefined;
          writeStoredTask(toolId, null);
          return;
        }
      } catch (error) {
        if (
          !active() ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return;
        }
        setQueryError(
          error instanceof Error ? error.message : '任务状态查询失败',
        );
      }
      if (active()) {
        timer = setTimeout(
          () => void poll(),
          Math.max(1, pollSeconds) * 1000,
        );
      }
    }

    pollNow.current = () => void poll();
    void poll();
    return () => {
      disposed = true;
      pollNow.current = null;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [legacyInterface, pollSeconds, taskId, toolId]);

  async function submit(
    pathOrArguments: string | Record<string, unknown>,
    maybeArguments?: Record<string, unknown>,
  ) {
    if (lock.current) return;
    lock.current = true;
    const current = generation.current;
    setBusy(true);
    setRawStatus('submitting');
    setQueryError('');

    const path =
      typeof pathOrArguments === 'string'
        ? pathOrArguments
        : defaultPath || '';
    const argumentsJson =
      typeof pathOrArguments === 'string'
        ? maybeArguments || {}
        : pathOrArguments;
    const stored = pendingSubmission.current;
    const submission: PendingSubmission = stored || {
      path,
      body: {
        tenant_id: TENANT_ID,
        arguments: argumentsJson,
        client_request_id: makeRequestId(),
      },
    };
    pendingSubmission.current = submission;
    writeStoredTask(toolId, { pendingSubmission: submission });

    try {
      const postTask: (
        nextPath: string,
        body: unknown,
        signal?: AbortSignal,
      ) => Promise<Receipt> =
        api.postWithSignal ||
        ((nextPath: string, body: unknown) =>
          api.post<Receipt>(nextPath, body));
      const response = await postTask(submission.path, submission.body);
      if (current !== generation.current) return;
      setResult(response);
      if (
        response.success &&
        (response.data?.accepted || response.data?.detached) &&
        response.data.task_id
      ) {
        pendingSubmission.current = undefined;
        setTaskId(response.data.task_id);
        setRawStatus('queued');
        writeStoredTask(toolId, { taskId: response.data.task_id });
      } else {
        pendingSubmission.current = undefined;
        writeStoredTask(toolId, null);
        lock.current = false;
        setBusy(false);
        setRawStatus(
          response.success === false
            ? 'failed'
            : legacyInterface
              ? 'returned'
              : 'completed',
        );
      }
    } catch (error) {
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
        setRawStatus('failed');
        setQueryError(
          error instanceof Error ? error.message : '提交结果待核实',
        );
      }
      if (!legacyInterface) throw error;
    }
  }

  function retryStatus() {
    pollNow.current?.();
  }

  const status = legacyInterface
    ? statusLabels[rawStatus] || rawStatus
    : rawStatus;
  const error = queryError
    ? `状态查询暂不可用，正在重试查询，不会重新提交：${queryError}`
    : '';

  return {
    result,
    status,
    busy,
    queryError,
    error,
    taskId,
    submit,
    retryStatus,
  };
}
