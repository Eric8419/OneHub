// ═══════════════════════════════════════════════════════════════
// Melody Hub — Persistence layer
// ═══════════════════════════════════════════════════════════════
// Centralizes JSON load/save for providers, aggregations and
// settings. Provider API keys are encrypted on write and
// decrypted on read. The `api_key_encrypted` flag is the
// authoritative marker (no more `starts_with("sk-")` heuristic).
// ═══════════════════════════════════════════════════════════════

use std::io::Write;
use std::path::Path;

use crate::crypto;
use crate::paths;
use crate::types::{Aggregation, Provider};

const PROVIDERS_FILE: &str = "providers.json";
const AGGREGATIONS_FILE: &str = "aggregations.json";

// ── Low-level JSON helpers ─────────────────────────────────

pub fn write_json_atomic<T: serde::Serialize + ?Sized>(
    path: &Path,
    data: &T,
) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let tmp_path = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|s| s.to_str()).unwrap_or("json")
    ));
    {
        let mut file = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }

    std::fs::rename(&tmp_path, path)
        .or_else(|_| {
            if path.exists() {
                std::fs::remove_file(path)?;
            }
            std::fs::rename(&tmp_path, path)
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: T = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

// ── Providers (with API-key encryption) ────────────────────

/// Save providers to disk, encrypting each non-empty API key.
/// The in-memory plaintext list is also accepted so callers can
/// pass runtime state directly.
pub fn save_providers(
    app_handle: &tauri::AppHandle,
    providers: &[Provider],
) -> Result<(), String> {
    // Encrypt all keys first — fail before touching the file.
    let encrypted: Result<Vec<Provider>, String> = providers
        .iter()
        .map(|p| {
            if p.api_key.is_empty() {
                Ok(p.clone().with_encrypted_key(String::new()))
            } else {
                match crypto::encrypt(&p.api_key, app_handle) {
                    Ok(enc) => Ok(p.clone().with_encrypted_key(enc)),
                    Err(e) => {
                        Err(format!("Unable to encrypt API key for '{}': {}", p.name, e))
                    }
                }
            }
        })
        .collect();
    let encrypted = encrypted?;

    let path = paths::config_file(app_handle, PROVIDERS_FILE);
    write_json_atomic(&path, &encrypted)?;
    println!(
        "[storage] Saved {} providers to {:?}",
        encrypted.len(),
        path
    );
    Ok(())
}

/// Load providers from disk, decrypting API keys. Providers whose
/// keys fail to decrypt are marked `status = "error"` with an
/// empty key (mirrors previous behaviour, now driven by the
/// `api_key_encrypted` flag instead of a prefix heuristic).
pub fn load_providers(app_handle: &tauri::AppHandle) -> Result<Vec<Provider>, String> {
    let path = paths::config_file(app_handle, PROVIDERS_FILE);
    let stored: Option<Vec<Provider>> = read_json(&path)?;
    let Some(providers) = stored else {
        return Ok(Vec::new());
    };

    let decrypted: Vec<Provider> = providers
        .into_iter()
        .map(|p| {
            if p.api_key.is_empty() {
                return p.with_plaintext_key(String::new());
            }
            // Only attempt decryption when the flag says so. This is the
            // authoritative check; legacy data written without the flag
            // is treated as plaintext (forward-compat fallback below).
            if p.api_key_encrypted {
                match crypto::decrypt(&p.api_key, app_handle) {
                    Ok(pt) => p.with_plaintext_key(pt),
                    Err(e) => {
                        eprintln!(
                            "[storage] Failed to decrypt key for '{}': {} — marking as error",
                            p.name, e
                        );
                        let mut errored = p;
                        errored.status = "error".into();
                        errored.api_key = String::new();
                        errored.api_key_encrypted = false;
                        errored
                    }
                }
            } else {
                // Plaintext on disk (legacy or explicitly unencrypted).
                let key = p.api_key.clone();
                p.with_plaintext_key(key)
            }
        })
        .collect();

    Ok(decrypted)
}

// ── Aggregations (plain JSON) ──────────────────────────────

pub fn save_aggregations(
    app_handle: &tauri::AppHandle,
    aggregations: &[Aggregation],
) -> Result<(), String> {
    let path = paths::config_file(app_handle, AGGREGATIONS_FILE);
    write_json_atomic(&path, aggregations)?;
    println!(
        "[storage] Saved {} aggregations to {:?}",
        aggregations.len(),
        path
    );
    Ok(())
}

pub fn load_aggregations(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<Aggregation>, String> {
    let path = paths::config_file(app_handle, AGGREGATIONS_FILE);
    let stored: Option<Vec<Aggregation>> = read_json(&path)?;
    Ok(stored.unwrap_or_default())
}
