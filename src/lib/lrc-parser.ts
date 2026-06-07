export interface LrcWord {
  time: number;
  text: string;
}

export interface LrcLine {
  time: number;
  text: string;
  words?: LrcWord[];
}

export interface LrcData {
  title?: string;
  artist?: string;
  album?: string;
  lines: LrcLine[];
  hasWordTimestamps: boolean;
}

const TAG_RE = /^\[(\w+):(.+)\]$/;
const LINE_TIME_RE = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
const WORD_TIME_RE = /<(\d{2}):(\d{2})\.(\d{2,3})>([^<]*)/g;

function parseSeconds(min: string, sec: string, ms: string): number {
  return parseInt(min) * 60 + parseInt(sec) + (ms.length === 2 ? parseInt(ms) * 10 : parseInt(ms)) / 1000;
}

export function parseLrc(raw: string): LrcData {
  const result: LrcData = { lines: [], hasWordTimestamps: false };

  for (const rawLine of raw.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const tagMatch = TAG_RE.exec(trimmed);
    if (tagMatch) {
      const key = tagMatch[1].toLowerCase();
      const val = tagMatch[2].trim();
      if (key === "ti") result.title = val;
      else if (key === "ar") result.artist = val;
      else if (key === "al") result.album = val;
      continue;
    }

    const lineTimeMatch = LINE_TIME_RE.exec(trimmed);
    if (!lineTimeMatch) continue;

    const lineTime = parseSeconds(lineTimeMatch[1], lineTimeMatch[2], lineTimeMatch[3]);
    const rest = trimmed.slice(lineTimeMatch[0].length);

    // Check for word-level timestamps  <mm:ss.xx>word
    WORD_TIME_RE.lastIndex = 0;
    const words: LrcWord[] = [];
    let match: RegExpExecArray | null;
    while ((match = WORD_TIME_RE.exec(rest)) !== null) {
      const wordText = match[4];
      if (wordText.trim()) {
        words.push({ time: parseSeconds(match[1], match[2], match[3]), text: wordText });
      }
    }

    const text = rest.replace(/<\d{2}:\d{2}\.\d{2,3}>/g, "").trim();

    if (words.length > 0) {
      result.hasWordTimestamps = true;
      result.lines.push({ time: lineTime, text, words });
    } else {
      result.lines.push({ time: lineTime, text });
    }
  }

  result.lines.sort((a, b) => a.time - b.time);
  return result;
}

export function getCurrentLineIndex(lines: LrcLine[], currentTime: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) index = i;
    else break;
  }
  return index;
}

export function getCurrentWordIndex(words: LrcWord[], currentTime: number): number {
  let index = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].time <= currentTime) index = i;
    else break;
  }
  return index;
}

function toTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export function buildEnhancedLrc(
  lines: { text: string; words: { time: number; text: string }[] }[],
  title?: string,
  artist?: string
): string {
  const parts: string[] = [];
  if (title) parts.push(`[ti:${title}]`);
  if (artist) parts.push(`[ar:${artist}]`);
  for (const line of lines) {
    if (line.words.length === 0) continue;
    const lineTime = `[${toTimestamp(line.words[0].time)}]`;
    const wordParts = line.words.map((w) => `<${toTimestamp(w.time)}>${w.text}`).join("");
    parts.push(`${lineTime}${wordParts}`);
  }
  return parts.join("\n");
}
