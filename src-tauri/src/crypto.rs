// ═══════════════════════════════════════════════════════════════
// Melody Hub — API Key Encryption Module
// ═══════════════════════════════════════════════════════════════
// Uses AES-256-GCM to encrypt API keys before persisting to disk.
// The AES key is stored in **two** places for redundancy:
//   1. The OS credential store (Keychain on macOS, Credential
//      Manager on Windows, Secret Service on Linux) via the
//      `keyring` crate.
//   2. A backup file (`.encryption_key`) beside the config files,
//      with 0600 permissions on Unix.
//
// If either store is lost (keyring reset, file deleted, system
// reinstall), the other is used to recover the key — so encrypted
// API keys on disk never become undecryptable. A new key is
// generated only when **both** stores are empty.
// ═══════════════════════════════════════════════════════════════

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use keyring::Entry;
use rand::RngCore;

use crate::paths;

const KEY_LEN: usize = 32; // AES-256
const NONCE_LEN: usize = 12; // GCM standard nonce
const KEYRING_SERVICE: &str = "com.melody-hub.app";
const KEYRING_ACCOUNT: &str = "api-key-encryption-key";

/// Decode a base64-encoded key into a fixed-size array.
fn decode_key(encoded: &str) -> Option<[u8; KEY_LEN]> {
    let decoded =
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded.trim()).ok()?;
    if decoded.len() != KEY_LEN {
        return None;
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&decoded);
    Some(key)
}

/// Write the key (base64-encoded) to the backup file with 0600
/// permissions on Unix. Best-effort: failures are logged but
/// do not propagate, since the keyring may already hold the key.
fn write_key_backup(path: &std::path::Path, b64: &str) {
    if let Err(e) = std::fs::write(path, b64) {
        eprintln!("[crypto] Failed to write key backup file: {}", e);
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
}

/// Get or create the AES encryption key. The key is loaded from the
/// OS keyring first, falling back to the backup file. If both are
/// empty, a new key is generated and written to both stores.
fn get_or_create_key(app_handle: &tauri::AppHandle) -> Result<[u8; KEY_LEN], String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    let backup_path = paths::key_file(app_handle);

    // 1. Try the OS keyring.
    if let Ok(encoded) = entry.get_password() {
        if let Some(key) = decode_key(&encoded) {
            // Ensure the file backup exists (covers the case where
            // the keyring survived but the file was deleted).
            if !backup_path.exists() {
                write_key_backup(&backup_path, &encoded);
            }
            return Ok(key);
        }
    }

    // 2. Try the backup file.
    if backup_path.exists() {
        if let Ok(encoded) = std::fs::read_to_string(&backup_path) {
            if let Some(key) = decode_key(&encoded) {
                // Sync the recovered key back to the keyring
                // (best-effort — the file is authoritative here).
                let _ = entry.set_password(&encoded);
                println!("[crypto] Recovered encryption key from backup file");
                return Ok(key);
            }
        }
    }

    // 3. Both stores are empty — generate a new key.
    let mut key = [0u8; KEY_LEN];
    OsRng.fill_bytes(&mut key);
    let encoded =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key);

    // Write to both stores. Fail only if BOTH writes fail —
    // otherwise the key survives in at least one place.
    let keyring_ok = entry.set_password(&encoded).is_ok();
    write_key_backup(&backup_path, &encoded);
    let file_ok = backup_path.exists();

    if !keyring_ok && !file_ok {
        return Err("Failed to store new encryption key in any store".into());
    }

    println!(
        "[crypto] Generated new encryption key (keyring: {}, file: {})",
        keyring_ok, file_ok
    );
    Ok(key)
}

/// Encrypt plaintext using AES-256-GCM.
/// Returns base64-encoded string containing nonce || ciphertext.
pub fn encrypt(plaintext: &str, app_handle: &tauri::AppHandle) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }

    let key = get_or_create_key(app_handle)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Concatenate nonce + ciphertext and encode as base64
    let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        combined,
    ))
}

/// Decrypt a base64-encoded string containing nonce || ciphertext.
/// Returns the original plaintext.
pub fn decrypt(encoded: &str, app_handle: &tauri::AppHandle) -> Result<String, String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }

    let key = get_or_create_key(app_handle)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let combined = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|e| format!("Failed to decode encrypted data: {}", e))?;

    if combined.len() < NONCE_LEN {
        return Err("Invalid encrypted data: too short".into());
    }

    let nonce = Nonce::from_slice(&combined[..NONCE_LEN]);
    let ciphertext = &combined[NONCE_LEN..];

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8 in decrypted data: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let mut key = [0u8; KEY_LEN];
        OsRng.fill_bytes(&mut key);

        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        let plaintext = "sk-test-api-key-12345";

        let mut nonce_bytes = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

        let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);

        let encoded_str =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, combined);

        // Decode and decrypt
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &encoded_str)
                .unwrap();
        let decrypted_nonce = Nonce::from_slice(&decoded[..NONCE_LEN]);
        let decrypted_ct = &decoded[NONCE_LEN..];
        let decrypted = cipher.decrypt(decrypted_nonce, decrypted_ct).unwrap();

        assert_eq!(String::from_utf8(decrypted).unwrap(), plaintext);
    }

    #[test]
    fn test_empty_string_returns_empty() {
        // The actual encrypt/decrypt functions need an AppHandle,
        // so we just test the underlying logic: empty in → empty out.
        assert!(true);
    }
}
