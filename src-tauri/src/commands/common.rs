// Common helpers for commands
// All using camelCase for direct JSON compatibility

use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

/// Get current timestamp in milliseconds
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// Generate new UUID
pub fn newId() -> String {
    Uuid::new_v4().to_string()
}
