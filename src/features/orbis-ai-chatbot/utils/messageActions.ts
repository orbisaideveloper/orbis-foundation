/**
 * Copies the complete message text to the clipboard. Resolves to a boolean
 * so callers can react to failure without the Chat UI throwing/crashing on
 * denied permissions or unsupported environments.
 */
export async function copyMessageContent(content: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

/** Whether the Web Share API is available in the current environment. */
export function isShareSupported(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

/**
 * Shares the complete message text via the native Web Share API where
 * supported. Fails gracefully (returns false) instead of throwing when
 * unsupported or when the user cancels/denies the share sheet.
 */
export async function shareMessageContent(content: string): Promise<boolean> {
  try {
    if (!isShareSupported()) return false;
    await navigator.share({ text: content });
    return true;
  } catch {
    // Includes user-cancelled shares (AbortError) — not an app error.
    return false;
  }
}
