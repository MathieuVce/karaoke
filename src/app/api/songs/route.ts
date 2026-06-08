import { list, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

export interface SongMeta {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  lrcUrl: string | null;
  vocalsUrl: string | null; // piste voix optionnelle (stem) pour le mixage
  createdAt: string;
}

const AUDIO_EXTS = [".mp3", ".mp4", ".ogg", ".wav", ".m4a", ".aac"];

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "karaoke/" });

    const metaBlobs = blobs.filter((b) => b.pathname.endsWith(".meta.txt") || b.pathname.endsWith(".meta.json"));
    // Piste voix : `{id}.vocals.{ext}` : à exclure de l'audio principal
    const isVocals = (p: string) => /\.vocals\.[^.]+$/.test(p);
    const audioBlobs = blobs.filter((b) => AUDIO_EXTS.some((ext) => b.pathname.endsWith(ext)) && !isVocals(b.pathname));
    const vocalsBlobs = blobs.filter((b) => isVocals(b.pathname));
    const lrcBlobs = blobs.filter((b) => b.pathname.endsWith(".lrc"));

    const songs: SongMeta[] = [];

    for (const audio of audioBlobs) {
      // Extraire l'ID depuis le nom de fichier (premier segment avant le premier ".")
      const filename = audio.pathname.split("/").pop() ?? "";
      const id = filename.split(".")[0];
      if (!id) continue;

      const lrc = lrcBlobs.find((b) => b.pathname.includes(id)) ?? null;
      const vocals = vocalsBlobs.find((b) => b.pathname.includes(id)) ?? null;
      const metaBlob = metaBlobs.find((b) => b.pathname.includes(id));

      let title = filename.replace(/\.[^.]+$/, "");
      let artist = "";
      let createdAt = audio.uploadedAt.toString();

      if (metaBlob) {
        try {
          const data = await fetch(metaBlob.url).then((r) => r.json());
          title = data.title ?? title;
          artist = data.artist ?? "";
          createdAt = data.createdAt ?? createdAt;
        } catch { /* garder les valeurs par défaut */ }
      }

      songs.push({ id, title, artist, audioUrl: audio.url, lrcUrl: lrc?.url ?? null, vocalsUrl: vocals?.url ?? null, createdAt });
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
    const match = type === "vocals"
      ? blobs.filter((b) => /\.vocals\.[^.]+$/.test(b.pathname))
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
