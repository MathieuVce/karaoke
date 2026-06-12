import { NextResponse } from "next/server";

// Secondes -> mm:ss.xx (format LRC)
function fmtTs(s: number): string {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  let cs = Math.round((s - Math.floor(s)) * 100);
  if (cs === 100) { cs = 0; sec += 1; }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

interface GroqWord { word: string; start: number; end: number }
interface GroqSegment { text: string; start: number; end: number; words?: GroqWord[] }

// Construit un Enhanced LRC depuis la sortie Groq, robuste (jamais vide à tort)
function buildLrc(result: { segments?: GroqSegment[]; words?: GroqWord[] }, title?: string, artist?: string): string {
  const segments = result.segments ?? [];
  // Groq peut renvoyer les mots à la racine OU imbriqués dans chaque segment : on couvre les deux
  const words = (result.words && result.words.length)
    ? result.words
    : segments.flatMap((s) => s.words ?? []);
  const tags: string[] = [];
  if (title) tags.push(`[ti:${title}]`);
  if (artist) tags.push(`[ar:${artist}]`);
  const body: string[] = [];

  const wordsLine = (ws: GroqWord[]) =>
    `[${fmtTs(ws[0].start)}]${ws.map((w) => `<${fmtTs(w.start)}>${(w.word ?? "").trim()} `).join("").trimEnd()}`;

  if (segments.length) {
    let wi = 0;
    for (const seg of segments) {
      while (wi < words.length && words[wi].start < seg.start - 0.2) wi++;
      const segWords: GroqWord[] = [];
      while (wi < words.length && words[wi].start < seg.end - 0.01) { segWords.push(words[wi]); wi++; }
      const text = (seg.text ?? "").trim();
      if (segWords.length) body.push(wordsLine(segWords));
      else if (text) body.push(`[${fmtTs(seg.start)}]${text}`);
    }
  } else if (words.length) {
    for (let i = 0; i < words.length; i += 8) body.push(wordsLine(words.slice(i, i + 8)));
  }

  if (body.length === 0) return ""; // rien de transcrit (audio sans voix)
  return [...tags, ...body].join("\n");
}

// Transcrit un audio (URL distante) via Groq Whisper -> renvoie le LRC
export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: "GROQ_API_KEY non configurée" }, { status: 503 });

  try {
    const { url, title, artist, language } = await request.json();
    if (!url) return NextResponse.json({ error: "url manquante" }, { status: 400 });

    // Récupère l'audio côté serveur (évite la limite de taille du corps de requête Vercel)
    const audioRes = await fetch(url);
    if (!audioRes.ok) return NextResponse.json({ error: "Audio introuvable" }, { status: 400 });
    const audioBlob = await audioRes.blob();

    const form = new FormData();
    form.append("file", audioBlob, "audio.mp3");
    form.append("model", process.env.GROQ_MODEL ?? "whisper-large-v3-turbo");
    form.append("response_format", "verbose_json");
    // Demande les deux granularités : segments (repli) + mots (synchro fine)
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
    if (language) form.append("language", language);

    const gr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!gr.ok) {
      const txt = await gr.text();
      return NextResponse.json({ error: `Groq ${gr.status}: ${txt.slice(0, 200)}` }, { status: 502 });
    }
    const data = await gr.json();
    const lrc = buildLrc(data, title, artist);
    if (!lrc) return NextResponse.json({ error: "Aucune parole détectée dans l'audio (essaie sur le stem voix)." }, { status: 422 });
    return NextResponse.json({ lrc });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
