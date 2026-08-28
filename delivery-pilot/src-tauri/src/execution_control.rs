use serde::Serialize;
use std::{
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};
use tauri::State;

use crate::task_supervisor::{SupervisorEvent, SupervisorTaskView, TaskSupervisor};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionTool {
    id: &'static str,
    name: &'static str,
    kind: &'static str,
    transport: &'static str,
    status: String,
    detail: String,
    capabilities: Vec<&'static str>,
    active_runs: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionRun {
    id: String,
    tool_id: &'static str,
    tool_name: String,
    workspace_path: String,
    stage: String,
    state: String,
    health: String,
    progress_percent: u8,
    started_at_ms: u64,
    last_activity_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionEvent {
    id: String,
    sequence: usize,
    task_id: String,
    tool_id: &'static str,
    tool_name: String,
    timestamp_ms: u64,
    category: &'static str,
    severity: &'static str,
    kind: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionAction {
    id: &'static str,
    label: &'static str,
    command: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionItem {
    id: String,
    task_id: String,
    severity: &'static str,
    title: String,
    detail: String,
    tool_name: String,
    workspace_path: String,
    created_at_ms: u64,
    actions: Vec<AttentionAction>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionControlSnapshot {
    generated_at_ms: u64,
    tools: Vec<ExecutionTool>,
    runs: Vec<ExecutionRun>,
    transcript: Vec<ExecutionEvent>,
    attention: Vec<AttentionItem>,
}

fn process_running(pattern: &str) -> bool {
    Command::new("/usr/bin/pgrep")
        .args(["-f", pattern])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn provider_online() -> bool {
    "127.0.0.1:43128"
        .parse::<SocketAddr>()
        .ok()
        .is_some_and(|address| {
            TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
        })
}

fn command_available(name: &str, candidates: &[PathBuf]) -> bool {
    candidates.iter().any(|path| path.is_file())
        || Command::new("/usr/bin/which")
            .arg(name)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
}

fn tool_id_for_stage(stage: &str) -> &'static str {
    if stage == "traework_analysis" {
        "trae-work"
    } else {
        "trae-code"
    }
}

fn tool_id(task: &SupervisorTaskView) -> &'static str {
    tool_id_for_stage(&task.stage)
}

fn event_shape(event: &SupervisorEvent) -> (&'static str, &'static str) {
    match event.kind.as_str() {
        "progress" | "completed" | "transition_confirmed" | "transition_recovered" => {
            ("progress", "success")
        }
        "recovery_started" | "recovery_submitted" | "recover_requested" => ("recovery", "warning"),
        "recovery_failed" | "transition_failed" => ("failure", "error"),
        "retry_exhausted" => ("decision", "critical"),
        "paused" | "resumed" | "stopped" | "retry_budget_reset" => ("operator", "info"),
        _ => ("lifecycle", "info"),
    }
}

fn task_attention(task: &SupervisorTaskView, now: u64) -> Option<AttentionItem> {
    let (severity, title, actions) = match task.health.as_str() {
        "retry_exhausted" => (
            "critical",
            "自动恢复次数已耗尽",
            vec![
                AttentionAction {
                    id: "reset_budget",
                    label: "重置并恢复",
                    command: Some("reset_budget"),
                },
                AttentionAction {
                    id: "stop",
                    label: "停止任务",
                    command: Some("stop"),
                },
            ],
        ),
        "transition_failed" => (
            "critical",
            "下一研发阶段无法接续",
            vec![AttentionAction {
                id: "recover_now",
                label: "立即重试",
                command: Some("recover_now"),
            }],
        ),
        "waiting_unlock" => (
            "warning",
            "Mac 锁屏阻止真实操作",
            vec![AttentionAction {
                id: "unlock",
                label: "解锁后自动继续",
                command: None,
            }],
        ),
        "controller_unavailable" if now.saturating_sub(task.last_healthy_at_ms) >= 45_000 => (
            "warning",
            "执行控制器持续不可用",
            vec![AttentionAction {
                id: "recover_now",
                label: "重新检查",
                command: Some("recover_now"),
            }],
        ),
        _ => return None,
    };
    Some(AttentionItem {
        id: format!("{}:{}", task.task_id, task.health),
        task_id: task.task_id.clone(),
        severity,
        title: title.into(),
        detail: task
            .last_error
            .clone()
            .unwrap_or_else(|| task.health_message.clone()),
        tool_name: task.app_name.clone(),
        workspace_path: task.workspace_path.clone(),
        created_at_ms: task.last_check_at_ms,
        actions,
    })
}

fn task_tool_status(tasks: &[SupervisorTaskView], id: &str, installed: bool) -> (String, String) {
    let related = tasks
        .iter()
        .filter(|task| tool_id(task) == id)
        .collect::<Vec<_>>();
    if related.iter().any(|task| {
        matches!(
            task.health.as_str(),
            "retry_exhausted" | "transition_failed" | "controller_unavailable"
        )
    }) {
        return ("attention".into(), "存在需要人工处理的执行任务".into());
    }
    if related.iter().any(|task| {
        matches!(
            task.state.as_str(),
            "monitoring" | "recovering" | "transition_pending"
        )
    }) {
        return ("active".into(), "工具正在执行受管任务".into());
    }
    if installed {
        ("ready".into(), "Runtime 可用，当前没有活动任务".into())
    } else {
        ("unavailable".into(), "本机未发现可用 Runtime".into())
    }
}

fn build_tools(tasks: &[SupervisorTaskView]) -> Vec<ExecutionTool> {
    let home = std::env::var_os("HOME").map_or_else(PathBuf::new, PathBuf::from);
    let work_installed =
        Path::new("/Applications/TRAE SOLO CN.app").is_dir() || process_running("TRAE SOLO CN");
    let code_installed =
        Path::new("/Applications/Trae CN.app").is_dir() || process_running("Trae CN");
    let (work_status, work_detail) = task_tool_status(tasks, "trae-work", work_installed);
    let (code_status, code_detail) = task_tool_status(tasks, "trae-code", code_installed);
    let exploration_app = Path::new(
        "/Users/bytedance/Desktop/desk_apps/technology-intelligence/dist/Technology Exploration.app",
    );
    let exploration_online = provider_online();
    let graph_available = command_available(
        "codegraph",
        &[
            home.join(".local/bin/codegraph"),
            PathBuf::from("/opt/homebrew/bin/codegraph"),
            PathBuf::from("/usr/local/bin/codegraph"),
        ],
    );
    vec![
        ExecutionTool {
            id: "trae-work",
            name: "Trae Work",
            kind: "desktop_gui",
            transport: "Accessibility / Computer Use",
            status: work_status,
            detail: work_detail,
            capabilities: vec!["需求分析", "任务新建", "工作区切换", "断点恢复"],
            active_runs: tasks
                .iter()
                .filter(|task| tool_id(task) == "trae-work" && task.state != "completed")
                .count(),
        },
        ExecutionTool {
            id: "trae-code",
            name: "Trae Code",
            kind: "desktop_gui",
            transport: "Accessibility / Computer Use",
            status: code_status,
            detail: code_detail,
            capabilities: vec!["规格生成", "代码开发", "自动化测试", "构建交付"],
            active_runs: tasks
                .iter()
                .filter(|task| tool_id(task) == "trae-code" && task.state != "completed")
                .count(),
        },
        ExecutionTool {
            id: "technology-exploration",
            name: "Technology Exploration",
            kind: "hybrid",
            transport: "Provider API / Computer Use",
            status: if exploration_online {
                "ready".into()
            } else if exploration_app.is_dir() {
                "standby".into()
            } else {
                "unavailable".into()
            },
            detail: if exploration_online {
                "Provider 在线，可切换可视化操作".into()
            } else if exploration_app.is_dir() {
                "应用已安装，Provider 将在使用时拉起".into()
            } else {
                "本机未发现 Technology Exploration".into()
            },
            capabilities: vec!["技术热点", "开源匹配", "持续扫描", "方案建议"],
            active_runs: 0,
        },
        ExecutionTool {
            id: "codegraph",
            name: "CodeGraph",
            kind: "cli",
            transport: "Local CLI",
            status: if graph_available {
                "ready".into()
            } else {
                "unavailable".into()
            },
            detail: if graph_available {
                "CLI 已发现，可生成可追溯代码图谱".into()
            } else {
                "未发现 codegraph 可执行文件".into()
            },
            capabilities: vec!["代码索引", "调用链查询", "需求匹配证据", "图谱导出"],
            active_runs: 0,
        },
    ]
}

fn build_snapshot(supervisor: &TaskSupervisor) -> ExecutionControlSnapshot {
    let now = super::task_supervisor::current_time_ms();
    let tasks = supervisor.list();
    let full_tasks = supervisor.full_tasks();
    let runs = tasks
        .iter()
        .map(|task| ExecutionRun {
            id: task.task_id.clone(),
            tool_id: tool_id(task),
            tool_name: task.app_name.clone(),
            workspace_path: task.workspace_path.clone(),
            stage: task.stage.clone(),
            state: task.state.clone(),
            health: task.health.clone(),
            progress_percent: task.progress_percent,
            started_at_ms: full_tasks
                .iter()
                .find(|full_task| full_task.task_id == task.task_id)
                .and_then(|full_task| full_task.events.first())
                .map_or(task.last_check_at_ms, |event| event.timestamp_ms),
            last_activity_at_ms: task.last_progress_at_ms.max(task.last_check_at_ms),
        })
        .collect();
    let mut raw_events = full_tasks
        .iter()
        .flat_map(|task| {
            task.events
                .iter()
                .enumerate()
                .map(move |(task_sequence, event)| {
                    let (category, severity) = event_shape(event);
                    (
                        event.timestamp_ms,
                        task_sequence,
                        task,
                        event,
                        category,
                        severity,
                    )
                })
        })
        .collect::<Vec<_>>();
    raw_events.sort_by(
        |(left_time, left_sequence, left_task, _, _, _),
         (right_time, right_sequence, right_task, _, _, _)| {
            left_time
                .cmp(right_time)
                .then_with(|| left_task.task_id.cmp(&right_task.task_id))
                .then_with(|| left_sequence.cmp(right_sequence))
        },
    );
    let transcript = raw_events
        .into_iter()
        .enumerate()
        .rev()
        .take(300)
        .map(
            |(sequence, (timestamp, task_sequence, task, event, category, severity))| {
                ExecutionEvent {
                    id: format!("{}:{task_sequence}", task.task_id),
                    sequence: sequence + 1,
                    task_id: task.task_id.clone(),
                    tool_id: tool_id_for_stage(&task.stage),
                    tool_name: task.app_name.clone(),
                    timestamp_ms: timestamp,
                    category,
                    severity,
                    kind: event.kind.clone(),
                    message: event.message.clone(),
                }
            },
        )
        .collect();
    let mut attention = tasks
        .iter()
        .filter_map(|task| task_attention(task, now))
        .collect::<Vec<_>>();
    attention.sort_by_key(|item| std::cmp::Reverse(item.created_at_ms));
    ExecutionControlSnapshot {
        generated_at_ms: now,
        tools: build_tools(&tasks),
        runs,
        transcript,
        attention,
    }
}

#[tauri::command]
pub fn execution_control_snapshot(
    supervisor: State<'_, TaskSupervisor>,
) -> ExecutionControlSnapshot {
    build_snapshot(&supervisor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashSet, fs};

    #[test]
    fn attention_only_contains_human_decisions() {
        let root =
            std::env::temp_dir().join(format!("delivery-control-center-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create workspace");
        let supervisor =
            TaskSupervisor::new(root.join("registry.json")).expect("create supervisor");
        supervisor
            .register(
                root.to_string_lossy().to_string(),
                "traework_analysis".into(),
                "Trae Work".into(),
                "cn.trae.solo.app".into(),
                String::new(),
                String::new(),
                0,
            )
            .expect("register");
        let task_id = format!("{}:traework_analysis", root.to_string_lossy());
        supervisor.control(&task_id, "pause").expect("pause");
        assert!(build_snapshot(&supervisor).attention.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn transcript_merges_task_events_with_sequences() {
        let root =
            std::env::temp_dir().join(format!("delivery-transcript-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create workspace");
        let supervisor =
            TaskSupervisor::new(root.join("registry.json")).expect("create supervisor");
        supervisor
            .register(
                root.to_string_lossy().to_string(),
                "trae_spec".into(),
                "Trae Code".into(),
                "cn.trae.app".into(),
                String::new(),
                String::new(),
                0,
            )
            .expect("register");
        let snapshot = build_snapshot(&supervisor);
        assert_eq!(snapshot.transcript.len(), 1);
        assert_eq!(snapshot.transcript[0].tool_id, "trae-code");
        assert_eq!(snapshot.transcript[0].sequence, 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn transcript_uses_full_history_and_stable_unique_ids() {
        let root =
            std::env::temp_dir().join(format!("delivery-full-transcript-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create workspace");
        let supervisor =
            TaskSupervisor::new(root.join("registry.json")).expect("create supervisor");
        supervisor
            .register(
                root.to_string_lossy().to_string(),
                "traework_analysis".into(),
                "Trae Work".into(),
                "cn.trae.solo.app".into(),
                String::new(),
                String::new(),
                0,
            )
            .expect("register");
        let task_id = format!("{}:traework_analysis", root.to_string_lossy());
        for _ in 0..20 {
            supervisor.control(&task_id, "pause").expect("pause");
            supervisor.control(&task_id, "resume").expect("resume");
        }

        assert_eq!(supervisor.list()[0].events.len(), 30);
        let snapshot = build_snapshot(&supervisor);
        assert_eq!(snapshot.transcript.len(), 41);
        assert_eq!(
            snapshot
                .transcript
                .iter()
                .map(|event| event.id.as_str())
                .collect::<HashSet<_>>()
                .len(),
            snapshot.transcript.len()
        );
        let _ = fs::remove_dir_all(root);
    }
}
