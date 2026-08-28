use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, MutexGuard},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

use crate::call_sidecar;

const CHECK_INTERVAL_SECONDS: u64 = 10;
const MAX_RECOVERY_ATTEMPTS: u8 = 4;
const LAUNCH_AGENT_LABEL: &str = "com.deliverypilot.supervisor";
const AUTO_RECOVERY_SETTINGS_FILE: &str = "supervisor-settings.json";
const RECOVERY_REQUIRED_FILE: &str = "supervisor-recovery-required";
const INTENTIONAL_QUIT_FILE: &str = "supervisor-intentional-quit";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupervisorSettings {
    auto_recovery_enabled: bool,
}

impl Default for SupervisorSettings {
    fn default() -> Self {
        Self {
            auto_recovery_enabled: true,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisorEvent {
    pub timestamp_ms: u64,
    pub kind: String,
    pub message: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisedTask {
    pub task_id: String,
    pub workspace_path: String,
    pub stage: String,
    pub app_name: String,
    pub bundle_id: String,
    pub source_document: String,
    pub prompt: String,
    pub state: String,
    pub health: String,
    pub health_message: String,
    pub pid: u32,
    pub retry_count: u8,
    pub max_retries: u8,
    pub recovery_count: u32,
    pub last_check_at_ms: u64,
    pub last_healthy_at_ms: u64,
    pub last_progress_at_ms: u64,
    pub next_retry_at_ms: u64,
    pub progress_fingerprint: String,
    pub progress_percent: u8,
    pub app_running: bool,
    pub window_available: bool,
    pub app_busy: bool,
    pub task_match: bool,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub controller_error: Option<String>,
    pub last_error: Option<String>,
    pub events: Vec<SupervisorEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisorTaskView {
    pub task_id: String,
    pub workspace_path: String,
    pub stage: String,
    pub app_name: String,
    pub bundle_id: String,
    pub state: String,
    pub health: String,
    pub health_message: String,
    pub pid: u32,
    pub retry_count: u8,
    pub max_retries: u8,
    pub recovery_count: u32,
    pub last_check_at_ms: u64,
    pub last_healthy_at_ms: u64,
    pub last_progress_at_ms: u64,
    pub next_retry_at_ms: u64,
    pub progress_percent: u8,
    pub app_running: bool,
    pub window_available: bool,
    pub app_busy: bool,
    pub task_match: bool,
    pub controller_error: Option<String>,
    pub last_error: Option<String>,
    pub events: Vec<SupervisorEvent>,
}

impl From<&SupervisedTask> for SupervisorTaskView {
    fn from(task: &SupervisedTask) -> Self {
        Self {
            task_id: task.task_id.clone(),
            workspace_path: task.workspace_path.clone(),
            stage: task.stage.clone(),
            app_name: task.app_name.clone(),
            bundle_id: task.bundle_id.clone(),
            state: task.state.clone(),
            health: task.health.clone(),
            health_message: task.health_message.clone(),
            pid: task.pid,
            retry_count: task.retry_count,
            max_retries: task.max_retries,
            recovery_count: task.recovery_count,
            last_check_at_ms: task.last_check_at_ms,
            last_healthy_at_ms: task.last_healthy_at_ms,
            last_progress_at_ms: task.last_progress_at_ms,
            next_retry_at_ms: task.next_retry_at_ms,
            progress_percent: task.progress_percent,
            app_running: task.app_running,
            window_available: task.window_available,
            app_busy: task.app_busy,
            task_match: task.task_match,
            controller_error: task.controller_error.clone(),
            last_error: task.last_error.clone(),
            events: task.events.iter().rev().take(30).cloned().collect(),
        }
    }
}

pub struct TaskSupervisor {
    registry_path: PathBuf,
    tasks: Mutex<HashMap<String, SupervisedTask>>,
    automation_lock: Mutex<()>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptTaskRequest {
    pub workspace_path: String,
    pub stage: String,
    pub app_name: String,
    pub bundle_id: String,
    pub source_document: String,
    pub prompt: String,
    pub pid: u32,
}

impl TaskSupervisor {
    pub fn new(registry_path: PathBuf) -> Result<Self, String> {
        let tasks = if registry_path.is_file() {
            serde_json::from_slice(&fs::read(&registry_path).map_err(|error| error.to_string())?)
                .unwrap_or_default()
        } else {
            HashMap::new()
        };
        let supervisor = Self {
            registry_path,
            tasks: Mutex::new(tasks),
            automation_lock: Mutex::new(()),
        };
        supervisor.sync_recovery_marker()?;
        Ok(supervisor)
    }

    pub fn register(
        &self,
        workspace_path: String,
        stage: String,
        app_name: String,
        bundle_id: String,
        source_document: String,
        prompt: String,
        pid: u32,
    ) -> Result<(), String> {
        let now = now_ms();
        let task_id = format!("{}:{}", workspace_path, stage);
        let mut tasks = self.tasks.lock().map_err(|error| error.to_string())?;
        let previous = tasks.remove(&task_id);
        let mut task = SupervisedTask {
            task_id: task_id.clone(),
            workspace_path,
            stage,
            app_name,
            bundle_id,
            source_document,
            prompt,
            state: "monitoring".into(),
            health: "starting".into(),
            health_message: "任务已登记，等待首次健康检查".into(),
            pid,
            retry_count: previous.as_ref().map_or(0, |task| task.retry_count),
            max_retries: MAX_RECOVERY_ATTEMPTS,
            recovery_count: previous.as_ref().map_or(0, |task| task.recovery_count),
            last_check_at_ms: now,
            last_healthy_at_ms: now,
            last_progress_at_ms: now,
            next_retry_at_ms: 0,
            progress_fingerprint: String::new(),
            progress_percent: 0,
            app_running: true,
            window_available: true,
            app_busy: true,
            task_match: true,
            revision: previous.as_ref().map_or(1, |task| task.revision + 1),
            controller_error: None,
            last_error: None,
            events: previous.map_or_else(Vec::new, |task| task.events),
        };
        push_event(&mut task, "registered", "任务已交由后台监督器托管");
        tasks.insert(task_id.clone(), task);
        self.persist_locked(&tasks, Some(&task_id))
    }

    pub fn adopt(&self, request: AdoptTaskRequest) -> Result<(), String> {
        let task_id = format!("{}:{}", request.workspace_path, request.stage);
        if self
            .tasks
            .lock()
            .map_err(|error| error.to_string())?
            .contains_key(&task_id)
        {
            return Ok(());
        }
        self.register(
            request.workspace_path,
            request.stage,
            request.app_name,
            request.bundle_id,
            request.source_document,
            request.prompt,
            request.pid,
        )
    }

    pub fn discover_workspace(&self, workspace_root: &Path) -> Result<usize, String> {
        let projects = workspace_root.join("projects");
        if !projects.is_dir() {
            return Ok(0);
        }
        let mut adopted = 0;
        for entry in walkdir::WalkDir::new(&projects)
            .max_depth(6)
            .into_iter()
            .filter_map(Result::ok)
        {
            if entry.file_name() != "version.json"
                || entry.path().parent().and_then(Path::file_name)
                    != Some(std::ffi::OsStr::new(".delivery-pilot"))
            {
                continue;
            }
            let Ok(manifest) = fs::read(entry.path())
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .ok_or(())
            else {
                continue;
            };
            if manifest.get("status").and_then(Value::as_str) != Some("running") {
                continue;
            }
            let Some(workspace) = entry.path().parent().and_then(Path::parent) else {
                continue;
            };
            let work_progress =
                read_progress_value(&workspace.join(".delivery-pilot/traework-progress.json"));
            let work_complete = work_progress
                .as_ref()
                .and_then(|value| value.get("completed"))
                .and_then(Value::as_bool)
                == Some(true)
                && workspace
                    .join(".delivery-pilot/traework-result.md")
                    .is_file();
            let (stage, app_name, bundle_id, prompt) = if work_complete {
                (
                    "trae_spec",
                    "Trae Code",
                    "cn.trae.app",
                    "继续当前版本的研发规格、实现、测试、构建和交付证据任务。",
                )
            } else {
                (
                    "traework_analysis",
                    "Trae Work",
                    "cn.trae.solo.app",
                    "继续当前版本的需求分析任务，完成需求、规则、验收标准和结果文件。",
                )
            };
            let task_id = format!("{}:{stage}", workspace.to_string_lossy());
            if self
                .tasks
                .lock()
                .map_err(|error| error.to_string())?
                .contains_key(&task_id)
            {
                continue;
            }
            let source_document = fs::read_dir(workspace.join(".delivery-pilot/input"))
                .ok()
                .and_then(|entries| {
                    entries
                        .filter_map(Result::ok)
                        .map(|entry| entry.path())
                        .find(|path| path.is_file())
                })
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default();
            self.register(
                workspace.to_string_lossy().to_string(),
                stage.into(),
                app_name.into(),
                bundle_id.into(),
                source_document,
                prompt.into(),
                0,
            )?;
            adopted += 1;
        }
        Ok(adopted)
    }

    fn persist_locked(
        &self,
        tasks: &HashMap<String, SupervisedTask>,
        changed_task_id: Option<&str>,
    ) -> Result<(), String> {
        if let Some(parent) = self.registry_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        atomic_json(&self.registry_path, tasks)?;
        for task in tasks
            .values()
            .filter(|task| changed_task_id.is_none_or(|task_id| task.task_id == task_id))
        {
            let checkpoint =
                PathBuf::from(&task.workspace_path).join(".delivery-pilot/supervisor.json");
            atomic_json(&checkpoint, task)?;
        }
        self.sync_recovery_marker_locked(tasks)?;
        Ok(())
    }

    fn lifecycle_path(&self, file_name: &str) -> PathBuf {
        self.registry_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(file_name)
    }

    fn sync_recovery_marker_locked(
        &self,
        tasks: &HashMap<String, SupervisedTask>,
    ) -> Result<(), String> {
        sync_recovery_marker(
            &self.lifecycle_path(RECOVERY_REQUIRED_FILE),
            tasks.values().any(task_requires_app_recovery),
        )
    }

    fn sync_recovery_marker(&self) -> Result<(), String> {
        let tasks = self.tasks.lock().map_err(|error| error.to_string())?;
        self.sync_recovery_marker_locked(&tasks)
    }

    fn recovery_required(&self) -> bool {
        self.tasks
            .lock()
            .is_ok_and(|tasks| tasks.values().any(task_requires_app_recovery))
    }

    pub fn list(&self) -> Vec<SupervisorTaskView> {
        let Ok(tasks) = self.tasks.lock() else {
            return Vec::new();
        };
        let mut result = tasks
            .values()
            .map(SupervisorTaskView::from)
            .collect::<Vec<_>>();
        result.sort_by_key(|task| std::cmp::Reverse(task.last_check_at_ms));
        result
    }

    pub(crate) fn full_tasks(&self) -> Vec<SupervisedTask> {
        let Ok(tasks) = self.tasks.lock() else {
            return Vec::new();
        };
        let mut result = tasks.values().cloned().collect::<Vec<_>>();
        result.sort_by(|left, right| left.task_id.cmp(&right.task_id));
        result
    }

    fn snapshot(&self) -> Vec<(u64, SupervisedTask)> {
        self.tasks
            .lock()
            .map(|tasks| {
                tasks
                    .values()
                    .filter(|task| {
                        matches!(
                            task.state.as_str(),
                            "monitoring" | "recovering" | "transition_pending"
                        )
                    })
                    .map(|task| (task.revision, task.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn update_batch(&self, checked: Vec<(u64, SupervisedTask)>) {
        let Ok(mut tasks) = self.tasks.lock() else {
            return;
        };
        let mut changed = Vec::new();
        for (expected_revision, task) in checked {
            let Some(current) = tasks.get(&task.task_id) else {
                continue;
            };
            if current.revision != expected_revision {
                continue;
            }
            if serde_json::to_vec(current).ok() == serde_json::to_vec(&task).ok() {
                continue;
            }
            changed.push(task.task_id.clone());
            tasks.insert(task.task_id.clone(), task);
        }
        if changed.is_empty() {
            return;
        }
        if let Some(parent) = self.registry_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = atomic_json(&self.registry_path, &*tasks);
        let _ = self.sync_recovery_marker_locked(&tasks);
        for task_id in changed {
            if let Some(task) = tasks.get(&task_id) {
                let checkpoint =
                    PathBuf::from(&task.workspace_path).join(".delivery-pilot/supervisor.json");
                let _ = atomic_json(&checkpoint, task);
            }
        }
    }

    fn has_stage(&self, workspace_path: &str, stage: &str) -> bool {
        let task_id = format!("{workspace_path}:{stage}");
        self.tasks
            .lock()
            .is_ok_and(|tasks| tasks.contains_key(&task_id))
    }

    pub(crate) fn automation_guard(&self) -> Result<MutexGuard<'_, ()>, String> {
        self.automation_lock
            .lock()
            .map_err(|error| error.to_string())
    }

    pub fn control(&self, task_id: &str, action: &str) -> Result<(), String> {
        let mut tasks = self.tasks.lock().map_err(|error| error.to_string())?;
        let task = tasks
            .get_mut(task_id)
            .ok_or_else(|| "监督任务不存在".to_string())?;
        match action {
            "pause" => {
                task.state = "paused".into();
                task.health_message = "已暂停自动恢复，保留当前检查点".into();
                push_event(task, "paused", "用户暂停了自动恢复");
            }
            "resume" => {
                task.state = "monitoring".into();
                task.next_retry_at_ms = 0;
                task.last_error = None;
                push_event(task, "resumed", "后台监督已恢复");
            }
            "recover_now" => {
                task.state = "monitoring".into();
                task.next_retry_at_ms = 0;
                task.health = "recovery_pending".into();
                push_event(task, "recover_requested", "用户要求立即从检查点恢复");
            }
            "reset_budget" => {
                task.retry_count = 0;
                task.next_retry_at_ms = 0;
                task.state = "monitoring".into();
                push_event(task, "retry_budget_reset", "重试预算已重置");
            }
            "stop" => {
                task.state = "stopped".into();
                task.health = "stopped".into();
                task.health_message = "任务监督已停止，检查点仍保留".into();
                push_event(task, "stopped", "用户停止了任务监督");
            }
            _ => return Err("不支持的监督操作".into()),
        }
        task.revision = task.revision.saturating_add(1);
        self.persist_locked(&tasks, Some(task_id))
    }
}

fn task_requires_app_recovery(task: &SupervisedTask) -> bool {
    matches!(
        task.state.as_str(),
        "monitoring" | "recovering" | "transition_pending"
    )
}

fn sync_recovery_marker(path: &Path, required: bool) -> Result<(), String> {
    if required {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(path, b"active\n").map_err(|error| error.to_string())
    } else {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

pub(crate) fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

fn now_ms() -> u64 {
    current_time_ms()
}

fn atomic_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn push_event(task: &mut SupervisedTask, kind: &str, message: &str) {
    task.events.push(SupervisorEvent {
        timestamp_ms: now_ms(),
        kind: kind.into(),
        message: message.into(),
    });
    if task.events.len() > 100 {
        task.events.drain(..task.events.len() - 100);
    }
}

fn progress_file(task: &SupervisedTask) -> PathBuf {
    let name = if task.stage == "traework_analysis" {
        "traework-progress.json"
    } else {
        "progress.json"
    };
    PathBuf::from(&task.workspace_path)
        .join(".delivery-pilot")
        .join(name)
}

fn read_progress_value(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn progress_is_stale(task: &SupervisedTask, now: u64) -> bool {
    let stalled_seconds = if task.stage == "traework_analysis" {
        10 * 60
    } else {
        20 * 60
    };
    now.saturating_sub(task.last_progress_at_ms) > stalled_seconds * 1_000
}

fn progress_snapshot(task: &SupervisedTask) -> (String, u8, bool) {
    let path = progress_file(task);
    let Ok(bytes) = fs::read(&path) else {
        return ("missing".into(), 0, false);
    };
    let modified = fs::metadata(&path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_millis());
    let value = serde_json::from_slice::<Value>(&bytes).unwrap_or(Value::Null);
    let percent = value
        .get("percent")
        .and_then(Value::as_u64)
        .unwrap_or_default()
        .min(100) as u8;
    let completed = value
        .get("completed")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    (
        format!("{modified}:{}:{percent}", bytes.len()),
        percent,
        completed,
    )
}

fn inspect(app: &AppHandle, task: &SupervisedTask) -> Result<HashMap<String, String>, String> {
    call_sidecar(
        app,
        "app.inspect",
        HashMap::from([
            ("bundleId", task.bundle_id.as_str()),
            ("workingDirectory", task.workspace_path.as_str()),
        ]),
    )
}

fn open_application(task: &SupervisedTask) -> Result<(), String> {
    let status = if task.bundle_id == "cn.trae.solo.app" {
        Command::new("/usr/bin/open")
            .args(["-b", task.bundle_id.as_str()])
            .status()
    } else {
        Command::new("/usr/bin/open")
            .args(["-b", task.bundle_id.as_str(), "--args", "--reuse-window"])
            .arg(&task.workspace_path)
            .status()
    }
    .map_err(|error| format!("无法重启 {}: {error}", task.app_name))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{} 重启失败", task.app_name))
    }
}

fn recovery_prompt(task: &SupervisedTask) -> String {
    let progress = if task.stage == "traework_analysis" {
        ".delivery-pilot/traework-progress.json 与 .delivery-pilot/traework-result.md"
    } else {
        ".delivery-pilot/progress.json、.delivery-pilot/traecode-result.md 和现有源码"
    };
    format!(
        "【DeliveryPilot 断点恢复】这不是新任务，不要从头重做。当前工作目录：{}\n\
         请先读取 {progress}，核对已经完成的文件和检查点，从第一个未完成步骤继续。\
         保留已完成产物，不覆盖正确结果；继续沿用原进度文件并更新心跳。\
         原任务目标如下：\n{}",
        task.workspace_path, task.prompt
    )
}

fn recover(
    app: &AppHandle,
    supervisor: &TaskSupervisor,
    task: &mut SupervisedTask,
) -> Result<(), String> {
    let _automation = supervisor.automation_guard()?;
    task.state = "recovering".into();
    task.health = "recovering".into();
    task.health_message = format!("正在执行第 {} 次断点恢复", task.retry_count + 1);
    push_event(
        task,
        "recovery_started",
        &format!("开始第 {} 次断点恢复", task.retry_count + 1),
    );
    open_application(task)?;
    thread::sleep(Duration::from_secs(4));
    let prompt = recovery_prompt(task);
    let source = task.source_document.clone();
    let workspace = task.workspace_path.clone();
    let primary = call_sidecar(
        app,
        "chat.submit",
        HashMap::from([
            ("bundleId", task.bundle_id.as_str()),
            ("prompt", prompt.as_str()),
            ("sourceDocument", source.as_str()),
            ("workingDirectory", workspace.as_str()),
            ("workflow", "chat"),
        ]),
    );
    let result = if primary.is_err() && task.stage == "traework_analysis" {
        call_sidecar(
            app,
            "chat.submit",
            HashMap::from([
                ("bundleId", task.bundle_id.as_str()),
                ("prompt", prompt.as_str()),
                ("sourceDocument", source.as_str()),
                ("workingDirectory", workspace.as_str()),
                ("workflow", "traework"),
            ]),
        )
    } else {
        primary
    }?;
    task.pid = result
        .get("pid")
        .and_then(|value| value.parse().ok())
        .unwrap_or(task.pid);
    task.retry_count += 1;
    task.recovery_count += 1;
    task.state = "monitoring".into();
    task.health = "recovering".into();
    task.health_message = "断点恢复指令已发送，等待新的进度心跳".into();
    task.last_error = None;
    task.next_retry_at_ms = now_ms() + 30_000;
    push_event(task, "recovery_submitted", "已从最近检查点继续执行");
    Ok(())
}

fn check_task(
    app: &AppHandle,
    supervisor: &TaskSupervisor,
    mut task: SupervisedTask,
) -> SupervisedTask {
    if task.state == "transition_pending" {
        task.last_check_at_ms = now_ms();
        if supervisor.has_stage(&task.workspace_path, "trae_spec") {
            task.state = "completed".into();
            task.health_message = "后续研发阶段已由任务编排器接管".into();
            push_event(&mut task, "transition_confirmed", "Trae Code 阶段已接管");
            return task;
        }
        if task.last_check_at_ms < task.next_retry_at_ms {
            return task;
        }
        if crate::technology_advisory::technology_work_in_progress(Path::new(&task.workspace_path))
            && task
                .last_check_at_ms
                .saturating_sub(task.last_healthy_at_ms)
                < 30 * 60 * 1_000
        {
            task.health = "waiting_technology".into();
            task.health_message = "技术参考仍在运行，后台保留主流程接续权".into();
            task.next_retry_at_ms = now_ms() + 30_000;
            return task;
        }
        let prompt = "请读取当前工作目录中的原始需求文档和 \
            .delivery-pilot/traework-result.md，继续完成研发规格、代码实现、自动化测试、\
            构建和交付证据。请沿用已有检查点，不要重新执行已完成的需求分析。";
        match crate::launch_external_stage_core(
            app,
            supervisor,
            crate::ExternalStage::TraeSpec,
            prompt.into(),
            task.source_document.clone(),
            task.workspace_path.clone(),
        ) {
            Ok(_) => {
                task.state = "completed".into();
                task.health_message = "前端未接续，后台已从检查点启动 Trae Code".into();
                push_event(
                    &mut task,
                    "transition_recovered",
                    "后台已自动启动下一研发阶段",
                );
            }
            Err(error) => {
                task.health = "transition_failed".into();
                task.health_message = format!("后台接续失败：{error}");
                task.last_error = Some(error.clone());
                task.next_retry_at_ms = now_ms() + 30_000;
                push_event(&mut task, "transition_failed", &error);
            }
        }
        return task;
    }
    if !matches!(task.state.as_str(), "monitoring" | "recovering") {
        return task;
    }
    let force_recovery = task.health == "recovery_pending";
    let now = now_ms();
    task.last_check_at_ms = now;
    let (fingerprint, percent, completed) = progress_snapshot(&task);
    if completed {
        let needs_transition = task.stage == "traework_analysis";
        task.state = if needs_transition {
            "transition_pending".into()
        } else {
            "completed".into()
        };
        task.health = "completed".into();
        task.health_message = if needs_transition {
            "需求阶段完成，等待技术参考或后台自动接续".into()
        } else {
            "阶段产物与完成标记已确认".into()
        };
        task.progress_percent = 100;
        task.last_healthy_at_ms = now;
        task.next_retry_at_ms = if needs_transition { now + 60_000 } else { 0 };
        push_event(
            &mut task,
            "completed",
            if needs_transition {
                "阶段已完成，后台接续计时已启动"
            } else {
                "阶段已完成，监督器停止恢复动作"
            },
        );
        return task;
    }
    if fingerprint != "missing" && fingerprint != task.progress_fingerprint {
        task.progress_fingerprint = fingerprint;
        task.progress_percent = percent;
        task.last_progress_at_ms = now;
        task.last_healthy_at_ms = now;
        task.retry_count = 0;
        task.health = "healthy".into();
        task.health_message = format!("检测到新的进度心跳：{percent}%");
        push_event(&mut task, "progress", &format!("进度更新到 {percent}%"));
    }

    let inspection = match inspect(app, &task) {
        Ok(inspection) => {
            task.controller_error = None;
            inspection
        }
        Err(error) => {
            task.health = "controller_unavailable".into();
            task.health_message = "控制器暂时不可用，不会重启客户软件或消耗重试次数".into();
            task.controller_error = Some(error.clone());
            task.last_error = Some(error);
            return task;
        }
    };
    task.app_running = inspection.get("running").map(String::as_str) == Some("true");
    task.window_available = inspection.get("windowAvailable").map(String::as_str) == Some("true");
    task.app_busy = inspection.get("busy").map(String::as_str) == Some("true");
    task.task_match = inspection.get("taskMatch").map(String::as_str) == Some("true");
    task.pid = inspection
        .get("pid")
        .and_then(|value| value.parse().ok())
        .unwrap_or(task.pid);
    if inspection.get("screenLocked").map(String::as_str) == Some("true") {
        task.health = "waiting_unlock".into();
        task.health_message = "macOS 已锁屏，保留检查点并等待解锁".into();
        task.next_retry_at_ms = 0;
        return task;
    }
    if force_recovery {
        match recover(app, supervisor, &mut task) {
            Ok(()) => {}
            Err(error) => {
                task.retry_count += 1;
                task.state = "monitoring".into();
                task.health = "recovery_failed".into();
                task.health_message = error.clone();
                task.last_error = Some(error.clone());
                task.next_retry_at_ms = now + 30_000;
                push_event(&mut task, "recovery_failed", &error);
            }
        }
        return task;
    }

    let stale = progress_is_stale(&task, now);
    if task.app_running && task.window_available && !stale {
        task.health = if task.task_match {
            "healthy".into()
        } else {
            "task_unverified".into()
        };
        task.health_message = if task.app_busy {
            "目标应用正在生成，进度心跳仍在有效窗口内".into()
        } else if task.task_match {
            "目标应用与当前工作区匹配".into()
        } else {
            "应用在线，当前任务需结合产物心跳持续确认".into()
        };
        task.last_healthy_at_ms = now;
        return task;
    }

    let reason = if !task.app_running {
        "目标应用已退出"
    } else if !task.window_available {
        "目标应用没有可用窗口"
    } else {
        "超过允许时间未检测到进度或生成状态"
    };
    task.health = if stale {
        "stalled".into()
    } else {
        "offline".into()
    };
    task.health_message = reason.into();
    task.last_error = Some(reason.into());
    if task.retry_count >= task.max_retries {
        task.state = "needs_attention".into();
        task.health = "retry_exhausted".into();
        task.health_message = format!("自动恢复已达到 {} 次，需要人工确认", task.max_retries);
        push_event(&mut task, "retry_exhausted", "自动恢复预算已耗尽");
        return task;
    }
    if now < task.next_retry_at_ms {
        return task;
    }
    match recover(app, supervisor, &mut task) {
        Ok(()) => {}
        Err(error) => {
            task.retry_count += 1;
            task.state = "monitoring".into();
            task.health = "recovery_failed".into();
            task.health_message = error.clone();
            task.last_error = Some(error.clone());
            let delay = 10_u64.saturating_mul(3_u64.pow(task.retry_count.min(3) as u32));
            task.next_retry_at_ms = now + delay * 1_000;
            push_event(&mut task, "recovery_failed", &error);
        }
    }
    task
}

pub fn start(app: AppHandle) {
    thread::spawn(move || loop {
        let supervisor = app.state::<TaskSupervisor>();
        let snapshots = supervisor.snapshot();
        let checked = thread::scope(|scope| {
            snapshots
                .into_iter()
                .map(|(revision, task)| {
                    let app = &app;
                    let supervisor = &*supervisor;
                    scope.spawn(move || (revision, check_task(app, supervisor, task)))
                })
                .collect::<Vec<_>>()
                .into_iter()
                .filter_map(|handle| handle.join().ok())
                .collect::<Vec<_>>()
        });
        supervisor.update_batch(checked);
        thread::sleep(Duration::from_secs(CHECK_INTERVAL_SECONDS));
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisorRuntimeStatus {
    pub loop_running: bool,
    pub launch_agent_loaded: bool,
    pub auto_recovery_enabled: bool,
    pub auto_recovery_armed: bool,
    pub recovery_required: bool,
    pub launch_agent_label: &'static str,
    pub check_interval_seconds: u64,
    pub detail: String,
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn watchdog_script(
    process_name: &str,
    executable: &str,
    app_path: &str,
    intentional_quit: &Path,
    recovery_required: &Path,
) -> String {
    format!(
        "while true; do running=false; \
         if [ -f {} ] || [ ! -f {} ]; then /bin/sleep 5; continue; fi; \
         for pid in $(/usr/bin/pgrep -x {}); do \
         if [ \"$(/bin/ps -p \"$pid\" -o command=)\" = {} ]; then running=true; break; fi; done; \
         if [ \"$running\" = false ]; then /usr/bin/open -a {}; /bin/sleep 8; fi; \
         /bin/sleep 5; done",
        shell_quote(&intentional_quit.to_string_lossy()),
        shell_quote(&recovery_required.to_string_lossy()),
        shell_quote(process_name),
        shell_quote(executable),
        shell_quote(app_path)
    )
}

fn current_uid() -> String {
    Command::new("/usr/bin/id")
        .arg("-u")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|| "0".into())
}

fn launch_agent_loaded() -> bool {
    let uid = current_uid();
    Command::new("/bin/launchctl")
        .args(["print", &format!("gui/{uid}/{LAUNCH_AGENT_LABEL}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn lifecycle_file(data_dir: &Path, file_name: &str) -> PathBuf {
    data_dir.join(file_name)
}

fn supervisor_settings(data_dir: &Path) -> SupervisorSettings {
    fs::read(lifecycle_file(data_dir, AUTO_RECOVERY_SETTINGS_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_supervisor_settings(data_dir: &Path, settings: &SupervisorSettings) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
    atomic_json(
        &lifecycle_file(data_dir, AUTO_RECOVERY_SETTINGS_FILE),
        settings,
    )
}

pub fn prepare_for_user_launch(data_dir: &Path) -> Result<(), String> {
    sync_recovery_marker(&lifecycle_file(data_dir, INTENTIONAL_QUIT_FILE), false)
}

pub fn mark_intentional_quit(data_dir: &Path) -> Result<(), String> {
    sync_recovery_marker(&lifecycle_file(data_dir, INTENTIONAL_QUIT_FILE), true)
}

fn uninstall_login_agent(remove_plist: bool) -> Result<(), String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "无法定位用户目录".to_string())?;
    let path = PathBuf::from(home)
        .join("Library/LaunchAgents")
        .join(format!("{LAUNCH_AGENT_LABEL}.plist"));
    let uid = current_uid();
    let service = format!("gui/{uid}/{LAUNCH_AGENT_LABEL}");
    if launch_agent_loaded() {
        let status = Command::new("/bin/launchctl")
            .args(["bootout", &service])
            .status()
            .map_err(|error| format!("无法卸载后台监督登录项: {error}"))?;
        if !status.success() {
            return Err("launchd 未能卸载后台监督登录项".into());
        }
    }
    if remove_plist {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

pub fn install_login_agent(data_dir: &Path) -> Result<(), String> {
    if !supervisor_settings(data_dir).auto_recovery_enabled {
        return uninstall_login_agent(true);
    }
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable_text = executable.to_string_lossy();
    if !executable_text.contains(".app/Contents/MacOS/") {
        return Ok(());
    }
    let home = std::env::var_os("HOME").ok_or_else(|| "无法定位用户目录".to_string())?;
    let agents = PathBuf::from(home).join("Library/LaunchAgents");
    fs::create_dir_all(&agents).map_err(|error| error.to_string())?;
    let path = agents.join(format!("{LAUNCH_AGENT_LABEL}.plist"));
    let app_path = executable
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .ok_or_else(|| "无法定位 DeliveryPilot.app".to_string())?;
    let process_name = executable
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "无法识别 DeliveryPilot 进程名".to_string())?;
    let intentional_quit = lifecycle_file(data_dir, INTENTIONAL_QUIT_FILE);
    let recovery_required = lifecycle_file(data_dir, RECOVERY_REQUIRED_FILE);
    let watchdog = watchdog_script(
        process_name,
        &executable_text,
        &app_path.to_string_lossy(),
        &intentional_quit,
        &recovery_required,
    );
    let escaped_watchdog = watchdog
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>{escaped_watchdog}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
"#
    );
    fs::write(&path, plist).map_err(|error| error.to_string())?;
    let uid = current_uid();
    let domain = format!("gui/{uid}");
    let service = format!("{domain}/{LAUNCH_AGENT_LABEL}");
    if launch_agent_loaded() {
        let _ = Command::new("/bin/launchctl")
            .args(["bootout", &service])
            .status();
    }
    let status = Command::new("/bin/launchctl")
        .args(["bootstrap", &domain, path.to_string_lossy().as_ref()])
        .status()
        .map_err(|error| format!("无法加载后台监督登录项: {error}"))?;
    if !status.success() || !launch_agent_loaded() {
        return Err("后台监督登录项已写入，但 launchd 未确认加载".into());
    }
    Ok(())
}

#[tauri::command]
pub fn supervisor_tasks(supervisor: State<'_, TaskSupervisor>) -> Vec<SupervisorTaskView> {
    supervisor.list()
}

fn runtime_status(data_dir: &Path, recovery_required: bool) -> SupervisorRuntimeStatus {
    let loaded = launch_agent_loaded();
    let settings = supervisor_settings(data_dir);
    let intentional_quit = lifecycle_file(data_dir, INTENTIONAL_QUIT_FILE).is_file();
    let armed = loaded && settings.auto_recovery_enabled && recovery_required && !intentional_quit;
    SupervisorRuntimeStatus {
        loop_running: true,
        launch_agent_loaded: loaded,
        auto_recovery_enabled: settings.auto_recovery_enabled,
        auto_recovery_armed: armed,
        recovery_required,
        launch_agent_label: LAUNCH_AGENT_LABEL,
        check_interval_seconds: CHECK_INTERVAL_SECONDS,
        detail: if !settings.auto_recovery_enabled {
            "后台巡检运行中，异常退出自动恢复已关闭".into()
        } else if intentional_quit {
            "已记录主动退出，后台不会重新启动应用".into()
        } else if !recovery_required {
            "当前没有运行中任务，应用退出后不会自动拉起".into()
        } else if loaded {
            "运行中任务受保护，异常退出时将自动恢复".into()
        } else {
            "巡检线程运行中，但异常退出自动拉起尚未加载".into()
        },
    }
}

#[tauri::command]
pub fn supervisor_runtime_status(
    app: AppHandle,
    supervisor: State<'_, TaskSupervisor>,
) -> Result<SupervisorRuntimeStatus, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(runtime_status(&data_dir, supervisor.recovery_required()))
}

#[tauri::command]
pub fn supervisor_auto_recovery_set(
    app: AppHandle,
    supervisor: State<'_, TaskSupervisor>,
    enabled: bool,
) -> Result<SupervisorRuntimeStatus, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    write_supervisor_settings(
        &data_dir,
        &SupervisorSettings {
            auto_recovery_enabled: enabled,
        },
    )?;
    if enabled {
        prepare_for_user_launch(&data_dir)?;
        install_login_agent(&data_dir)?;
    } else {
        uninstall_login_agent(true)?;
    }
    Ok(runtime_status(&data_dir, supervisor.recovery_required()))
}

#[tauri::command]
pub fn supervisor_control(
    supervisor: State<'_, TaskSupervisor>,
    task_id: String,
    action: String,
) -> Result<(), String> {
    supervisor.control(&task_id, &action)
}

#[tauri::command]
pub fn supervisor_adopt(
    supervisor: State<'_, TaskSupervisor>,
    request: AdoptTaskRequest,
) -> Result<(), String> {
    supervisor.adopt(request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_checkpoint_and_controls_retry_budget() {
        let root =
            std::env::temp_dir().join(format!("delivery-supervisor-{}", uuid::Uuid::new_v4()));
        let workspace = root.join("workspace");
        fs::create_dir_all(&workspace).expect("create workspace");
        let registry = root.join("registry.json");
        let supervisor = TaskSupervisor::new(registry.clone()).expect("create supervisor");
        supervisor
            .register(
                workspace.to_string_lossy().to_string(),
                "traework_analysis".into(),
                "TRAE SOLO CN".into(),
                "cn.trae.solo.app".into(),
                "/tmp/requirements.pdf".into(),
                "analyze requirements".into(),
                42,
            )
            .expect("register task");
        let task_id = format!("{}:traework_analysis", workspace.to_string_lossy());
        assert!(registry.is_file());
        assert!(workspace.join(".delivery-pilot/supervisor.json").is_file());
        assert_eq!(supervisor.list().len(), 1);

        supervisor.control(&task_id, "pause").expect("pause task");
        assert_eq!(supervisor.list()[0].state, "paused");
        supervisor
            .control(&task_id, "recover_now")
            .expect("request recovery");
        let task = &supervisor.list()[0];
        assert_eq!(task.state, "monitoring");
        assert_eq!(task.health, "recovery_pending");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_progress_checkpoint_without_claiming_missing_work() {
        let root = std::env::temp_dir().join(format!("delivery-progress-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join(".delivery-pilot")).expect("create metadata");
        let task = SupervisedTask {
            task_id: "test".into(),
            workspace_path: root.to_string_lossy().to_string(),
            stage: "traework_analysis".into(),
            app_name: "TRAE SOLO CN".into(),
            bundle_id: "cn.trae.solo.app".into(),
            source_document: String::new(),
            prompt: String::new(),
            state: "monitoring".into(),
            health: "starting".into(),
            health_message: String::new(),
            pid: 0,
            retry_count: 0,
            max_retries: 4,
            recovery_count: 0,
            last_check_at_ms: 0,
            last_healthy_at_ms: 0,
            last_progress_at_ms: 0,
            next_retry_at_ms: 0,
            progress_fingerprint: String::new(),
            progress_percent: 0,
            app_running: false,
            window_available: false,
            app_busy: false,
            task_match: false,
            revision: 1,
            controller_error: None,
            last_error: None,
            events: Vec::new(),
        };
        assert_eq!(progress_snapshot(&task), ("missing".into(), 0, false));
        fs::write(
            root.join(".delivery-pilot/traework-progress.json"),
            r#"{"percent":64,"completed":false}"#,
        )
        .expect("write progress");
        let (_, percent, completed) = progress_snapshot(&task);
        assert_eq!(percent, 64);
        assert!(!completed);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn busy_control_does_not_hide_a_stale_progress_heartbeat() {
        let mut task = test_task("traework_analysis");
        task.app_busy = true;
        task.last_progress_at_ms = 1_000;
        assert!(progress_is_stale(&task, 602_001));
    }

    #[test]
    fn stale_snapshot_cannot_overwrite_a_user_pause() {
        let root = std::env::temp_dir().join(format!("delivery-cas-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create workspace");
        let supervisor =
            TaskSupervisor::new(root.join("registry.json")).expect("create supervisor");
        supervisor
            .register(
                root.to_string_lossy().to_string(),
                "traework_analysis".into(),
                "Trae Work".into(),
                "cn.trae.solo.app".into(),
                "/tmp/requirements.pdf".into(),
                "analyze".into(),
                1,
            )
            .expect("register");
        let (revision, mut stale) = supervisor.snapshot().remove(0);
        supervisor
            .control(&stale.task_id, "pause")
            .expect("pause task");
        stale.health = "healthy".into();
        supervisor.update_batch(vec![(revision, stale)]);
        assert_eq!(supervisor.list()[0].state, "paused");
        let _ = fs::remove_dir_all(root);
    }

    fn test_task(stage: &str) -> SupervisedTask {
        SupervisedTask {
            task_id: "test".into(),
            workspace_path: "/tmp/test".into(),
            stage: stage.into(),
            app_name: "Trae".into(),
            bundle_id: "cn.trae.app".into(),
            source_document: String::new(),
            prompt: String::new(),
            state: "monitoring".into(),
            health: "starting".into(),
            health_message: String::new(),
            pid: 0,
            retry_count: 0,
            max_retries: 4,
            recovery_count: 0,
            last_check_at_ms: 0,
            last_healthy_at_ms: 0,
            last_progress_at_ms: 0,
            next_retry_at_ms: 0,
            progress_fingerprint: String::new(),
            progress_percent: 0,
            app_running: false,
            window_available: false,
            app_busy: false,
            task_match: false,
            revision: 1,
            controller_error: None,
            last_error: None,
            events: Vec::new(),
        }
    }

    #[test]
    fn discovers_running_workspace_without_frontend_state() {
        let root =
            std::env::temp_dir().join(format!("delivery-discovery-{}", uuid::Uuid::new_v4()));
        let workspace = root.join("projects/demo/versions/v2");
        fs::create_dir_all(workspace.join(".delivery-pilot/input")).expect("create workspace");
        fs::write(
            workspace.join(".delivery-pilot/version.json"),
            r#"{"status":"running"}"#,
        )
        .expect("write manifest");
        fs::write(
            workspace.join(".delivery-pilot/input/requirements.md"),
            "requirements",
        )
        .expect("write source");
        let supervisor =
            TaskSupervisor::new(root.join("registry.json")).expect("create supervisor");
        assert_eq!(
            supervisor
                .discover_workspace(&root)
                .expect("discover tasks"),
            1
        );
        assert_eq!(supervisor.list()[0].stage, "traework_analysis");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recovery_marker_exists_only_for_active_tasks() {
        let root =
            std::env::temp_dir().join(format!("delivery-recovery-marker-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create root");
        let supervisor =
            TaskSupervisor::new(root.join("supervisor-tasks.json")).expect("create supervisor");
        let marker = root.join(RECOVERY_REQUIRED_FILE);
        assert!(!marker.exists());

        supervisor
            .register(
                root.join("workspace").to_string_lossy().to_string(),
                "traework_analysis".into(),
                "Trae Work".into(),
                "cn.trae.solo.app".into(),
                "/tmp/requirements.pdf".into(),
                "analyze".into(),
                42,
            )
            .expect("register active task");
        assert!(marker.is_file());

        let task_id = format!(
            "{}:traework_analysis",
            root.join("workspace").to_string_lossy()
        );
        supervisor.control(&task_id, "pause").expect("pause task");
        assert!(!marker.exists());
        supervisor.control(&task_id, "resume").expect("resume task");
        assert!(marker.is_file());
        supervisor.control(&task_id, "stop").expect("stop task");
        assert!(!marker.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn intentional_quit_marker_survives_until_a_user_launch() {
        let root = std::env::temp_dir().join(format!(
            "delivery-intentional-quit-{}",
            uuid::Uuid::new_v4()
        ));
        mark_intentional_quit(&root).expect("mark intentional quit");
        assert!(root.join(INTENTIONAL_QUIT_FILE).is_file());
        prepare_for_user_launch(&root).expect("prepare user launch");
        assert!(!root.join(INTENTIONAL_QUIT_FILE).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn auto_recovery_preference_is_persistent_and_defaults_on() {
        let root = std::env::temp_dir().join(format!(
            "delivery-recovery-setting-{}",
            uuid::Uuid::new_v4()
        ));
        assert!(supervisor_settings(&root).auto_recovery_enabled);
        write_supervisor_settings(
            &root,
            &SupervisorSettings {
                auto_recovery_enabled: false,
            },
        )
        .expect("disable recovery");
        assert!(!supervisor_settings(&root).auto_recovery_enabled);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn watchdog_requires_active_work_and_allows_intentional_quit() {
        let script = watchdog_script(
            "delivery-pilot",
            "/Applications/DeliveryPilot.app/Contents/MacOS/delivery-pilot",
            "/Applications/DeliveryPilot.app",
            Path::new("/tmp/intentional quit"),
            Path::new("/tmp/recovery required"),
        );
        assert!(script.contains("if [ -f '/tmp/intentional quit' ]"));
        assert!(script.contains("[ ! -f '/tmp/recovery required' ]"));
        assert!(script.contains("/usr/bin/open -a '/Applications/DeliveryPilot.app'"));
    }
}
