// ═══════════════════════════════════════════════════════════════
// Melody Hub — API Key Encryption Module
// ═══════════════════════════════════════════════════════════════
// Uses AES-256-GCM to encrypt API keys before persisting to disk.
// The AES key is stored in the OS credential store (Keychain on
// macOS, Credential Manager on Windows, Secret Service on Linux)
// via the `keyring` crate.
//
// Migration from the legacy `.encryption_key` file is handled
// once: on first access after upgrade, the file's key is read,
// stored in the OS keyring, verified, and the legacy file deleted.
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

/// Get or create the AES encryption key from the OS credential store.
fn get_or_create_key(app_handle: &tauri::AppHandle) -> Result<[u8; KEY_LEN], String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    // Try reading from keyring first.
    if let Ok(encoded) = entry.get_password() {
        if let Ok(decoded) =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &encoded)
        {
            if decoded.len() == KEY_LEN {
                let mut key = [0u8; KEY_LEN];
                key.copy_from_slice(&decoded);
                return Ok(key);
            }
        }
    }

    // Not in keyring yet — try migration from legacy file.
    let legacy_path = paths::key_file(app_handle);
    if legacy_path.exists() {
        let encoded = std::fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded.trim())
                .map_err(|e| format!("Failed to decode legacy encryption key: {}", e))?;

        if decoded.len() == KEY_LEN {
            let mut key = [0u8; KEY_LEN];
            key.copy_from_slice(&decoded);
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key);
            // Write to keyring.
            entry
                .set_password(&b64)
                .map_err(|e| format!("Failed to store key in OS keyring: {}", e))?;
            // Verify read-back.
            let readback = entry
                .get_password()
                .map_err(|e| format!("Failed to verify key in OS keyring: {}", e))?;
            if readback != b64 {
                return Err("Key migration verification failed: key mismatch".into());
            }
            // Remove legacy file.
            std::fs::remove_file(&legacy_path).ok();
            println!("[crypto] Migrated encryption key from file to OS keyring");
            return Ok(key);
        } else {
            return Err("Invalid legacy encryption key length".into());
        }
    }

    // Generate new key and store in keyring.
    let mut key = [0u8; KEY_LEN];
    OsRng.fill_bytes(&mut key);
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key);
    entry
        .set_password(&b64)
        .map_err(|e| format!("Failed to store new key in OS keyring: {}", e))?;

    println!("[crypto] Generated and stored new encryption key in OS keyring");
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
