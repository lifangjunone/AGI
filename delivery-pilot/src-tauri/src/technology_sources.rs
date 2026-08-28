use crate::technology::{
    MatchBreakdown, MatchRequest, MatchResponse, TechnologyMatch, TrendItem, TrendResponse,
};
use reqwest::header::{AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceConfig {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub priority: u16,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub priority: u16,
    pub capabilities: Vec<String>,
    pub location: String,
    pub api_key_configured: bool,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceTestResult {
    pub id: String,
    pub ok: bool,
    pub message: String,
    pub item_count: usize,
    pub checked_at: String,
}

#[derive(Clone)]
pub struct SourceManager {
    path: PathBuf,
    sources: Arc<tokio::sync::RwLock<Vec<DataSourceConfig>>>,
    client: reqwest::Client,
}

impl SourceManager {
    pub fn new(path: PathBuf, client: reqwest::Client) -> Result<Self, String> {
        let sources = load_sources(&path)?;
        Ok(Self {
            path,
            sources: Arc::new(tokio::sync::RwLock::new(sources)),
            client,
        })
    }

    pub async fn list(&self) -> Vec<DataSourceView> {
        let mut sources = self
            .sources
            .read()
            .await
            .iter()
            .map(source_view)
            .collect::<Vec<_>>();
        sources.sort_by_key(|source| source.priority);
        sources
    }

    pub async fn enabled_for(&self, capability: &str) -> Vec<DataSourceConfig> {
        let mut sources = self
            .sources
            .read()
            .await
            .iter()
            .filter(|source| {
                source.enabled
                    && (source.capabilities.is_empty()
                        || source.capabilities.iter().any(|item| item == capability))
            })
            .cloned()
            .collect::<Vec<_>>();
        sources.sort_by_key(|source| source.priority);
        sources
    }

    pub async fn save(&self, mut input: DataSourceConfig) -> Result<DataSourceView, String> {
        validate_source(&input)?;
        let mut sources = self.sources.write().await;
        if let Some(existing) = sources.iter_mut().find(|source| source.id == input.id) {
            if input.api_key.trim().is_empty() {
                input.api_key = existing.api_key.clone();
            }
            if existing.kind == "builtin" {
                input.kind = "builtin".into();
                input.location.clear();
            }
            *existing = input.clone();
        } else {
            if input.id.trim().is_empty() {
                input.id = format!("source-{}", uuid::Uuid::new_v4());
            }
            sources.push(input.clone());
        }
        persist_sources(&self.path, &sources)?;
        Ok(source_view(&input))
    }

    pub async fn delete(&self, id: &str) -> Result<(), String> {
        let mut sources = self.sources.write().await;
        if sources
            .iter()
            .any(|source| source.id == id && source.kind == "builtin")
        {
            return Err("默认数据源不能删除，可以停用".into());
        }
        let original = sources.len();
        sources.retain(|source| source.id != id);
        if sources.len() == original {
            return Err("没有找到该数据源".into());
        }
        persist_sources(&self.path, &sources)
    }

    pub async fn test(&self, id: &str) -> Result<SourceTestResult, String> {
        let source = self
            .sources
            .read()
            .await
            .iter()
            .find(|source| source.id == id)
            .cloned()
            .ok_or_else(|| "没有找到该数据源".to_string())?;
        let result = match source.kind.as_str() {
            "builtin" => SourceTestResult {
                id: source.id,
                ok: true,
                message: "默认 GitHub 与 Hacker News 连接由实时查询验证".into(),
                item_count: 0,
                checked_at: timestamp(),
            },
            "technology_exploration" => {
                let items = read_local_report(&source)?;
                SourceTestResult {
                    id: source.id,
                    ok: true,
                    message: format!("已读取最新技术情报报告，共 {} 条候选", items.len()),
                    item_count: items.len(),
                    checked_at: timestamp(),
                }
            }
            "http" => {
                let base = source.location.trim_end_matches('/');
                let response =
                    authorized(self.client.get(format!("{base}/health")), &source.api_key)
                        .send()
                        .await
                        .map_err(|error| format!("第三方数据源连接失败: {error}"))?
                        .error_for_status()
                        .map_err(|error| format!("第三方数据源健康检查失败: {error}"))?;
                SourceTestResult {
                    id: source.id,
                    ok: true,
                    message: format!("连接成功 · HTTP {}", response.status()),
                    item_count: 0,
                    checked_at: timestamp(),
                }
            }
            _ => return Err("不支持的数据源类型".into()),
        };
        Ok(result)
    }

    pub async fn matches(
        &self,
        source: &DataSourceConfig,
        request: &MatchRequest,
    ) -> Result<Vec<TechnologyMatch>, String> {
        match source.kind.as_str() {
            "technology_exploration" => {
                let items = read_local_report(source)?;
                Ok(score_local_items(items, source, request))
            }
            "http" => {
                let endpoint = format!("{}/match", source.location.trim_end_matches('/'));
                let response = authorized(self.client.post(endpoint), &source.api_key)
                    .header(USER_AGENT, "DeliveryPilot-Technology-Radar/1.0")
                    .json(request)
                    .send()
                    .await
                    .map_err(|error| format!("{} 匹配接口失败: {error}", source.name))?
                    .error_for_status()
                    .map_err(|error| format!("{} 匹配接口响应失败: {error}", source.name))?
                    .json::<MatchResponse>()
                    .await
                    .map_err(|error| format!("{} 匹配数据格式错误: {error}", source.name))?;
                Ok(response
                    .results
                    .into_iter()
                    .map(|mut item| {
                        item.source = source.name.clone();
                        item
                    })
                    .collect())
            }
            _ => Ok(Vec::new()),
        }
    }

    pub async fn trends(
        &self,
        source: &DataSourceConfig,
        domain: Option<&str>,
        limit: usize,
    ) -> Result<Vec<TrendItem>, String> {
        match source.kind.as_str() {
            "technology_exploration" => {
                let items = read_local_report(source)?;
                Ok(items
                    .into_iter()
                    .filter(|item| domain.is_none_or(|value| local_matches_domain(item, value)))
                    .take(limit)
                    .map(|item| local_trend(item, source))
                    .collect())
            }
            "http" => {
                let path = if domain.is_some() {
                    "trends/domain"
                } else {
                    "trends/global"
                };
                let mut request = authorized(
                    self.client.get(format!(
                        "{}/{}",
                        source.location.trim_end_matches('/'),
                        path
                    )),
                    &source.api_key,
                )
                .query(&[("limit", limit.to_string())]);
                if let Some(domain) = domain {
                    request = request.query(&[("domain", domain)]);
                }
                let response = request
                    .send()
                    .await
                    .map_err(|error| format!("{} 趋势接口失败: {error}", source.name))?
                    .error_for_status()
                    .map_err(|error| format!("{} 趋势接口响应失败: {error}", source.name))?
                    .json::<TrendResponse>()
                    .await
                    .map_err(|error| format!("{} 趋势数据格式错误: {error}", source.name))?;
                Ok(response
                    .items
                    .into_iter()
                    .map(|mut item| {
                        item.source = source.name.clone();
                        item
                    })
                    .collect())
            }
            _ => Ok(Vec::new()),
        }
    }
}

fn default_sources() -> Vec<DataSourceConfig> {
    vec![
        DataSourceConfig {
            id: "builtin".into(),
            name: "默认实时技术源".into(),
            kind: "builtin".into(),
            enabled: true,
            priority: 10,
            capabilities: vec![
                "match".into(),
                "domain_trends".into(),
                "global_trends".into(),
            ],
            location: String::new(),
            api_key: String::new(),
        },
        DataSourceConfig {
            id: "technology-exploration".into(),
            name: "Technology Exploration".into(),
            kind: "technology_exploration".into(),
            enabled: false,
            priority: 20,
            capabilities: vec![
                "match".into(),
                "domain_trends".into(),
                "global_trends".into(),
            ],
            location: "/Users/bytedance/Desktop/desk_apps/technology-intelligence".into(),
            api_key: String::new(),
        },
    ]
}

fn load_sources(path: &Path) -> Result<Vec<DataSourceConfig>, String> {
    if !path.is_file() {
        let sources = default_sources();
        persist_sources(path, &sources)?;
        return Ok(sources);
    }
    let content =
        fs::read_to_string(path).map_err(|error| format!("无法读取技术雷达数据源配置: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("技术雷达数据源配置无效: {error}"))
}

fn persist_sources(path: &Path, sources: &[DataSourceConfig]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建数据源配置目录: {error}"))?;
    }
    let content = serde_json::to_string_pretty(sources)
        .map_err(|error| format!("无法序列化数据源配置: {error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存数据源配置: {error}"))
}

fn source_view(source: &DataSourceConfig) -> DataSourceView {
    DataSourceView {
        id: source.id.clone(),
        name: source.name.clone(),
        kind: source.kind.clone(),
        enabled: source.enabled,
        priority: source.priority,
        capabilities: source.capabilities.clone(),
        location: source.location.clone(),
        api_key_configured: !source.api_key.trim().is_empty(),
        locked: source.kind == "builtin",
    }
}

fn validate_source(source: &DataSourceConfig) -> Result<(), String> {
    if source.name.trim().is_empty() {
        return Err("数据源名称不能为空".into());
    }
    match source.kind.as_str() {
        "builtin" => Ok(()),
        "technology_exploration" => {
            let root = Path::new(&source.location);
            if !root.join("app/technology_explorer.py").is_file() {
                return Err("目录中没有找到 app/technology_explorer.py".into());
            }
            Ok(())
        }
        "http" => {
            if !source.location.starts_with("http://") && !source.location.starts_with("https://") {
                return Err("第三方 API 地址必须以 http:// 或 https:// 开头".into());
            }
            Ok(())
        }
        _ => Err("不支持的数据源类型".into()),
    }
}

fn report_directory(source: &DataSourceConfig) -> PathBuf {
    let project_reports = Path::new(&source.location).join("reports");
    if project_reports.is_dir() {
        return project_reports;
    }
    dirs_home().join("Library/Application Support/Technology Exploration Agent/reports")
}

fn read_local_report(source: &DataSourceConfig) -> Result<Vec<Value>, String> {
    validate_source(source)?;
    let directory = report_directory(source);
    let mut files = fs::read_dir(&directory)
        .map_err(|error| format!("无法读取 Technology Exploration 报告目录: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|path| {
        std::cmp::Reverse(path.metadata().and_then(|meta| meta.modified()).ok())
    });
    let latest = files
        .first()
        .ok_or_else(|| "Technology Exploration 还没有生成 JSON 报告".to_string())?;
    let report: Value = serde_json::from_str(
        &fs::read_to_string(latest).map_err(|error| format!("无法读取最新技术报告: {error}"))?,
    )
    .map_err(|error| format!("最新技术报告格式无效: {error}"))?;
    let mut items = report
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for group in report
        .get("source_top10")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let Some(group_items) = group.get("items").and_then(Value::as_array) {
            items.extend(group_items.iter().cloned());
        }
    }
    let mut seen = std::collections::HashSet::new();
    items.retain(|item| {
        let key = item.get("url").and_then(Value::as_str).unwrap_or_default();
        !key.is_empty() && seen.insert(key.to_string())
    });
    Ok(items)
}

fn score_local_items(
    items: Vec<Value>,
    source: &DataSourceConfig,
    request: &MatchRequest,
) -> Vec<TechnologyMatch> {
    let terms = requirement_terms(&request.requirement);
    let mut matches = items
        .into_iter()
        .filter_map(|item| {
            let title = text(&item, "title");
            let description = text(&item, "summary");
            let haystack = format!("{title} {description}").to_lowercase();
            let hits = terms
                .iter()
                .filter(|term| haystack.contains(&term.to_lowercase()))
                .count();
            if hits == 0 {
                return None;
            }
            let source_score = item.get("score").and_then(Value::as_f64).unwrap_or(50.0);
            let relevance = (20 + hits * 8).min(45) as u8;
            let popularity = (source_score * 0.25).round().clamp(5.0, 25.0) as u8;
            let activity = 13;
            let health = 9;
            Some(TechnologyMatch {
                name: title.clone(),
                full_name: title,
                description,
                url: text(&item, "url"),
                language: "多源情报".into(),
                stars: item
                    .get("total_stars")
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
                forks: 0,
                open_issues: 0,
                updated_at: text(&item, "published_at"),
                license: "待核实".into(),
                topics: vec![text(&item, "source")],
                score: relevance + popularity + activity + health,
                breakdown: MatchBreakdown {
                    relevance,
                    popularity,
                    activity,
                    health,
                },
                matched_reasons: vec![
                    format!("命中 {hits} 个需求信号"),
                    text(&item, "evidence"),
                    format!("来自 {}", source.name),
                ],
                source: source.name.clone(),
            })
        })
        .collect::<Vec<_>>();
    matches.sort_by_key(|item| std::cmp::Reverse(item.score));
    matches.truncate(request.limit.unwrap_or(8).clamp(1, 20));
    matches
}

fn local_trend(item: Value, source: &DataSourceConfig) -> TrendItem {
    let heat = item
        .get("score")
        .and_then(Value::as_f64)
        .unwrap_or(50.0)
        .round()
        .clamp(0.0, 100.0) as u64;
    TrendItem {
        title: text(&item, "title"),
        description: text(&item, "summary"),
        url: text(&item, "url"),
        source: format!("{} · {}", source.name, text(&item, "source")),
        heat,
        signal: text(&item, "evidence"),
        published_at: text(&item, "published_at"),
        tags: vec![text(&item, "source")],
    }
}

fn local_matches_domain(item: &Value, domain: &str) -> bool {
    let haystack = format!("{} {}", text(item, "title"), text(item, "summary")).to_lowercase();
    let terms: &[&str] = match domain {
        "ai" => &["ai", "llm", "agent", "模型", "智能"],
        "enterprise" => &["workflow", "enterprise", "工单", "审批", "企业"],
        "data" => &["data", "database", "analytics", "数据"],
        "cloud" => &["cloud", "kubernetes", "devops", "云"],
        "iot" => &["iot", "device", "industrial", "设备", "工业"],
        "security" => &["security", "privacy", "安全"],
        "developer" => &["code", "developer", "testing", "研发"],
        _ => &[],
    };
    terms.iter().any(|term| haystack.contains(term))
}

fn requirement_terms(requirement: &str) -> Vec<String> {
    let mut terms = requirement
        .split(|character: char| character.is_whitespace() || "，。；、,.;/".contains(character))
        .filter(|term| term.chars().count() >= 2)
        .map(str::to_lowercase)
        .collect::<Vec<_>>();
    for (source, target) in [
        ("检修", "maintenance"),
        ("工单", "workflow"),
        ("知识库", "knowledge"),
        ("智能", "ai"),
        ("数据", "data"),
    ] {
        if requirement.contains(source) {
            terms.push(target.into());
        }
    }
    terms
}

fn text(item: &Value, key: &str) -> String {
    item.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn authorized(request: reqwest::RequestBuilder, api_key: &str) -> reqwest::RequestBuilder {
    if api_key.trim().is_empty() {
        request
    } else {
        request.header(AUTHORIZATION, format!("Bearer {}", api_key.trim()))
    }
}

fn dirs_home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("~"))
}

fn timestamp() -> String {
    std::process::Command::new("/bin/date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_sources_keep_builtin_enabled_and_local_optional() {
        let sources = default_sources();
        assert!(sources
            .iter()
            .any(|source| source.kind == "builtin" && source.enabled));
        assert!(sources
            .iter()
            .any(|source| source.kind == "technology_exploration" && !source.enabled));
    }

    #[test]
    fn source_view_never_exposes_api_key() {
        let source = DataSourceConfig {
            id: "third-party".into(),
            name: "Third Party".into(),
            kind: "http".into(),
            enabled: true,
            priority: 30,
            capabilities: vec!["match".into()],
            location: "https://example.com/api/v1".into(),
            api_key: "secret".into(),
        };
        let value = serde_json::to_value(source_view(&source)).expect("serialize view");
        assert_eq!(value.get("apiKeyConfigured"), Some(&Value::Bool(true)));
        assert!(value.get("apiKey").is_none());
    }
}
