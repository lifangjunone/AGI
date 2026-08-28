use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};
use tauri::AppHandle;

use crate::call_sidecar;

const PROVIDER_BASE: &str = "http://127.0.0.1:43128";
const EXPLORATION_BUNDLE_ID: &str = "com.local.technology-exploration";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvisoryStartRequest {
    pub workspace_path: String,
    pub requirement: String,
    pub business_domain: Option<String>,
    pub transport: String,
    pub depth: String,
    pub fallback_transport: Option<String>,
    pub max_candidates: Option<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvisoryRun {
    pub job_id: String,
    pub project_id: Option<String>,
    pub state: String,
    pub requested_transport: String,
    pub actual_transport: String,
    pub fallback_used: bool,
    pub workspace_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvisoryStatus {
    pub job_id: String,
    pub project_id: Option<String>,
    pub state: String,
    pub phase: String,
    pub percent: u8,
    pub message: String,
    pub completed: bool,
    pub continuously_monitored: bool,
    pub last_scanned_at: Option<String>,
    pub next_scan_at: Option<String>,
    pub result: Option<Value>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGraphCandidate {
    pub full_name: String,
    pub url: String,
    pub clone_url: String,
    pub license: String,
    pub license_blocked: bool,
    pub fit_score: u8,
    pub matched_terms: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGraphStartRequest {
    pub workspace_path: String,
    pub advisory_job_id: String,
    pub candidate: CodeGraphCandidate,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeGraphRun {
    pub state: String,
    pub phase: String,
    pub percent: u8,
    pub message: String,
    pub candidate: String,
    pub evidence_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequirementProject {
    id: String,
    #[serde(default)]
    scan_status: String,
    #[serde(default)]
    scan_phase: String,
    #[serde(default)]
    last_scanned_at: Option<String>,
    #[serde(default)]
    next_scan_at: Option<String>,
}

#[derive(Deserialize)]
struct RequirementProjectResponse {
    project: RequirementProject,
    result: Option<Value>,
}

fn support_job_dir(job_id: &str) -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "无法定位用户目录".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library/Application Support/Technology Exploration Agent/jobs")
        .join(job_id))
}

fn advisory_output_dir(workspace: &Path) -> PathBuf {
    workspace.join(".delivery-pilot/technology-reference")
}

pub(crate) fn technology_work_in_progress(workspace: &Path) -> bool {
    let output = advisory_output_dir(workspace);
    let Some(request) = read_json(&output.join("request.json")) else {
        return false;
    };
    if request
        .get("technologyProjectId")
        .and_then(Value::as_str)
        .is_some()
    {
        let scan_state = read_json(&output.join("project-status.json")).and_then(|value| {
            value
                .get("scanStatus")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
        if scan_state
            .as_deref()
            .is_none_or(|state| matches!(state, "waiting" | "queued" | "running"))
        {
            return true;
        }
        if scan_state.as_deref() == Some("failed") {
            return false;
        }
        let needs_graph = request.get("depth").and_then(Value::as_str) == Some("code_graph");
        return needs_graph
            && !output.join("graph-evidence.json").is_file()
            && !read_json(&output.join("codegraph-progress.json"))
                .and_then(|value| {
                    value
                        .get("state")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .is_some_and(|state| state == "failed");
    }
    let Some(job_id) = request.get("jobId").and_then(Value::as_str) else {
        return false;
    };
    let result = support_job_dir(job_id)
        .ok()
        .and_then(|job| read_json(&job.join("result.json")));
    let terminal = result
        .as_ref()
        .and_then(|value| value.get("state"))
        .and_then(Value::as_str)
        .is_some_and(|state| matches!(state, "completed" | "failed"));
    if !terminal {
        return true;
    }
    let needs_graph = request.get("depth").and_then(Value::as_str) == Some("code_graph");
    needs_graph
        && !output.join("graph-evidence.json").is_file()
        && !read_json(&output.join("codegraph-progress.json"))
            .and_then(|value| {
                value
                    .get("state")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .is_some_and(|state| state == "failed")
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
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

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

async fn provider_online() -> bool {
    reqwest::Client::new()
        .get(format!("{PROVIDER_BASE}/v1/health"))
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
}

async fn provider_capabilities() -> Result<Value, String> {
    ensure_provider().await?;
    reqwest::Client::new()
        .get(format!("{PROVIDER_BASE}/v1/capabilities"))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .map_err(|error| format!("读取 Technology Exploration 能力失败: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Technology Exploration 能力接口异常: {error}"))?
        .json()
        .await
        .map_err(|error| format!("Technology Exploration 能力响应无效: {error}"))
}

async fn create_requirement_project(payload: &Value) -> Result<RequirementProject, String> {
    let response = reqwest::Client::new()
        .post(format!("{PROVIDER_BASE}/v1/projects"))
        .json(payload)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|error| format!("创建 Technology Exploration 项目失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Technology Exploration 拒绝项目: HTTP {} {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ));
    }
    response
        .json()
        .await
        .map_err(|error| format!("Technology Exploration 项目响应无效: {error}"))
}

async fn update_requirement_project(
    project_id: &str,
    payload: &Value,
) -> Result<RequirementProject, String> {
    let response = reqwest::Client::new()
        .put(format!("{PROVIDER_BASE}/v1/projects/{project_id}"))
        .json(payload)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|error| format!("更新 Technology Exploration 项目失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Technology Exploration 拒绝更新项目: HTTP {} {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ));
    }
    response
        .json()
        .await
        .map_err(|error| format!("Technology Exploration 项目响应无效: {error}"))
}

async fn requirement_project_exists(project_id: &str) -> bool {
    reqwest::Client::new()
        .get(format!("{PROVIDER_BASE}/v1/projects/{project_id}"))
        .timeout(Duration::from_secs(4))
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
}

async fn scan_requirement_project(project_id: &str) -> Result<(), String> {
    let response = reqwest::Client::new()
        .post(format!("{PROVIDER_BASE}/v1/projects/{project_id}/scan"))
        .json(&serde_json::json!({}))
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|error| format!("启动 Technology Exploration 匹配失败: {error}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Technology Exploration 扫描请求失败: HTTP {} {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ))
    }
}

fn open_exploration(background: bool) -> Result<(), String> {
    let mut command = Command::new("/usr/bin/open");
    if background {
        command.arg("-gj");
    }
    let status = command
        .args([
            "-b",
            EXPLORATION_BUNDLE_ID,
            "--args",
            "--show-latest",
            "--open-match",
        ])
        .status()
        .map_err(|error| format!("无法启动 Technology Exploration: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Technology Exploration 启动失败".into())
    }
}

async fn ensure_provider() -> Result<(), String> {
    if provider_online().await {
        return Ok(());
    }
    open_exploration(true)?;
    for _ in 0..12 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if provider_online().await {
            return Ok(());
        }
    }
    Err("Technology Exploration Provider 未启动（127.0.0.1:43128）".into())
}

async fn start_provider(request: &Value) -> Result<(), String> {
    ensure_provider().await?;
    let response = reqwest::Client::new()
        .post(format!("{PROVIDER_BASE}/v1/advisories"))
        .json(request)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|error| format!("Provider 请求失败: {error}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Provider 拒绝任务: HTTP {} {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ))
    }
}

fn start_requirement_project_with_computer_use(app: &AppHandle) -> Result<(), String> {
    open_exploration(false)?;
    thread::sleep(Duration::from_millis(1_200));
    let open_workbench = call_sidecar(
        app,
        "ui.press",
        HashMap::from([("bundleId", EXPLORATION_BUNDLE_ID), ("label", "需求匹配")]),
    )?;
    if !open_workbench
        .get("method")
        .is_some_and(|method| method.starts_with("AX"))
    {
        return Err("Technology Exploration 的“需求匹配”入口不可访问".into());
    }
    for _ in 0..20 {
        let snapshot = call_sidecar(
            app,
            "ui.snapshot",
            HashMap::from([("bundleId", EXPLORATION_BUNDLE_ID)]),
        )?;
        if snapshot
            .get("nodes")
            .is_some_and(|nodes| nodes.contains("立即匹配"))
        {
            let start = call_sidecar(
                app,
                "ui.press",
                HashMap::from([("bundleId", EXPLORATION_BUNDLE_ID), ("label", "立即匹配")]),
            )?;
            if start
                .get("method")
                .is_some_and(|method| method.starts_with("AX"))
            {
                return Ok(());
            }
            return Err("Computer Use 未通过辅助功能控件触发需求匹配".into());
        }
        thread::sleep(Duration::from_millis(300));
    }
    Err("Technology Exploration 项目中心的“立即匹配”控件不可访问".into())
}

#[tauri::command]
pub async fn technology_advisory_start(
    app: AppHandle,
    request: AdvisoryStartRequest,
) -> Result<AdvisoryRun, String> {
    let workspace = PathBuf::from(&request.workspace_path);
    if !workspace.is_dir() {
        return Err("技术参考工作目录不存在".into());
    }
    if request.requirement.trim().is_empty() {
        return Err("技术参考需求摘要不能为空".into());
    }
    if !matches!(
        request.depth.as_str(),
        "recommend" | "verify" | "code_graph"
    ) {
        return Err("不支持的技术参考深度".into());
    }
    let integration_id = format!("delivery-pilot-{}", uuid::Uuid::new_v4());
    let requirement_analysis =
        fs::read_to_string(workspace.join(".delivery-pilot/traework-result.md"))
            .ok()
            .filter(|content| !content.trim().is_empty())
            .map(|content| content.chars().take(6_000).collect::<String>());
    let requirement_summary =
        requirement_analysis.unwrap_or_else(|| request.requirement.trim().to_string());
    let profile = serde_json::json!({
        "businessDomain": request.business_domain.unwrap_or_else(|| "自动识别".into()),
        "summary": requirement_summary,
        "capabilities": request.requirement
            .split(['，', '。', '、', ',', ';'])
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .take(12)
            .collect::<Vec<_>>(),
        "constraints": {
            "forbiddenLicenses": ["AGPL-3.0"],
            "demoTimeBudgetMinutes": 30
        }
    });
    let payload = serde_json::json!({
        "schemaVersion": "1.0",
        "jobId": integration_id,
        "requirementProfile": profile,
        "depth": request.depth,
        "maxCandidates": request.max_candidates.unwrap_or(8).clamp(1, 12),
        "requestedAt": crate::current_timestamp(),
    });
    let output_dir = advisory_output_dir(&workspace);
    fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;
    let existing_project_id = read_json(&output_dir.join("request.json")).and_then(|value| {
        value
            .get("technologyProjectId")
            .and_then(Value::as_str)
            .map(str::to_string)
    });

    let requested_transport = request.transport.clone();
    let fallback = request.fallback_transport.as_deref();
    if !matches!(request.transport.as_str(), "computer_use" | "provider_api") {
        return Err("不支持的技术参考通道".into());
    }
    let capabilities = provider_capabilities().await?;
    let supports_projects = capabilities
        .get("projectMonitoring")
        .and_then(|value| value.get("enabled"))
        .and_then(Value::as_bool)
        == Some(true);
    if !supports_projects {
        start_provider(&payload).await?;
        write_json(&output_dir.join("request.json"), &payload)?;
        return Ok(AdvisoryRun {
            job_id: integration_id,
            project_id: None,
            state: "queued".into(),
            requested_transport: requested_transport.clone(),
            actual_transport: requested_transport,
            fallback_used: false,
            workspace_path: request.workspace_path,
        });
    }

    let project_payload = serde_json::json!({
        "name": request.requirement.trim().chars().take(80).collect::<String>(),
        "businessDomain": payload["requirementProfile"]["businessDomain"],
        "summary": payload["requirementProfile"]["summary"],
        "capabilities": payload["requirementProfile"]["capabilities"],
        "status": "active",
        "integration": {
            "source": "delivery-pilot",
            "workspacePath": request.workspace_path,
            "integrationId": integration_id,
            "depth": request.depth
        }
    });
    let project = match existing_project_id {
        Some(project_id) if requirement_project_exists(&project_id).await => {
            update_requirement_project(&project_id, &project_payload).await?
        }
        _ => create_requirement_project(&project_payload).await?,
    };
    let primary = if request.transport == "computer_use" {
        start_requirement_project_with_computer_use(&app)
    } else {
        scan_requirement_project(&project.id).await
    };
    let (actual_transport, fallback_used) = match primary {
        Ok(()) => (request.transport, false),
        Err(primary_error) => {
            let Some(fallback) = fallback.filter(|value| *value != requested_transport) else {
                return Err(primary_error);
            };
            let fallback_result = if fallback == "computer_use" {
                start_requirement_project_with_computer_use(&app)
            } else if fallback == "provider_api" {
                scan_requirement_project(&project.id).await
            } else {
                return Err(primary_error);
            };
            fallback_result.map_err(|fallback_error| {
                format!("主通道失败: {primary_error}; 降级通道失败: {fallback_error}")
            })?;
            (fallback.to_string(), true)
        }
    };
    let integration_request = serde_json::json!({
        "schemaVersion": "2.0",
        "integrationId": integration_id,
        "technologyProjectId": project.id,
        "requirementProfile": payload["requirementProfile"],
        "depth": request.depth,
        "maxCandidates": request.max_candidates.unwrap_or(8).clamp(1, 12),
        "requestedAt": crate::current_timestamp(),
        "monitoring": {
            "enabled": true,
            "intervalSeconds": 300
        }
    });
    write_json(&output_dir.join("request.json"), &integration_request)?;
    Ok(AdvisoryRun {
        job_id: project.id.clone(),
        project_id: Some(project.id),
        state: "queued".into(),
        requested_transport,
        actual_transport,
        fallback_used,
        workspace_path: request.workspace_path,
    })
}

#[tauri::command]
pub async fn technology_advisory_status(
    workspace_path: String,
    job_id: String,
) -> Result<AdvisoryStatus, String> {
    let workspace = PathBuf::from(workspace_path);
    let integration_request = read_json(&advisory_output_dir(&workspace).join("request.json"));
    let project_id = integration_request
        .as_ref()
        .and_then(|value| value.get("technologyProjectId"))
        .and_then(Value::as_str)
        .map(str::to_string);
    if let Some(project_id) = project_id {
        ensure_provider().await?;
        let response = reqwest::Client::new()
            .get(format!("{PROVIDER_BASE}/v1/projects/{project_id}"))
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|error| format!("读取 Technology Exploration 项目状态失败: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Technology Exploration 项目状态异常: HTTP {}",
                response.status()
            ));
        }
        let response: RequirementProjectResponse = response
            .json()
            .await
            .map_err(|error| format!("Technology Exploration 项目状态无效: {error}"))?;
        let project = response.project;
        let completed = project.scan_status == "completed" && response.result.is_some();
        let failed = project.scan_status == "failed";
        let state = if completed {
            "completed"
        } else if failed {
            "failed"
        } else if project.scan_status == "running" {
            "running"
        } else {
            "queued"
        };
        let percent = match project.scan_status.as_str() {
            "completed" | "failed" => 100,
            "running" => 55,
            _ => 5,
        };
        let message = if completed {
            response
                .result
                .as_ref()
                .and_then(|value| value.get("summary"))
                .and_then(Value::as_str)
                .unwrap_or("项目需求匹配已完成")
                .to_string()
        } else if failed {
            "项目需求匹配失败，Technology Exploration 将按周期继续监控".into()
        } else if !project.scan_phase.is_empty() {
            project.scan_phase.clone()
        } else {
            "项目已进入持续监控，等待本轮扫描".into()
        };
        let output_dir = advisory_output_dir(&workspace);
        let project_status = serde_json::json!({
            "projectId": project.id,
            "scanStatus": project.scan_status,
            "scanPhase": project.scan_phase,
            "lastScannedAt": project.last_scanned_at,
            "nextScanAt": project.next_scan_at,
            "updatedAt": crate::current_timestamp()
        });
        write_json(&output_dir.join("project-status.json"), &project_status)?;
        if let Some(result) = response.result.as_ref() {
            write_json(&output_dir.join("result.json"), result)?;
        }
        return Ok(AdvisoryStatus {
            job_id,
            project_id: Some(project_id),
            state: state.into(),
            phase: if completed {
                "completed".into()
            } else {
                project.scan_status
            },
            percent,
            message,
            completed,
            continuously_monitored: true,
            last_scanned_at: project.last_scanned_at,
            next_scan_at: project.next_scan_at,
            result: response.result,
        });
    }

    let job_dir = support_job_dir(&job_id)?;
    let progress = read_json(&job_dir.join("progress.json")).unwrap_or_else(|| {
        serde_json::json!({
            "state": "queued",
            "phase": "queued",
            "percent": 0,
            "message": "等待 Technology Exploration 接收任务",
            "completed": false
        })
    });
    let result = read_json(&job_dir.join("result.json"));
    let state = result
        .as_ref()
        .and_then(|value| value.get("state"))
        .and_then(Value::as_str)
        .or_else(|| progress.get("state").and_then(Value::as_str))
        .unwrap_or("queued")
        .to_string();
    let completed = state == "completed";
    if completed || state == "failed" {
        let output_dir = advisory_output_dir(&workspace);
        fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;
        for file in [
            "request.json",
            "progress.json",
            "result.json",
            "events.jsonl",
        ] {
            let source = job_dir.join(file);
            if source.is_file() {
                fs::copy(&source, output_dir.join(file)).map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(AdvisoryStatus {
        job_id,
        project_id: None,
        state,
        phase: progress
            .get("phase")
            .and_then(Value::as_str)
            .unwrap_or("queued")
            .to_string(),
        percent: progress
            .get("percent")
            .and_then(Value::as_u64)
            .unwrap_or_default()
            .min(100) as u8,
        message: progress
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("等待技术参考")
            .to_string(),
        completed,
        continuously_monitored: false,
        last_scanned_at: None,
        next_scan_at: None,
        result,
    })
}

fn codegraph_binary() -> Result<PathBuf, String> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/codegraph"),
        PathBuf::from("/usr/local/bin/codegraph"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        candidates.insert(0, PathBuf::from(home).join(".local/bin/codegraph"));
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "未安装 CodeGraph 1.5.0，请先安装后重试".to_string())
}

fn safe_candidate_name(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .take(100)
        .collect()
}

fn write_codegraph_progress(path: &Path, run: &CodeGraphRun) -> Result<(), String> {
    write_json(
        path,
        &serde_json::to_value(run).map_err(|error| error.to_string())?,
    )
}

fn command_json(command: &mut Command, label: &str) -> Result<Value, String> {
    let output = command
        .output()
        .map_err(|error| format!("{label} 启动失败: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "{label} 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("{label} 返回无效 JSON: {error}"))
}

fn run_codegraph_analysis(
    workspace: &Path,
    advisory_job_id: &str,
    candidate: &CodeGraphCandidate,
) -> Result<Value, String> {
    let binary = codegraph_binary()?;
    let candidate_id = safe_candidate_name(&candidate.full_name);
    let sandbox = workspace
        .join(".sandbox/technology-poc")
        .join(&candidate_id);
    let repository = sandbox.join("repository");
    let queries_dir = sandbox.join("queries");
    fs::create_dir_all(&queries_dir).map_err(|error| error.to_string())?;
    let progress_path = advisory_output_dir(workspace).join("codegraph-progress.json");
    write_codegraph_progress(
        &progress_path,
        &CodeGraphRun {
            state: "running".into(),
            phase: "cloning".into(),
            percent: 15,
            message: format!("正在隔离浅克隆 {}", candidate.full_name),
            candidate: candidate.full_name.clone(),
            evidence_path: String::new(),
        },
    )?;
    if !repository.join(".git").is_dir() {
        if repository.exists() {
            return Err("CodeGraph 沙箱存在不完整仓库，请更换候选或清理该沙箱".into());
        }
        let output = Command::new("/usr/bin/git")
            .args(["clone", "--depth", "1", "--filter=blob:none"])
            .arg(&candidate.clone_url)
            .arg(&repository)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .map_err(|error| format!("Git 浅克隆启动失败: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "Git 浅克隆失败: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
    }
    let commit_output = Command::new("/usr/bin/git")
        .args(["-C"])
        .arg(&repository)
        .args(["rev-parse", "HEAD"])
        .output()
        .map_err(|error| error.to_string())?;
    if !commit_output.status.success() {
        return Err("无法固定候选仓库 Commit".into());
    }
    let commit = String::from_utf8_lossy(&commit_output.stdout)
        .trim()
        .to_string();

    write_codegraph_progress(
        &progress_path,
        &CodeGraphRun {
            state: "running".into(),
            phase: "indexing".into(),
            percent: 45,
            message: "CodeGraph 正在解析文件、符号与调用关系".into(),
            candidate: candidate.full_name.clone(),
            evidence_path: String::new(),
        },
    )?;
    let index_command = if repository.join(".codegraph").is_dir() {
        "index"
    } else {
        "init"
    };
    let index = Command::new(&binary)
        .arg(index_command)
        .arg(&repository)
        .output()
        .map_err(|error| format!("CodeGraph 索引启动失败: {error}"))?;
    if !index.status.success() {
        return Err(format!(
            "CodeGraph 索引失败: {}",
            String::from_utf8_lossy(&index.stderr).trim()
        ));
    }
    let status = command_json(
        Command::new(&binary)
            .arg("status")
            .arg(&repository)
            .arg("--json"),
        "CodeGraph status",
    )?;
    let files = command_json(
        Command::new(&binary)
            .arg("files")
            .arg("-p")
            .arg(&repository)
            .args(["--format", "flat", "--max-depth", "5", "--json"]),
        "CodeGraph files",
    )?;
    write_json(&queries_dir.join("status.json"), &status)?;
    write_json(&queries_dir.join("files.json"), &files)?;

    write_codegraph_progress(
        &progress_path,
        &CodeGraphRun {
            state: "running".into(),
            phase: "querying".into(),
            percent: 72,
            message: "正在将需求能力映射到代码符号与文件".into(),
            candidate: candidate.full_name.clone(),
            evidence_path: String::new(),
        },
    )?;
    let mut query_evidence = Vec::new();
    for (index, term) in candidate.matched_terms.iter().take(6).enumerate() {
        let result = command_json(
            Command::new(&binary)
                .arg("query")
                .arg(term)
                .arg("-p")
                .arg(&repository)
                .args(["-l", "10", "--json"]),
            &format!("CodeGraph query {term}"),
        )?;
        write_json(&queries_dir.join(format!("query-{index}.json")), &result)?;
        query_evidence.push((term.clone(), result));
    }

    let mut nodes = vec![serde_json::json!({
        "id": format!("repo:{}", candidate.full_name),
        "label": candidate.full_name,
        "kind": "Repository",
        "layer": 2,
        "detail": format!("{} · commit {}", candidate.license, commit),
    })];
    let mut edges = Vec::new();
    let mut node_ids = HashSet::from([format!("repo:{}", candidate.full_name)]);
    let mut covered_capabilities = 0usize;
    let mut top_symbols = Vec::new();
    for (capability_index, (term, result)) in query_evidence.iter().enumerate() {
        let capability_id = format!("capability:{capability_index}");
        nodes.push(serde_json::json!({
            "id": capability_id,
            "label": term,
            "kind": "Capability",
            "layer": 0,
            "detail": "来自需求与候选匹配词",
        }));
        edges.push(serde_json::json!({
            "id": format!("edge-cap-repo-{capability_index}"),
            "from": capability_id,
            "to": format!("repo:{}", candidate.full_name),
            "type": "SATISFIED_BY",
            "confidence": f64::from(candidate.fit_score) / 100.0,
            "evidence": [{"source": "technology-exploration", "jobId": advisory_job_id}],
        }));
        let rows = result.as_array().cloned().unwrap_or_default();
        if !rows.is_empty() {
            covered_capabilities += 1;
        }
        for (symbol_index, row) in rows.iter().take(4).enumerate() {
            let Some(symbol) = row.get("node") else {
                continue;
            };
            let raw_id = symbol
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let symbol_id = format!("symbol:{raw_id}");
            let name = symbol
                .get("qualifiedName")
                .or_else(|| symbol.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("未命名符号");
            let file_path = symbol.get("filePath").and_then(Value::as_str).unwrap_or("");
            let line = symbol
                .get("startLine")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            if node_ids.insert(symbol_id.clone()) {
                nodes.push(serde_json::json!({
                    "id": symbol_id,
                    "label": name,
                    "kind": "Symbol",
                    "layer": 4,
                    "detail": format!("{}:{}", file_path, line),
                }));
                top_symbols.push((name.to_string(), symbol_id.clone()));
            }
            edges.push(serde_json::json!({
                "id": format!("edge-cap-symbol-{capability_index}-{symbol_index}"),
                "from": capability_id,
                "to": symbol_id,
                "type": "IMPLEMENTED_IN",
                "confidence": row.get("score").and_then(Value::as_f64).unwrap_or(1.0) / 12.0,
                "evidence": [{
                    "source": "codegraph",
                    "command": format!("codegraph query \"{}\" --json", term),
                    "repository": candidate.full_name,
                    "commit": commit,
                    "file": file_path,
                    "lineRange": [line, symbol.get("endLine").and_then(Value::as_u64).unwrap_or(line)]
                }],
            }));
        }
    }

    let mut relation_queries = Vec::new();
    for (index, (name, symbol_id)) in top_symbols.iter().take(3).enumerate() {
        for relation in ["callers", "callees", "impact"] {
            let mut command = Command::new(&binary);
            command
                .arg(relation)
                .arg(name)
                .arg("-p")
                .arg(&repository)
                .arg("--json");
            if relation == "impact" {
                command.args(["--depth", "3"]);
            } else {
                command.args(["--limit", "12"]);
            }
            if let Ok(result) = command_json(&mut command, &format!("CodeGraph {relation}")) {
                write_json(
                    &queries_dir.join(format!("{relation}-{index}.json")),
                    &result,
                )?;
                relation_queries.push(serde_json::json!({
                    "symbol": name,
                    "symbolId": symbol_id,
                    "relation": relation,
                    "result": result,
                }));
            }
        }
    }
    let total_capabilities = query_evidence.len().max(1);
    let coverage_ratio = covered_capabilities as f64 / total_capabilities as f64;
    let verified_fit_score = (f64::from(candidate.fit_score) + coverage_ratio * 15.0)
        .round()
        .min(95.0) as u8;
    let evidence = serde_json::json!({
        "schemaVersion": "1.0",
        "engine": {"name": "CodeGraph", "version": status.get("version").cloned().unwrap_or(Value::Null)},
        "repository": {
            "fullName": candidate.full_name,
            "url": candidate.url,
            "commit": commit,
            "license": candidate.license,
            "sandbox": sandbox,
        },
        "discoveryFitScore": candidate.fit_score,
        "verifiedFitScore": verified_fit_score,
        "coverage": {
            "matchedCapabilities": covered_capabilities,
            "totalCapabilities": query_evidence.len(),
            "ratio": coverage_ratio,
        },
        "metrics": status,
        "nodes": nodes,
        "edges": edges,
        "queries": query_evidence.into_iter().map(|(term, result)| serde_json::json!({
            "term": term,
            "command": format!("codegraph query \"{}\" --json", term),
            "result": result,
        })).collect::<Vec<_>>(),
        "relations": relation_queries,
        "generatedAt": crate::current_timestamp(),
        "safety": {
            "repositoryCodeExecuted": false,
            "installScriptsExecuted": false,
            "indexLocalOnly": true,
        }
    });
    let sandbox_evidence = sandbox.join("graph-evidence.json");
    write_json(&sandbox_evidence, &evidence)?;
    let output_evidence = advisory_output_dir(workspace).join("graph-evidence.json");
    write_json(&output_evidence, &evidence)?;
    Ok(evidence)
}

#[tauri::command]
pub fn technology_codegraph_start(request: CodeGraphStartRequest) -> Result<CodeGraphRun, String> {
    let workspace = PathBuf::from(&request.workspace_path);
    if !workspace.is_dir() {
        return Err("CodeGraph 工作目录不存在".into());
    }
    if request.candidate.license_blocked {
        return Err("候选许可证已被策略阻断，禁止进入 CodeGraph 验证".into());
    }
    if !request.candidate.url.starts_with("https://github.com/")
        || !request
            .candidate
            .clone_url
            .starts_with("https://github.com/")
    {
        return Err("CodeGraph 仅允许验证受信任的 GitHub HTTPS 仓库".into());
    }
    let progress_path = advisory_output_dir(&workspace).join("codegraph-progress.json");
    let queued = CodeGraphRun {
        state: "queued".into(),
        phase: "queued".into(),
        percent: 0,
        message: "CodeGraph 验证任务已进入队列".into(),
        candidate: request.candidate.full_name.clone(),
        evidence_path: String::new(),
    };
    write_codegraph_progress(&progress_path, &queued)?;
    thread::spawn(move || {
        let result =
            run_codegraph_analysis(&workspace, &request.advisory_job_id, &request.candidate);
        let output_path = advisory_output_dir(&workspace).join("graph-evidence.json");
        let final_status = match result {
            Ok(_) => CodeGraphRun {
                state: "completed".into(),
                phase: "completed".into(),
                percent: 100,
                message: "CodeGraph 代码知识图谱验证完成".into(),
                candidate: request.candidate.full_name,
                evidence_path: output_path.to_string_lossy().to_string(),
            },
            Err(error) => CodeGraphRun {
                state: "failed".into(),
                phase: "failed".into(),
                percent: 100,
                message: error,
                candidate: request.candidate.full_name,
                evidence_path: String::new(),
            },
        };
        let _ = write_codegraph_progress(&progress_path, &final_status);
    });
    Ok(queued)
}

#[tauri::command]
pub fn technology_codegraph_status(workspace_path: String) -> Result<Value, String> {
    let workspace = PathBuf::from(workspace_path);
    let progress_path = advisory_output_dir(&workspace).join("codegraph-progress.json");
    let mut progress =
        read_json(&progress_path).ok_or_else(|| "CodeGraph 任务尚未启动".to_string())?;
    if let Some(evidence) = read_json(&advisory_output_dir(&workspace).join("graph-evidence.json"))
    {
        progress["state"] = Value::String("completed".into());
        progress["phase"] = Value::String("completed".into());
        progress["percent"] = Value::from(100);
        progress["message"] = Value::String("CodeGraph 代码知识图谱验证完成".into());
        progress["evidence"] = evidence;
    }
    Ok(progress)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project_workspace(depth: &str, scan_status: &str) -> PathBuf {
        let workspace =
            std::env::temp_dir().join(format!("technology-project-{}", uuid::Uuid::new_v4()));
        let output = advisory_output_dir(&workspace);
        fs::create_dir_all(&output).expect("create output");
        write_json(
            &output.join("request.json"),
            &serde_json::json!({
                "schemaVersion": "2.0",
                "technologyProjectId": "req-test",
                "depth": depth
            }),
        )
        .expect("write request");
        write_json(
            &output.join("project-status.json"),
            &serde_json::json!({"scanStatus": scan_status}),
        )
        .expect("write status");
        workspace
    }

    #[test]
    fn requirement_project_waits_while_scan_is_running() {
        let workspace = project_workspace("recommend", "running");
        assert!(technology_work_in_progress(&workspace));
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn failed_project_scan_does_not_block_main_delivery() {
        let workspace = project_workspace("code_graph", "failed");
        assert!(!technology_work_in_progress(&workspace));
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn completed_project_waits_for_requested_codegraph() {
        let workspace = project_workspace("code_graph", "completed");
        assert!(technology_work_in_progress(&workspace));
        write_json(
            &advisory_output_dir(&workspace).join("codegraph-progress.json"),
            &serde_json::json!({"state": "failed"}),
        )
        .expect("write graph status");
        assert!(!technology_work_in_progress(&workspace));
        let _ = fs::remove_dir_all(workspace);
    }
}
