import { list, del } from "@vercel/blob";
import { NextResponse } from "next/server";

export interface SongMeta {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  lrcUrl: string | null;
  createdAt: string;
}

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "karaoke/" });

    // Group by song ID (karaoke/{id}.mp3 / .lrc / .meta.json)
    const metaBlobs = blobs.filter((b) => b.pathname.endsWith(".meta.json"));
    const audioBlobs = blobs.filter((b) => !b.pathname.endsWith(".meta.json") && !b.pathname.endsWith(".lrc"));
    const lrcBlobs = blobs.filter((b) => b.pathname.endsWith(".lrc"));

    const songs: SongMeta[] = [];

    for (const meta of metaBlobs) {
      try {
        const res = await fetch(meta.url);
        const data = await res.json();
        const id = data.id as string;
        const audio = audioBlobs.find((b) => b.pathname.includes(id));
        const lrc = lrcBlobs.find((b) => b.pathname.includes(id));
        if (!audio) continue;
        songs.push({
          id,
          title: data.title ?? "Sans titre",
          artist: data.artist ?? "",
          audioUrl: audio.url,
          lrcUrl: lrc?.url ?? null,
          createdAt: data.createdAt ?? meta.uploadedAt.toString(),
        });
      } catch {
        // skip malformed meta
      }
    }

    songs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ songs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    const { blobs } = await list({ prefix: `karaoke/${id}` });
    await Promise.all(blobs.map((b) => del(b.url)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
