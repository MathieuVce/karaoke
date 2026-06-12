"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, Download, ArrowLeft } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { extractYtId } from "@/lib/youtube";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void }
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "karaoke";
}

function toTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

interface Props {
  initialVideoId?: string | null;
  initialText?: string;
  title: string;
  artist: string;
  onBack?: () => void;
  existingSongId?: string; // si fourni : met à jour le LRC de cette chanson au lieu d'en créer une
}

type Step = "setup" | "tap" | "done";
interface TapLine { text: string; time: number | null }

// Synchronisation manuelle des paroles contre une vidéo YouTube (légal : écoute + taps).
export default function YoutubeSync({ initialVideoId = null, initialText = "", title, artist, onBack, existingSongId }: Props) {
  const [step, setStep] = useState<Step>("setup");
  const [videoId, setVideoId] = useState<string | null>(initialVideoId);
  const [ytPaste, setYtPaste] = useState("");
  const [text, setText] = useState(initialText);
  const [songTitle, setSongTitle] = useState(title);
  const [songArtist, setSongArtist] = useState(artist);

  const [lines, setLines] = useState<TapLine[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [latencyMs, setLatencyMs] = useState(150);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const playerRef = useRef<any>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Charge l'API IFrame YouTube
  useEffect(() => {
    if (window.YT?.Player) return;
    if (document.getElementById("yt-iframe-api")) return;
    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // Crée le player quand on passe à l'étape tap
  useEffect(() => {
    if (step !== "tap" || !videoId) return;
    let cancelled = false;
    const create = () => {
      if (cancelled) return;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = new window.YT.Player("yt-sync-player", {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: { playsinline: 1, modestbranding: 1, rel: 0 },
      });
    };
    if (window.YT?.Player) create();
    else window.onYouTubeIframeAPIReady = create;
    return () => { cancelled = true; try { playerRef.current?.destroy(); } catch { /* ignore */ } playerRef.current = null; };
  }, [step, videoId]);

  const tap = useCallback(() => {
    const p = playerRef.current;
    if (!p?.getCurrentTime) return;
    const t = Math.max(0, p.getCurrentTime() - latencyMs / 1000);
    setLines((prev) => prev.map((l, i) => (i === currentIdx ? { ...l, time: t } : l)));
    setCurrentIdx((i) => i + 1);
  }, [currentIdx, latencyMs]);

  const undo = useCallback(() => {
    setCurrentIdx((i) => {
      const idx = Math.max(0, i - 1);
      setLines((prev) => prev.map((l, j) => (j >= idx ? { ...l, time: null } : l)));
      return idx;
    });
  }, []);

  // Raccourcis clavier en mode tap
  useEffect(() => {
    if (step !== "tap") return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); tap(); }
      if (e.code === "Backspace") { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, tap, undo]);

  useEffect(() => { activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [currentIdx]);

  useEffect(() => {
    if (step === "tap" && lines.length > 0 && currentIdx >= lines.length) setStep("done");
  }, [currentIdx, lines.length, step]);

  const start = () => {
    const ls = text.split("\n").map((l) => l.trim()).filter(Boolean).map((t) => ({ text: t, time: null as number | null }));
    if (ls.length === 0) return;
    setLines(ls);
    setCurrentIdx(0);
    setStep("tap");
  };

  const buildLrc = () => {
    const parts: string[] = [];
    if (songTitle) parts.push(`[ti:${songTitle}]`);
    if (songArtist) parts.push(`[ar:${songArtist}]`);
    for (const l of lines) if (l.time !== null) parts.push(`[${toTimestamp(l.time)}]${l.text}`);
    return parts.join("\n");
  };

  const downloadLrc = () => {
    const blob = new Blob([buildLrc()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(songTitle)}.lrc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sauvegarde dans la bibliothèque : met à jour le LRC d'une chanson existante,
  // ou crée une nouvelle entrée légère (LRC + meta avec youtubeId)
  const saveToLibrary = async () => {
    if (!videoId) return;
    setSaving(true);
    try {
      if (existingSongId) {
        // Remplace le LRC de la chanson existante (la meta et l'ID YouTube restent)
        await fetch("/api/songs", { method: "PATCH", body: JSON.stringify({ id: existingSongId }), headers: { "Content-Type": "application/json" } });
        const lrcFile = new File([buildLrc()], `${existingSongId}.lrc`, { type: "text/plain" });
        await upload(`karaoke/${existingSongId}.lrc`, lrcFile, { access: "public", handleUploadUrl: "/api/songs/upload" });
      } else {
        const id = `${Date.now()}-${slugify(songTitle)}`;
        const lrcFile = new File([buildLrc()], `${id}.lrc`, { type: "text/plain" });
        const lrcBlob = await upload(`karaoke/${id}.lrc`, lrcFile, { access: "public", handleUploadUrl: "/api/songs/upload" });
        const meta = { id, title: songTitle, artist: songArtist, lrcUrl: lrcBlob.url, vocalsUrl: null, youtubeId: videoId, createdAt: new Date().toISOString() };
        const metaFile = new File([JSON.stringify(meta)], `${id}.meta.txt`, { type: "text/plain" });
        await upload(`karaoke/${id}.meta.txt`, metaFile, { access: "public", handleUploadUrl: "/api/songs/upload" });
      }
      setSaved(true);
    } catch (e) {
      alert(`Erreur sauvegarde : ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const tappedCount = lines.filter((l) => l.time !== null).length;

  // ─── Étape configuration ──────────────────────────────────────────────────
  if (step === "setup") {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="p-5 max-w-2xl mx-auto w-full space-y-4">
          <div className="flex items-center gap-3">
            {onBack && <button onClick={onBack} className="text-sm text-white/60 hover:text-white transition-colors"><ArrowLeft size={15} />Retour</button>}
            <h2 className="text-lg font-bold text-white">Synchroniser sur la vidéo</h2>
          </div>

          <div className="flex gap-3">
            <input className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-400" placeholder="Titre" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
            <input className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-400" placeholder="Artiste" value={songArtist} onChange={(e) => setSongArtist(e.target.value)} />
          </div>

          {!videoId ? (
            <div className="flex gap-2">
              <input value={ytPaste} onChange={(e) => setYtPaste(e.target.value)} placeholder="Lien YouTube" className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-400" />
              <button onClick={() => { const id = extractYtId(ytPaste); if (id) setVideoId(id); }} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-all active:scale-95 shrink-0">OK</button>
            </div>
          ) : (
            <div className="text-xs text-green-400">Check Vidéo YouTube prête</div>
          )}

          <div>
            <label className="text-xs text-white/40 mb-1 block">Paroles (une ligne par ligne chantée)</label>
            <textarea
              className="w-full h-56 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-violet-400 font-mono leading-6"
              placeholder={"Première ligne\nDeuxième ligne\n…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-white/30 mt-1">{text.split("\n").filter((l) => l.trim()).length} ligne(s)</p>
          </div>

          <button
            onClick={start}
            disabled={!videoId || text.trim().length === 0}
            className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-30 transition-all active:scale-95"
          >
            Commencer la synchronisation
          </button>
        </div>
      </div>
    );
  }

  // ─── Étape tap ────────────────────────────────────────────────────────────
  if (step === "tap") {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-4 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs text-white/50">
          <span><kbd className="bg-white/15 px-1.5 py-0.5 rounded font-mono">Espace</kbd> = ligne suivante · <kbd className="bg-white/15 px-1.5 py-0.5 rounded font-mono">⌫</kbd> = annuler</span>
          <span className="flex items-center gap-2">
            Latence
            <input type="range" min={0} max={400} step={10} value={latencyMs} onChange={(e) => setLatencyMs(parseInt(e.target.value))} className="w-16 accent-violet-400" />
            <span className="font-mono w-10 text-violet-300">{latencyMs}</span>
          </span>
          <span className="font-mono text-violet-300">{tappedCount}/{lines.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {lines.map((l, i) => (
            <div
              key={i}
              ref={i === currentIdx ? activeRef : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                i === currentIdx ? "bg-violet-900/50 border border-violet-500 text-white scale-[1.02]" : l.time !== null ? "text-green-400" : "text-white/40"
              }`}
            >
              <span className="inline-block w-16 font-mono text-xs text-white/40">{l.time !== null ? toTimestamp(l.time) : ":"}</span>
              {l.text}
            </div>
          ))}
          <div className="h-24" />
        </div>

        <div className="shrink-0 border-t border-white/10 p-3 space-y-3" style={{ background: "rgba(10,5,30,0.65)", backdropFilter: "blur(20px)" }}>
          <div className="mx-auto max-w-sm aspect-video rounded-lg overflow-hidden">
            <div id="yt-sync-player" className="w-full h-full" />
          </div>
          <div className="flex items-center gap-3 justify-center">
            <button onClick={undo} disabled={currentIdx === 0} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-all disabled:opacity-30">Annuler</button>
            <button onClick={tap} className="flex-1 max-w-xs py-3 rounded-xl font-bold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 active:scale-95 transition-all">TAP : Espace</button>
            <button onClick={() => setStep("done")} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-all">Terminer</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Étape terminée ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-5 max-w-2xl mx-auto w-full space-y-4">
        <h2 className="text-xl font-bold text-white text-center">Synchronisation terminée</h2>
        <p className="text-sm text-white/50 text-center">{tappedCount} ligne(s) synchronisée(s)</p>
        <pre className="bg-black/30 rounded-xl p-4 font-mono text-xs text-white/70 max-h-56 overflow-y-auto whitespace-pre-wrap">{buildLrc()}</pre>
        <div className="flex gap-2">
          <button onClick={saveToLibrary} disabled={saving || saved} className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 transition-all active:scale-95 flex items-center justify-center gap-2">
            {saved ? (
              <>
                <Check size={16} /> Sauvegardé
              </>
            ) : saving ? (
              "Sauvegarde…"
            ) : (
              "Sauvegarder dans la bibliothèque"
            )}
          </button>
          <button onClick={downloadLrc} className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5"><Download size={16} /> .lrc</button>
        </div>
        <button onClick={() => { setStep("setup"); setSaved(false); }} className="w-full text-sm text-white/40 hover:text-white/70 transition-colors flex items-center justify-center gap-1.5"><ArrowLeft size={15} />Recommencer</button>
      </div>
    </div>
  );
}
