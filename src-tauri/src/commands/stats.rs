use crate::proxy;
use crate::types::RequestRecord;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(serde::Serialize)]
pub struct UsageStats {
    pub total_tokens: i64,
    pub total_requests: i64,
    pub active_models: i32,
    pub avg_response_time: f64,
}

#[derive(serde::Serialize)]
pub struct DailyUsage {
    pub date: String,
    pub count: i64,
    pub tokens: i64,
}

#[tauri::command]
pub async fn get_stats(
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<UsageStats, String> {
    let cfg = proxy_state.read().await;
    let records = &cfg.records;

    let total_tokens: i64 = records.iter().map(|r| r.tokens).sum();
    let total_requests = records.len() as i64;

    // Count distinct models
    let mut models = std::collections::HashSet::new();
    for r in records {
        models.insert(r.model.clone());
    }

    let avg_latency = if records.is_empty() {
        0.0
    } else {
        let sum: i64 = records.iter().map(|r| r.latency_ms).sum();
        sum as f64 / records.len() as f64 / 1000.0 // convert ms to seconds
    };

    Ok(UsageStats {
        total_tokens,
        total_requests,
        active_models: models.len() as i32,
        avg_response_time: (avg_latency * 10.0).round() / 10.0,
    })
}

#[tauri::command]
pub async fn get_recent_requests(
    limit: u32,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<Vec<RequestRecord>, String> {
    let cfg = proxy_state.read().await;
    let records = cfg.records.clone();
    let limit = limit as usize;
    if records.len() > limit {
        Ok(records[records.len() - limit..].to_vec())
    } else {
        Ok(records)
    }
}

/// Get daily usage data for the heatmap, aggregated from request records.
/// Returns counts per day for the last ~365 days.
#[tauri::command]
pub async fn get_daily_usage(
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<Vec<DailyUsage>, String> {
    let cfg = proxy_state.read().await;
    let records = &cfg.records;

    // Group by date (YYYY-MM-DD)
    let mut daily: HashMap<String, (i64, i64)> = HashMap::new();
    for r in records {
        let date = if r.timestamp.len() >= 10 {
            r.timestamp[..10].to_string()
        } else {
            r.timestamp.clone()
        };
        let entry = daily.entry(date).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += r.tokens;
    }

    let mut result: Vec<DailyUsage> = daily
        .into_iter()
        .map(|(date, (count, tokens))| DailyUsage {
            date,
            count,
            tokens,
        })
        .collect();
    result.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(result)
}
