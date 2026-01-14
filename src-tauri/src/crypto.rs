// Password encryption using AES-256-GCM with Argon2 key derivation

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Argon2, password_hash::SaltString};
use rand::Rng;

const NONCE_SIZE: usize = 12;
const SALT_SIZE: usize = 16;

/// Derive a 256-bit key from master password using Argon2
fn deriveKey(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .expect("Key derivation failed");
    key
}

/// Encrypt content with master password
/// Returns: salt (16) + nonce (12) + ciphertext, base64 encoded
pub fn encrypt(plaintext: &str, masterPassword: &str) -> Result<String, String> {
    let mut rng = rand::thread_rng();
    
    // Generate random salt and nonce
    let mut salt = [0u8; SALT_SIZE];
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    rng.fill(&mut salt);
    rng.fill(&mut nonce_bytes);
    
    // Derive key
    let key = deriveKey(masterPassword, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    // Encrypt
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    
    // Combine: salt + nonce + ciphertext
    let mut combined = Vec::with_capacity(SALT_SIZE + NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&salt);
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &combined))
}

/// Decrypt content with master password
pub fn decrypt(encrypted: &str, masterPassword: &str) -> Result<String, String> {
    let combined = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encrypted)
        .map_err(|e| e.to_string())?;
    
    if combined.len() < SALT_SIZE + NONCE_SIZE + 1 {
        return Err("Invalid encrypted data".to_string());
    }
    
    let salt = &combined[..SALT_SIZE];
    let nonce_bytes = &combined[SALT_SIZE..SALT_SIZE + NONCE_SIZE];
    let ciphertext = &combined[SALT_SIZE + NONCE_SIZE..];
    
    // Derive key
    let key = deriveKey(masterPassword, salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);
    
    // Decrypt
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed - wrong password?".to_string())?;
    
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

/// Hash master password for verification storage
pub fn hashMasterPassword(password: &str) -> String {
    use argon2::PasswordHasher;
    let salt = SaltString::generate(&mut rand::thread_rng());
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("Password hashing failed")
        .to_string()
}

/// Verify master password against stored hash  
pub fn verifyMasterPassword(password: &str, hash: &str) -> bool {
    use argon2::{PasswordHash, PasswordVerifier};
    if let Ok(parsed) = PasswordHash::new(hash) {
        Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
    } else {
        false
    }
}
