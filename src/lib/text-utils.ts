const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{FE00}-\u{FEFF}\u{200D}️\u{20D0}-\u{20FF}]/gu;

export function stripEmojis(text: string): string {
  return text.replace(EMOJI_RE, "").trim();
}

export function shouldSkipWord(word: string): boolean {
  const clean = stripEmojis(word).replace(/[^\p{L}\p{N}'-]/gu, "").trim();
  if (!clean) return true;
  if (/^[-–—]+$/.test(clean)) return true;
  return false;
}
