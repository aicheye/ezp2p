/**
 * Generate a random 6-character alphanumeric lobby code.
 * Uses uppercase letters and digits for easy readability.
 * 6 chars = 31^6 = ~887M combinations (vs 31^4 = ~1M for 4 chars)
 */
export function generateLobbyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Omit confusing chars: I, O, 0, 1
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validate a lobby code format.
 * Must be exactly 6 alphanumeric characters.
 */
export function isValidLobbyCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/**
 * Normalize a lobby code (uppercase, trimmed).
 */
export function normalizeLobbyCode(code: string): string {
  return code.toUpperCase().trim();
}

/**
 * Extract a lobby code from a URL or raw string.
 * Prefer a `?code=XXXXXX` search parameter, but fall back to legacy
 * path-based extraction and a last-6-chars heuristic for robustness.
 */
export function extractCodeFromUrl(input: string): string | null {
  // Try to parse as URL first
  try {
    const url = new URL(input);
    // Prefer explicit query param `?code=`
    const codeParam = url.searchParams.get("code");
    if (codeParam) {
      const norm = normalizeLobbyCode(codeParam);
      if (isValidLobbyCode(norm)) return norm;
    }

    // Fallback: legacy support — check last path segment
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1].toUpperCase();
      if (isValidLobbyCode(lastSegment)) {
        return lastSegment;
      }
    }
  } catch {
    // Not a valid URL, fall through to heuristic
  }

  // Heuristic: extract last 6 alphanumeric chars from the input
  const alphanumeric = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (alphanumeric.length >= 6) {
    const code = alphanumeric.slice(-6);
    if (isValidLobbyCode(code)) {
      return code;
    }
  }

  return null;
}
