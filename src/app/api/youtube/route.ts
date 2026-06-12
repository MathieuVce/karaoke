import { NextResponse } from "next/server";

// Recherche YouTube via l'API Data v3 (clé optionnelle).
// Si YOUTUBE_API_KEY n'est pas configurée, renvoie videoId: null
// → le frontend proposera alors de coller une URL YouTube manuellement.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ videoId: null });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({ videoId: null, reason: "no-key" });

  const max = searchParams.get("max") ?? "1";
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=${encodeURIComponent(max)}&q=${encodeURIComponent(q)}&key=${key}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      // Remonte la vraie raison (ex. clé restreinte par referrer) pour faciliter le diagnostic
      const reason = data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? `HTTP ${res.status}`;
      const message = data?.error?.message ?? "";
      return NextResponse.json({ videoId: null, results: [], error: reason, message });
    }
    interface YtItem {
      id?: { videoId?: string };
      snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } };
    }
    const results = ((data.items ?? []) as YtItem[]).map((it) => ({
      videoId: it.id?.videoId ?? "",
      title: it.snippet?.title ?? "",
      channel: it.snippet?.channelTitle ?? "",
      thumbnail: it.snippet?.thumbnails?.medium?.url ?? "",
    })).filter((r) => r.videoId);
    return NextResponse.json({ videoId: results[0]?.videoId ?? null, results });
  } catch (err) {
    return NextResponse.json({ videoId: null, results: [], error: (err as Error).message });
  }
}
