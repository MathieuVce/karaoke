"use client";

import { useState, useCallback } from "react";
import { Loader2, Search } from "lucide-react";
import { upload } from "@vercel/blob/client";
import YoutubeKaraoke from "./YoutubeKaraoke";
import YoutubeSync from "./YoutubeSync";

interface LrcResult {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  syncedLyrics: string;
  plainLyrics: string;
}
interface VideoResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

type View =
  | { type: "play"; lrc: string; title: string; artist: string; videoId: string | null }
  | { type: "sync"; text: string; title: string; artist: string; videoId: string | null }
  | null;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "karaoke";
}

// Nettoie un titre de vidéo pour la recherche LRCLIB
function cleanTitle(t: string): string {
  return t
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\b(official|video|audio|lyrics?|paroles|clip|hd|4k|mv|live)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function SearchKaraoke() {
  const [searchMode, setSearchMode] = useState<"lyrics" | "video">("lyrics");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [instrumental, setInstrumental] = useState(false); // version instrumentale/karaoké
  const [lrcResults, setLrcResults] = useState<LrcResult[]>([]);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);
  const [view, setView] = useState<View>(null);
  const [resolving, setResolving] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || searching) return; // anti-doublon : ignore si une recherche tourne déjà
    setSearching(true);
    setSearchError("");
    try {
      if (searchMode === "lyrics") {
        const data = await fetch(`/api/lrclib?q=${encodeURIComponent(q)}`).then((r) => r.json());
        setLrcResults(data.results ?? []);
        if ((data.results ?? []).length === 0) setSearchError("Aucune parole trouvée.");
      } else {
        const vq = instrumental ? `${q} instrumental karaoke` : q;
        const data = await fetch(`/api/youtube?q=${encodeURIComponent(vq)}&max=10`).then((r) => r.json());
        setVideoResults(data.results ?? []);
        if ((data.results ?? []).length === 0) {
          setSearchError(data.error === "API_KEY_HTTP_REFERRER_BLOCKED"
            ? "Clé YouTube restreinte par referrer : passe la restriction sur « Aucune »."
            : `Aucune vidéo. ${data.error ?? ""}`);
        }
      }
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }, [query, searchMode, instrumental, searching]);

  // Recherche par paroles : ouvre directement le lecteur synchronisé
  const selectLrc = async (r: LrcResult) => {
    if (resolving) return; // évite les doubles clics pendant la résolution YouTube
    setResolving(true);
    setSaved(false);
    let videoId: string | null = null;
    try {
      const base = `${r.artist} ${r.title}`;
      const yq = instrumental ? `${base} instrumental karaoke` : base;
      const yt = await fetch(`/api/youtube?q=${encodeURIComponent(yq)}`).then((res) => res.json());
      videoId = yt.videoId ?? null;
    } catch { /* paste manuel possible */ }
    setResolving(false);
    if (r.syncedLyrics) {
      setView({ type: "play", lrc: r.syncedLyrics, title: r.title, artist: r.artist, videoId });
    } else {
      setView({ type: "sync", text: r.plainLyrics, title: r.title, artist: r.artist, videoId });
    }
  };

  // Recherche par vidéo : on choisit une vidéo, puis on cherche un LRC ; sinon sync manuelle
  const selectVideo = async (v: VideoResult) => {
    if (resolving) return; // évite les doubles clics pendant la résolution des paroles
    setResolving(true);
    setSaved(false);
    const guess = cleanTitle(v.title);
    try {
      const data = await fetch(`/api/lrclib?q=${encodeURIComponent(guess)}`).then((r) => r.json());
      const synced = (data.results as LrcResult[] | undefined)?.find((x) => x.syncedLyrics);
      const plain = (data.results as LrcResult[] | undefined)?.find((x) => x.plainLyrics);
      if (synced) {
        setView({ type: "play", lrc: synced.syncedLyrics, title: synced.title, artist: synced.artist, videoId: v.videoId });
      } else {
        // Pas de paroles synchronisées : on passe en sync manuelle (texte pré-rempli si dispo)
        setView({ type: "sync", text: plain?.plainLyrics ?? "", title: cleanTitle(v.title) || v.title, artist: v.channel, videoId: v.videoId });
      }
    } catch {
      setView({ type: "sync", text: "", title: v.title, artist: v.channel, videoId: v.videoId });
    } finally {
      setResolving(false);
    }
  };

  // Sauvegarde légère depuis le lecteur (chanson YouTube : LRC + meta, sans audio)
  const savePlay = async (videoId: string) => {
    if (view?.type !== "play") return;
    setSaving(true);
    try {
      const id = `${Date.now()}-${slugify(view.title)}`;
      const lrcFile = new File([view.lrc], `${id}.lrc`, { type: "text/plain" });
      const lrcBlob = await upload(`karaoke/${id}.lrc`, lrcFile, { access: "public", handleUploadUrl: "/api/songs/upload" });
      const meta = { id, title: view.title, artist: view.artist, lrcUrl: lrcBlob.url, vocalsUrl: null, youtubeId: videoId, createdAt: new Date().toISOString() };
      const metaFile = new File([JSON.stringify(meta)], `${id}.meta.txt`, { type: "text/plain" });
      await upload(`karaoke/${id}.meta.txt`, metaFile, { access: "public", handleUploadUrl: "/api/songs/upload" });
      setSaved(true);
    } catch (e) {
      alert(`Erreur sauvegarde : ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Vues sélectionnées ───────────────────────────────────────────────────
  if (view?.type === "play") {
    return (
      <YoutubeKaraoke
        lrc={view.lrc}
        title={view.title}
        artist={view.artist}
        initialVideoId={view.videoId}
        onBack={() => setView(null)}
        onSave={saved ? undefined : savePlay}
        saving={saving}
      />
    );
  }
  if (view?.type === "sync") {
    return (
      <YoutubeSync
        initialVideoId={view.videoId}
        initialText={view.text}
        title={view.title}
        artist={view.artist}
        onBack={() => setView(null)}
      />
    );
  }

  // ─── Vue recherche ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-5 max-w-2xl mx-auto w-full space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Rechercher une chanson</h2>
          <p className="text-xs text-white/40 mt-1">Paroles synchronisées via LRCLIB, musique via YouTube. Sauvegarde légère : aucun fichier audio, juste le lien + les paroles.</p>
        </div>

        {/* Bascule du mode de recherche */}
        <div className="flex gap-1 p-1 rounded-lg bg-white/5 w-fit">
          {(["lyrics", "video"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setSearchMode(m); setSearchError(""); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${searchMode === m ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {m === "lyrics" ? "Par paroles" : "Par vidéo YouTube"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer w-fit">
          <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="accent-violet-500" />
          Privilégier la version instrumentale / karaoké (sans voix originale)
        </label>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder={searchMode === "lyrics" ? "ex. Daft Punk Get Lucky" : "ex. Pierre Vacance karaoké"}
            className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-400"
          />
          <button onClick={doSearch} disabled={searching || !query.trim()} className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-sm font-bold transition-all active:scale-95 disabled:opacity-40 shrink-0 flex items-center gap-1.5 min-w-[6.5rem] justify-center">
            {searching ? <><Loader2 size={15} className="animate-spin" />Recherche…</> : <><Search size={15} />Chercher</>}
          </button>
        </div>

        {searchError && <p className="text-xs text-amber-300/70">{searchError}</p>}
        {resolving && (
          <p className="text-xs text-white/50 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />Recherche des paroles…</p>
        )}

        {/* Résultats LRCLIB */}
        {searchMode === "lyrics" && (
          <div className="space-y-2">
            {lrcResults.map((r) => (
              <button key={r.id} onClick={() => selectLrc(r)} disabled={resolving} className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{r.title}</div>
                  <div className="text-xs text-white/40 truncate">{r.artist}{r.album ? ` · ${r.album}` : ""}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: r.syncedLyrics ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.1)", color: r.syncedLyrics ? "rgba(196,181,253,1)" : "rgba(255,255,255,0.5)" }}>
                  {r.syncedLyrics ? "LRC" : "texte"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Résultats vidéos YouTube */}
        {searchMode === "video" && (
          <div className="space-y-2">
            {videoResults.map((v) => (
              <button key={v.videoId} onClick={() => selectVideo(v)} disabled={resolving} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl transition-all bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none">
                {v.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnail} alt="" className="w-20 h-12 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white line-clamp-2">{v.title}</div>
                  <div className="text-xs text-white/40 truncate">{v.channel}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
