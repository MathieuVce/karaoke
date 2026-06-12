import { list, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

export interface SongMeta {
  id: string;
  title: string;
  artist: string;
  audioUrl: string | null;   // null pour une chanson YouTube (pas de fichier audio)
  lrcUrl: string | null;
  vocalsUrl: string | null;  // piste voix optionnelle (stem) pour le mixage
  youtubeId: string | null;  // chanson légère : musique via iframe YouTube
  createdAt: string;
}

const AUDIO_EXTS = [".mp3", ".mp4", ".ogg", ".wav", ".m4a", ".aac"];

// Les pistes IA sont réécrites au même chemin (URL identique) : on ajoute une
// version basée sur la date d'upload pour forcer le navigateur/CDN à recharger
// le nouveau fichier au lieu de servir l'ancien depuis le cache.
function bust(url: string, uploadedAt: string | Date): string {
  const v = new Date(uploadedAt).getTime();
  return Number.isFinite(v) ? `${url}${url.includes("?") ? "&" : "?"}v=${v}` : url;
}

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "karaoke/" });

    const metaBlobs = blobs.filter((b) => b.pathname.endsWith(".meta.txt") || b.pathname.endsWith(".meta.json"));
    const isVocals = (p: string) => /\.vocals\.[^.]+$/.test(p);
    const audioBlobs = blobs.filter((b) => AUDIO_EXTS.some((ext) => b.pathname.endsWith(ext)) && !isVocals(b.pathname));
    const vocalsBlobs = blobs.filter((b) => isVocals(b.pathname));
    const lrcBlobs = blobs.filter((b) => b.pathname.endsWith(".lrc"));

    // On itère sur les métadonnées (source de vérité) → inclut les chansons
    // YouTube (sans fichier audio) comme les chansons audio classiques.
    const songs: SongMeta[] = [];
    for (const metaBlob of metaBlobs) {
      try {
        const data = await fetch(metaBlob.url).then((r) => r.json());
        const id: string = data.id ?? (metaBlob.pathname.split("/").pop() ?? "").split(".")[0];
        if (!id) continue;
        const audio = audioBlobs.find((b) => b.pathname.includes(id)) ?? null;
        const lrc = lrcBlobs.find((b) => b.pathname.includes(id)) ?? null;
        const vocals = vocalsBlobs.find((b) => b.pathname.includes(id)) ?? null;
        songs.push({
          id,
          title: data.title ?? "Sans titre",
          artist: data.artist ?? "",
          audioUrl: audio ? bust(audio.url, audio.uploadedAt) : null,
          lrcUrl: lrc ? bust(lrc.url, lrc.uploadedAt) : null,
          vocalsUrl: vocals ? bust(vocals.url, vocals.uploadedAt) : null,
          youtubeId: data.youtubeId ?? null,
          createdAt: data.createdAt ?? metaBlob.uploadedAt.toString(),
        });
      } catch { /* meta illisible : on saute */ }
    }

    songs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ songs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Supprime les fichiers existants d'un type avant d'uploader le nouveau
// → garantit un seul fichier par type/chanson (pas d'accumulation, pas de collision)
//   type "lrc" (défaut) → .lrc ; type "vocals" → .vocals.*
export async function PATCH(request: Request) {
  try {
    if (!(await checkAuth())) {
      return NextResponse.json({ error: "Non autorisé. Mot de passe requis." }, { status: 401 });
    }
    const { id, type } = await request.json();
    if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
    const { blobs } = await list({ prefix: `karaoke/${id}` });
    const isVocals = (p: string) => /\.vocals\.[^.]+$/.test(p);
    const match = type === "vocals"
      ? blobs.filter((b) => isVocals(b.pathname))
      : type === "audio"
      ? blobs.filter((b) => AUDIO_EXTS.some((e) => b.pathname.endsWith(e)) && !isVocals(b.pathname))
      : blobs.filter((b) => b.pathname.endsWith(".lrc"));
    await Promise.all(match.map((b) => del(b.url)));
    return NextResponse.json({ ok: true, deleted: match.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await checkAuth())) {
      return NextResponse.json({ error: "Non autorisé. Mot de passe requis." }, { status: 401 });
    }
    const { id } = await request.json();
    const { blobs } = await list({ prefix: `karaoke/${id}` });
    await Promise.all(blobs.map((b) => del(b.url)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
