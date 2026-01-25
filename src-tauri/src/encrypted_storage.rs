// Encrypted storage format for Claudia
// Format: CLAUDIA-ENCRYPTED-v1 with separate encrypted metadata and content sections

use crate::crypto;

const FORMAT_HEADER: &str = "CLAUDIA-ENCRYPTED-v1";
const METADATA_MARKER: &str = "[METADATA]";
const CONTENT_MARKER: &str = "[CONTENT]";

/// Parsed encrypted file with separate metadata and content sections
#[derive(Debug)]
pub struct EncryptedFile {
    pub metadata: String,  // Base64-encoded encrypted metadata
    pub content: String,   // Base64-encoded encrypted content
}

/// Parse an encrypted file into its components
pub fn parseEncryptedFile(raw: &str) -> Result<EncryptedFile, String> {
    let lines: Vec<&str> = raw.lines().collect();

    if lines.is_empty() || lines[0].trim() != FORMAT_HEADER {
        return Err("Invalid file format: missing header".to_string());
    }

    let mut metadataStart = None;
    let mut contentStart = None;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed == METADATA_MARKER {
            metadataStart = Some(i + 1);
        } else if trimmed == CONTENT_MARKER {
            contentStart = Some(i + 1);
        }
    }

    let metadataIdx = metadataStart.ok_or("Missing [METADATA] section")?;
    let contentIdx = contentStart.ok_or("Missing [CONTENT] section")?;

    if metadataIdx >= contentIdx {
        return Err("Invalid format: [METADATA] must come before [CONTENT]".to_string());
    }

    // Collect metadata lines (between [METADATA] and [CONTENT])
    let metadata: String = lines[metadataIdx..contentIdx - 1]
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("");

    // Collect content lines (after [CONTENT])
    let content: String = lines[contentIdx..]
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("");

    Ok(EncryptedFile { metadata, content })
}

/// Serialize encrypted metadata and content to file format
pub fn toEncryptedFile(encryptedMetadata: &str, encryptedContent: &str) -> String {
    format!(
        "{}\n{}\n{}\n{}\n{}\n",
        FORMAT_HEADER,
        METADATA_MARKER,
        encryptedMetadata,
        CONTENT_MARKER,
        encryptedContent
    )
}

/// Encrypt metadata (YAML frontmatter) with master password
pub fn encryptMetadata(yamlContent: &str, masterPassword: &str) -> Result<String, String> {
    crypto::encrypt(yamlContent, masterPassword)
}

/// Decrypt metadata with master password
pub fn decryptMetadata(encryptedMetadata: &str, masterPassword: &str) -> Result<String, String> {
    crypto::decrypt(encryptedMetadata, masterPassword)
}

/// Encrypt content (markdown body) with master password
pub fn encryptContent(bodyContent: &str, masterPassword: &str) -> Result<String, String> {
    crypto::encrypt(bodyContent, masterPassword)
}

/// Decrypt content with master password
pub fn decryptContent(encryptedContent: &str, masterPassword: &str) -> Result<String, String> {
    crypto::decrypt(encryptedContent, masterPassword)
}

/// Check if raw file content is in encrypted format
pub fn isEncryptedFormat(raw: &str) -> bool {
    raw.trim().starts_with(FORMAT_HEADER)
}

/// Create a new encrypted file from plaintext metadata (YAML) and content
pub fn createEncryptedFile(
    yamlMetadata: &str,
    bodyContent: &str,
    masterPassword: &str,
) -> Result<String, String> {
    let encryptedMetadata = encryptMetadata(yamlMetadata, masterPassword)?;
    let encryptedContent = encryptContent(bodyContent, masterPassword)?;
    Ok(toEncryptedFile(&encryptedMetadata, &encryptedContent))
}

/// Serialize frontmatter and body, then encrypt to file format
pub fn serializeAndEncrypt<T: serde::Serialize>(
    frontmatter: &T,
    body: &str,
    masterPassword: &str,
) -> Result<String, String> {
    let yaml = serde_yaml::to_string(frontmatter)
        .map_err(|e| format!("YAML serialization error: {}", e))?;
    createEncryptedFile(&yaml, body, masterPassword)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_encrypted_format() {
        let raw = r#"CLAUDIA-ENCRYPTED-v1
[METADATA]
dGVzdG1ldGE=
[CONTENT]
dGVzdGNvbnRlbnQ="#;

        let result = parseEncryptedFile(raw).unwrap();
        assert_eq!(result.metadata, "dGVzdG1ldGE=");
        assert_eq!(result.content, "dGVzdGNvbnRlbnQ=");
    }

    #[test]
    fn test_to_encrypted_format() {
        let output = toEncryptedFile("encmeta", "enccontent");
        assert!(output.contains("CLAUDIA-ENCRYPTED-v1"));
        assert!(output.contains("[METADATA]"));
        assert!(output.contains("encmeta"));
        assert!(output.contains("[CONTENT]"));
        assert!(output.contains("enccontent"));
    }

    #[test]
    fn test_is_encrypted_format() {
        assert!(isEncryptedFormat("CLAUDIA-ENCRYPTED-v1\n[METADATA]..."));
        assert!(!isEncryptedFormat("---\ntitle: test\n---\ncontent"));
    }
}
