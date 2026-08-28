use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

const MODEL_TIMEOUT: Duration = Duration::from_secs(3);
const DEFAULT_BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL: &str = "glm-5-2-260617";

#[derive(Deserialize)]
struct ModelConfig {
    #[serde(default)]
    ark_api_key: String,
    #[serde(default = "default_base_url")]
    ark_base_url: String,
    #[serde(default = "default_model")]
    ark_model: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelRecommendation {
    project_name: String,
    feature: String,
    #[serde(default)]
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementRecommendation {
    project_name: String,
    feature: String,
    source: &'static str,
    model: Option<String>,
    reason: String,
}

fn default_base_url() -> String {
    DEFAULT_BASE_URL.into()
}

fn default_model() -> String {
    DEFAULT_MODEL.into()
}

fn config_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| {
        PathBuf::from(home)
            .join("Library/Application Support/Technology Exploration Agent/config.json")
    })
}

fn load_config() -> Result<ModelConfig, String> {
    let path = config_path().ok_or_else(|| "无法定位模型配置目录".to_string())?;
    let bytes = fs::read(path).map_err(|error| format!("未找到模型配置: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("模型配置无效: {error}"))
}

fn clean_value(value: &str, limit: usize) -> String {
    value
        .trim()
        .trim_matches(['"', '\'', '“', '”'])
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(limit)
        .collect()
}

fn parse_model_content(content: &str) -> Result<ModelRecommendation, String> {
    let trimmed = content.trim();
    let json = if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        &trimmed[start..=end]
    } else {
        trimmed
    };
    let mut recommendation: ModelRecommendation =
        serde_json::from_str(json).map_err(|error| format!("模型返回格式无效: {error}"))?;
    recommendation.project_name = clean_value(&recommendation.project_name, 30);
    recommendation.feature = clean_value(&recommendation.feature, 20);
    recommendation.reason = clean_value(&recommendation.reason, 80);
    if recommendation.project_name.is_empty() || recommendation.feature.is_empty() {
        return Err("模型未给出完整推荐值".into());
    }
    Ok(recommendation)
}

fn text_from_document(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let content = match extension.as_str() {
        "txt" | "md" => fs::read_to_string(path).map_err(|error| error.to_string())?,
        "pdf" => {
            pdf_extract::extract_text(path).map_err(|error| format!("PDF 正文解析失败: {error}"))?
        }
        "doc" | "docx" | "xls" | "xlsx" => {
            let output = Command::new("/usr/bin/textutil")
                .args(["-convert", "txt", "-stdout"])
                .arg(path)
                .output()
                .map_err(|error| format!("文档正文解析失败: {error}"))?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
            String::from_utf8_lossy(&output.stdout).into_owned()
        }
        _ => return Err("该文档格式暂不支持正文解析".into()),
    };
    Ok(content.chars().take(12_000).collect())
}

fn fallback_name(content: &str, document_name: Option<&str>) -> String {
    let first_line = content
        .lines()
        .map(|line| line.trim().trim_start_matches('#').trim())
        .find(|line| !line.is_empty())
        .unwrap_or_default();
    let candidate = first_line
        .split(['：', ':', '。', '；', ';', '，', ','])
        .next()
        .unwrap_or_default()
        .replace("需求说明", "")
        .replace("需求描述", "")
        .replace("产品需求", "")
        .replace("需求文档", "");
    let candidate = clean_value(&candidate, 30);
    if !candidate.is_empty() {
        return candidate;
    }
    document_name
        .and_then(|name| Path::new(name).file_stem())
        .and_then(|name| name.to_str())
        .map(|name| {
            clean_value(
                &name
                    .replace("需求规格说明书", "")
                    .replace("需求说明书", "")
                    .replace("需求文档", ""),
                30,
            )
        })
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "文本需求项目".into())
}

fn fallback_features(content: &str) -> Vec<String> {
    let mut features = [
        ("批量导入", "批量导入"),
        ("审批", "审批流程"),
        ("统一登录", "统一登录"),
        ("单点登录", "单点登录"),
        ("报表", "数据报表"),
        ("搜索", "智能搜索"),
        ("通知", "消息通知"),
        ("预警", "预警能力"),
        ("看板", "业务看板"),
    ]
    .iter()
    .filter_map(|(keyword, feature)| content.contains(keyword).then(|| (*feature).to_string()))
    .collect::<Vec<_>>();
    if features.is_empty() {
        features.push("首版交付".into());
    }
    features
}

fn fallback(
    content: &str,
    document_name: Option<&str>,
    attempt: u32,
    previous_feature: Option<&str>,
    reason: impl Into<String>,
) -> RequirementRecommendation {
    let features = fallback_features(content);
    let mut feature = features[attempt as usize % features.len()].clone();
    if previous_feature == Some(feature.as_str()) {
        let alternatives = ["业务闭环", "流程提效", "协同升级", "体验优化"];
        feature = format!(
            "{}{}",
            feature.trim_end_matches("能力").trim_end_matches("流程"),
            alternatives[attempt as usize % alternatives.len()]
        );
    }
    RequirementRecommendation {
        project_name: fallback_name(content, document_name),
        feature,
        source: "fallback",
        model: None,
        reason: reason.into(),
    }
}

async fn request_model(
    config: &ModelConfig,
    content: &str,
    attempt: u32,
    previous: Option<(&str, &str)>,
) -> Result<ModelRecommendation, String> {
    if config.ark_api_key.trim().is_empty() {
        return Err("未配置模型 API Key".into());
    }
    let endpoint = format!(
        "{}/chat/completions",
        config.ark_base_url.trim_end_matches('/')
    );
    let angles = ["业务对象", "核心流程", "用户价值", "交付结果"];
    let angle = angles[attempt as usize % angles.len()];
    let previous_instruction = previous.map_or_else(String::new, |(name, feature)| {
        format!(
            "\n上一次推荐为“{name} / {feature}”，本次必须给出不同的项目名称或版本特性，不得原样重复。"
        )
    });
    let response = reqwest::Client::builder()
        .timeout(MODEL_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?
        .post(endpoint)
        .bearer_auth(config.ark_api_key.trim())
        .json(&serde_json::json!({
            "model": config.ark_model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是资深产品经理。根据需求正文生成清晰、稳定、可用于项目目录的项目名称和本次版本特性。只输出 JSON，不得输出 Markdown。"
                },
                {
                    "role": "user",
                    "content": format!(
                        "输出结构：{{\"projectName\":\"不超过30字的项目名称\",\"feature\":\"不超过20字的核心版本特性\",\"reason\":\"不超过80字的推荐依据\"}}。\n要求：理解完整需求后概括，不得直接截取开头，不使用“系统”“平台”“项目”等空泛词作为唯一特征。本轮重点从“{angle}”角度命名。{previous_instruction}\n\n需求正文：\n{content}",
                    )
                }
            ],
            "temperature": if attempt == 0 { 0.2 } else { 0.65 },
            "max_tokens": 180,
            "thinking": {"type": "disabled"}
        }))
        .send()
        .await
        .map_err(|error| format!("模型调用失败: {error}"))?
        .error_for_status()
        .map_err(|error| format!("模型接口异常: {error}"))?;
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("模型响应无效: {error}"))?;
    let content = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "模型响应缺少推荐内容".to_string())?;
    parse_model_content(content)
}

pub async fn recommend(
    content: Option<String>,
    document_path: Option<String>,
    document_name: Option<String>,
    attempt: u32,
    previous_project_name: Option<String>,
    previous_feature: Option<String>,
) -> RequirementRecommendation {
    let extracted = match content.filter(|value| !value.trim().is_empty()) {
        Some(value) => value,
        None => match document_path.as_deref().map(Path::new) {
            Some(path) => match text_from_document(path) {
                Ok(value) if !value.trim().is_empty() => value,
                Ok(_) => {
                    return fallback(
                        "",
                        document_name.as_deref(),
                        attempt,
                        previous_feature.as_deref(),
                        "文档正文为空，已使用文件名兜底",
                    )
                }
                Err(error) => {
                    return fallback(
                        "",
                        document_name.as_deref(),
                        attempt,
                        previous_feature.as_deref(),
                        error,
                    )
                }
            },
            None => {
                return fallback(
                    "",
                    document_name.as_deref(),
                    attempt,
                    previous_feature.as_deref(),
                    "没有可分析的需求正文",
                )
            }
        },
    };
    let config = match load_config() {
        Ok(config) => config,
        Err(error) => {
            return fallback(
                &extracted,
                document_name.as_deref(),
                attempt,
                previous_feature.as_deref(),
                error,
            )
        }
    };
    let previous = previous_project_name
        .as_deref()
        .zip(previous_feature.as_deref());
    match tokio::time::timeout(
        MODEL_TIMEOUT,
        request_model(&config, &extracted, attempt, previous),
    )
    .await
    {
        Ok(Ok(result))
            if previous != Some((result.project_name.as_str(), result.feature.as_str())) =>
        {
            RequirementRecommendation {
                project_name: result.project_name,
                feature: result.feature,
                source: "model",
                model: Some(config.ark_model),
                reason: result.reason,
            }
        }
        Ok(Ok(_)) => fallback(
            &extracted,
            document_name.as_deref(),
            attempt,
            previous_feature.as_deref(),
            "模型返回了重复结果，已切换本地推荐视角",
        ),
        Ok(Err(error)) => fallback(
            &extracted,
            document_name.as_deref(),
            attempt,
            previous_feature.as_deref(),
            error,
        ),
        Err(_) => fallback(
            &extracted,
            document_name.as_deref(),
            attempt,
            previous_feature.as_deref(),
            "模型生成超过 3 秒，已自动使用本地规则",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::{fallback, parse_model_content};

    #[test]
    fn parses_json_wrapped_by_model_text() {
        let result = parse_model_content(
            "```json\n{\"projectName\":\"设备运维中心\",\"feature\":\"闭环工单\",\"reason\":\"覆盖报修到验收\"}\n```",
        )
        .expect("parse recommendation");
        assert_eq!(result.project_name, "设备运维中心");
        assert_eq!(result.feature, "闭环工单");
    }

    #[test]
    fn fallback_is_explicit_and_content_aware() {
        let result = fallback(
            "# 客户资料中心\n支持客户资料批量导入与主管审批",
            None,
            0,
            None,
            "timeout",
        );
        assert_eq!(result.source, "fallback");
        assert_eq!(result.project_name, "客户资料中心");
        assert_eq!(result.feature, "批量导入");
        assert_eq!(result.reason, "timeout");
    }

    #[test]
    fn repeated_fallback_changes_the_recommendation() {
        let first = fallback("客户中心支持审批和通知", None, 0, None, "timeout");
        let second = fallback(
            "客户中心支持审批和通知",
            None,
            1,
            Some(&first.feature),
            "timeout",
        );
        assert_ne!(first.feature, second.feature);
    }
}
