mod delivery_runtime;
mod execution_control;
mod requirement_recommendation;
mod task_supervisor;
mod technology;
mod technology_advisory;
mod technology_sources;

use delivery_runtime::DeliveryRuntimeManager;
use quick_xml::{events::Event as XmlEvent, Reader};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use technology::{
    Domain, MatchRequest, MatchResponse, SolutionResponse, TechnologyService, TrendResponse,
    API_ADDRESS,
};
use technology_sources::{DataSourceConfig, DataSourceView, SourceTestResult};
use walkdir::WalkDir;

struct AppState {
    db: Mutex<Connection>,
}

fn demo_handoff_root() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "无法定位用户目录".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library/Application Support/Technology Exploration Agent/demo-handoffs"))
}

#[tauri::command]
fn demo_handoff_update(request_path: String, patch: Value) -> Result<(), String> {
    let root = demo_handoff_root()?
        .canonicalize()
        .map_err(|error| format!("Demo Handoff 目录不可用: {error}"))?;
    let request = PathBuf::from(&request_path)
        .canonicalize()
        .map_err(|error| format!("Demo Handoff 请求不存在: {error}"))?;
    if !request.starts_with(&root)
        || request.file_name().and_then(|name| name.to_str()) != Some("request.json")
    {
        return Err("拒绝更新不受信任的 Demo Handoff".into());
    }
    let status_path = request.parent().unwrap().join("status.json");
    let mut current: Value = fs::read(&status_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let current_object = current
        .as_object_mut()
        .ok_or_else(|| "Demo Handoff 状态格式无效".to_string())?;
    if let Some(patch_object) = patch.as_object() {
        for (key, value) in patch_object {
            current_object.insert(key.clone(), value.clone());
        }
    }
    current_object.insert("updatedAt".into(), Value::String(current_timestamp()));
    let temporary = status_path.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&current).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(temporary, status_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn demo_handoff_pending() -> Result<Vec<Value>, String> {
    let root = demo_handoff_root()?;
    let mut pending = Vec::new();
    for entry in fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let request_path = entry.path().join("request.json");
        let status_path = entry.path().join("status.json");
        let Some(mut request) = fs::read(&request_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        else {
            continue;
        };
        if request.get("executionTool").and_then(Value::as_str) != Some("delivery-pilot") {
            continue;
        }
        let state = fs::read(&status_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .and_then(|status| {
                status
                    .get("state")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });
        if state.as_deref() != Some("queued") {
            continue;
        }
        let Some(requirement_path) = request
            .get("requirementPath")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        let Ok(bytes) = fs::read(&requirement_path) else {
            continue;
        };
        if let Some(object) = request.as_object_mut() {
            let digest = format!("{:x}", Sha256::digest(&bytes));
            object.insert(
                "requestPath".into(),
                Value::String(request_path.to_string_lossy().to_string()),
            );
            object.insert(
                "sourceDocument".into(),
                serde_json::json!({
                    "id": digest,
                    "name": Path::new(&requirement_path).file_name().and_then(|name| name.to_str()).unwrap_or("requirement.md"),
                    "mediaType": "text/markdown",
                    "byteSize": bytes.len(),
                    "sha256": digest,
                    "path": requirement_path,
                }),
            );
        }
        pending.push(request);
    }
    Ok(pending)
}

fn start_demo_handoff_inbox(app: AppHandle) {
    thread::spawn(move || loop {
        if let Ok(root) = demo_handoff_root() {
            if let Ok(entries) = fs::read_dir(root) {
                for entry in entries.flatten() {
                    let request_path = entry.path().join("request.json");
                    let status_path = entry.path().join("status.json");
                    let Some(mut request) = fs::read(&request_path)
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                    else {
                        continue;
                    };
                    if request.get("executionTool").and_then(Value::as_str)
                        != Some("delivery-pilot")
                    {
                        continue;
                    }
                    let state = fs::read(&status_path)
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                        .and_then(|status| {
                            status
                                .get("state")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                        });
                    if state.as_deref() != Some("queued") {
                        continue;
                    }
                    let Some(requirement_path) = request
                        .get("requirementPath")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                    else {
                        continue;
                    };
                    let Ok(bytes) = fs::read(&requirement_path) else {
                        continue;
                    };
                    if let Some(object) = request.as_object_mut() {
                        object.insert(
                            "requestPath".into(),
                            Value::String(request_path.to_string_lossy().to_string()),
                        );
                        object.insert(
                            "sourceDocument".into(),
                            serde_json::json!({
                                "id": format!("{:x}", Sha256::digest(&bytes)),
                                "name": Path::new(&requirement_path).file_name().and_then(|name| name.to_str()).unwrap_or("requirement.md"),
                                "mediaType": "text/markdown",
                                "byteSize": bytes.len(),
                                "sha256": format!("{:x}", Sha256::digest(&bytes)),
                                "path": requirement_path,
                            }),
                        );
                    }
                    let _ = demo_handoff_update(
                        request_path.to_string_lossy().to_string(),
                        serde_json::json!({
                            "backendSeenAt": current_timestamp(),
                            "message": "DeliveryPilot 后端已发现事件，正在交给交付界面",
                        }),
                    );
                    let _ = app.emit("demo-handoff", request);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        }
        thread::sleep(Duration::from_secs(3));
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TechnologyApiStatus {
    online: bool,
    base_url: String,
    version: &'static str,
}

#[tauri::command]
fn technology_api_status() -> TechnologyApiStatus {
    TechnologyApiStatus {
        online: true,
        base_url: format!("http://{API_ADDRESS}/api/v1"),
        version: "v1",
    }
}

#[tauri::command]
fn technology_domains() -> Vec<Domain> {
    technology::domains()
}

#[tauri::command]
async fn technology_match(
    service: State<'_, TechnologyService>,
    request: MatchRequest,
) -> Result<MatchResponse, String> {
    service.match_technologies(request).await
}

#[tauri::command]
async fn technology_solution(
    service: State<'_, TechnologyService>,
    request: MatchRequest,
) -> Result<SolutionResponse, String> {
    service.solution(request).await
}

#[tauri::command]
async fn technology_domain_trends(
    service: State<'_, TechnologyService>,
    domain: Option<String>,
    limit: Option<usize>,
) -> Result<TrendResponse, String> {
    service
        .domain_trends(domain.as_deref(), limit.unwrap_or(8))
        .await
}

#[tauri::command]
async fn technology_global_trends(
    service: State<'_, TechnologyService>,
    limit: Option<usize>,
) -> Result<TrendResponse, String> {
    service.global_trends(limit.unwrap_or(10)).await
}

#[tauri::command]
async fn technology_sources(
    service: State<'_, TechnologyService>,
) -> Result<Vec<DataSourceView>, String> {
    Ok(service.data_sources().await)
}

#[tauri::command]
async fn technology_source_save(
    service: State<'_, TechnologyService>,
    source: DataSourceConfig,
) -> Result<DataSourceView, String> {
    service.save_data_source(source).await
}

#[tauri::command]
async fn technology_source_delete(
    service: State<'_, TechnologyService>,
    id: String,
) -> Result<(), String> {
    service.delete_data_source(&id).await
}

#[tauri::command]
async fn technology_source_test(
    service: State<'_, TechnologyService>,
    id: String,
) -> Result<SourceTestResult, String> {
    service.test_data_source(&id).await
}

#[tauri::command]
fn technology_open_url(url: String) -> Result<(), String> {
    let allowed = url.starts_with("https://github.com/")
        || url.starts_with("https://news.ycombinator.com/")
        || url.starts_with("https://") && !url.contains(char::is_whitespace) && url.len() < 2_048;
    if !allowed {
        return Err("拒绝打开不受信任的技术链接".into());
    }
    let status = Command::new("/usr/bin/open")
        .arg(&url)
        .status()
        .map_err(|error| format!("无法打开链接: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("系统未能打开技术链接".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentCheck {
    id: &'static str,
    label: &'static str,
    available: bool,
    detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectedDocument {
    path: String,
    name: String,
    media_type: String,
    byte_size: u64,
    sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ExternalStage {
    TraeworkAnalysis,
    TraeSpec,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalRun {
    pid: u32,
    app_name: &'static str,
    bundle_id: &'static str,
    started_at_ms: u64,
    send_confirmed: bool,
    attachment_status: String,
    confirmation: String,
    automation_steps: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarResponse {
    ok: bool,
    result: Option<HashMap<String, String>>,
    error: Option<SidecarProtocolError>,
}

#[derive(Deserialize)]
struct SidecarProtocolError {
    code: String,
    message: String,
    recoverable: bool,
}

fn sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("DeliveryPilot Computer Use.app")
        .join("Contents/MacOS/delivery-computer-use");
    if bundled.is_file() {
        return Ok(bundled);
    }
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("DeliveryPilot Computer Use.app")
        .join("Contents/MacOS/delivery-computer-use");
    if development.is_file() {
        return Ok(development);
    }
    Err("DeliveryPilot 自动化组件未打包，请重新安装应用".into())
}

pub(crate) fn call_sidecar(
    app: &AppHandle,
    method: &str,
    params: HashMap<&str, &str>,
) -> Result<HashMap<String, String>, String> {
    let path = sidecar_path(app)?;
    let mut child = Command::new(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动自动化组件: {error}"))?;
    let request = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "method": method,
        "params": params,
    });
    if let Some(mut stdin) = child.stdin.take() {
        writeln!(stdin, "{request}").map_err(|error| format!("无法发送自动化请求: {error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("自动化组件执行失败: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: SidecarResponse = serde_json::from_str(stdout.trim()).map_err(|error| {
        format!(
            "自动化组件返回无效响应: {error}; stderr={}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    })?;
    if response.ok {
        return Ok(response.result.unwrap_or_default());
    }
    let error = response.error.unwrap_or(SidecarProtocolError {
        code: "unknown".into(),
        message: "自动化组件执行失败".into(),
        recoverable: true,
    });
    Err(format!(
        "{} [{}{}]",
        error.message,
        error.code,
        if error.recoverable {
            "，可重试"
        } else {
            ""
        }
    ))
}

#[tauri::command]
fn automation_permission(app: AppHandle, request: bool) -> Result<HashMap<String, String>, String> {
    call_sidecar(
        &app,
        if request {
            "permission.request"
        } else {
            "permission.check"
        },
        HashMap::new(),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelfReportedProgress {
    phase: Option<String>,
    percent: Option<u8>,
    message: Option<String>,
    completed: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalStatus {
    app_online: bool,
    state: &'static str,
    phase: String,
    phase_index: u8,
    total_phases: u8,
    elapsed_seconds: u64,
    last_activity_at: Option<u64>,
    last_activity_label: String,
    changed_files: Vec<String>,
    artifact_count: usize,
    expected_artifact_count: usize,
    progress_percent: u8,
    self_reported: bool,
    completed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeliveryArtifact {
    id: &'static str,
    title: &'static str,
    description: &'static str,
    category: &'static str,
    relative_path: &'static str,
    available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AutomationTestCase {
    name: String,
    traceability: String,
    scenario: String,
    duration_seconds: f64,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeliveryEvidence {
    artifacts: Vec<DeliveryArtifact>,
    tests: Vec<AutomationTestCase>,
    test_total: usize,
    test_passed: usize,
    test_failed: usize,
    test_duration_seconds: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeliveryAccess {
    available: bool,
    kind: &'static str,
    formally_deployed: bool,
    label: String,
    address: String,
    display_address: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VersionManifest {
    project_id: String,
    project_name: String,
    version: u32,
    version_label: String,
    feature: String,
    based_on_version: Option<String>,
    status: String,
    source_document_name: String,
    source_document_sha256: String,
    #[serde(default)]
    delivery_squad: Option<serde_json::Value>,
    workspace_path: String,
    created_at: String,
    completed_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceVersion {
    project_id: String,
    project_name: String,
    version: u32,
    version_label: String,
    workspace_path: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryProject {
    project_id: String,
    project_name: String,
    versions: Vec<VersionManifest>,
}

fn is_verified_complete(
    reported_complete: bool,
    artifact_count: usize,
    expected_artifact_count: usize,
) -> bool {
    reported_complete && expected_artifact_count > 0 && artifact_count == expected_artifact_count
}

fn command_available(command: &str) -> bool {
    std::process::Command::new("sh")
        .args(["-lc", &format!("command -v {command}")])
        .output()
        .is_ok_and(|output| output.status.success())
}

#[tauri::command]
fn environment_check() -> Vec<EnvironmentCheck> {
    vec![
        EnvironmentCheck {
            id: "traework",
            label: "TraeWork",
            available: Path::new("/Applications/TRAE SOLO CN.app").exists(),
            detail: "cn.trae.solo.app".into(),
        },
        EnvironmentCheck {
            id: "traecode",
            label: "TraeCode",
            available: std::path::Path::new("/Applications/Trae CN.app").exists(),
            detail: "cn.trae.app".into(),
        },
        EnvironmentCheck {
            id: "git",
            label: "Git",
            available: command_available("git"),
            detail: "本机命令".into(),
        },
        EnvironmentCheck {
            id: "node",
            label: "Node.js",
            available: command_available("node"),
            detail: "本机命令".into(),
        },
        EnvironmentCheck {
            id: "docker",
            label: "Docker",
            available: command_available("docker"),
            detail: "本机命令".into(),
        },
        EnvironmentCheck {
            id: "kubectl",
            label: "Kubernetes",
            available: command_available("kubectl"),
            detail: "本机命令".into(),
        },
    ]
}

fn media_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "md" => "text/markdown",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn document_pick() -> Result<Option<SelectedDocument>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter(
            "需求文档",
            &["pdf", "doc", "docx", "txt", "md", "xls", "xlsx"],
        )
        .pick_file()
    else {
        return Ok(None);
    };
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    Ok(Some(SelectedDocument {
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("document")
            .to_string(),
        media_type: media_type(&path).to_string(),
        byte_size: metadata.len(),
        sha256,
        path: path.to_string_lossy().to_string(),
    }))
}

fn persist_text_requirement(root: &Path, content: &str) -> Result<SelectedDocument, String> {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if trimmed.chars().count() < 10 {
        return Err("需求文字至少需要 10 个字符".into());
    }
    if normalized.len() > 2 * 1024 * 1024 {
        return Err("需求文字不能超过 2MB".into());
    }
    let bytes = format!("{trimmed}\n").into_bytes();
    let directory = root
        .join("intake-sources")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建需求暂存目录: {error}"))?;
    let path = directory.join("requirement.md");
    let temporary = directory.join("requirement.md.tmp");
    fs::write(&temporary, &bytes).map_err(|error| format!("无法暂存需求文字: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("无法固化需求文字: {error}"))?;
    Ok(SelectedDocument {
        path: path.to_string_lossy().to_string(),
        name: "requirement.md".into(),
        media_type: "text/markdown".into(),
        byte_size: bytes.len() as u64,
        sha256: format!("{:x}", Sha256::digest(&bytes)),
    })
}

#[tauri::command]
fn document_create_from_text(app: AppHandle, content: String) -> Result<SelectedDocument, String> {
    let root = workspace_root(&app)?;
    persist_text_requirement(&root, &content)
}

#[tauri::command]
async fn requirement_recommend(
    content: Option<String>,
    document_path: Option<String>,
    document_name: Option<String>,
    attempt: u32,
    previous_project_name: Option<String>,
    previous_feature: Option<String>,
) -> requirement_recommendation::RequirementRecommendation {
    requirement_recommendation::recommend(
        content,
        document_path,
        document_name,
        attempt,
        previous_project_name,
        previous_feature,
    )
    .await
}

fn expand_home(path: &str) -> PathBuf {
    if path == "~" {
        return std::env::var_os("HOME").map_or_else(|| PathBuf::from(path), PathBuf::from);
    }
    if let Some(relative) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(relative);
        }
    }
    PathBuf::from(path)
}

fn workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .filter(|path| path.join("package.json").is_file())
        .map(Path::to_path_buf)
        .or_else(|| {
            app.path()
                .resource_dir()
                .ok()?
                .ancestors()
                .find(|path| path.join("package.json").is_file())
                .map(Path::to_path_buf)
        })
        .ok_or_else(|| "无法定位 DeliveryPilot 程序目录".to_string())?;
    let workspace = project_root.join(".workspace");
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("无法创建默认工作目录 {}: {error}", workspace.display()))?;
    Ok(workspace)
}

fn safe_path_name(value: &str, fallback: &str) -> String {
    let cleaned = value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => character,
        })
        .collect::<String>();
    let cleaned = cleaned.trim_matches([' ', '.', '-']).to_string();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned.chars().take(60).collect()
    }
}

fn compact_feature(value: &str) -> String {
    safe_path_name(value, "iteration")
        .chars()
        .map(|character| {
            if character.is_whitespace() {
                '-'
            } else {
                character
            }
        })
        .collect()
}

fn current_date() -> String {
    Command::new("/bin/date")
        .arg("+%Y%m%d")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| value.len() == 8)
        .unwrap_or_else(|| "unknown-date".into())
}

pub(crate) fn current_timestamp() -> String {
    Command::new("/bin/date")
        .arg("-u")
        .arg("+%Y-%m-%dT%H:%M:%SZ")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".into())
}

fn write_manifest(path: &Path, manifest: &VersionManifest) -> Result<(), String> {
    let content = serde_json::to_string_pretty(manifest)
        .map_err(|error| format!("无法序列化版本信息: {error}"))?;
    fs::write(path.join(".delivery-pilot/version.json"), content)
        .map_err(|error| format!("无法写入版本信息: {error}"))
}

fn read_manifest(path: &Path) -> Option<VersionManifest> {
    let content = fs::read_to_string(path.join(".delivery-pilot/version.json")).ok()?;
    serde_json::from_str(&content).ok()
}

fn copy_version_baseline(source: &Path, destination: &Path) -> Result<(), String> {
    let excluded = [
        ".delivery-pilot",
        "node_modules",
        "dist",
        "playwright-report",
        "test-results",
        "target",
    ];
    for entry in WalkDir::new(source).into_iter().filter_entry(|entry| {
        entry.depth() == 0
            || !excluded.iter().any(|name| {
                entry
                    .path()
                    .strip_prefix(source)
                    .ok()
                    .is_some_and(|relative| {
                        relative.components().any(|part| part.as_os_str() == *name)
                    })
            })
    }) {
        let entry = entry.map_err(|error| format!("无法读取上一版本: {error}"))?;
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| error.to_string())?;
        if relative.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)
                .map_err(|error| format!("无法创建版本基线目录: {error}"))?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(entry.path(), &target)
                .map_err(|error| format!("无法复制上一版本文件: {error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn workspace_default(app: AppHandle) -> Result<String, String> {
    Ok(workspace_root(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn workspace_prepare(
    app: AppHandle,
    project_name: String,
    feature: String,
    source_document_name: String,
    source_document_sha256: String,
    delivery_squad: Option<serde_json::Value>,
) -> Result<WorkspaceVersion, String> {
    let root = workspace_root(&app)?;
    let project_name = safe_path_name(&project_name, "未命名项目");
    let project_id = project_name.clone();
    let versions_root = root.join("projects").join(&project_id).join("versions");
    fs::create_dir_all(&versions_root).map_err(|error| format!("无法创建项目版本目录: {error}"))?;
    let existing_versions = fs::read_dir(&versions_root)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| read_manifest(&entry.path()).map(|manifest| (entry.path(), manifest)))
        .collect::<Vec<_>>();
    let next_version = existing_versions
        .iter()
        .map(|(_, manifest)| manifest.version)
        .max()
        .unwrap_or(0)
        + 1;
    let baseline = existing_versions
        .iter()
        .filter(|(_, manifest)| manifest.status == "completed")
        .max_by_key(|(_, manifest)| manifest.version);
    let feature = compact_feature(&feature);
    let version_label = format!("v{next_version}-{}-{feature}", current_date());
    let version_root = versions_root.join(&version_label);
    if let Some((baseline_path, _)) = baseline {
        copy_version_baseline(baseline_path, &version_root)?;
    }
    fs::create_dir_all(version_root.join(".delivery-pilot/input"))
        .map_err(|error| format!("无法创建版本工作目录: {error}"))?;
    let manifest = VersionManifest {
        project_id: project_id.clone(),
        project_name: project_name.clone(),
        version: next_version,
        version_label: version_label.clone(),
        feature,
        based_on_version: baseline.map(|(_, manifest)| manifest.version_label.clone()),
        status: "draft".into(),
        source_document_name,
        source_document_sha256,
        delivery_squad,
        workspace_path: version_root.to_string_lossy().to_string(),
        created_at: current_timestamp(),
        completed_at: None,
    };
    write_manifest(&version_root, &manifest)?;
    Ok(WorkspaceVersion {
        project_id,
        project_name,
        version: next_version,
        version_label,
        workspace_path: version_root.to_string_lossy().to_string(),
        created_at: manifest.created_at,
    })
}

#[tauri::command]
fn workspace_history(app: AppHandle) -> Result<Vec<HistoryProject>, String> {
    let root = workspace_root(&app)?;
    let projects_root = root.join("projects");
    fs::create_dir_all(&projects_root).map_err(|error| error.to_string())?;
    let mut projects = Vec::new();
    for project_entry in fs::read_dir(projects_root).map_err(|error| error.to_string())? {
        let project_entry = project_entry.map_err(|error| error.to_string())?;
        let versions_root = project_entry.path().join("versions");
        if !versions_root.is_dir() {
            continue;
        }
        let mut versions = fs::read_dir(versions_root)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter_map(|entry| read_manifest(&entry.path()))
            .collect::<Vec<_>>();
        versions.sort_by_key(|manifest| std::cmp::Reverse(manifest.version));
        if let Some(latest) = versions.first() {
            projects.push(HistoryProject {
                project_id: latest.project_id.clone(),
                project_name: latest.project_name.clone(),
                versions,
            });
        }
    }
    projects.sort_by(|left, right| left.project_name.cmp(&right.project_name));
    Ok(projects)
}

#[tauri::command]
fn workspace_version_status(workspace_path: String, status: String) -> Result<(), String> {
    let workspace = expand_home(&workspace_path);
    let mut manifest = read_manifest(&workspace).ok_or_else(|| "版本元数据不存在".to_string())?;
    manifest.status = status.clone();
    if status == "completed" {
        manifest.completed_at = Some(current_timestamp());
    }
    write_manifest(&workspace, &manifest)
}

#[tauri::command]
fn launch_external_stage(
    app: AppHandle,
    supervisor: State<'_, task_supervisor::TaskSupervisor>,
    stage: ExternalStage,
    prompt: String,
    source_document: String,
    workspace_path: String,
) -> Result<ExternalRun, String> {
    launch_external_stage_core(
        &app,
        &supervisor,
        stage,
        prompt,
        source_document,
        workspace_path,
    )
}

pub(crate) fn launch_external_stage_core(
    app: &AppHandle,
    supervisor: &task_supervisor::TaskSupervisor,
    stage: ExternalStage,
    prompt: String,
    source_document: String,
    workspace_path: String,
) -> Result<ExternalRun, String> {
    let _automation = supervisor.automation_guard()?;
    let stage_label = match &stage {
        ExternalStage::TraeworkAnalysis => "traework_analysis",
        ExternalStage::TraeSpec => "trae_spec",
    };
    let debug_started_at = std::time::Instant::now();
    let source = PathBuf::from(source_document);
    if !source.is_file() {
        return Err("原始需求文档路径无效，请重新选择文档".into());
    }

    let workspace = expand_home(&workspace_path);
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("无法创建工作目录 {}: {error}", workspace.display()))?;
    let input_dir = workspace.join(".delivery-pilot/input");
    fs::create_dir_all(&input_dir)
        .map_err(|error| format!("无法创建需求输入目录 {}: {error}", input_dir.display()))?;
    let staged_source = input_dir.join(
        source
            .file_name()
            .ok_or_else(|| "原始需求文档缺少文件名".to_string())?,
    );
    let source_is_staged =
        source.canonicalize().ok() == staged_source.canonicalize().ok() && staged_source.is_file();
    if !source_is_staged {
        fs::copy(&source, &staged_source)
            .map_err(|error| format!("无法复制需求文档到任务目录: {error}"))?;
    }
    let run_started_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64);

    let (cli, app_name, bundle_id, working_dir) = match stage {
        ExternalStage::TraeworkAnalysis => (
            "/Applications/TRAE SOLO CN.app/Contents/Resources/app/bin/trae-solo-cn",
            "TRAE SOLO CN",
            "cn.trae.solo.app",
            workspace,
        ),
        ExternalStage::TraeSpec => (
            "/Applications/Trae CN.app/Contents/Resources/app/bin/trae-cn",
            "Trae CN",
            "cn.trae.app",
            workspace,
        ),
    };
    if !Path::new(cli).is_file() {
        return Err(format!("未安装 {app_name}"));
    }

    let mut window_command = if matches!(stage_label, "traework_analysis") {
        let mut command = Command::new("/usr/bin/open");
        command.args(["-b", bundle_id]);
        command
    } else {
        let mut command = Command::new(cli);
        command
            .current_dir(&working_dir)
            .arg("--reuse-window")
            .arg(&working_dir);
        command
    };
    let window_status = window_command
        .status()
        .map_err(|error| format!("打开 {app_name} 工作窗口失败: {error}"))?;
    if !window_status.success() {
        return Err(format!("{app_name} 工作窗口启动失败"));
    }
    std::thread::sleep(std::time::Duration::from_secs(4));

    // #region debug-point A:accessibility-submit-start
    let _ = Command::new("/usr/bin/curl")
        .args([
            "-s",
            "-X",
            "POST",
            "http://127.0.0.1:7777/event",
            "-d",
            &serde_json::json!({
                "sessionId": "trae-progress-invisible",
                "runId": "post-fix",
                "hypothesisId": "A",
                "location": "src-tauri/src/lib.rs:launch_external_stage",
                "msg": "[DEBUG] submitting task through Accessibility",
                "data": {"stage": stage_label, "bundleId": bundle_id, "workingDir": working_dir},
                "ts": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |duration| duration.as_millis())
            })
            .to_string(),
        ])
        .status();
    // #endregion
    let permission = call_sidecar(app, "permission.request", HashMap::new())?;
    if permission.get("accessibility").map(String::as_str) != Some("granted") {
        let _ = Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .status();
        return Err(
            "请先在“系统设置 → 隐私与安全性 → 辅助功能”中允许 DeliveryPilot，然后返回点击“重试发送”"
                .into(),
        );
    }
    let source_path = staged_source.to_string_lossy().to_string();
    let working_directory = working_dir.to_string_lossy().to_string();
    let workflow = if matches!(stage_label, "traework_analysis") {
        "traework"
    } else {
        "chat"
    };
    let prompt_with_source =
        format!("{prompt}\n\n原始需求文件绝对路径：{source_path}\n请读取并以该文件为输入。");
    let submit = match call_sidecar(
        app,
        "chat.submit",
        HashMap::from([
            ("bundleId", bundle_id),
            ("prompt", prompt_with_source.as_str()),
            ("sourceDocument", source_path.as_str()),
            ("workingDirectory", working_directory.as_str()),
            ("workflow", workflow),
        ]),
    ) {
        Ok(result) => result,
        Err(error) => {
            let snapshot =
                call_sidecar(app, "ui.snapshot", HashMap::from([("bundleId", bundle_id)]))
                    .unwrap_or_default();
            // #region debug-point E:accessibility-snapshot-on-failure
            let _ = Command::new("/usr/bin/curl")
                .args([
                    "-s",
                    "-X",
                    "POST",
                    "http://127.0.0.1:7777/event",
                    "-d",
                    &serde_json::json!({
                        "sessionId": "trae-progress-invisible",
                        "runId": "post-fix",
                        "hypothesisId": "E",
                        "location": "src-tauri/src/lib.rs:launch_external_stage",
                        "msg": "[DEBUG] Accessibility submission failed with AX snapshot",
                        "data": {"stage": stage_label, "error": error, "nodeCount": snapshot.get("nodeCount"), "nodes": snapshot.get("nodes")},
                        "ts": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |duration| duration.as_millis())
                    })
                    .to_string(),
                ])
                .status();
            // #endregion
            return Err(error);
        }
    };
    let send_confirmed = submit.get("sendConfirmed").map(String::as_str) == Some("true");
    if !send_confirmed {
        return Err(format!("{app_name} 未确认接收任务"));
    }
    let target_pid = submit
        .get("pid")
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or_default();
    let attachment_status = submit
        .get("attachment")
        .cloned()
        .unwrap_or_else(|| "unknown".into());
    let confirmation = submit
        .get("confirmation")
        .cloned()
        .unwrap_or_else(|| "unknown".into());
    let mut automation_steps = submit
        .get("steps")
        .map(|steps| steps.lines().map(str::to_string).collect())
        .unwrap_or_else(|| {
            vec![
                "Trae 现有窗口已激活".into(),
                "聊天输入框已定位并聚焦".into(),
                format!("任务发送已确认: {confirmation}"),
            ]
        });
    if let (Some(display), Some(frame)) = (submit.get("windowDisplay"), submit.get("windowFrame")) {
        automation_steps.push(format!(
            "目标窗口已锁定：显示器 {} · 全局窗口坐标 {}",
            display
                .parse::<usize>()
                .map_or_else(|_| display.to_string(), |index| (index + 1).to_string()),
            frame
        ));
    }

    // #region debug-point A:accessibility-submit-returned
    let _ = Command::new("/usr/bin/curl")
        .args([
            "-s",
            "-X",
            "POST",
            "http://127.0.0.1:7777/event",
            "-d",
            &serde_json::json!({
                "sessionId": "trae-progress-invisible",
                "runId": "post-fix",
                "hypothesisId": "A",
                "location": "src-tauri/src/lib.rs:launch_external_stage",
                "msg": "[DEBUG] Accessibility task submission confirmed",
                "data": {"stage": stage_label, "pid": target_pid, "attachment": attachment_status, "confirmation": confirmation, "elapsedMs": debug_started_at.elapsed().as_millis()},
                "ts": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |duration| duration.as_millis())
            })
            .to_string(),
        ])
        .status();
    // #endregion

    supervisor.register(
        working_directory,
        stage_label.to_string(),
        app_name.to_string(),
        bundle_id.to_string(),
        source_path,
        prompt,
        target_pid,
    )?;

    Ok(ExternalRun {
        pid: target_pid,
        app_name,
        bundle_id,
        started_at_ms: run_started_at_ms,
        send_confirmed,
        attachment_status: attachment_status.clone(),
        confirmation: confirmation.clone(),
        automation_steps,
    })
}

#[tauri::command]
fn focus_external_app(bundle_id: String) -> Result<(), String> {
    let status = Command::new("/usr/bin/open")
        .args(["-b", &bundle_id])
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("无法打开应用 {bundle_id}"))
    }
}

#[tauri::command]
fn external_status(
    stage: ExternalStage,
    workspace_path: String,
    started_at_ms: u64,
) -> Result<ExternalStatus, String> {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64);
    let (process_pattern, support_name, total_phases, is_trae_spec): (&str, &str, u8, bool) =
        match stage {
            ExternalStage::TraeworkAnalysis => ("TRAE SOLO CN.app", "TRAE SOLO CN", 4, false),
            ExternalStage::TraeSpec => ("Trae CN.app", "Trae CN", 5, true),
        };
    let app_online = Command::new("/usr/bin/pgrep")
        .args(["-f", process_pattern])
        .output()
        .is_ok_and(|output| output.status.success());

    let home = std::env::var_os("HOME").map_or_else(PathBuf::new, PathBuf::from);
    let logs_root = home
        .join("Library/Application Support")
        .join(support_name)
        .join("logs");
    let latest_log_activity = WalkDir::new(logs_root)
        .max_depth(7)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            entry
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()
                .map(|modified| modified.as_millis() as u64)
        })
        .filter(|modified| *modified >= started_at_ms)
        .max();

    let workspace = expand_home(&workspace_path);
    let mut changed: Vec<(u64, String)> = WalkDir::new(&workspace)
        .max_depth(8)
        .into_iter()
        .filter_entry(|entry| {
            !matches!(
                entry.file_name().to_str(),
                Some(".git" | "node_modules" | "target" | "dist")
            ) && !entry
                .path()
                .starts_with(workspace.join(".delivery-pilot/input"))
        })
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            let modified = entry
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            if modified < started_at_ms {
                return None;
            }
            let relative = entry
                .path()
                .strip_prefix(&workspace)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .to_string();
            Some((modified, relative))
        })
        .collect();
    changed.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    let latest_workspace_activity = changed.first().map(|entry| entry.0);
    let changed_files: Vec<String> = changed
        .iter()
        .take(8)
        .map(|entry| entry.1.clone())
        .collect();

    let expected_artifacts = if is_trae_spec {
        vec![
            ".trae/specs/delivery/spec.md",
            ".trae/specs/delivery/tasks.md",
            ".trae/specs/delivery/checklist.md",
            ".delivery-pilot/traecode-result.md",
        ]
    } else {
        vec![".delivery-pilot/traework-result.md"]
    };
    let artifact_count = expected_artifacts
        .iter()
        .filter(|relative| {
            workspace
                .join(relative)
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .is_some_and(|modified| modified.as_millis() as u64 >= started_at_ms)
        })
        .count();
    let progress_path = workspace.join(if is_trae_spec {
        ".delivery-pilot/progress.json"
    } else {
        ".delivery-pilot/traework-progress.json"
    });
    let self_progress = progress_path
        .metadata()
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .filter(|modified| modified.as_millis() as u64 >= started_at_ms)
        .and_then(|_| fs::read_to_string(progress_path).ok())
        .and_then(|content| serde_json::from_str::<SelfReportedProgress>(&content).ok());

    let last_activity_at = latest_log_activity.max(latest_workspace_activity);
    let completed = is_verified_complete(
        self_progress
            .as_ref()
            .and_then(|progress| progress.completed)
            .unwrap_or(false),
        artifact_count,
        expected_artifacts.len(),
    );
    let (phase_index, fallback_phase) = if completed {
        (total_phases, "任务已完成")
    } else if !changed_files.is_empty() {
        (total_phases.saturating_sub(1), "正在生成工作区产物")
    } else if app_online {
        (2, "应用在线，等待本任务活动")
    } else {
        (1, "应用未在线")
    };
    let phase = self_progress
        .as_ref()
        .and_then(|progress| progress.phase.clone())
        .unwrap_or_else(|| fallback_phase.to_string());
    let last_activity_label = self_progress
        .as_ref()
        .and_then(|progress| progress.message.clone())
        .or_else(|| changed_files.first().map(|file| format!("最近修改 {file}")))
        .or_else(|| latest_log_activity.map(|_| "应用日志有活动，但尚未确认属于本任务".to_string()))
        .unwrap_or_else(|| fallback_phase.to_string());
    let self_reported_percent = self_progress.as_ref().and_then(|progress| progress.percent);
    let progress_percent = self_reported_percent
        .unwrap_or_else(|| ((u16::from(phase_index) * 100) / u16::from(total_phases)) as u8)
        .min(100);
    let state = if completed {
        "completed"
    } else if !app_online {
        "offline"
    } else if self_progress.is_some() || !changed_files.is_empty() {
        "working"
    } else {
        "idle"
    };

    Ok(ExternalStatus {
        app_online,
        state,
        phase,
        phase_index,
        total_phases,
        elapsed_seconds: now_ms.saturating_sub(started_at_ms) / 1000,
        last_activity_at,
        last_activity_label,
        changed_files,
        artifact_count,
        expected_artifact_count: expected_artifacts.len(),
        progress_percent,
        self_reported: self_reported_percent.is_some(),
        completed,
    })
}

fn xml_attribute(element: &quick_xml::events::BytesStart<'_>, key: &[u8]) -> Option<String> {
    element
        .attributes()
        .flatten()
        .find(|attribute| attribute.key.as_ref() == key)
        .map(|attribute| String::from_utf8_lossy(attribute.value.as_ref()).into_owned())
}

fn parse_test_name(name: &str) -> (String, String) {
    let Some(e2e_start) = name.find("E2E-WO-") else {
        return (String::new(), name.to_string());
    };
    let suffix = &name[e2e_start..];
    let id_end = suffix.find(char::is_whitespace).unwrap_or(suffix.len());
    let trace_end = e2e_start + id_end;
    (
        name[..trace_end].trim().to_string(),
        name[trace_end..].trim().to_string(),
    )
}

fn parse_junit(path: &Path) -> Result<Vec<AutomationTestCase>, String> {
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let mut reader = Reader::from_file(path).map_err(|error| error.to_string())?;
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut tests = Vec::new();
    let mut current: Option<(String, f64, bool)> = None;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(XmlEvent::Start(element)) if element.name().as_ref() == b"testcase" => {
                let name = xml_attribute(&element, b"name").unwrap_or_default();
                let duration = xml_attribute(&element, b"time")
                    .and_then(|value| value.parse().ok())
                    .unwrap_or_default();
                current = Some((name, duration, false));
            }
            Ok(XmlEvent::Empty(element)) if element.name().as_ref() == b"testcase" => {
                let name = xml_attribute(&element, b"name").unwrap_or_default();
                let duration = xml_attribute(&element, b"time")
                    .and_then(|value| value.parse().ok())
                    .unwrap_or_default();
                let (traceability, scenario) = parse_test_name(&name);
                tests.push(AutomationTestCase {
                    name,
                    traceability,
                    scenario,
                    duration_seconds: duration,
                    status: "passed",
                });
            }
            Ok(XmlEvent::Start(element))
                if element.name().as_ref() == b"failure" || element.name().as_ref() == b"error" =>
            {
                if let Some(test) = current.as_mut() {
                    test.2 = true;
                }
            }
            Ok(XmlEvent::Empty(element))
                if element.name().as_ref() == b"failure" || element.name().as_ref() == b"error" =>
            {
                if let Some(test) = current.as_mut() {
                    test.2 = true;
                }
            }
            Ok(XmlEvent::End(element)) if element.name().as_ref() == b"testcase" => {
                if let Some((name, duration, failed)) = current.take() {
                    let (traceability, scenario) = parse_test_name(&name);
                    tests.push(AutomationTestCase {
                        name,
                        traceability,
                        scenario,
                        duration_seconds: duration,
                        status: if failed { "failed" } else { "passed" },
                    });
                }
            }
            Ok(XmlEvent::Eof) => break,
            Err(error) => return Err(format!("无法解析自动化测试报告: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(tests)
}

fn first_existing_path<'a>(workspace: &Path, candidates: &'a [&'a str]) -> &'a str {
    candidates
        .iter()
        .copied()
        .find(|relative| workspace.join(relative).is_file())
        .unwrap_or(candidates[0])
}

fn configured_deployment_url(workspace: &Path) -> Option<String> {
    if let Ok(content) = fs::read_to_string(workspace.join(".delivery-pilot/deployment.json")) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
            for key in ["url", "accessUrl", "deploymentUrl"] {
                if let Some(url) = value.get(key).and_then(serde_json::Value::as_str) {
                    if url.starts_with("https://") || url.starts_with("http://") {
                        return Some(url.trim().to_string());
                    }
                }
            }
        }
    }
    fs::read_to_string(workspace.join(".delivery-pilot/deployment-url.txt"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|url| url.starts_with("https://") || url.starts_with("http://"))
}

fn remote_url_available(url: &str) -> bool {
    Command::new("/usr/bin/curl")
        .args([
            "--silent",
            "--location",
            "--max-time",
            "5",
            "--output",
            "/dev/null",
            "--write-out",
            "%{http_code}",
            url,
        ])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|status| status.trim().parse::<u16>().ok())
        .is_some_and(|status| (200..400).contains(&status))
}

fn resolve_delivery_access(workspace_path: &str) -> Result<DeliveryAccess, String> {
    let workspace = fs::canonicalize(expand_home(workspace_path))
        .map_err(|error| format!("工作目录不可用: {error}"))?;
    if let Some(url) = configured_deployment_url(&workspace) {
        if remote_url_available(&url) {
            return Ok(DeliveryAccess {
                available: true,
                kind: "deployed",
                formally_deployed: true,
                label: "已部署服务".into(),
                address: url.clone(),
                display_address: url,
            });
        }
    }
    Ok(DeliveryAccess {
        available: false,
        kind: "unavailable",
        formally_deployed: false,
        label: "尚未生成可运行系统".into(),
        address: String::new(),
        display_address: "没有已验证的部署服务地址".into(),
    })
}

#[tauri::command]
fn delivery_access(
    runtime: State<'_, DeliveryRuntimeManager>,
    workspace_path: String,
) -> Result<DeliveryAccess, String> {
    let deployment = resolve_delivery_access(&workspace_path)?;
    if deployment.available {
        return Ok(deployment);
    }
    let workspace = fs::canonicalize(expand_home(&workspace_path))
        .map_err(|error| format!("工作目录不可用: {error}"))?;
    let url = runtime.ensure_started(&workspace)?;
    Ok(DeliveryAccess {
        available: true,
        kind: "local_runtime",
        formally_deployed: false,
        label: "本机运行服务".into(),
        address: url.clone(),
        display_address: url,
    })
}

#[tauri::command]
fn open_delivery_access(
    runtime: State<'_, DeliveryRuntimeManager>,
    workspace_path: String,
) -> Result<(), String> {
    let access = delivery_access(runtime, workspace_path)?;
    if !access.available {
        return Err("当前版本没有可访问的运行系统".into());
    }
    let status = Command::new("/usr/bin/open")
        .arg(access.address)
        .status()
        .map_err(|error| format!("无法打开交付系统: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("系统未能打开交付系统".into())
    }
}

#[tauri::command]
fn delivery_evidence(workspace_path: String) -> Result<DeliveryEvidence, String> {
    let workspace = expand_home(&workspace_path);
    let test_report_path = first_existing_path(
        &workspace,
        &[
            ".delivery-pilot/evidence/playwright-report/index.html",
            "playwright-report/index.html",
        ],
    );
    let junit_path = first_existing_path(
        &workspace,
        &[
            ".delivery-pilot/evidence/playwright-junit.xml",
            "test-results/junit.xml",
        ],
    );
    let definitions = [
        (
            "requirement",
            "需求分析报告",
            "Trae Work 对原始需求的结构化分析",
            "需求",
            ".delivery-pilot/traework-result.md",
        ),
        (
            "technology-reference",
            "开源技术参考",
            "Technology Exploration 生成的候选、评分与许可证证据",
            "设计",
            ".delivery-pilot/technology-reference/result.json",
        ),
        (
            "codegraph",
            "需求代码知识图谱",
            "固定 Commit 的 CodeGraph 节点、关系、调用链与影响范围证据",
            "设计",
            ".delivery-pilot/technology-reference/graph-evidence.json",
        ),
        (
            "spec",
            "研发规格说明",
            "需求、业务规则与验收标准",
            "设计",
            ".trae/specs/delivery/spec.md",
        ),
        (
            "tasks",
            "研发任务清单",
            "可执行的开发与验证任务",
            "设计",
            ".trae/specs/delivery/tasks.md",
        ),
        (
            "checklist",
            "交付检查表",
            "需求、实现、测试和证据完成情况",
            "质量",
            ".trae/specs/delivery/checklist.md",
        ),
        (
            "test-cases",
            "业务测试用例",
            "REQ → BR → TC → E2E 完整追踪",
            "测试",
            "docs/testing/业务测试用例.md",
        ),
        (
            "test-report",
            "自动化测试报告",
            "8 条浏览器场景的可视化报告",
            "测试",
            test_report_path,
        ),
        (
            "junit",
            "测试结果明细",
            "机器可读的逐用例执行证据",
            "测试",
            junit_path,
        ),
        (
            "application",
            "可运行应用",
            "Trae Code 构建的生产版本",
            "交付",
            "dist/index.html",
        ),
        (
            "delivery",
            "研发交付报告",
            "实现摘要、变更文件和实际验证结果",
            "交付",
            ".delivery-pilot/traecode-result.md",
        ),
    ];
    let artifacts = definitions
        .into_iter()
        .map(
            |(id, title, description, category, relative_path)| DeliveryArtifact {
                id,
                title,
                description,
                category,
                relative_path,
                available: workspace.join(relative_path).is_file(),
            },
        )
        .collect();
    let tests = parse_junit(&workspace.join(junit_path))?;
    let test_passed = tests.iter().filter(|test| test.status == "passed").count();
    let test_failed = tests.iter().filter(|test| test.status == "failed").count();
    let test_duration_seconds = tests.iter().map(|test| test.duration_seconds).sum();
    Ok(DeliveryEvidence {
        test_total: tests.len(),
        test_passed,
        test_failed,
        test_duration_seconds,
        tests,
        artifacts,
    })
}

#[tauri::command]
fn open_delivery_artifact(workspace_path: String, relative_path: String) -> Result<(), String> {
    let workspace = fs::canonicalize(expand_home(&workspace_path))
        .map_err(|error| format!("工作目录不可用: {error}"))?;
    let candidate = fs::canonicalize(workspace.join(&relative_path))
        .map_err(|error| format!("产物不存在: {error}"))?;
    if !candidate.starts_with(&workspace) {
        return Err("拒绝打开工作目录之外的文件".to_string());
    }
    let status = Command::new("/usr/bin/open")
        .arg(candidate)
        .status()
        .map_err(|error| format!("无法打开产物: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("系统未能打开该产物".to_string())
    }
}

#[tauri::command]
fn event_count(state: State<'_, AppState>, task_id: String) -> Result<i64, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    db.query_row(
        "SELECT COUNT(*) FROM task_events WHERE task_id = ?1",
        [task_id],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::{
        compact_feature, copy_version_baseline, first_existing_path, is_verified_complete,
        parse_junit, parse_test_name, persist_text_requirement, resolve_delivery_access,
        safe_path_name, VersionManifest,
    };
    use sha2::{Digest, Sha256};
    use std::fs;

    #[test]
    fn external_completion_requires_progress_and_all_artifacts() {
        assert!(!is_verified_complete(false, 1, 1));
        assert!(!is_verified_complete(true, 0, 1));
        assert!(!is_verified_complete(true, 2, 3));
        assert!(is_verified_complete(true, 1, 1));
        assert!(is_verified_complete(true, 4, 4));
    }

    #[test]
    fn splits_traceability_from_business_scenario() {
        let (traceability, scenario) = parse_test_name(
            "REQ-WO-008 → BR-WO-001 → TC-WO-008 → E2E-WO-008 空值和纯空白输入禁止提交",
        );
        assert_eq!(
            traceability,
            "REQ-WO-008 → BR-WO-001 → TC-WO-008 → E2E-WO-008"
        );
        assert_eq!(scenario, "空值和纯空白输入禁止提交");
    }

    #[test]
    fn parses_passed_and_failed_junit_cases() {
        let path =
            std::env::temp_dir().join(format!("delivery-pilot-{}.xml", uuid::Uuid::new_v4()));
        fs::write(
            &path,
            r#"<testsuite tests="2"><testcase name="REQ-1 → BR-1 → TC-1 → E2E-WO-001 正常创建" time="0.4"></testcase><testcase name="REQ-2 → BR-2 → TC-2 → E2E-WO-002 空值校验" time="0.2"><failure /></testcase></testsuite>"#,
        )
        .expect("write junit fixture");
        let tests = parse_junit(&path).expect("parse junit fixture");
        let _ = fs::remove_file(path);
        assert_eq!(tests.len(), 2);
        assert_eq!(tests[0].scenario, "正常创建");
        assert_eq!(tests[0].status, "passed");
        assert_eq!(tests[1].status, "failed");
    }

    #[test]
    fn sanitizes_project_and_feature_names() {
        assert_eq!(
            safe_path_name("客户/门户:一期", "fallback"),
            "客户-门户-一期"
        );
        assert_eq!(compact_feature("批量 导入"), "批量-导入");
    }

    #[test]
    fn copies_source_as_version_baseline_without_generated_output() {
        let root =
            std::env::temp_dir().join(format!("delivery-pilot-version-{}", uuid::Uuid::new_v4()));
        let source = root.join("v1");
        let destination = root.join("v2");
        fs::create_dir_all(source.join("src")).expect("create source");
        fs::create_dir_all(source.join("node_modules/pkg")).expect("create dependencies");
        fs::create_dir_all(source.join(".delivery-pilot")).expect("create metadata");
        fs::write(source.join("src/App.tsx"), "v1").expect("write source");
        fs::write(source.join("node_modules/pkg/index.js"), "generated").expect("write dependency");
        fs::write(source.join(".delivery-pilot/progress.json"), "{}").expect("write progress");

        copy_version_baseline(&source, &destination).expect("copy baseline");

        assert!(destination.join("src/App.tsx").is_file());
        assert!(!destination.join("node_modules").exists());
        assert!(!destination.join(".delivery-pilot").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prefers_new_evidence_path_and_falls_back_to_legacy_path() {
        let root =
            std::env::temp_dir().join(format!("delivery-pilot-evidence-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("test-results")).expect("create legacy evidence");
        fs::write(root.join("test-results/junit.xml"), "<testsuites />")
            .expect("write legacy evidence");
        let candidates = [
            ".delivery-pilot/evidence/playwright-junit.xml",
            "test-results/junit.xml",
        ];
        assert_eq!(
            first_existing_path(&root, &candidates),
            "test-results/junit.xml"
        );
        fs::create_dir_all(root.join(".delivery-pilot/evidence")).expect("create new evidence");
        fs::write(
            root.join(".delivery-pilot/evidence/playwright-junit.xml"),
            "<testsuites />",
        )
        .expect("write new evidence");
        assert_eq!(
            first_existing_path(&root, &candidates),
            ".delivery-pilot/evidence/playwright-junit.xml"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn build_file_does_not_masquerade_as_a_deployed_service() {
        let root =
            std::env::temp_dir().join(format!("delivery-pilot-access-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create workspace");
        fs::create_dir_all(root.join("dist")).expect("create dist");
        fs::write(root.join("dist/index.html"), "<html></html>").expect("write application");
        let access =
            resolve_delivery_access(root.to_string_lossy().as_ref()).expect("resolve deployment");
        assert!(!access.available);
        assert!(!access.formally_deployed);
        assert!(access.address.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn text_requirement_is_persisted_with_real_fingerprint() {
        let root =
            std::env::temp_dir().join(format!("delivery-pilot-text-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create root");
        let document = persist_text_requirement(
            &root,
            "设备检修工单\n\n需要支持工单创建、审批和自动化验收。\r\n",
        )
        .expect("persist text requirement");
        let bytes = fs::read(&document.path).expect("read persisted requirement");
        assert_eq!(document.name, "requirement.md");
        assert_eq!(document.media_type, "text/markdown");
        assert_eq!(document.byte_size, bytes.len() as u64);
        assert_eq!(document.sha256, format!("{:x}", Sha256::digest(&bytes)));
        assert_eq!(
            String::from_utf8(bytes).expect("utf8"),
            "设备检修工单\n\n需要支持工单创建、审批和自动化验收。\n"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn text_requirement_rejects_empty_content() {
        let root =
            std::env::temp_dir().join(format!("delivery-pilot-text-{}", uuid::Uuid::new_v4()));
        let error = persist_text_requirement(&root, "太短").expect_err("reject short content");
        assert!(error.contains("至少需要 10 个字符"));
        assert!(!root.exists());
    }

    #[test]
    fn version_manifest_keeps_legacy_compatibility_and_squad_snapshot() {
        let legacy = r#"{
          "projectId":"demo",
          "projectName":"Demo",
          "version":1,
          "versionLabel":"v1",
          "feature":"initial",
          "basedOnVersion":null,
          "status":"completed",
          "sourceDocumentName":"requirements.pdf",
          "sourceDocumentSha256":"abc",
          "workspacePath":"/tmp/demo",
          "createdAt":"2026-08-17T00:00:00Z",
          "completedAt":null
        }"#;
        let parsed: VersionManifest =
            serde_json::from_str(legacy).expect("parse legacy version manifest");
        assert!(parsed.delivery_squad.is_none());

        let mut with_squad = parsed;
        with_squad.delivery_squad = Some(serde_json::json!({
            "id": "squad-1",
            "memberIds": ["employee-1"],
            "leaderId": "employee-1"
        }));
        let serialized = serde_json::to_value(with_squad).expect("serialize version manifest");
        assert_eq!(serialized["deliverySquad"]["leaderId"], "employee-1");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            task_supervisor::prepare_for_user_launch(&data_dir)?;
            let db = Connection::open(data_dir.join("delivery-pilot.db"))?;
            db.execute_batch(include_str!("../migrations/001_initial.sql"))?;
            app.manage(AppState { db: Mutex::new(db) });
            app.manage(DeliveryRuntimeManager::new());
            let supervisor =
                task_supervisor::TaskSupervisor::new(data_dir.join("supervisor-tasks.json"))?;
            let task_workspace = workspace_root(app.handle())?;
            if let Err(error) = supervisor.discover_workspace(&task_workspace) {
                eprintln!("无法自动接管历史运行任务: {error}");
            }
            app.manage(supervisor);
            task_supervisor::start(app.handle().clone());
            if let Err(error) = task_supervisor::install_login_agent(&data_dir) {
                eprintln!("无法安装任务监督登录项: {error}");
            }
            let technology_service =
                TechnologyService::new(data_dir.join("technology-sources.json"))?;
            app.manage(technology_service.clone());
            tauri::async_runtime::spawn(async move {
                if let Err(error) = technology::start_api(technology_service).await {
                    eprintln!("{error}");
                }
            });
            start_demo_handoff_inbox(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            environment_check,
            document_pick,
            document_create_from_text,
            requirement_recommend,
            workspace_default,
            workspace_prepare,
            workspace_history,
            workspace_version_status,
            automation_permission,
            launch_external_stage,
            focus_external_app,
            external_status,
            delivery_access,
            open_delivery_access,
            delivery_evidence,
            open_delivery_artifact,
            event_count,
            demo_handoff_pending,
            demo_handoff_update,
            technology_api_status,
            technology_domains,
            technology_match,
            technology_solution,
            technology_domain_trends,
            technology_global_trends,
            technology_sources,
            technology_source_save,
            technology_source_delete,
            technology_source_test,
            technology_open_url,
            technology_advisory::technology_advisory_start,
            technology_advisory::technology_advisory_status,
            technology_advisory::technology_codegraph_start,
            technology_advisory::technology_codegraph_status,
            execution_control::execution_control_snapshot,
            task_supervisor::supervisor_tasks,
            task_supervisor::supervisor_runtime_status,
            task_supervisor::supervisor_auto_recovery_set,
            task_supervisor::supervisor_control,
            task_supervisor::supervisor_adopt
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build DeliveryPilot");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Reopen { .. }) {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        if let tauri::RunEvent::ExitRequested { code, .. } = event {
            if code != Some(tauri::RESTART_EXIT_CODE) {
                if let Ok(data_dir) = app_handle.path().app_data_dir() {
                    if let Err(error) = task_supervisor::mark_intentional_quit(&data_dir) {
                        eprintln!("无法记录主动退出状态: {error}");
                    }
                }
            }
            app_handle.state::<DeliveryRuntimeManager>().stop_all();
        } else if matches!(event, tauri::RunEvent::Exit) {
            app_handle.state::<DeliveryRuntimeManager>().stop_all();
        }
    });
}
