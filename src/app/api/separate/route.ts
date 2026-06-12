import { NextResponse } from "next/server";
import { put, list, del } from "@vercel/blob";
import { getJob, setJob, genJobId } from "@/lib/jobStore";

// Chaque invocation est courte (lancement ou sondage), pas d'attente longue
export const maxDuration = 60;

const AUDIO_EXTS = [".mp3", ".mp4", ".ogg", ".wav", ".m4a", ".aac"];

function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  return Buffer.from(comma >= 0 ? dataUri.slice(comma + 1) : dataUri, "base64");
}

function authHeaders(): Record<string, string> {
  const t = process.env.HF_TOKEN;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Stocke les pistes générées dans Blob (remplace l'audio principal par l'instrumental)
async function storeResult(id: string, data: { instrumental_base64: string; vocals_base64: string; lyrics_lrc?: string }) {
  const { blobs } = await list({ prefix: `karaoke/${id}` });
  const isVocals = (p: string) => /\.vocals\.[^.]+$/.test(p);
  const toDelete = blobs.filter((b) =>
    (AUDIO_EXTS.some((e) => b.pathname.endsWith(e)) && !isVocals(b.pathname)) ||
    isVocals(b.pathname) || b.pathname.endsWith(".lrc")
  );
  await Promise.all(toDelete.map((b) => del(b.url)));

  await put(`karaoke/${id}.mp3`, dataUriToBuffer(data.instrumental_base64), { access: "public", contentType: "audio/mpeg", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 });
  await put(`karaoke/${id}.vocals.mp3`, dataUriToBuffer(data.vocals_base64), { access: "public", contentType: "audio/mpeg", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 });
  const lrc = data.lyrics_lrc ?? "";
  if (lrc && !lrc.startsWith("#")) {
    await put(`karaoke/${id}.lrc`, lrc, { access: "public", contentType: "text/plain", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 });
  }
}

// POST : lance le job sur le Space, retour immédiat d'un jobId Vercel
export async function POST(request: Request) {
  const demucsUrl = process.env.DEMUCS_URL;
  if (!demucsUrl) return NextResponse.json({ error: "DEMUCS_URL non configurée" }, { status: 503 });

  try {
    const { id, url, title, artist } = await request.json();
    if (!id || !url) return NextResponse.json({ error: "id ou url manquant" }, { status: 400 });

    const audioRes = await fetch(url);
    if (!audioRes.ok) return NextResponse.json({ error: "Audio introuvable" }, { status: 400 });
    const audioBlob = await audioRes.blob();

    const form = new FormData();
    form.append("file", audioBlob, "input.mp3");
    if (title) form.append("title", title);
    if (artist) form.append("artist", artist);
    const startRes = await fetch(`${demucsUrl}/start`, { method: "POST", headers: authHeaders(), body: form });
    if (startRes.status === 409) {
      return NextResponse.json({ error: "Le backend traite déjà une chanson. Réessaie dans un instant." }, { status: 409 });
    }
    if (!startRes.ok) {
      const txt = await startRes.text();
      return NextResponse.json({ error: `Backend ${startRes.status}: ${txt.slice(0, 200)}` }, { status: 502 });
    }
    const { job_id: spaceJobId } = await startRes.json();

    const jobId = genJobId();
    await setJob(jobId, { status: "processing", progress: "Démarrage…", spaceJobId, songId: id, title, artist, updatedAt: Date.now() });
    return NextResponse.json({ jobId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET ?job= : sonde le Space, relaie l'étape ; à la fin, stocke les pistes
export async function GET(request: Request) {
  const demucsUrl = process.env.DEMUCS_URL;
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId) return NextResponse.json({ error: "job manquant" }, { status: 400 });

  const vjob = await getJob(jobId);
  if (!vjob) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  if (vjob.status === "done" || vjob.status === "error") {
    return NextResponse.json({ status: vjob.status, progress: vjob.progress, message: vjob.message }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const sres = await fetch(`${demucsUrl}/status/${vjob.spaceJobId}`, { headers: authHeaders(), cache: "no-store" });
    if (!sres.ok) {
      return NextResponse.json({ status: "processing", progress: vjob.progress }, { headers: { "Cache-Control": "no-store" } });
    }
    const s = await sres.json();

    if (s.status === "processing") {
      await setJob(jobId, { ...vjob, progress: s.step, updatedAt: Date.now() });
      return NextResponse.json({ status: "processing", progress: s.step }, { headers: { "Cache-Control": "no-store" } });
    }
    if (s.status === "error") {
      await setJob(jobId, { ...vjob, status: "error", message: s.error, updatedAt: Date.now() });
      return NextResponse.json({ status: "error", message: s.error }, { headers: { "Cache-Control": "no-store" } });
    }
    if (s.status === "done") {
      await setJob(jobId, { ...vjob, progress: "Enregistrement des pistes…", updatedAt: Date.now() });
      await storeResult(vjob.songId!, s);
      await setJob(jobId, { ...vjob, status: "done", progress: "Terminé", updatedAt: Date.now() });
      return NextResponse.json({ status: "done" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ status: "processing", progress: vjob.progress }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
