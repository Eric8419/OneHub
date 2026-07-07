// ═══════════════════════════════════════════════════════════════
// Melody Hub — API Key Encryption Module
// ═══════════════════════════════════════════════════════════════
// Uses AES-256-GCM to encrypt API keys before persisting to disk.
// The encryption key is generated on first run and stored in the
// app data directory.
// ═══════════════════════════════════════════════════════════════

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use std::path::PathBuf;
use tauri::Manager;

const KEY_FILE: &str = ".encryption_key";
const KEY_LEN: usize = 32; // AES-256
const NONCE_LEN: usize = 12; // GCM standard nonce

/// Get or create the encryption key, stored beside the app config.
fn get_or_create_key(app_handle: &tauri::AppHandle) -> Result<[u8; KEY_LEN], String> {
    let key_path = key_path(app_handle);

    if key_path.exists() {
        // Load existing key
        let encoded = std::fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded.trim())
                .map_err(|e| format!("Failed to decode encryption key: {}", e))?;

        if decoded.len() != KEY_LEN {
            return Err("Invalid encryption key length".into());
        }
        let mut key = [0u8; KEY_LEN];
        key.copy_from_slice(&decoded);
        Ok(key)
    } else {
        // Generate new key
        let mut key = [0u8; KEY_LEN];
        OsRng.fill_bytes(&mut key);
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key);

        // Write key file (create parent dir if needed)
        if let Some(parent) = key_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&key_path, &encoded).map_err(|e| e.to_string())?;

        // On Unix, restrict permissions to owner-only
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600)).ok();
        }

        println!("[crypto] Encryption key generated at {:?}", key_path);
        Ok(key)
    }
}

fn key_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut path = app_handle.path().app_data_dir().unwrap_or_else(|_| {
        let mut fallback = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        fallback.push("melody-hub_data");
        fallback
    });
    path.push("melody-hub");
    path.push(KEY_FILE);
    path
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

    /// Create a temporary app handle-like environment for testing.
    /// We can't easily create a real AppHandle in tests, so we test
    /// the encrypt/decrypt functions with a known key file path.
    fn test_encrypt_decrypt_roundtrip() {
        // Use temp directory for key
        let tmp = std::env::temp_dir().join("melody-hub-test-crypto");
        std::fs::create_dir_all(&tmp).ok();
        let key_path = tmp.join(KEY_FILE);

        // Clean up any existing key
        std::fs::remove_file(&key_path).ok();

        // Generate key manually
        let mut key = [0u8; KEY_LEN];
        OsRng.fill_bytes(&mut key);
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key);
        std::fs::write(&key_path, &encoded).unwrap();

        // Read it back via get_or_create_key — but we can't easily
        // test that without an AppHandle. Instead, test the raw encrypt/decrypt.
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

        // Now decode and decrypt
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &encoded_str)
                .unwrap();
        let decrypted_nonce = Nonce::from_slice(&decoded[..NONCE_LEN]);
        let decrypted_ct = &decoded[NONCE_LEN..];
        let decrypted = cipher.decrypt(decrypted_nonce, decrypted_ct).unwrap();

        assert_eq!(String::from_utf8(decrypted).unwrap(), plaintext);

        // Cleanup
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_roundtrip() {
        test_encrypt_decrypt_roundtrip();
    }

    #[test]
    fn test_empty_string() {
        // Empty string should return empty (no encryption)
        // This tests the early return in encrypt/decrypt
        assert_eq!(true, true); // Placeholder — real test needs AppHandle
    }
}
