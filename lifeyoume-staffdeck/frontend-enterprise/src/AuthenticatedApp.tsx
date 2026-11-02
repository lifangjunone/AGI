import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api, TENANT_ID } from "./api/client";
import {
  isEnterpriseAdmin,
  type EnterpriseAuthSession,
} from "./auth";
import AppSidebar from "./components/AppSidebar";
import {
  ONBOARDING_SEEN_KEY,
  OPEN_ONBOARDING_EVENT,
  OPEN_QUICK_START_EVENT,
  QUICK_START_COMPLETED_EVENT,
  QUICK_START_SEEN_KEY,
} from "./lib/guide-events";
import UpdateReminder from "./components/UpdateReminder";
import StaffdeckIcon from "./components/StaffdeckIcon";
import { SidebarProvider } from "@/components/ui/sidebar";
import { EnterpriseRoute } from "./enums/routes";
import {
  employeeBlankMetadata,
  canAccessEmployeeAgent,
  canManageEmployeeAgent,
  canSelectCurrentEmployeeAgent,
  employeeDisplayName,
  employeeProfile,
  preferredEmployeeAgent,
} from "./employee";
import ChatGalleryPage from "./pages/chat/ChatGalleryPage";
import { loadEmployeeDirectory } from './api/employee-directory';
import { useIsMobile } from "./hooks/use-mobile";
import { Button as UIButton } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { notify } from "@/components/ui/app-toast";
import {
  emitAgentScopeChange,
  ENTERPRISE_AGENT_STORAGE_KEY,
  isTeamScope,
  persistSharedAgentScope,
  teamIdFromScope,
  toTeamScope,
} from "@/lib/agent-scope-storage";
import { cn } from "@/lib/utils";
import type { AgentProfileRead, ModelConfigRead, TeamRead } from "./types";
import { useI18n } from "./i18n";
import AgentCreateDialog, {
  type AgentCreateFormState,
} from "./components/AgentCreateDialog";

const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const EmptyEmployeeState = lazy(() => import("./components/EmptyEmployeeState"));
const OnboardingGuide = lazy(() => import("./components/OnboardingGuide"));
const QuickStartGuide = lazy(() => import("./components/QuickStartGuide"));
const ChatPage = lazy(() => import("./pages/chat/ChatPage"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const ChannelsPage = lazy(() => import("./pages/ChannelsPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const DistillPage = lazy(() => import("./pages/DistillPage"));
const GeneralSkillsPage = lazy(() => import("./pages/GeneralSkillsPage"));
const GeneralSkillEditPage = lazy(() =>
  import("./pages/GeneralSkillsPage").then((module) => ({
    default: module.GeneralSkillEditPage,
  })),
);
const GeneralSkillNewPage = lazy(() =>
  import("./pages/GeneralSkillsPage").then((module) => ({
    default: module.GeneralSkillNewPage,
  })),
);
const KnowledgeManagePage = lazy(() => import("./pages/KnowledgePage"));
const KnowledgeAddPage = lazy(() =>
  import("./pages/KnowledgePage").then((module) => ({
    default: module.KnowledgeAddPage,
  })),
);
const ModelsPage = lazy(() => import("./pages/ModelsPage"));
const RuntimeSettingsPage = lazy(() => import("./pages/RuntimeSettingsPage"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage"));
const OpenPlatformPage = lazy(() => import("./pages/OpenPlatformPage"));
const PersonaPage = lazy(() => import("./pages/PersonaPage"));
const SkillsPage = lazy(() => import("./pages/SkillsPage"));
const TeamChatPage = lazy(() => import("./pages/TeamChatPage"));
const TeamDetailPage = lazy(() => import("./pages/TeamDetailPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const ScheduledTaskEditPage = lazy(() =>
  import("./pages/dashboard/ScheduledTasksTab").then((module) => ({
    default: module.ScheduledTaskEditPage,
  })),
);
const ScheduledTaskNewPage = lazy(() =>
  import("./pages/dashboard/ScheduledTasksTab").then((module) => ({
    default: module.ScheduledTaskNewPage,
  })),
);
const ToolsPage = lazy(() => import("./pages/ToolsPage"));
const McpServerEditPage = lazy(() =>
  import("./pages/ToolsPage").then((module) => ({
    default: module.McpServerEditPage,
  })),
);
const McpServerNewPage = lazy(() =>
  import("./pages/ToolsPage").then((module) => ({
    default: module.McpServerNewPage,
  })),
);
const ToolEditPage = lazy(() =>
  import("./pages/ToolsPage").then((module) => ({
    default: module.ToolEditPage,
  })),
);
const ToolNewPage = lazy(() =>
  import("./pages/ToolsPage").then((module) => ({
    default: module.ToolNewPage,
  })),
);
const ToolTestPage = lazy(() =>
  import("./pages/ToolsPage").then((module) => ({
    default: module.ToolTestPage,
  })),
);

const ENTERPRISE_SIDEBAR_STORAGE_KEY = "ultrarag_enterprise_sidebar_expanded";
const MODEL_CONFIGS_UPDATED_EVENT = "ultrarag-enterprise-model-configs-updated";
const EMPTY_AGENT_FORM: AgentCreateFormState = {
  name: "",
  description: "",
  roleName: "",
  sourceMode: "copy",
  copyFromAgentId: "",
};

function RouteLoading() {
  return (
    <div
      className="flex min-h-[240px] flex-1 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-[10px] text-[13px] text-[#858b9c]">
        <span className="size-[16px] animate-spin rounded-full border-2 border-[#d9deea] border-t-[#1a71ff]" />
        正在加载工作区…
      </div>
    </div>
  );
}

function Shell({
  auth,
  onLogout,
  guidesCompleted,
}: {
  auth: EnterpriseAuthSession;
  onLogout: () => void;
  guidesCompleted: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [scopeTeams, setScopeTeams] = useState<TeamRead[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || "",
  );
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const stored = window.localStorage.getItem(ENTERPRISE_SIDEBAR_STORAGE_KEY);
    return stored == null ? true : stored === "1";
  });
  const [agentCreateOpen, setAgentCreateOpen] = useState(false);
  const [agentForm, setAgentForm] =
    useState<AgentCreateFormState>(EMPTY_AGENT_FORM);
  const [modelConfigs, setModelConfigs] = useState<ModelConfigRead[]>([]);
  const [modelConfigsLoaded, setModelConfigsLoaded] = useState(false);
  const isMobile = useIsMobile();
  const sidebarOpen = !isMobile && sidebarExpanded;
  const isAdmin = isEnterpriseAdmin(auth.user);
  const accountRoleLabel = isAdmin ? "管理员" : "";
  const isDistillRoute = location.pathname === "/enterprise/skills/distill";
  const [distillVisited, setDistillVisited] = useState(isDistillRoute);
  const selected =
    location.pathname === "/enterprise"
      ? "/enterprise/dashboard"
      : location.pathname.startsWith("/enterprise/platform")
        ? "/enterprise/platform"
        : location.pathname.startsWith("/enterprise/knowledge")
          ? "/enterprise/knowledge"
          : location.pathname.startsWith("/enterprise/general-skills")
            ? "/enterprise/general-skills"
            : location.pathname.startsWith("/enterprise/tools")
              ? "/enterprise/tools"
              : location.pathname.startsWith("/enterprise/teams")
                ? "/enterprise/teams"
                : location.pathname.startsWith("/enterprise/scheduled-tasks")
                ? "/enterprise/scheduled-tasks"
                : isDistillRoute
                  ? "/enterprise/skills"
                  : location.pathname;
  const isAgentRosterRoute = location.pathname.startsWith("/enterprise/agents");
  const [lastDistillSearch, setLastDistillSearch] = useState(() =>
    isDistillRoute ? location.search : "",
  );
  const distillSearch = isDistillRoute ? location.search : lastDistillSearch;
  const distillSearchParams = useMemo(
    () => new URLSearchParams(distillSearch),
    [distillSearch],
  );

  useEffect(() => {
    if (isDistillRoute) {
      setDistillVisited(true);
      setLastDistillSearch(location.search);
    }
  }, [isDistillRoute, location.search]);

  useEffect(() => {
    loadAgents();
    loadTeams();
  }, []);

  const loadModelConfigs = useCallback(() => {
    return api
      .get<ModelConfigRead[]>(`/api/enterprise/model-configs?tenant_id=${TENANT_ID}`)
      .then((items) => {
        setModelConfigs(items);
        setModelConfigsLoaded(true);
      })
      .catch(() => {
        setModelConfigs([]);
        setModelConfigsLoaded(false);
      });
  }, []);

  useEffect(() => {
    void loadModelConfigs();
  }, [loadModelConfigs]);

  useEffect(() => {
    const onModelConfigsUpdated = (event: Event) => {
      const rows = (event as CustomEvent<{ models?: ModelConfigRead[] }>).detail?.models;
      if (rows) {
        setModelConfigs(rows);
        setModelConfigsLoaded(true);
      } else {
        void loadModelConfigs();
      }
    };
    window.addEventListener(MODEL_CONFIGS_UPDATED_EVENT, onModelConfigsUpdated);
    return () => window.removeEventListener(MODEL_CONFIGS_UPDATED_EVENT, onModelConfigsUpdated);
  }, [loadModelConfigs]);

  // Auto-collapse the sidebar on small screens; restore the saved preference on desktop.
  useEffect(() => {
    if (isMobile) {
      setSidebarExpanded(false);
    } else {
      const stored = window.localStorage.getItem(
        ENTERPRISE_SIDEBAR_STORAGE_KEY,
      );
      setSidebarExpanded(stored == null ? true : stored === "1");
    }
  }, [isMobile]);

  useEffect(() => {
    const onAgentRefresh = () => {
      void loadAgents();
    };
    window.addEventListener(
      "ultrarag-enterprise-agent-scope-refresh",
      onAgentRefresh,
    );
    return () =>
      window.removeEventListener(
        "ultrarag-enterprise-agent-scope-refresh",
        onAgentRefresh,
      );
  }, []);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const nextAgentId =
        (event as CustomEvent<{ agentId?: string }>).detail?.agentId ||
        window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) ||
        "";
      if (nextAgentId && !isTeamScope(nextAgentId)) {
        persistSharedAgentScope(nextAgentId, auth.user.id);
        const knownSelectableAgent = agents.some(
          (item) => item.id === nextAgentId && canUseAgentScope(item),
        );
        if (!knownSelectableAgent) void loadAgents(nextAgentId);
      }
      setSelectedAgentId(nextAgentId);
    };
    window.addEventListener(
      "ultrarag-enterprise-agent-scope-change",
      onScopeChange,
    );
    return () =>
      window.removeEventListener(
        "ultrarag-enterprise-agent-scope-change",
        onScopeChange,
      );
  }, [agents, auth.user.id]);

  useEffect(() => {
    const onCreateAgent = () => openCreateAgentModal();
    window.addEventListener("ultrarag-enterprise-agent-create", onCreateAgent);
    return () =>
      window.removeEventListener(
        "ultrarag-enterprise-agent-create",
        onCreateAgent,
      );
  }, []);

  function loadTeams() {
    return api
      .get<TeamRead[]>(`/api/enterprise/teams?tenant_id=${TENANT_ID}`)
      .then((rows) => setScopeTeams(rows))
      .catch(() => setScopeTeams([]));
  }

  function loadAgents(preferredAgentId = "") {
    return loadEmployeeDirectory()
      .then((rows) => {
        setAgents(rows);
        const selectableRows = rows.filter((item) => canUseAgentScope(item));
        setSelectedAgentId((current) => {
          // A team scope is not part of the employee roster; keep it untouched.
          if (isTeamScope(current)) return current;
          const requestedAgentId = preferredAgentId || current;
          if (
            requestedAgentId &&
            selectableRows.some((item) => item.id === requestedAgentId)
          ) {
            persistSharedAgentScope(requestedAgentId, auth.user.id);
            return requestedAgentId;
          }
          const manageableRows = selectableRows.filter((item) =>
            canManageEmployeeAgent(item, auth.user),
          );
          const next = isAdmin
            ? preferredEmployeeAgent(selectableRows)?.id || ""
            : preferredEmployeeAgent(manageableRows)?.id ||
              preferredEmployeeAgent(selectableRows)?.id ||
              "";
          if (next) {
            persistSharedAgentScope(next, auth.user.id);
            if (next !== current) {
              emitAgentScopeChange(next);
            }
          }
          return next;
        });
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoaded(true));
  }

  function canUseAgentScope(agent: AgentProfileRead): boolean {
    return canSelectCurrentEmployeeAgent(agent, auth.user, { activeOnly: true });
  }

  function changeAgentScope(agentId: string) {
    setSelectedAgentId(agentId);
    persistSharedAgentScope(agentId, auth.user.id);
    emitAgentScopeChange(agentId);
  }

  async function selectTeamScope(teamId: string) {
    const scope = toTeamScope(teamId);
    try {
      const result = await api.post<{ session_id: string }>(
        `/api/enterprise/teams/${teamId}/tl/session`,
        { tenant_id: TENANT_ID },
      );
      if (!result.session_id) throw new Error("发起群聊失败");
      setSelectedAgentId(scope);
      persistSharedAgentScope(scope, auth.user.id);
      emitAgentScopeChange(scope);
      navigate(`/workspace/chat/${result.session_id}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "发起群聊失败");
    }
  }

  function handleSidebarOpenChange(open: boolean) {
    setSidebarExpanded(open);
    window.localStorage.setItem(
      ENTERPRISE_SIDEBAR_STORAGE_KEY,
      open ? "1" : "0",
    );
  }

  const scopeAgents = agents.filter(canUseAgentScope);
  const hasUsableModelConfig = modelConfigs.some((item) => item.enabled);
  const showModelSetupNotice = guidesCompleted && modelConfigsLoaded && !hasUsableModelConfig;
  const modelSetupNoticeText = isAdmin
    ? t("还没有可用模型配置，数字员工暂不能调用模型。请先完成模型配置。")
    : t("系统管理员尚未配置可用模型，数字员工暂不能调用模型。请联系管理员完成模型配置。");
  const selectedAgent = scopeAgents.find((item) => item.id === selectedAgentId);
  const sidebarAgent = selectedAgent;
  // Routes that operate on a specific employee; show the empty guide when none exist.
  const EMPLOYEE_SCOPED_PREFIXES = [
    "/enterprise/dashboard",
    "/enterprise/scheduled-tasks",
    "/enterprise/memories",
    "/enterprise/feedback",
    "/enterprise/knowledge",
    "/enterprise/general-skills",
    "/enterprise/skills",
    "/enterprise/tools",
  ];
  const hasEmployees = scopeAgents.some((item) => !item.is_overall);
  const isEmployeeScopedRoute = EMPLOYEE_SCOPED_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix),
  );
  const showEmployeeEmptyState =
    agentsLoaded && !hasEmployees && isEmployeeScopedRoute;
  const sourceAgents = agents.filter((item) =>
    canAccessEmployeeAgent(item, auth.user, {
      activeOnly: true,
      includeOverall: isAdmin,
    }),
  );
  const selectedAgentName = selectedAgent
    ? employeeDisplayName(selectedAgent)
    : "未选择";
  const selectedAgentCaption = selectedAgent
    ? selectedAgent.is_overall
      ? "开放广场"
      : employeeProfile(selectedAgent).roleName
    : "-";
  function openCreateAgentModal() {
    setAgentForm({
      ...EMPTY_AGENT_FORM,
      copyFromAgentId: (isTeamScope(selectedAgentId) ? "" : selectedAgentId) || sourceAgents[0]?.id || "",
    });
    setAgentCreateOpen(true);
  }

  async function saveAgentCreateModal() {
    const name = agentForm.name.trim();
    if (!name) {
      notify.error("请填写数字员工姓名");
      return;
    }
    const isBlankOnboarding = agentForm.sourceMode === "blank";
    let sourceAgent = agentForm.copyFromAgentId
      ? sourceAgents.find((item) => item.id === agentForm.copyFromAgentId)
      : undefined;
    if (!isBlankOnboarding && sourceAgent?.metadata?.directory_summary) {
      try {
        sourceAgent = await api.get<AgentProfileRead>(`/api/enterprise/agents/${encodeURIComponent(sourceAgent.id)}?tenant_id=${TENANT_ID}`);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : '员工详情加载失败');
        return;
      }
    }
    const sourceMetadata =
      !isBlankOnboarding && sourceAgent?.metadata ? sourceAgent.metadata : {};
    const sourceRoleName =
      sourceAgent && !sourceAgent.is_overall
        ? employeeProfile(sourceAgent).roleName
        : "";
    const roleName =
      agentForm.roleName.trim() ||
      (!isBlankOnboarding ? sourceRoleName : "") ||
      "待补充职位";
    const description =
      agentForm.description.trim() ||
      (!isBlankOnboarding
        ? sourceAgent?.description ||
          String(sourceMetadata.system_prompt_summary || "")
        : "") ||
      "";
    const baseMetadata = {
      ...sourceMetadata,
      system_prompt_summary: description,
      owner_user_id: auth.user.id,
      owner_username: auth.user.username,
      owner_display_name: auth.user.display_name || auth.user.username,
      created_by_user_id: auth.user.id,
      created_by_username: auth.user.username,
      created_by: auth.user.username,
      created_by_display_name: auth.user.display_name || auth.user.username,
      creator_name: auth.user.username,
      role_key: "",
      role_name: roleName,
      onboarded_at: new Date().toISOString().slice(0, 10),
      blank_onboarding: isBlankOnboarding,
    };
    try {
      const created = await api.post<AgentProfileRead>(
        "/api/enterprise/agents",
        {
          tenant_id: TENANT_ID,
          name,
          description,
          source_mode: agentForm.sourceMode,
          copy_from_agent_id:
            agentForm.sourceMode === "copy"
              ? agentForm.copyFromAgentId || undefined
              : undefined,
          metadata: isBlankOnboarding
            ? employeeBlankMetadata(baseMetadata)
            : baseMetadata,
        },
      );
      await loadAgents();
      changeAgentScope(created.id);
      setAgentCreateOpen(false);
      window.dispatchEvent(new Event("ultrarag-enterprise-agent-scope-refresh"));
      notify.success("数字员工创建成功");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "创建数字员工失败");
    }
  }

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      style={
        {
          "--sidebar-width": "220px",
          "--sidebar-width-icon": "72px",
        } as CSSProperties
      }
      className={`app-shell ${sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed"} ${isAgentRosterRoute ? "is-agent-roster" : ""}`}
    >
      <AppSidebar
        selected={selected}
        onNavigate={navigate}
        isAdmin={isAdmin}
        sidebarAgent={sidebarAgent}
        scopeAgents={scopeAgents}
        scopeTeams={scopeTeams}
        selectedAgentId={selectedAgentId}
        onSelectAgent={(agentId) => {
          const teamId = teamIdFromScope(agentId);
          if (teamId) {
            void selectTeamScope(teamId);
            return;
          }
          if (agentId !== selectedAgentId) changeAgentScope(agentId);
          navigate(EnterpriseRoute.Dashboard);
        }}
        onOpenChat={() => {
          navigate(EnterpriseRoute.Gallery);
        }}
        modelSetupAttention={isAdmin && showModelSetupNotice}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={`content flex-1 ${isDistillRoute ? "flex min-h-0 flex-col overflow-hidden p-0!" : ""} ${selected === "/enterprise/dashboard" ? "sd1-dashboard-content" : ""} ${selected !== "/enterprise/dashboard" && !isDistillRoute ? "sd1-management-content" : ""}`}
        >
          {showModelSetupNotice && (
            <div className="mx-[24px] mt-[18px] mb-[10px] flex shrink-0 flex-col items-start justify-between gap-[12px] rounded-[12px] border border-[#f3d28b] bg-[#fff8e8] px-[18px] py-[12px] text-[#6f4500] shadow-[0_8px_24px_rgba(92,62,0,0.08)] sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-[10px]">
                <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] bg-[#ffe7ad] text-[#8a4b00]">
                  <StaffdeckIcon name="model" className="size-[15px]" />
                </span>
                <span className="min-w-0 text-[13px] leading-[20px]">{modelSetupNoticeText}</span>
              </div>
              {isAdmin && (
                <UIButton
                  type="button"
                  size="sm"
                  onClick={() => navigate(EnterpriseRoute.Models)}
                  className="h-[32px] shrink-0 rounded-[8px] bg-[#1a71ff] px-[12px] text-[12px] text-white hover:bg-[#0f5ed7]"
                >
                  {t("去配置")}
                </UIButton>
              )}
            </div>
          )}
          {(isDistillRoute || distillVisited) && (
            <div
              className={
                isDistillRoute
                  ? "persistent-distill active flex min-h-0 flex-1 flex-col"
                  : "persistent-distill hidden"
              }
            >
              <Suspense fallback={<RouteLoading />}>
                <DistillPage
                  active={isDistillRoute}
                  searchParamsOverride={distillSearchParams}
                  currentUser={auth.user}
                  onLogout={onLogout}
                />
              </Suspense>
            </div>
          )}
          {!isDistillRoute && showEmployeeEmptyState && (
            <Suspense fallback={<RouteLoading />}>
              <EmptyEmployeeState
                isAdmin={isAdmin}
                onCreate={openCreateAgentModal}
                onBrowsePlatform={() => navigate(EnterpriseRoute.Platform)}
              />
            </Suspense>
          )}
          {!isDistillRoute && !showEmployeeEmptyState && (
            <Suspense fallback={<RouteLoading />}>
              <Routes>
              <Route
                path="/enterprise"
                element={<Navigate to="/enterprise/dashboard" replace />}
              />
              <Route
                path="/enterprise/platform"
                element={
                  <OpenPlatformPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/platform/:kind"
                element={
                  <OpenPlatformPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/dashboard"
                element={
                  <DashboardPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/agents"
                element={
                  <AgentsPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    onCreateAgent={openCreateAgentModal}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/teams"
                element={
                  <TeamsPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/teams/:teamId/chat"
                element={<TeamChatPage />}
              />
              <Route
                path="/enterprise/teams/:teamId"
                element={
                  <TeamDetailPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/memories"
                element={
                  <DashboardPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    profileTab="memories"
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/knowledge"
                element={
                  <KnowledgeManagePage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/knowledge/new"
                element={
                  <KnowledgeAddPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/feedback"
                element={
                  <DashboardPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    profileTab="logs"
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/channels"
                element={
                  <ChannelsPage currentUser={auth.user} onLogout={onLogout} />
                }
              />
              <Route
                path="/enterprise/scheduled-tasks"
                element={
                  <DashboardPage
                    currentUser={auth.user}
                    isAdmin={isAdmin}
                    profileTab="scheduled"
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/scheduled-tasks/new"
                element={
                  <ScheduledTaskNewPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/scheduled-tasks/:taskId/edit"
                element={
                  <ScheduledTaskEditPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/skills"
                element={
                  <SkillsPage currentUser={auth.user} onLogout={onLogout} />
                }
              />
              <Route
                path="/enterprise/general-skills"
                element={
                  <GeneralSkillsPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/general-skills/new"
                element={
                  <GeneralSkillNewPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/general-skills/:slug/edit"
                element={
                  <GeneralSkillEditPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/accounts"
                element={
                  isAdmin ? (
                    <AccountsPage currentUser={auth.user} onLogout={onLogout} />
                  ) : (
                    <Navigate to={EnterpriseRoute.Gallery} replace />
                  )
                }
              />
              <Route
                path="/enterprise/models"
                element={
                  isAdmin ? (
                    <ModelsPage currentUser={auth.user} onLogout={onLogout} />
                  ) : (
                    <Navigate to={EnterpriseRoute.Gallery} replace />
                  )
                }
              />
              <Route
                path="/enterprise/runtime-settings"
                element={
                  isAdmin ? (
                    <RuntimeSettingsPage currentUser={auth.user} />
                  ) : (
                    <Navigate to={EnterpriseRoute.Gallery} replace />
                  )
                }
              />
              <Route
                path="/enterprise/tools"
                element={
                  <ToolsPage currentUser={auth.user} onLogout={onLogout} />
                }
              />
              <Route
                path="/enterprise/tools/new"
                element={
                  <ToolNewPage currentUser={auth.user} onLogout={onLogout} />
                }
              />
              <Route
                path="/enterprise/tools/mcp/new"
                element={
                  <McpServerNewPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/tools/mcp/:serverId/edit"
                element={
                  <McpServerEditPage
                    currentUser={auth.user}
                    onLogout={onLogout}
                  />
                }
              />
              <Route
                path="/enterprise/tools/:toolId/edit"
                element={
                  <ToolEditPage currentUser={auth.user} onLogout={onLogout} />
                }
              />
              <Route
                path="/enterprise/tools/:toolId/test"
                element={
                  <ToolTestPage currentUser={auth.user} onLogout={onLogout} />
                }
              />
              <Route
                path="/enterprise/persona"
                element={<PersonaPage />}
              />
              <Route
                path="*"
                element={<Navigate to="/enterprise/dashboard" replace />}
              />
              </Routes>
            </Suspense>
          )}
        </div>
      </div>
      {agentCreateOpen && (
        <AgentCreateDialog
          form={agentForm}
          isAdmin={isAdmin}
          sourceAgents={sourceAgents}
          onFormChange={setAgentForm}
          onClose={() => setAgentCreateOpen(false)}
          onCreate={() => void saveAgentCreateModal()}
        />
      )}
    </SidebarProvider>
  );
}

function WorkspaceRoutes({
  auth,
  onLogout,
  guidesCompleted,
}: {
  auth: EnterpriseAuthSession;
  onLogout: () => void;
  guidesCompleted: boolean;
}) {
  const location = useLocation();
  if (location.pathname === "/") {
    return <Navigate to={EnterpriseRoute.Gallery} replace />;
  }
  if (location.pathname === "/chat" || location.pathname === "/chat/") {
    return <Navigate to={EnterpriseRoute.Gallery} replace />;
  }
  if (location.pathname.startsWith("/chat/draft/")) {
    const nextPath = location.pathname.replace(/^\/chat/, EnterpriseRoute.Chat);
    return <Navigate to={`${nextPath}${location.search}`} replace />;
  }
  if (location.pathname.startsWith("/chat/session_")) {
    const nextPath = location.pathname.replace(/^\/chat/, EnterpriseRoute.Chat);
    return <Navigate to={`${nextPath}${location.search}`} replace />;
  }
  if (location.pathname === "/enterprise/chat" || location.pathname === "/enterprise/chat/") {
    return <Navigate to={EnterpriseRoute.Gallery} replace />;
  }
  if (location.pathname.startsWith("/enterprise/chat/draft/")) {
    const nextPath = location.pathname.replace(/^\/enterprise\/chat/, EnterpriseRoute.Chat);
    return <Navigate to={`${nextPath}${location.search}`} replace />;
  }
  if (location.pathname.startsWith("/enterprise/chat/session_")) {
    const nextPath = location.pathname.replace(/^\/enterprise\/chat/, EnterpriseRoute.Chat);
    return <Navigate to={`${nextPath}${location.search}`} replace />;
  }
  if (location.pathname === EnterpriseRoute.Admin || location.pathname.startsWith(`${EnterpriseRoute.Admin}/`)) {
    return isEnterpriseAdmin(auth.user)
      ? (
          <Suspense fallback={<RouteLoading />}>
            <AdminPage currentUser={auth.user} onLogout={onLogout} />
          </Suspense>
        )
      : <Navigate to={EnterpriseRoute.Gallery} replace />;
  }
  if (location.pathname.startsWith(EnterpriseRoute.Workspace)) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route
            path="/workspace"
            element={<Navigate to="/workspace/gallery" replace />}
          />
          <Route path="/workspace/gallery" element={<ChatGalleryPage />} />
          <Route path="/workspace/chat" element={<ChatPage />} />
          <Route
            path="/workspace/chat/draft/:draftAgentId"
            element={<ChatPage />}
          />
          <Route path="/workspace/chat/:sessionId" element={<ChatPage />} />
        </Routes>
      </Suspense>
    );
  }
  return <Shell auth={auth} onLogout={onLogout} guidesCompleted={guidesCompleted} />;
}

export default function AuthenticatedApp({
  auth,
  onLogout,
}: {
  auth: EnterpriseAuthSession;
  onLogout: () => void;
}) {
  // Subscribe the application tree to locale changes so locale-sensitive dates
  // and computed labels update without remounting or losing form state.
  useI18n();
  const [guidesCompleted, setGuidesCompleted] = useState(() => Boolean(
    window.localStorage.getItem(ONBOARDING_SEEN_KEY)
    && window.localStorage.getItem(QUICK_START_SEEN_KEY),
  ));
  const [onboardingMounted, setOnboardingMounted] = useState(
    () => !window.localStorage.getItem(ONBOARDING_SEEN_KEY),
  );
  const [quickStartMounted, setQuickStartMounted] = useState(() => Boolean(
    window.localStorage.getItem(ONBOARDING_SEEN_KEY)
    && !window.localStorage.getItem(QUICK_START_SEEN_KEY),
  ));
  const [onboardingOpenRequest, setOnboardingOpenRequest] = useState(0);
  const [quickStartOpenRequest, setQuickStartOpenRequest] = useState(0);

  useEffect(() => {
    const onQuickStartCompleted = () => setGuidesCompleted(true);
    const openOnboarding = () => {
      setOnboardingMounted(true);
      setOnboardingOpenRequest((request) => request + 1);
    };
    const openQuickStart = () => {
      if (window.localStorage.getItem(QUICK_START_SEEN_KEY)) return;
      setQuickStartMounted(true);
      setQuickStartOpenRequest((request) => request + 1);
    };
    window.addEventListener(QUICK_START_COMPLETED_EVENT, onQuickStartCompleted);
    window.addEventListener(OPEN_ONBOARDING_EVENT, openOnboarding);
    window.addEventListener(OPEN_QUICK_START_EVENT, openQuickStart);
    return () => {
      window.removeEventListener(QUICK_START_COMPLETED_EVENT, onQuickStartCompleted);
      window.removeEventListener(OPEN_ONBOARDING_EVENT, openOnboarding);
      window.removeEventListener(OPEN_QUICK_START_EVENT, openQuickStart);
    };
  }, []);

  return (
    <TooltipProvider>
      <WorkspaceRoutes
        auth={auth}
        onLogout={onLogout}
        guidesCompleted={guidesCompleted}
      />
      {onboardingMounted && (
        <Suspense fallback={null}>
          <OnboardingGuide openRequest={onboardingOpenRequest} />
        </Suspense>
      )}
      {quickStartMounted && (
        <Suspense fallback={null}>
          <QuickStartGuide
            isAdmin={isEnterpriseAdmin(auth.user)}
            openRequest={quickStartOpenRequest}
          />
        </Suspense>
      )}
      <UpdateReminder enabled={guidesCompleted} />
      <Toaster richColors closeButton position="top-center" />
    </TooltipProvider>
  );
}
