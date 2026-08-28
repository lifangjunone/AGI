use crate::technology_sources::{
    DataSourceConfig, DataSourceView, SourceManager, SourceTestResult,
};
use axum::{
    extract::{Path as AxumPath, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    process::Command,
    sync::Arc,
    time::{Duration, Instant},
};
use tower_http::cors::CorsLayer;

pub const API_ADDRESS: &str = "127.0.0.1:43127";

#[derive(Clone)]
pub struct TechnologyService {
    client: reqwest::Client,
    match_cache: Arc<tokio::sync::Mutex<HashMap<String, (Instant, MatchResponse)>>>,
    sources: SourceManager,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Domain {
    pub id: &'static str,
    pub name: &'static str,
    pub icon: &'static str,
    pub description: &'static str,
    pub keywords: &'static [&'static str],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchRequest {
    pub requirement: String,
    pub domain: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchBreakdown {
    pub relevance: u8,
    pub popularity: u8,
    pub activity: u8,
    pub health: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechnologyMatch {
    pub name: String,
    pub full_name: String,
    pub description: String,
    pub url: String,
    pub language: String,
    pub stars: u64,
    pub forks: u64,
    pub open_issues: u64,
    pub updated_at: String,
    pub license: String,
    pub topics: Vec<String>,
    pub score: u8,
    pub breakdown: MatchBreakdown,
    pub matched_reasons: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResponse {
    pub query: String,
    pub domain: String,
    pub generated_at: String,
    pub realtime: bool,
    pub results: Vec<TechnologyMatch>,
    pub notice: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolutionComponent {
    pub role: String,
    pub technology: TechnologyMatch,
    pub responsibility: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchitectureNode {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub detail: String,
    pub column: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchitectureEdge {
    pub from: String,
    pub to: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolutionResponse {
    pub title: String,
    pub summary: String,
    pub domain: String,
    pub confidence: u8,
    pub components: Vec<SolutionComponent>,
    pub phases: Vec<String>,
    pub risks: Vec<String>,
    pub nodes: Vec<ArchitectureNode>,
    pub edges: Vec<ArchitectureEdge>,
    pub generated_at: String,
    pub realtime: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendItem {
    pub title: String,
    pub description: String,
    pub url: String,
    pub source: String,
    pub heat: u64,
    pub signal: String,
    pub published_at: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendResponse {
    pub scope: String,
    pub generated_at: String,
    pub realtime: bool,
    pub items: Vec<TrendItem>,
    pub notice: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubSearchResponse {
    items: Vec<GitHubRepository>,
}

#[derive(Debug, Deserialize)]
struct GitHubRepository {
    name: String,
    full_name: String,
    description: Option<String>,
    html_url: String,
    language: Option<String>,
    stargazers_count: u64,
    forks_count: u64,
    open_issues_count: u64,
    updated_at: String,
    license: Option<GitHubLicense>,
    topics: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubLicense {
    spdx_id: String,
}

#[derive(Debug, Deserialize)]
struct HackerNewsItem {
    title: Option<String>,
    url: Option<String>,
    score: Option<u64>,
    time: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct DomainTrendQuery {
    domain: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct SourceIdRequest {
    id: String,
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Debug)]
struct ApiError(String);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": self.0 })),
        )
            .into_response()
    }
}

impl TechnologyService {
    pub fn new(config_path: std::path::PathBuf) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .map_err(|error| format!("无法初始化技术雷达网络客户端: {error}"))?;
        let sources = SourceManager::new(config_path, client.clone())?;
        Ok(Self {
            client,
            match_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            sources,
        })
    }

    pub async fn data_sources(&self) -> Vec<DataSourceView> {
        self.sources.list().await
    }

    pub async fn save_data_source(
        &self,
        source: DataSourceConfig,
    ) -> Result<DataSourceView, String> {
        let view = self.sources.save(source).await?;
        self.match_cache.lock().await.clear();
        Ok(view)
    }

    pub async fn delete_data_source(&self, id: &str) -> Result<(), String> {
        self.sources.delete(id).await?;
        self.match_cache.lock().await.clear();
        Ok(())
    }

    pub async fn test_data_source(&self, id: &str) -> Result<SourceTestResult, String> {
        self.sources.test(id).await
    }

    pub async fn match_technologies(&self, request: MatchRequest) -> Result<MatchResponse, String> {
        let requirement = request.requirement.trim();
        if requirement.is_empty() {
            return Err("需求描述不能为空".into());
        }
        let domain = resolve_domain(request.domain.as_deref(), requirement);
        let limit = request.limit.unwrap_or(8).clamp(1, 20);
        let enabled_sources = self.sources.enabled_for("match").await;
        let source_key = enabled_sources
            .iter()
            .map(|source| source.id.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let cache_key = format!(
            "{}:{}:{limit}:{source_key}",
            domain.id,
            requirement.to_lowercase()
        );
        if let Some((created_at, response)) = self.match_cache.lock().await.get(&cache_key).cloned()
        {
            if created_at.elapsed() < Duration::from_secs(300) {
                return Ok(response);
            }
        }
        let mut results = Vec::new();
        let mut errors = Vec::new();
        let mut realtime = false;
        for source in &enabled_sources {
            if source.kind == "builtin" {
                let search_terms = extract_search_terms(requirement, domain);
                match self.github_match_search(&search_terms, limit).await {
                    Ok(repositories) => {
                        realtime |= !repositories.is_empty();
                        results.extend(
                            repositories.into_iter().map(|repository| {
                                score_repository(repository, requirement, domain)
                            }),
                        );
                    }
                    Err(error) => errors.push(format!("{}: {error}", source.name)),
                }
            } else {
                match self.sources.matches(source, &request).await {
                    Ok(items) => {
                        realtime |= !items.is_empty();
                        results.extend(items);
                    }
                    Err(error) => errors.push(format!("{}: {error}", source.name)),
                }
            }
        }
        deduplicate_matches(&mut results);
        results.sort_by_key(|item| std::cmp::Reverse(item.score));
        results = diversify_matches(results, &enabled_sources, limit);
        if results.is_empty() {
            results = fallback_catalog(domain.id);
        }
        let response = MatchResponse {
            query: requirement.into(),
            domain: domain.name.into(),
            generated_at: timestamp(),
            realtime,
            results,
            notice: (!errors.is_empty())
                .then(|| format!("部分数据源不可用：{}", errors.join("；"))),
        };
        self.match_cache
            .lock()
            .await
            .insert(cache_key, (Instant::now(), response.clone()));
        Ok(response)
    }

    pub async fn solution(&self, request: MatchRequest) -> Result<SolutionResponse, String> {
        let matches = self.match_technologies(request.clone()).await?;
        let domain = resolve_domain(request.domain.as_deref(), &request.requirement);
        let selected = matches.results.iter().take(3).cloned().collect::<Vec<_>>();
        let roles = ["业务应用骨架", "流程与数据能力", "可观测与交付能力"];
        let responsibilities = [
            "承载核心用户体验、权限边界与业务操作入口",
            "负责领域规则、工作流编排、数据持久化与外部集成",
            "提供测试、运行观测、发布门禁与故障追踪",
        ];
        let components = selected
            .into_iter()
            .enumerate()
            .map(|(index, technology)| SolutionComponent {
                role: roles[index.min(roles.len() - 1)].into(),
                technology,
                responsibility: responsibilities[index.min(responsibilities.len() - 1)].into(),
            })
            .collect::<Vec<_>>();
        let (nodes, edges) = architecture_for(domain, &components);
        let confidence = if components.len() >= 3 {
            components
                .iter()
                .map(|item| item.technology.score as u16)
                .sum::<u16>()
                / components.len() as u16
        } else {
            62
        } as u8;
        Ok(SolutionResponse {
            title: format!("{}开源实现方案", domain.name),
            summary: format!(
                "围绕“{}”构建可渐进落地的组合方案，优先复用高匹配开源能力，并保留替换边界。",
                request.requirement.trim()
            ),
            domain: domain.name.into(),
            confidence,
            components,
            phases: vec![
                "第 1 阶段：验证核心业务闭环与关键数据模型".into(),
                "第 2 阶段：接入流程、权限、搜索和外部系统".into(),
                "第 3 阶段：补齐自动化测试、观测与弹性部署".into(),
            ],
            risks: vec![
                "开源许可证与企业使用边界需要法务复核".into(),
                "高星项目不等于适配现有团队栈，需要 PoC 验证".into(),
                "组合项目之间的身份、数据和版本兼容应通过适配层隔离".into(),
            ],
            nodes,
            edges,
            generated_at: timestamp(),
            realtime: matches.realtime,
        })
    }

    pub async fn domain_trends(
        &self,
        domain_id: Option<&str>,
        limit: usize,
    ) -> Result<TrendResponse, String> {
        let domain = domain_by_id(domain_id.unwrap_or("ai")).unwrap_or(&DOMAINS[0]);
        let limit = limit.clamp(1, 20);
        let mut items = Vec::new();
        let mut errors = Vec::new();
        for source in self.sources.enabled_for("domain_trends").await {
            if source.kind == "builtin" {
                let since = days_ago(90);
                let query = format!(
                    "{} created:>={} stars:>100 archived:false",
                    domain
                        .keywords
                        .iter()
                        .take(2)
                        .copied()
                        .collect::<Vec<_>>()
                        .join(" "),
                    since
                );
                match self.github_search(&query, limit).await {
                    Ok(repositories) => items.extend(repositories.into_iter().map(github_trend)),
                    Err(error) => errors.push(format!("{}: {error}", source.name)),
                }
            } else {
                match self.sources.trends(&source, Some(domain.id), limit).await {
                    Ok(source_items) => items.extend(source_items),
                    Err(error) => errors.push(format!("{}: {error}", source.name)),
                }
            }
        }
        deduplicate_trends(&mut items);
        items.sort_by_key(|item| std::cmp::Reverse(item.heat));
        items.truncate(limit);
        Ok(TrendResponse {
            scope: domain.name.into(),
            generated_at: timestamp(),
            realtime: !items.is_empty(),
            items,
            notice: (!errors.is_empty())
                .then(|| format!("部分数据源不可用：{}", errors.join("；"))),
        })
    }

    pub async fn global_trends(&self, limit: usize) -> Result<TrendResponse, String> {
        let limit = limit.clamp(1, 20);
        let mut items = Vec::new();
        let mut errors = Vec::new();
        for source in self.sources.enabled_for("global_trends").await {
            if source.kind == "builtin" {
                match self.hacker_news_trends(limit).await {
                    Ok(source_items) => items.extend(source_items),
                    Err(error) => errors.push(format!("{}: {error}", source.name)),
                }
            } else {
                match self.sources.trends(&source, None, limit).await {
                    Ok(source_items) => items.extend(source_items),
                    Err(error) => errors.push(format!("{}: {error}", source.name)),
                }
            }
        }
        deduplicate_trends(&mut items);
        items.sort_by_key(|item| std::cmp::Reverse(item.heat));
        items.truncate(limit);
        Ok(TrendResponse {
            scope: "全球技术热点".into(),
            generated_at: timestamp(),
            realtime: !items.is_empty(),
            items,
            notice: (!errors.is_empty())
                .then(|| format!("部分数据源不可用：{}", errors.join("；"))),
        })
    }

    async fn hacker_news_trends(&self, limit: usize) -> Result<Vec<TrendItem>, String> {
        let ids = self
            .client
            .get("https://hacker-news.firebaseio.com/v0/topstories.json")
            .send()
            .await
            .map_err(|error| format!("热点数据连接失败: {error}"))?
            .error_for_status()
            .map_err(|error| format!("热点数据响应失败: {error}"))?
            .json::<Vec<u64>>()
            .await
            .map_err(|error| format!("热点数据解析失败: {error}"))?;
        let mut items = Vec::new();
        for id in ids.into_iter().take(limit.clamp(1, 15)) {
            let url = format!("https://hacker-news.firebaseio.com/v0/item/{id}.json");
            if let Ok(item) = self.client.get(url).send().await {
                if let Ok(item) = item.json::<HackerNewsItem>().await {
                    if let Some(title) = item.title {
                        items.push(TrendItem {
                            description: "全球开发者社区正在讨论的技术话题与事件".into(),
                            url: item.url.unwrap_or_else(|| {
                                format!("https://news.ycombinator.com/item?id={id}")
                            }),
                            heat: item.score.unwrap_or_default(),
                            signal: format!("{} 社区热度", item.score.unwrap_or_default()),
                            published_at: item.time.map(unix_timestamp).unwrap_or_default(),
                            tags: classify_trend(&title),
                            source: "Hacker News".into(),
                            title,
                        });
                    }
                }
            }
        }
        Ok(items)
    }

    async fn github_search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<GitHubRepository>, String> {
        let mut request = self
            .client
            .get("https://api.github.com/search/repositories")
            .header(USER_AGENT, "DeliveryPilot-Technology-Radar/1.0")
            .header(ACCEPT, "application/vnd.github+json")
            .query(&[
                ("q", query),
                ("sort", "stars"),
                ("order", "desc"),
                ("per_page", &limit.to_string()),
            ]);
        if let Ok(token) = std::env::var("GITHUB_TOKEN") {
            if !token.trim().is_empty() {
                request = request.header(AUTHORIZATION, format!("Bearer {}", token.trim()));
            }
        }
        request
            .send()
            .await
            .map_err(|error| format!("GitHub 连接失败: {error}"))?
            .error_for_status()
            .map_err(|error| format!("GitHub API 响应失败: {error}"))?
            .json::<GitHubSearchResponse>()
            .await
            .map(|response| response.items)
            .map_err(|error| format!("GitHub 数据解析失败: {error}"))
    }

    async fn github_match_search(
        &self,
        terms: &[String],
        limit: usize,
    ) -> Result<Vec<GitHubRepository>, String> {
        let mut repositories = HashMap::new();
        let mut last_error = None;
        for term in terms.iter().take(3) {
            let query = format!("{term} stars:>50 archived:false");
            match self.github_search(&query, limit).await {
                Ok(items) => {
                    for item in items {
                        repositories.entry(item.full_name.clone()).or_insert(item);
                    }
                }
                Err(error) => last_error = Some(error),
            }
        }
        if repositories.is_empty() {
            return Err(last_error.unwrap_or_else(|| "GitHub 未返回匹配项目".into()));
        }
        Ok(repositories.into_values().collect())
    }
}

pub fn domains() -> Vec<Domain> {
    DOMAINS.to_vec()
}

pub fn router(service: TechnologyService) -> Router {
    Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/openapi.json", get(openapi))
        .route("/api/v1/domains", get(list_domains))
        .route("/api/v1/match", post(api_match))
        .route("/api/v1/solutions", post(api_solution))
        .route("/api/v1/architecture", post(api_solution))
        .route("/api/v1/trends/domain", get(api_domain_trends))
        .route("/api/v1/trends/global", get(api_global_trends))
        .route("/api/v1/sources", get(api_sources).post(api_save_source))
        .route("/api/v1/sources/test", post(api_test_source))
        .route("/api/v1/sources/{id}", delete(api_delete_source))
        .layer(CorsLayer::permissive())
        .with_state(service)
}

pub async fn start_api(service: TechnologyService) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(API_ADDRESS)
        .await
        .map_err(|error| format!("技术雷达 API 无法监听 {API_ADDRESS}: {error}"))?;
    axum::serve(listener, router(service))
        .await
        .map_err(|error| format!("技术雷达 API 服务异常: {error}"))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "DeliveryPilot Technology Radar",
        "version": "v1",
        "address": API_ADDRESS,
    }))
}

async fn openapi() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "openapi": "3.1.0",
        "info": {
            "title": "DeliveryPilot Technology Radar API",
            "version": "1.0.0",
            "description": "本机技术发现、趋势与开源方案服务"
        },
        "servers": [{ "url": format!("http://{API_ADDRESS}") }],
        "paths": {
            "/api/v1/health": { "get": { "summary": "服务健康状态" } },
            "/api/v1/domains": { "get": { "summary": "业务领域分类" } },
            "/api/v1/match": { "post": {
                "summary": "按需求匹配并评分开源技术",
                "requestBody": { "required": true, "content": { "application/json": {
                    "schema": { "$ref": "#/components/schemas/MatchRequest" }
                }}}
            }},
            "/api/v1/solutions": { "post": {
                "summary": "生成单项目或多项目组合实现方案",
                "requestBody": { "required": true, "content": { "application/json": {
                    "schema": { "$ref": "#/components/schemas/MatchRequest" }
                }}}
            }},
            "/api/v1/architecture": { "post": {
                "summary": "生成行业技术选型与架构图数据",
                "requestBody": { "required": true, "content": { "application/json": {
                    "schema": { "$ref": "#/components/schemas/MatchRequest" }
                }}}
            }},
            "/api/v1/trends/domain": { "get": {
                "summary": "查询领域热门技术",
                "parameters": [
                    { "name": "domain", "in": "query", "schema": { "type": "string" } },
                    { "name": "limit", "in": "query", "schema": { "type": "integer" } }
                ]
            }},
            "/api/v1/trends/global": { "get": {
                "summary": "查询全球技术热点、话题和事件",
                "parameters": [{ "name": "limit", "in": "query", "schema": { "type": "integer" } }]
            }},
            "/api/v1/sources": {
                "get": { "summary": "查询已配置数据源，不返回密钥" },
                "post": { "summary": "新增或更新数据源" }
            },
            "/api/v1/sources/test": { "post": { "summary": "测试数据源连接" } },
            "/api/v1/sources/{id}": { "delete": { "summary": "删除非内置数据源" } }
        },
        "components": { "schemas": {
            "MatchRequest": {
                "type": "object",
                "required": ["requirement"],
                "properties": {
                    "requirement": { "type": "string" },
                    "domain": { "type": ["string", "null"] },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 20 }
                }
            }
        }}
    }))
}

async fn list_domains() -> Json<Vec<Domain>> {
    Json(domains())
}

async fn api_match(
    State(service): State<TechnologyService>,
    Json(request): Json<MatchRequest>,
) -> ApiResult<MatchResponse> {
    service
        .match_technologies(request)
        .await
        .map(Json)
        .map_err(ApiError)
}

async fn api_solution(
    State(service): State<TechnologyService>,
    Json(request): Json<MatchRequest>,
) -> ApiResult<SolutionResponse> {
    service.solution(request).await.map(Json).map_err(ApiError)
}

async fn api_domain_trends(
    State(service): State<TechnologyService>,
    Query(query): Query<DomainTrendQuery>,
) -> ApiResult<TrendResponse> {
    service
        .domain_trends(query.domain.as_deref(), query.limit.unwrap_or(8))
        .await
        .map(Json)
        .map_err(ApiError)
}

async fn api_global_trends(
    State(service): State<TechnologyService>,
    Query(query): Query<DomainTrendQuery>,
) -> ApiResult<TrendResponse> {
    service
        .global_trends(query.limit.unwrap_or(10))
        .await
        .map(Json)
        .map_err(ApiError)
}

async fn api_sources(State(service): State<TechnologyService>) -> Json<Vec<DataSourceView>> {
    Json(service.data_sources().await)
}

async fn api_save_source(
    State(service): State<TechnologyService>,
    Json(source): Json<DataSourceConfig>,
) -> ApiResult<DataSourceView> {
    service
        .save_data_source(source)
        .await
        .map(Json)
        .map_err(ApiError)
}

async fn api_test_source(
    State(service): State<TechnologyService>,
    Json(request): Json<SourceIdRequest>,
) -> ApiResult<SourceTestResult> {
    service
        .test_data_source(&request.id)
        .await
        .map(Json)
        .map_err(ApiError)
}

async fn api_delete_source(
    State(service): State<TechnologyService>,
    AxumPath(id): AxumPath<String>,
) -> Result<StatusCode, ApiError> {
    service
        .delete_data_source(&id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(ApiError)
}

fn github_trend(repository: GitHubRepository) -> TrendItem {
    TrendItem {
        title: repository.full_name,
        description: repository.description.unwrap_or_default(),
        url: repository.html_url,
        source: "默认实时技术源 · GitHub".into(),
        heat: repository.stargazers_count,
        signal: format!(
            "{} stars · {} forks",
            format_count(repository.stargazers_count),
            format_count(repository.forks_count)
        ),
        published_at: repository.updated_at,
        tags: repository.topics.into_iter().take(4).collect(),
    }
}

fn deduplicate_matches(items: &mut Vec<TechnologyMatch>) {
    let mut best = HashMap::<String, TechnologyMatch>::new();
    for item in items.drain(..) {
        let key = if item.url.is_empty() {
            item.full_name.to_lowercase()
        } else {
            item.url.trim_end_matches('/').to_lowercase()
        };
        match best.get(&key) {
            Some(existing) if existing.score >= item.score => {}
            _ => {
                best.insert(key, item);
            }
        }
    }
    items.extend(best.into_values());
}

fn diversify_matches(
    ranked: Vec<TechnologyMatch>,
    sources: &[DataSourceConfig],
    limit: usize,
) -> Vec<TechnologyMatch> {
    let enabled_names = sources
        .iter()
        .filter(|source| source.kind != "builtin")
        .map(|source| source.name.as_str())
        .collect::<Vec<_>>();
    let mut selected = Vec::new();
    let mut used = std::collections::HashSet::new();
    for source_name in enabled_names {
        if let Some(item) = ranked
            .iter()
            .find(|item| item.source == source_name && !used.contains(&item.url))
        {
            used.insert(item.url.clone());
            selected.push(item.clone());
        }
    }
    for item in ranked {
        if selected.len() >= limit {
            break;
        }
        if used.insert(item.url.clone()) {
            selected.push(item);
        }
    }
    selected.sort_by_key(|item| std::cmp::Reverse(item.score));
    selected
}

fn deduplicate_trends(items: &mut Vec<TrendItem>) {
    let mut best = HashMap::<String, TrendItem>::new();
    for item in items.drain(..) {
        let key = if item.url.is_empty() {
            item.title.to_lowercase()
        } else {
            item.url.trim_end_matches('/').to_lowercase()
        };
        match best.get(&key) {
            Some(existing) if existing.heat >= item.heat => {}
            _ => {
                best.insert(key, item);
            }
        }
    }
    items.extend(best.into_values());
}

fn score_repository(
    repository: GitHubRepository,
    requirement: &str,
    domain: &Domain,
) -> TechnologyMatch {
    let haystack = format!(
        "{} {} {} {}",
        repository.name,
        repository.description.as_deref().unwrap_or_default(),
        repository.language.as_deref().unwrap_or_default(),
        repository.topics.join(" ")
    )
    .to_lowercase();
    let terms = extract_search_terms(requirement, domain);
    let matched = terms
        .iter()
        .filter(|term| haystack.contains(&term.to_lowercase()))
        .cloned()
        .collect::<Vec<_>>();
    let relevance = (10.0 + (matched.len() as f64 / terms.len().max(1) as f64) * 35.0)
        .round()
        .clamp(10.0, 45.0) as u8;
    let popularity = ((repository.stargazers_count.max(1) as f64).log10() * 5.2)
        .round()
        .clamp(5.0, 25.0) as u8;
    let activity = activity_score(&repository.updated_at);
    let health = health_score(
        repository.license.is_some(),
        repository.forks_count,
        repository.open_issues_count,
        repository.stargazers_count,
    );
    let score = relevance + popularity + activity + health;
    let mut reasons = Vec::new();
    if !matched.is_empty() {
        reasons.push(format!(
            "命中 {} 个需求关键词：{}",
            matched.len(),
            matched.join("、")
        ));
    }
    reasons.push(format!(
        "社区认可度 {}",
        format_count(repository.stargazers_count)
    ));
    reasons.push(format!("最近更新 {}", short_date(&repository.updated_at)));
    if let Some(license) = repository.license.as_ref() {
        reasons.push(format!("开源许可证 {}", license.spdx_id));
    }
    TechnologyMatch {
        name: repository.name,
        full_name: repository.full_name,
        description: repository
            .description
            .unwrap_or_else(|| "项目暂未提供描述".into()),
        url: repository.html_url,
        language: repository.language.unwrap_or_else(|| "多语言".into()),
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        open_issues: repository.open_issues_count,
        updated_at: repository.updated_at,
        license: repository
            .license
            .map(|license| license.spdx_id)
            .unwrap_or_else(|| "待核实".into()),
        topics: repository.topics,
        score,
        breakdown: MatchBreakdown {
            relevance,
            popularity,
            activity,
            health,
        },
        matched_reasons: reasons,
        source: "默认实时技术源".into(),
    }
}

fn architecture_for(
    domain: &Domain,
    components: &[SolutionComponent],
) -> (Vec<ArchitectureNode>, Vec<ArchitectureEdge>) {
    let mut nodes = vec![
        ArchitectureNode {
            id: "channel".into(),
            label: "用户与业务入口".into(),
            kind: "channel".into(),
            detail: format!("{}多端入口", domain.name),
            column: 1,
        },
        ArchitectureNode {
            id: "gateway".into(),
            label: "统一 API 与身份".into(),
            kind: "gateway".into(),
            detail: "鉴权、限流、审计、协议适配".into(),
            column: 2,
        },
    ];
    for (index, component) in components.iter().enumerate() {
        nodes.push(ArchitectureNode {
            id: format!("component-{index}"),
            label: component.technology.name.clone(),
            kind: "service".into(),
            detail: component.role.clone(),
            column: 3,
        });
    }
    nodes.extend([
        ArchitectureNode {
            id: "data".into(),
            label: "领域数据层".into(),
            kind: "data".into(),
            detail: "业务数据、搜索索引、对象存储".into(),
            column: 4,
        },
        ArchitectureNode {
            id: "ops".into(),
            label: "质量与可观测".into(),
            kind: "ops".into(),
            detail: "自动化测试、日志、指标、发布门禁".into(),
            column: 4,
        },
    ]);
    let mut edges = vec![ArchitectureEdge {
        from: "channel".into(),
        to: "gateway".into(),
        label: "业务请求".into(),
    }];
    for index in 0..components.len() {
        edges.push(ArchitectureEdge {
            from: "gateway".into(),
            to: format!("component-{index}"),
            label: "安全调用".into(),
        });
        edges.push(ArchitectureEdge {
            from: format!("component-{index}"),
            to: "data".into(),
            label: "读写".into(),
        });
    }
    edges.push(ArchitectureEdge {
        from: "ops".into(),
        to: "gateway".into(),
        label: "观测与门禁".into(),
    });
    (nodes, edges)
}

fn resolve_domain<'a>(domain_id: Option<&str>, requirement: &str) -> &'a Domain {
    if let Some(domain) = domain_id.and_then(domain_by_id) {
        return domain;
    }
    let requirement = requirement.to_lowercase();
    DOMAINS
        .iter()
        .max_by_key(|domain| {
            let keyword_score = domain
                .keywords
                .iter()
                .filter(|keyword| requirement.contains(&keyword.to_lowercase()))
                .count();
            let cue_score = domain_cues(domain.id)
                .iter()
                .filter(|cue| requirement.contains(*cue))
                .count();
            keyword_score + cue_score
        })
        .unwrap_or(&DOMAINS[0])
}

fn domain_cues(domain_id: &str) -> &'static [&'static str] {
    match domain_id {
        "ai" => &["人工智能", "大模型", "智能体", "知识库", "问答"],
        "enterprise" => &["企业", "工单", "审批", "流程", "客户", "办公"],
        "data" => &["数据", "分析", "报表", "搜索", "驾驶舱"],
        "cloud" => &["云原生", "容器", "服务治理", "可观测", "部署"],
        "iot" => &["设备", "工业", "物联网", "边缘", "检修", "数字孪生"],
        "security" => &["安全", "身份", "零信任", "漏洞", "隐私"],
        "developer" => &["研发", "代码", "测试", "流水线", "开发者"],
        _ => &[],
    }
}

fn domain_by_id(id: &str) -> Option<&'static Domain> {
    DOMAINS.iter().find(|domain| domain.id == id)
}

fn extract_search_terms(requirement: &str, domain: &Domain) -> Vec<String> {
    let mut terms = Vec::new();
    let translations = [
        ("检修", "cmms"),
        ("工单", "work-order"),
        ("检修", "maintenance"),
        ("设备", "asset-management"),
        ("流程", "workflow"),
        ("审批", "approval"),
        ("知识库", "knowledge-base"),
        ("搜索", "search"),
        ("智能体", "ai-agent"),
        ("大模型", "llm"),
        ("数据分析", "analytics"),
        ("低代码", "low-code"),
        ("物联网", "iot"),
        ("监控", "observability"),
    ];
    for (source, target) in translations {
        if requirement.contains(source) && !terms.iter().any(|item| item == target) {
            terms.push(target.into());
        }
    }
    terms.extend(
        domain
            .keywords
            .iter()
            .take(3)
            .map(|item| (*item).to_string()),
    );
    for token in requirement
        .split(|character: char| character.is_whitespace() || "，。；、,.;/".contains(character))
        .filter(|token| token.is_ascii() && token.len() > 2)
        .take(4)
    {
        terms.push(token.to_lowercase());
    }
    let mut unique = Vec::new();
    for term in terms {
        if !unique.contains(&term) {
            unique.push(term);
        }
    }
    unique
}

fn activity_score(updated_at: &str) -> u8 {
    let year = updated_at
        .get(0..4)
        .and_then(|value| value.parse::<i32>().ok());
    match year {
        Some(year) if year >= 2026 => 15,
        Some(year) if year >= 2025 => 13,
        Some(year) if year >= 2024 => 10,
        Some(year) if year >= 2022 => 7,
        _ => 4,
    }
}

fn health_score(licensed: bool, forks: u64, issues: u64, stars: u64) -> u8 {
    let license = if licensed { 6 } else { 2 };
    let adoption = if forks > 1_000 {
        5
    } else if forks > 100 {
        4
    } else {
        2
    };
    let issue_ratio = issues as f64 / stars.max(1) as f64;
    let maintenance = if issue_ratio < 0.03 {
        4
    } else if issue_ratio < 0.1 {
        3
    } else {
        1
    };
    license + adoption + maintenance
}

fn fallback_catalog(domain_id: &str) -> Vec<TechnologyMatch> {
    let entries = match domain_id {
        "enterprise" => vec![
            ("n8n-io/n8n", "工作流自动化与系统集成", "TypeScript"),
            (
                "budibase/budibase",
                "企业内部工具与低代码应用",
                "TypeScript",
            ),
            (
                "appsmithorg/appsmith",
                "企业管理后台与数据应用",
                "TypeScript",
            ),
        ],
        "data" => vec![
            ("apache/superset", "现代数据分析与可视化平台", "TypeScript"),
            ("duckdb/duckdb", "嵌入式分析数据库", "C++"),
            ("apache/airflow", "数据工作流编排平台", "Python"),
        ],
        "cloud" => vec![
            ("kubernetes/kubernetes", "容器编排与云原生平台", "Go"),
            ("prometheus/prometheus", "指标监控与告警", "Go"),
            ("grafana/grafana", "可观测数据展示平台", "TypeScript"),
        ],
        _ => vec![
            ("langchain-ai/langchain", "大模型应用开发框架", "Python"),
            ("langgenius/dify", "生成式 AI 应用平台", "TypeScript"),
            ("open-webui/open-webui", "自托管 AI 用户入口", "Python"),
        ],
    };
    entries
        .into_iter()
        .enumerate()
        .map(
            |(index, (full_name, description, language))| TechnologyMatch {
                name: full_name.split('/').next_back().unwrap_or(full_name).into(),
                full_name: full_name.into(),
                description: description.into(),
                url: format!("https://github.com/{full_name}"),
                language: language.into(),
                stars: 0,
                forks: 0,
                open_issues: 0,
                updated_at: String::new(),
                license: "待实时核实".into(),
                topics: vec![],
                score: 78 - index as u8 * 5,
                breakdown: MatchBreakdown {
                    relevance: 38 - index as u8 * 2,
                    popularity: 18,
                    activity: 12,
                    health: 10,
                },
                matched_reasons: vec!["内置领域候选库".into(), "需要联网核实实时指标".into()],
                source: "默认候选库".into(),
            },
        )
        .collect()
}

fn classify_trend(title: &str) -> Vec<String> {
    let lower = title.to_lowercase();
    let map = [
        ("AI", ["ai", "llm", "model", "agent"].as_slice()),
        ("云原生", ["cloud", "kubernetes", "container"].as_slice()),
        ("安全", ["security", "vulnerability", "privacy"].as_slice()),
        (
            "开发工具",
            ["developer", "programming", "github", "code"].as_slice(),
        ),
    ];
    map.iter()
        .filter(|(_, keywords)| keywords.iter().any(|keyword| lower.contains(keyword)))
        .map(|(label, _)| (*label).into())
        .collect()
}

fn timestamp() -> String {
    Command::new("/bin/date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}

fn days_ago(days: u16) -> String {
    Command::new("/bin/date")
        .args([&format!("-v-{days}d"), "+%Y-%m-%d"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|| "2026-01-01".into())
}

fn unix_timestamp(value: u64) -> String {
    Command::new("/bin/date")
        .args(["-u", "-r", &value.to_string(), "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}

fn short_date(value: &str) -> &str {
    value.get(0..10).unwrap_or(value)
}

fn format_count(value: u64) -> String {
    if value >= 1_000_000 {
        format!("{:.1}m", value as f64 / 1_000_000.0)
    } else if value >= 1_000 {
        format!("{:.1}k", value as f64 / 1_000.0)
    } else {
        value.to_string()
    }
}

static DOMAINS: [Domain; 7] = [
    Domain {
        id: "ai",
        name: "人工智能",
        icon: "spark",
        description: "大模型、智能体、知识库与生成式应用",
        keywords: &["artificial-intelligence", "llm", "ai-agent", "rag"],
    },
    Domain {
        id: "enterprise",
        name: "企业管理",
        icon: "briefcase",
        description: "ERP、CRM、工单、审批和协同办公",
        keywords: &["workflow", "work-order", "enterprise", "low-code"],
    },
    Domain {
        id: "data",
        name: "数据智能",
        icon: "database",
        description: "数据工程、分析、搜索与决策支持",
        keywords: &["data-platform", "analytics", "database", "search"],
    },
    Domain {
        id: "cloud",
        name: "云原生",
        icon: "cloud",
        description: "容器、服务治理、可观测与平台工程",
        keywords: &["cloud-native", "kubernetes", "observability", "devops"],
    },
    Domain {
        id: "iot",
        name: "工业与物联",
        icon: "cpu",
        description: "设备接入、边缘计算、检修与数字孪生",
        keywords: &["iot", "industrial", "maintenance", "digital-twin"],
    },
    Domain {
        id: "security",
        name: "安全可信",
        icon: "shield",
        description: "身份、零信任、供应链与数据安全",
        keywords: &["cybersecurity", "zero-trust", "iam", "devsecops"],
    },
    Domain {
        id: "developer",
        name: "研发效能",
        icon: "code",
        description: "代码智能、测试、CI/CD 与开发者平台",
        keywords: &[
            "developer-tools",
            "testing",
            "ci-cd",
            "platform-engineering",
        ],
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_business_domain_and_translates_requirement() {
        let domain = resolve_domain(None, "建设一个设备检修工单与审批流程");
        assert_eq!(domain.id, "enterprise");
        let terms = extract_search_terms("设备检修工单审批流程", domain);
        assert!(terms.contains(&"work-order".to_string()));
        assert!(terms.contains(&"cmms".to_string()));
        assert!(terms.contains(&"approval".to_string()));
    }

    #[test]
    fn scores_repository_with_explainable_breakdown() {
        let repository = GitHubRepository {
            name: "workflow".into(),
            full_name: "sample/workflow".into(),
            description: Some("enterprise work-order workflow".into()),
            html_url: "https://github.com/sample/workflow".into(),
            language: Some("TypeScript".into()),
            stargazers_count: 10_000,
            forks_count: 1_200,
            open_issues_count: 100,
            updated_at: "2026-08-01T00:00:00Z".into(),
            license: Some(GitHubLicense {
                spdx_id: "MIT".into(),
            }),
            topics: vec!["workflow".into(), "work-order".into()],
        };
        let result = score_repository(
            repository,
            "企业工单流程",
            domain_by_id("enterprise").expect("domain"),
        );
        assert!(result.score >= 75);
        assert_eq!(
            result.score,
            result.breakdown.relevance
                + result.breakdown.popularity
                + result.breakdown.activity
                + result.breakdown.health
        );
    }

    #[test]
    fn architecture_connects_selected_components() {
        let components = fallback_catalog("enterprise")
            .into_iter()
            .take(2)
            .enumerate()
            .map(|(index, technology)| SolutionComponent {
                role: format!("role-{index}"),
                technology,
                responsibility: "responsibility".into(),
            })
            .collect::<Vec<_>>();
        let (nodes, edges) =
            architecture_for(domain_by_id("enterprise").expect("domain"), &components);
        assert!(nodes.iter().any(|node| node.id == "gateway"));
        assert!(edges
            .iter()
            .any(|edge| edge.from == "gateway" && edge.to == "component-0"));
    }
}
