import {
  UnderlineTabs,
  type UnderlineTabItem,
} from '@/components/ui/underline-tabs';
import { notify } from '@/components/ui/app-toast';

import IconSearch from '../assets/icons/search.svg?react';

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, TENANT_ID } from '../api/client';
import { type EnterpriseAuthUser } from '../auth';

import AppHeader from '../components/AppHeader';
import EmployeeCard from '../components/EmployeeCard';
import TeamCard, { teamLeader } from '../components/TeamCard';
import {
  employeeDisplayName,
  employeeDisplayNameWithCreator,
  employeeProfile,
} from '../employee';
import type { AgentProfileRead, TeamRead } from '../types';

type GalleryScope = 'all' | 'mine' | 'teams' | 'gallery' | 'shared';

export default function EmployeeGalleryPage({
  currentUser,
  isAdmin = false,
  onStartChat,
  onLogout,
  teams: sharedTeams,
  teamsLoadFailed: sharedTeamsLoadFailed,
  onRetryTeams,
}: {
  currentUser?: EnterpriseAuthUser;
  isAdmin?: boolean;
  onStartChat?: (agent: AgentProfileRead) => void | Promise<void>;
  onLogout?: () => void;
  teams?: TeamRead[];
  teamsLoadFailed?: boolean;
  onRetryTeams?: () => void | Promise<void>;
}) {
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [localTeams, setLocalTeams] = useState<TeamRead[]>([]);
  const [localTeamsLoadFailed, setLocalTeamsLoadFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [startingAgentId, setStartingAgentId] = useState<string | null>(null);
  const [startingTeamId, setStartingTeamId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState<GalleryScope>('all');
  const loadGeneration = useRef(0);
  const navigate = useNavigate();

  async function load() {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setAgents([]);
    setLoadError('');
    try {
      const queryScope = scope === 'all' || scope === 'teams' ? 'available' : scope;
      const rows = await api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}&scope=${queryScope}&view=summary`);
      if (generation !== loadGeneration.current) return;
      setAgents(rows);
    } catch (error) {
      if (generation === loadGeneration.current) {
        const message = error instanceof Error ? error.message : '加载员工失败';
        setLoadError(message);
        notify.error(message);
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }

  async function loadTeams() {
    if (sharedTeams !== undefined) {
      await onRetryTeams?.();
      return;
    }
    try {
      const rows = await api.get<TeamRead[]>(`/api/enterprise/teams?tenant_id=${TENANT_ID}`);
      setLocalTeams(rows);
      setLocalTeamsLoadFailed(false);
    } catch (error) {
      setLocalTeamsLoadFailed(true);
      notify.error(error instanceof Error ? error.message : '加载团队失败');
    }
  }

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [scope]);

  useEffect(() => {
    if (sharedTeams === undefined) void loadTeams();
  }, [sharedTeams]);

  // Keep these tabs aligned with the rest of the app:
  // - 所有员工: employees the current user can access and chat with
  // - 我的数字员工: employees the current user can manage/edit
  // - 团队对话: teams the backend has authorized for the current tenant
  // - 数字员工广场: the authoritative public directory, including my public employees
  // Directory membership is decided by the shared server contract, not inferred
  // from owner/public flags in a partial list. Public owners remain in the gallery.
  const scopedEmployees = loading ? [] : agents;

  const filteredEmployees = scopedEmployees.filter((item) => {
    const profile = employeeProfile(item);
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return true;
    return [
      employeeDisplayName(item),
      employeeDisplayNameWithCreator(item),
      profile.roleName,
      item.description || '',
      profile.workStyles.join(' '),
      profile.expertiseTags.join(' '),
    ].some((value) => value.toLowerCase().includes(keyword));
  });

  const teams = sharedTeams ?? localTeams;
  const teamsLoadFailed = sharedTeamsLoadFailed ?? localTeamsLoadFailed;
  const filteredTeams = teams.filter((team) => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return true;
    return [
      team.name,
      team.description || '',
      teamLeader(team)?.agent_name || '',
    ].some((value) => value.toLowerCase().includes(keyword));
  });

  async function startEmployeeChat(row: AgentProfileRead) {
    if (startingAgentId) return;
    setStartingAgentId(row.id);
    try {
      if (onStartChat) {
        await onStartChat(row);
        return;
      }
      navigate(`/workspace/chat/draft/${row.id}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '发起对话失败');
    } finally {
      setStartingAgentId(null);
    }
  }

  async function startTeamChat(team: TeamRead) {
    if (startingTeamId) return;
    setStartingTeamId(team.id);
    try {
      const result = await api.post<{ session_id: string }>(
        `/api/enterprise/teams/${team.id}/tl/session`,
        { tenant_id: TENANT_ID },
      );
      if (!result.session_id) throw new Error('未返回团队群聊');
      navigate(`/workspace/chat/${result.session_id}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '发起团队对话失败');
    } finally {
      setStartingTeamId(null);
    }
  }

  const galleryTabs: UnderlineTabItem<GalleryScope>[] = [
    { value: 'all', label: '所有员工' },
    { value: 'mine', label: '我的数字员工' },
    { value: 'teams', label: '团队对话' },
    { value: 'gallery', label: '数字员工广场' },
    { value: 'shared', label: '共享给我' },
  ];

  function changeScope(nextScope: GalleryScope) {
    setScope(nextScope);
    if (nextScope === 'teams' && teamsLoadFailed) {
      void loadTeams();
    }
  }

  const hasSearchTerm = Boolean(searchTerm.trim());
  const emptyText = hasSearchTerm ? '没有匹配的数字员工' : '暂无数字员工';
  const emptyDescription = hasSearchTerm
    ? '换个关键词，或切换员工分类再试试'
    : '当前分类还没有可用员工';
  const teamsEmptyText = hasSearchTerm ? '没有匹配的团队' : '暂无团队';
  const teamsEmptyDescription = hasSearchTerm
    ? '换个关键词再试试'
    : '请先在管理端创建团队并设置项目领导';

  return (
    <div className="min-h-full box-border px-[48px] pt-[32px] pb-[43px] max-[900px]:px-[16px]" aria-busy={loading}>
      <AppHeader
        onLogout={onLogout}
        userName={currentUser?.username}
        mobileStack
        left={(
          <div className="flex h-[50px] w-full items-center gap-[6px] rounded-[20px] bg-white px-[20px] text-[#757F9C] shadow-[0_0_6px_rgba(0,0,0,0.05)]">
            <IconSearch className="size-[20px] shrink-0" />
            <input
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索"
              aria-label="搜索数字员工"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#18181A] outline-none placeholder:text-[#757F9C]"
            />
          </div>
        )}
      />

      <UnderlineTabs
        className="mt-[36px] mb-[16px] max-[560px]:w-full"
        aria-label="数字员工分类"
        value={scope}
        onChange={changeScope}
        items={galleryTabs}
        tabClassName="max-[767px]:min-h-[44px] max-[767px]:w-auto max-[767px]:flex-1 max-[767px]:px-[6px] max-[767px]:text-[12px] max-[767px]:leading-[16px] max-[560px]:min-h-[54px]"
      />

      {scope === 'teams' ? (
        <section aria-label="团队">
          <div className="grid grid-cols-1 content-start gap-[32px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 max-[900px]:gap-[18px]">
            {filteredTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                agents={agents}
                busy={startingTeamId === team.id}
                onOpen={() => void startTeamChat(team)}
              />
            ))}
            {!filteredTeams.length && (
              <EmployeeGalleryEmptyState title={teamsEmptyText} description={teamsEmptyDescription} />
            )}
          </div>
        </section>
      ) : (
        <div className="grid auto-rows-[minmax(262px,auto)] grid-cols-1 content-start gap-[32px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 max-[900px]:gap-[18px]">
          {filteredEmployees.map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              busy={startingAgentId === employee.id}
              onOpen={() => void startEmployeeChat(employee)}
              onChat={() => void startEmployeeChat(employee)}
            />
          ))}
          {!filteredEmployees.length && (
            <EmployeeGalleryEmptyState title={loadError ? '员工目录暂不可用' : emptyText} description={loadError || emptyDescription} />
          )}
        </div>
      )}

    </div>
  );
}

function EmployeeGalleryEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-[262px] w-full items-center justify-center rounded-[20px] border border-dashed border-[#e4e9f2] bg-[#fbfcfe] px-[24px] text-center">
      <div className="flex max-w-[210px] flex-col items-center">
        <span className="grid size-[34px] place-items-center rounded-[12px] bg-white text-[#98a2b3] shadow-[0_1px_8px_rgba(70,76,94,0.06)] ring-1 ring-[#edf1f6]">
          <IconSearch className="size-[16px] shrink-0" />
        </span>
        <p className="mt-[12px] text-[14px] font-medium leading-[20px] text-[#7f879a]">
          {title}
        </p>
        <p className="mt-[4px] text-[11px] leading-[17px] text-[#a7adbb]">
          {description}
        </p>
      </div>
    </div>
  );
}
