// Vault commands - master password and encryption management

use std::fs;
use tauri::State;

use crate::crypto;
use crate::encrypted_storage;
use crate::storage::StorageState;

/// Check if vault has been set up (master password created)
#[tauri::command]
pub fn isVaultSetup(storage: State<'_, StorageState>) -> bool {
    println!("[isVaultSetup] Checking if vault is set up");
    let result = storage.isVaultSetup();
    println!("[isVaultSetup] Result: {}", result);
    result
}

/// Check if vault is currently unlocked
#[tauri::command]
pub fn isVaultUnlocked(storage: State<'_, StorageState>) -> bool {
    println!("[isVaultUnlocked] Checking if vault is unlocked");
    let result = storage.isUnlocked();
    println!("[isVaultUnlocked] Result: {}", result);
    result
}

/// Set up master password for the first time
#[tauri::command]
pub fn setupMasterPassword(storage: State<'_, StorageState>, password: String) -> Result<(), String> {
    println!("[setupMasterPassword] Setting up master password");

    if storage.isVaultSetup() {
        return Err("Master password already set up".to_string());
    }

    let hashPath = storage.masterPasswordHashPath()
        .ok_or("No workspace selected")?;

    // Hash the password
    let hash = crypto::hashMasterPassword(&password)?;

    // Write hash to file
    fs::write(&hashPath, &hash).map_err(|e| {
        println!("[setupMasterPassword] ERROR writing hash: {}", e);
        e.to_string()
    })?;

    // Derive key and unlock vault
    let key = deriveKeyFromPassword(&password)?;
    storage.setDerivedKey(key);

    println!("[setupMasterPassword] SUCCESS - vault set up and unlocked");
    Ok(())
}

/// Unlock the vault with master password
#[tauri::command]
pub fn unlockVault(storage: State<'_, StorageState>, password: String) -> Result<bool, String> {
    println!("[unlockVault] Attempting to unlock vault");

    let hashPath = storage.masterPasswordHashPath()
        .ok_or("No workspace selected")?;

    if !hashPath.exists() {
        return Err("Vault not set up - no master password".to_string());
    }

    // Read stored hash
    let storedHash = fs::read_to_string(&hashPath)
        .map_err(|e| format!("Failed to read master password hash: {}", e))?;

    // Verify password
    if !crypto::verifyMasterPassword(&password, &storedHash) {
        println!("[unlockVault] Password verification failed");
        return Ok(false);
    }

    // Derive key and store it
    let key = deriveKeyFromPassword(&password)?;
    storage.setDerivedKey(key);

    println!("[unlockVault] SUCCESS - vault unlocked");
    Ok(true)
}

/// Lock the vault (clear derived key from memory)
#[tauri::command]
pub fn lockVault(storage: State<'_, StorageState>) -> Result<(), String> {
    println!("[lockVault] Locking vault");
    storage.lock();
    Ok(())
}

/// Change master password
#[tauri::command]
pub fn changeMasterPasswordVault(
    storage: State<'_, StorageState>,
    oldPassword: String,
    newPassword: String,
) -> Result<(), String> {
    println!("[changeMasterPassword] Changing master password");

    let hashPath = storage.masterPasswordHashPath()
        .ok_or("No workspace selected")?;

    if !hashPath.exists() {
        return Err("Vault not set up".to_string());
    }

    // Verify old password
    let storedHash = fs::read_to_string(&hashPath)
        .map_err(|e| format!("Failed to read master password hash: {}", e))?;

    if !crypto::verifyMasterPassword(&oldPassword, &storedHash) {
        return Err("Current password is incorrect".to_string());
    }

    // Hash new password
    let newHash = crypto::hashMasterPassword(&newPassword)?;

    // Write new hash
    fs::write(&hashPath, &newHash).map_err(|e| {
        println!("[changeMasterPassword] ERROR writing hash: {}", e);
        e.to_string()
    })?;

    // Re-encrypt all files with new password
    reEncryptAllFiles(&storage, &oldPassword, &newPassword)?;

    // Update derived key
    let key = deriveKeyFromPassword(&newPassword)?;
    storage.setDerivedKey(key);

    println!("[changeMasterPassword] SUCCESS");
    Ok(())
}

/// Update activity to reset auto-lock timer (kept for compatibility)
#[tauri::command]
pub fn updateVaultActivity(storage: State<'_, StorageState>) {
    storage.updateActivity();
}

// ============================================
// PASSWORDS-ONLY AUTO-LOCK COMMANDS
// ============================================

/// Check if passwords access is unlocked
#[tauri::command]
pub fn isPasswordsAccessUnlocked(storage: State<'_, StorageState>) -> bool {
    storage.isPasswordsAccessUnlocked()
}

/// Unlock passwords access (verify password and grant 10-minute access)
#[tauri::command]
pub fn unlockPasswordsAccess(storage: State<'_, StorageState>, password: String) -> Result<bool, String> {
    println!("[unlockPasswordsAccess] Attempting to unlock passwords access");

    // Vault must be unlocked first
    if !storage.isUnlocked() {
        return Err("Vault is not unlocked".to_string());
    }

    let hashPath = storage.masterPasswordHashPath()
        .ok_or("No workspace selected")?;

    if !hashPath.exists() {
        return Err("Vault not set up".to_string());
    }

    // Read stored hash and verify password
    let storedHash = std::fs::read_to_string(&hashPath)
        .map_err(|e| format!("Failed to read master password hash: {}", e))?;

    if !crypto::verifyMasterPassword(&password, &storedHash) {
        println!("[unlockPasswordsAccess] Password verification failed");
        return Ok(false);
    }

    // Grant passwords access
    storage.unlockPasswordsAccess();

    println!("[unlockPasswordsAccess] SUCCESS - passwords access unlocked");
    Ok(true)
}

/// Lock passwords access manually
#[tauri::command]
pub fn lockPasswordsAccess(storage: State<'_, StorageState>) {
    println!("[lockPasswordsAccess] Locking passwords access");
    storage.lockPasswordsAccess();
}

/// Update passwords activity to reset auto-lock timer
#[tauri::command]
pub fn updatePasswordsActivity(storage: State<'_, StorageState>) {
    storage.updatePasswordsActivity();
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/// Derive a 32-byte key from password using Argon2
fn deriveKeyFromPassword(password: &str) -> Result<Vec<u8>, String> {
    use argon2::Argon2;

    // Use a fixed salt derived from the password for deterministic key derivation
    // This is safe because we also use random salts in the encryption itself
    let salt = format!("claudia-vault-{}", password.len());
    let salt_bytes = salt.as_bytes();

    let mut key = vec![0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt_bytes, &mut key)
        .map_err(|e| format!("Key derivation failed: {}", e))?;

    Ok(key)
}

/// Re-encrypt all files with new password when master password changes
fn reEncryptAllFiles(
    storage: &StorageState,
    oldPassword: &str,
    newPassword: &str,
) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let foldersDir = crate::storage::foldersDir(&wsPath);

    println!("[reEncryptAllFiles] Re-encrypting files in {:?}", foldersDir);

    // Walk through all .md files and re-encrypt them
    reEncryptDirectory(&foldersDir, oldPassword, newPassword)?;

    Ok(())
}

fn reEncryptDirectory(dir: &std::path::Path, oldPassword: &str, newPassword: &str) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            reEncryptDirectory(&path, oldPassword, newPassword)?;
        } else if path.extension().map(|e| e == "md").unwrap_or(false) {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

            // Only re-encrypt if it's in encrypted format
            if encrypted_storage::isEncryptedFormat(&content) {
                println!("[reEncryptDirectory] Re-encrypting {:?}", path);

                let encrypted = encrypted_storage::parseEncryptedFile(&content)?;

                // Decrypt with old password
                let metadata = encrypted_storage::decryptMetadata(&encrypted.metadata, oldPassword)?;
                let body = encrypted_storage::decryptContent(&encrypted.content, oldPassword)?;

                // Re-encrypt with new password
                let newContent = encrypted_storage::createEncryptedFile(&metadata, &body, newPassword)?;

                fs::write(&path, newContent).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}
