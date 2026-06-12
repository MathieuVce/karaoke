"use client";

import { useState, useRef, useEffect } from "react";
import { Pause, Play, ArrowLeft, RotateCcw } from "lucide-react";
import { parseLrc } from "@/lib/lrc-parser";
import { extractYtId } from "@/lib/youtube";
import LyricsDisplay from "./LyricsDisplay";
import YoutubeSync from "./YoutubeSync";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface Props {
  lrc: string;
  title: string;
  artist: string;
  initialVideoId?: string | null;
  onBack?: () => void;
  onSave?: (videoId: string) => void; // bouton Sauvegarder (a besoin de l'ID vidéo courant)
  saving?: boolean;
  // Remonte la progression (lecture, temps des paroles) pour l'écoute partagée
  onProgress?: (playing: boolean, lyricsTime: number) => void;
}

// Lecteur karaoké basé sur une vidéo YouTube : les paroles défilent
// calées sur getCurrentTime() de l'IFrame Player API.
export default function YoutubeKaraoke({ lrc, title, artist, initialVideoId = null, onBack, onSave, saving, onProgress }: Props) {
  const [videoId, setVideoId] = useState<string | null>(initialVideoId);
  const [ytPaste, setYtPaste] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [offset, setOffset] = useState(0); // décalage des paroles (s) pour recaler sur la vidéo
  const [frozen, setFrozen] = useState(false); // paroles gelées (la musique continue)
  const [resyncing, setResyncing] = useState(false);
  const frozenDisplayRef = useRef(0);
  const lrcData = useRef(parseLrc(lrc)).current;

  // Temps des paroles : normalement le temps vidéo moins le décalage ; gelé si on fige
  const displayTime = frozen ? frozenDisplayRef.current : currentTime - offset;

  // Refs pour que la boucle d'animation accède aux valeurs courantes (sans se recréer)
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const frozenRef = useRef(frozen); frozenRef.current = frozen;
  const onProgressRef = useRef(onProgress); onProgressRef.current = onProgress;

  const toggleFreeze = () => {
    if (!frozen) {
      frozenDisplayRef.current = currentTime - offset; // fige la position courante des paroles
      setFrozen(true);
    } else {
      // reprise : ajuste le décalage pour repartir d'où les paroles étaient gelées
      setOffset(currentTime - frozenDisplayRef.current);
      setFrozen(false);
    }
  };

  // Appui maintenu sur −/+ : décale, en accélérant tant qu'on reste appuyé
  const holdTimer = useRef<number | null>(null);
  const nudge = (dir: number, step: number) => setOffset((o) => Math.round((o + dir * step) * 10) / 10);
  const startHold = (dir: number) => {
    nudge(dir, 0.1); // pas immédiat au tap
    const t0 = Date.now();
    const tick = () => {
      const held = (Date.now() - t0) / 1000;
      const step = held < 0.8 ? 0.1 : held < 1.8 ? 0.3 : held < 3 ? 0.6 : 1;
      nudge(dir, step);
      holdTimer.current = window.setTimeout(tick, held < 1.8 ? 110 : 70);
    };
    holdTimer.current = window.setTimeout(tick, 350); // délai avant la répétition
  };
  const stopHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } };
  useEffect(() => () => stopHold(), []);

  const playerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);

  // Charge l'API IFrame YouTube une fois
  useEffect(() => {
    if (window.YT?.Player) return;
    if (document.getElementById("yt-iframe-api")) return;
    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // (Re)crée le player quand videoId change
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    const create = () => {
      if (cancelled) return;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = new window.YT.Player("yt-player", {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: { playsinline: 1, modestbranding: 1, rel: 0 },
      });
    };
    if (window.YT?.Player) create();
    else window.onYouTubeIframeAPIReady = create;
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  }, [videoId]);

  // Synchro : lit le temps du player en continu
  useEffect(() => {
    const loop = () => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        const t = p.getCurrentTime() || 0;
        setCurrentTime(t);
        // Remonte la progression pour l'écoute partagée (temps des paroles + lecture)
        if (onProgressRef.current) {
          const lyricsTime = frozenRef.current ? frozenDisplayRef.current : t - offsetRef.current;
          const playing = p.getPlayerState ? p.getPlayerState() === 1 : false;
          onProgressRef.current(playing, lyricsTime);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoId]);

  // Mode resynchronisation : re-tape chaque ligne contre cette vidéo précise
  // (gère les clips avec coupures, là où un décalage global ne suffit pas)
  if (resyncing) {
    return (
      <YoutubeSync
        initialVideoId={videoId}
        initialText={lrcData.lines.map((l) => l.text).join("\n")}
        title={title}
        artist={artist}
        onBack={() => setResyncing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-white/10">
        {onBack && <button onClick={onBack} className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1"><ArrowLeft size={15} />Retour</button>}
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="text-xs text-white/40 truncate">{artist}</div>
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-2">
          {videoId && lrcData.lines.length > 0 && (
            <button
              onClick={() => setResyncing(true)}
              title="Re-caler chaque ligne sur cette vidéo (clips avec coupures)"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 transition-all active:scale-95 whitespace-nowrap"
            >
              Resynchroniser
            </button>
          )}
          {onSave && (
            <button
              onClick={() => videoId && onSave(videoId)}
              disabled={!videoId || saving}
              title={!videoId ? "Charge d'abord une vidéo YouTube" : "Sauvegarder dans la bibliothèque"}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 transition-all active:scale-95 disabled:opacity-40"
            >
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4">
        <LyricsDisplay
          lines={lrcData.lines}
          currentTime={displayTime}
          hasWordTimestamps={lrcData.hasWordTimestamps}
          onClickLine={(t) => { try { playerRef.current?.seekTo(t + offset, true); } catch { /* ignore */ } }}
        />
      </div>

      <div className="shrink-0 border-t border-white/10 p-3 space-y-2" style={{ background: "rgba(10,5,30,0.65)", backdropFilter: "blur(20px)" }}>
        {videoId && (
          <div className="mx-auto max-w-md flex items-center justify-center gap-3 mb-1">
            <button
              onClick={toggleFreeze}
              title="Gèle les paroles pendant que la musique continue, puis reprend pour les recaler"
              className={`px-4 h-10 rounded-full flex items-center gap-2 text-sm font-semibold shadow-lg transition-all active:scale-95 ${
                frozen
                  ? "bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-900/40"
                  : "bg-gradient-to-br from-violet-500 to-pink-500 shadow-purple-900/40"
              }`}
            >
              {frozen ? (
                <><Play size={16} /> Reprendre les paroles</>
              ) : (
                <><Pause size={16} /> Geler les paroles</>
              )}
            </button>
          </div>
        )}
        {videoId && (
          <div className="mx-auto max-w-md flex items-center justify-center gap-2 text-xs">
            <span className="text-white/40">Paroles</span>
            <button
              onPointerDown={(e) => { e.preventDefault(); startHold(-1); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              title="Avancer les paroles (maintenir pour accélérer)"
              className="w-10 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-base font-bold transition-colors active:scale-95 select-none touch-none"
            >
              −
            </button>
            <span className="font-mono w-14 text-center tabular-nums text-violet-300 font-semibold text-sm">{offset > 0 ? "+" : ""}{offset.toFixed(1)}s</span>
            <button
              onPointerDown={(e) => { e.preventDefault(); startHold(1); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              title="Retarder les paroles (maintenir pour accélérer)"
              className="w-10 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-base font-bold transition-colors active:scale-95 select-none touch-none"
            >
              +
            </button>
            <button
              onClick={() => setOffset(0)}
              disabled={offset === 0}
              className="ml-1 px-3 h-9 rounded-lg bg-white/15 hover:bg-white/25 text-white/90 font-medium transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        )}
        {videoId ? (
          <div className="mx-auto max-w-md aspect-video rounded-lg overflow-hidden">
            <div id="yt-player" className="w-full h-full" />
          </div>
        ) : (
          <div className="mx-auto max-w-md space-y-2">
            <p className="text-xs text-white/50 text-center">Colle un lien YouTube pour la musique :</p>
            <div className="flex gap-2">
              <input
                value={ytPaste}
                onChange={(e) => setYtPaste(e.target.value)}
                placeholder="https://youtube.com/watch?v=…"
                className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-400"
              />
              <button
                onClick={() => { const id = extractYtId(ytPaste); if (id) setVideoId(id); }}
                className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-sm font-semibold transition-all active:scale-95 shrink-0"
              >
                Charger
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
