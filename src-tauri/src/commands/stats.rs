// ═══════════════════════════════════════════════════════════════
// Melody Hub — Stats commands
// ═══════════════════════════════════════════════════════════════
// Reads from the MetricsStore, which loads recent JSONL history
// on startup — so the dashboard survives restarts. Returned
// structs are camelCase-serialized, matching the frontend types
// directly (no manual field remapping in the stores).
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;

use chrono::{Duration, NaiveDate, NaiveDateTime, Utc};

use crate::proxy::SharedAppState;
use crate::types::{DailyUsage, RequestRecord, UsageStats};

#[tauri::command]
pub async fn get_stats(
    time_range: Option<String>,
    state: tauri::State<'_, SharedAppState>,
) -> Result<UsageStats, String> {
    let records = state.metrics.snapshot().await;
    compute_stats_for_range(&records, time_range.as_deref())
}

#[tauri::command]
pub async fn get_recent_requests(
    limit: u32,
    state: tauri::State<'_, SharedAppState>,
) -> Result<Vec<RequestRecord>, String> {
    Ok(state.metrics.recent(limit as usize).await)
}

/// Daily usage for the heatmap, aggregated from all records
/// (in-memory + startup-loaded history).
#[tauri::command]
pub async fn get_daily_usage(
    state: tauri::State<'_, SharedAppState>,
) -> Result<Vec<DailyUsage>, String> {
    let records = state.metrics.snapshot().await;
    Ok(compute_daily_usage(&records))
}

/// Reset all in-memory statistics. Persisted JSONL files on disk
/// are left untouched (they remain available as historical logs).
#[tauri::command]
pub async fn reset_stats(state: tauri::State<'_, SharedAppState>) -> Result<(), String> {
    state.metrics.flush().await;
    state.metrics.clear().await;
    Ok(())
}

// ── Aggregation helpers ────────────────────────────────────

fn compute_stats(records: &[RequestRecord]) -> Result<UsageStats, String> {
    let aggregate = aggregate_stats(records);
    Ok(UsageStats {
        total_tokens: aggregate.total_tokens,
        total_requests: aggregate.total_requests,
        active_models: aggregate.active_models,
        avg_response_time: aggregate.avg_response_time,
        token_change: 0.0,
        request_change: 0.0,
        response_time_change: 0.0,
        response_time_trend: "up".into(),
    })
}

fn compute_stats_for_range(
    records: &[RequestRecord],
    time_range: Option<&str>,
) -> Result<UsageStats, String> {
    let Some(range) = time_range else {
        return compute_stats(records);
    };
    let days = range_days(range);
    let today = Utc::now().date_naive();
    let current_start = today - Duration::days(days - 1);
    let previous_start = current_start - Duration::days(days);

    let current: Vec<_> = records
        .iter()
        .filter(|r| record_date(r).is_some_and(|d| d >= current_start && d <= today))
        .cloned()
        .collect();
    let previous: Vec<_> = records
        .iter()
        .filter(|r| record_date(r).is_some_and(|d| d >= previous_start && d < current_start))
        .cloned()
        .collect();

    let cur = aggregate_stats(&current);
    let prev = aggregate_stats(&previous);
    let response_delta = round1(cur.avg_response_time - prev.avg_response_time);

    Ok(UsageStats {
        total_tokens: cur.total_tokens,
        total_requests: cur.total_requests,
        active_models: cur.active_models,
        avg_response_time: cur.avg_response_time,
        token_change: percent_change(cur.total_tokens as f64, prev.total_tokens as f64),
        request_change: percent_change(cur.total_requests as f64, prev.total_requests as f64),
        response_time_change: response_delta,
        response_time_trend: if response_delta <= 0.0 { "up" } else { "down" }.into(),
    })
}

#[derive(Default)]
struct AggregatedStats {
    total_tokens: i64,
    total_requests: i64,
    active_models: i32,
    avg_response_time: f64,
}

fn aggregate_stats(records: &[RequestRecord]) -> AggregatedStats {
    let total_tokens: i64 = records.iter().map(|r| r.tokens).sum();
    let total_requests = records.len() as i64;

    let mut models = std::collections::HashSet::new();
    for r in records {
        models.insert(r.model.clone());
    }

    let avg_latency = if records.is_empty() {
        0.0
    } else {
        let sum: i64 = records.iter().map(|r| r.latency_ms).sum();
        sum as f64 / records.len() as f64 / 1000.0 // ms → seconds
    };

    AggregatedStats {
        total_tokens,
        total_requests,
        active_models: models.len() as i32,
        avg_response_time: round1(avg_latency),
    }
}

fn range_days(range: &str) -> i64 {
    match range {
        "30d" => 30,
        "90d" => 90,
        _ => 7,
    }
}

fn percent_change(current: f64, previous: f64) -> f64 {
    if previous == 0.0 {
        if current == 0.0 {
            0.0
        } else {
            100.0
        }
    } else {
        round1(((current - previous) / previous) * 100.0)
    }
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn record_date(record: &RequestRecord) -> Option<NaiveDate> {
    if let Ok(dt) = NaiveDateTime::parse_from_str(&record.timestamp, "%Y-%m-%d %H:%M:%S") {
        return Some(dt.date());
    }
    if record.timestamp.len() >= 10 {
        return NaiveDate::parse_from_str(&record.timestamp[..10], "%Y-%m-%d").ok();
    }
    None
}

fn compute_daily_usage(records: &[RequestRecord]) -> Vec<DailyUsage> {
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
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::RequestRecord;

    fn rec(model: &str, tokens: i64, latency_ms: i64, ts: &str) -> RequestRecord {
        RequestRecord {
            id: "x".into(),
            timestamp: ts.into(),
            model: model.into(),
            provider: "p".into(),
            r#type: "Chat Completion".into(),
            tokens,
            status: "success".into(),
            latency_ms,
            error_category: String::new(),
        }
    }

    #[test]
    fn stats_empty() {
        let s = compute_stats(&[]).unwrap();
        assert_eq!(s.total_tokens, 0);
        assert_eq!(s.total_requests, 0);
        assert_eq!(s.active_models, 0);
        assert_eq!(s.token_change, 0.0);
    }

    #[test]
    fn stats_aggregates() {
        let recs = vec![
            rec("gpt-4o", 100, 1000, "2026-01-01 10:00:00"),
            rec("claude", 200, 3000, "2026-01-01 11:00:00"),
        ];
        let s = compute_stats(&recs).unwrap();
        assert_eq!(s.total_tokens, 300);
        assert_eq!(s.total_requests, 2);
        assert_eq!(s.active_models, 2);
        // (1000+3000)/2 / 1000 = 2.0s
        assert_eq!(s.avg_response_time, 2.0);
    }

    #[test]
    fn stats_range_computes_previous_period_delta() {
        let today = Utc::now().date_naive();
        let current = today.format("%Y-%m-%d").to_string();
        let prev = (today - Duration::days(8)).format("%Y-%m-%d").to_string();
        let recs = vec![
            rec("gpt-4o", 200, 1000, &format!("{} 10:00:00", current)),
            rec("gpt-4o", 100, 2000, &format!("{} 10:00:00", prev)),
        ];
        let s = compute_stats_for_range(&recs, Some("7d")).unwrap();
        assert_eq!(s.total_tokens, 200);
        assert_eq!(s.token_change, 100.0);
        assert_eq!(s.response_time_change, -1.0);
    }

    #[test]
    fn daily_groups_by_date() {
        let recs = vec![
            rec("gpt-4o", 100, 1000, "2026-01-01 10:00:00"),
            rec("gpt-4o", 50, 500, "2026-01-01 12:00:00"),
            rec("claude", 200, 3000, "2026-01-02 11:00:00"),
        ];
        let d = compute_daily_usage(&recs);
        assert_eq!(d.len(), 2);
        let jan1 = d.iter().find(|x| x.date == "2026-01-01").unwrap();
        assert_eq!(jan1.count, 2);
        assert_eq!(jan1.tokens, 150);
    }
}
