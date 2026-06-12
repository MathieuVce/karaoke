import { NextResponse } from "next/server";

// Proxy vers LRCLIB (paroles synchronisées gratuites)
// Évite les soucis CORS et pose le User-Agent recommandé par LRCLIB.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Karaoke (https://github.com/MathieuVce/karaoke)" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ results: [], error: `LRCLIB ${res.status}` });
    const data = await res.json();

    // On ne garde que les entrées avec paroles synchronisées
    interface LrclibItem {
      id: number;
      trackName: string;
      artistName: string;
      albumName?: string;
      duration?: number;
      syncedLyrics?: string | null;
      plainLyrics?: string | null;
    }
    // On garde les entrées qui ont au moins des paroles synchronisées OU du texte brut
    const results = (data as LrclibItem[])
      .filter((r) => r.syncedLyrics || r.plainLyrics)
      .map((r) => ({
        id: r.id,
        title: r.trackName,
        artist: r.artistName,
        album: r.albumName ?? "",
        duration: r.duration ?? 0,
        syncedLyrics: r.syncedLyrics ?? "",
        plainLyrics: r.plainLyrics ?? "",
      }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ results: [], error: (err as Error).message });
  }
}
