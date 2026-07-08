// ═══════════════════════════════════════════════════════════════
// Melody Hub — Metrics store
// ═══════════════════════════════════════════════════════════════
// Owns request-record accumulation and JSONL persistence. On
// startup it loads recent history back from disk so the dashboard
// survives restarts. Records are kept in memory (capped) and
// periodically flushed to a rolling daily JSONL file.
// ═══════════════════════════════════════════════════════════════

use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::types::RequestRecord;

/// How many recent records to keep in memory for fast dashboard
/// reads. Older records stay on disk and are loaded on startup.
const IN_MEMORY_CAP: usize = 1000;

/// Flush to disk every this many new records.
const FLUSH_EVERY: usize = 50;

/// How many recent records to load back from disk on startup
/// (gives the dashboard immediate history after a restart).
const LOAD_BACK_ON_STARTUP: usize = 1000;

pub struct MetricsStore {
    /// In-memory recent records (newest at the end).
    records: RwLock<Vec<RequestRecord>>,
    /// Index of the first record not yet flushed to disk.
    last_flushed_index: RwLock<usize>,
    /// Directory for rolling JSONL files. None until initialized.
    log_dir: RwLock<Option<PathBuf>>,
}

impl MetricsStore {
    pub fn new() -> Self {
        Self {
            records: RwLock::new(Vec::new()),
            last_flushed_index: RwLock::new(0),
            log_dir: RwLock::new(None),
        }
    }

    /// Set the log directory and load recent history back from disk
    /// so the dashboard reflects activity from before this launch.
    pub async fn initialize(&self, log_dir: PathBuf) -> Result<(), String> {
        std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;

        let loaded = load_recent_from_disk(&log_dir, LOAD_BACK_ON_STARTUP);

        {
            let mut records = self.records.write().await;
            records.clear();
            records.extend(loaded);
            // Loaded records are considered already-flushed (they
            // came from disk), so the flush cursor starts at the end.
            let len = records.len();
            let mut idx = self.last_flushed_index.write().await;
            *idx = len;
        }
        {
            let mut dir = self.log_dir.write().await;
            *dir = Some(log_dir);
        }
        Ok(())
    }

    /// Delete rolling JSONL files older than the configured
    /// retention window. A value of 0 keeps all files.
    pub async fn prune_old(&self, retention_days: u32) -> Result<usize, String> {
        if retention_days == 0 {
            return Ok(0);
        }
        let dir = match self.log_dir.read().await.clone() {
            Some(d) => d,
            None => return Ok(0),
        };
        let cutoff = chrono::Utc::now().date_naive()
            - chrono::Duration::days(retention_days as i64);
        let mut removed = 0usize;

        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) => return Err(e.to_string()),
        };

        for entry in entries.filter_map(|r| r.ok()) {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                continue;
            }
            let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let Some(date_part) = name.strip_prefix("requests-") else {
                continue;
            };
            let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") else {
                continue;
            };
            if date < cutoff {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                removed += 1;
            }
        }

        Ok(removed)
    }

    /// Append a record. Trims the in-memory buffer to the cap,
    /// keeping only records that have already been flushed when
    /// deciding what to evict (so unflushed data is never lost).
    pub async fn record(&self, record: RequestRecord) {
        let should_flush;
        {
            let mut records = self.records.write().await;
            let mut idx = self.last_flushed_index.write().await;
            records.push(record);

            if records.len() > IN_MEMORY_CAP {
                let excess = records.len() - IN_MEMORY_CAP;
                // Only evict already-flushed records.
                let safe = excess.min(*idx);
                if safe > 0 {
                    records.drain(0..safe);
                    *idx = idx.saturating_sub(safe);
                }
            }

            let unflushed = records.len() - *idx;
            should_flush = unflushed >= FLUSH_EVERY;
        }

        if should_flush {
            self.flush().await;
        }
    }

    /// Flush not-yet-persisted records to the daily JSONL file.
    /// Returns the number of records written.
    pub async fn flush(&self) -> u32 {
        let (new_records, log_dir) = {
            let records = self.records.read().await;
            let dir = match self.log_dir.read().await.clone() {
                Some(d) => d,
                None => return 0,
            };
            let last = *self.last_flushed_index.read().await;
            if records.len() <= last {
                return 0;
            }
            (records[last..].to_vec(), dir)
        };

        let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let log_file = log_dir.join(format!("requests-{}.jsonl", date));

        let mut file = match std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file)
        {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[metrics] Failed to open log file: {}", e);
                return 0;
            }
        };

        let mut flushed = 0u32;
        use std::io::Write;
        for record in &new_records {
            if let Ok(line) = serde_json::to_string(record) {
                if writeln!(file, "{}", line).is_ok() {
                    flushed += 1;
                }
            }
        }

        if flushed > 0 {
            let mut idx = self.last_flushed_index.write().await;
            *idx = self.records.read().await.len();
            println!("[metrics] Flushed {} records to {:?}", flushed, log_file);
        }
        flushed
    }

    /// Snapshot of in-memory records (newest last). Includes the
    /// startup-loaded history plus everything recorded this session.
    pub async fn snapshot(&self) -> Vec<RequestRecord> {
        self.records.read().await.clone()
    }

    /// Most recent `limit` records (newest last).
    pub async fn recent(&self, limit: usize) -> Vec<RequestRecord> {
        let records = self.records.read().await;
        let mut recent = if records.len() > limit {
            records[records.len() - limit..].to_vec()
        } else {
            records.clone()
        };
        recent.reverse();
        recent
    }

    /// Clear the in-memory dashboard window. Persisted JSONL logs
    /// remain on disk for export/history.
    pub async fn clear(&self) {
        let mut records = self.records.write().await;
        records.clear();
        let mut idx = self.last_flushed_index.write().await;
        *idx = 0;
    }
}

/// Read the most recent `limit` records from the rolling JSONL
/// files in `log_dir`, oldest files first. Records are returned in
/// chronological order (oldest first).
fn load_recent_from_disk(log_dir: &PathBuf, limit: usize) -> Vec<RequestRecord> {
    let mut entries = match std::fs::read_dir(log_dir) {
        Ok(e) => e.filter_map(|r| r.ok()).collect::<Vec<_>>(),
        Err(_) => return Vec::new(),
    };
    // Sort by filename (which embeds the date) ascending.
    entries.sort_by_key(|e| e.file_name());

    let mut all: Vec<RequestRecord> = Vec::new();
    for entry in entries {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            for line in content.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                if let Ok(rec) = serde_json::from_str::<RequestRecord>(line) {
                    all.push(rec);
                }
            }
        }
    }

    // Keep only the most recent `limit`.
    if all.len() > limit {
        all.drain(0..all.len() - limit);
    }
    all
}

pub type SharedMetrics = Arc<MetricsStore>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_recent_handles_missing_dir() {
        let recs = load_recent_from_disk(&PathBuf::from("/nonexistent/melody-hub-test"), 100);
        assert!(recs.is_empty());
    }
}
