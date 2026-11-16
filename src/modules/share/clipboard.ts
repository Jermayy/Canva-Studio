/**
 * Copies text to the clipboard. Returns false instead of throwing when the
 * browser refuses (no permission, no secure context, or the click's user
 * activation expired during an upload), so the UI can offer manual copy.
 */
export async function copyText(
  text: string,
  // Typed as always present, but missing outside secure contexts.
  clipboard: Pick<Clipboard, 'writeText'> | undefined = (
    globalThis.navigator as Partial<Navigator>
  ).clipboard,
): Promise<boolean> {
  if (!clipboard) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
