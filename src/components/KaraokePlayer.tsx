"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { parseLrc, getCurrentLineIndex, type LrcData } from "@/lib/lrc-parser";
import LrcCreator from "./LrcCreator";
import LrcEditor from "./LrcEditor";
import LyricsDisplay from "./LyricsDisplay";
import SongLibrary from "./SongLibrary";

const DEMO_LRC = `[ti:Démo Karaoké]
[ar:Artiste]
[00:02.00]<00:02.00>Bienvenue <00:02.60>dans <00:03.00>votre <00:03.50>lecteur <00:04.10>karaoké
[00:05.50]<00:05.50>Glissez <00:06.10>votre <00:06.50>MP3 <00:07.00>et <00:07.30>votre <00:07.80>fichier <00:08.30>LRC <00:08.70>ici
[00:09.80]<00:09.80>Ou <00:10.10>utilisez <00:10.70>l'onglet <00:11.20>Créer <00:11.80>pour <00:12.20>synchroniser <00:13.00>vos <00:13.40>paroles
[00:14.50]<00:14.50>Chaque <00:15.10>mot <00:15.50>s'illumine <00:16.20>au <00:16.50>bon <00:16.90>moment
[00:18.00]<00:18.00>Utilisez <00:18.80>l'onglet <00:19.40>Éditer <00:20.00>pour <00:20.50>corriger <00:21.10>les <00:21.50>timestamps
[00:22.50]<00:22.50>Profitez <00:23.30>du <00:23.70>karaoké`;

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type Mode = "player" | "library" | "creator" | "editor";

export default function KaraokePlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const [mode, setMode] = useState<Mode>("player");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string>("");
  const [lrcData, setLrcData] = useState<LrcData>(() => parseLrc(DEMO_LRC));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dragging, setDragging] = useState(false);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (playing) animFrameRef.current = requestAnimationFrame(tick);
    else cancelAnimationFrame(animFrameRef.current);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, tick]);

  useEffect(() => {
    const idx = getCurrentLineIndex(lrcData.lines, currentTime);
    if (idx !== activeIndex) setActiveIndex(idx);
  }, [currentTime, lrcData.lines, activeIndex]);

  const handleAudioFile = (file: File) => {
    if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setAudioName(file.name.replace(/\.[^.]+$/, ""));
    setCurrentTime(0);
    setPlaying(false);
  };

  const loadSongFromServer = async (remoteAudioUrl: string, name: string, lrcUrl: string | null) => {
    if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    setAudioUrl(remoteAudioUrl);
    setAudioName(name);
    setCurrentTime(0);
    setPlaying(false);
    if (lrcUrl) {
      try {
        const text = await fetch(lrcUrl).then((r) => r.text());
        setLrcData(parseLrc(text));
        setActiveIndex(-1);
      } catch { /* ignore */ }
    } else {
      setLrcData(parseLrc(""));
    }
    setMode("player");
  };

  const handleLrcFile = async (file: File) => {
    const text = await file.text();
    setLrcData(parseLrc(text));
    setActiveIndex(-1);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith("audio/") || file.name.endsWith(".mp3")) handleAudioFile(file);
      else if (file.name.endsWith(".lrc")) handleLrcFile(file);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { audio.play(); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const tabs: { key: Mode; label: string }[] = [
    { key: "player", label: "Lecteur" },
    { key: "library", label: "Bibliothèque" },
    { key: "creator", label: "Créer" },
    { key: "editor", label: "Éditer" },
  ];

  return (
    <div
      className="h-screen flex flex-col text-white overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1a0533 0%, #2d0a5e 25%, #1e1060 50%, #0f2060 75%, #0a1a4a 100%)" }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* Warm background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: "absolute", top: "10%", left: "15%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", top: "30%", right: "10%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.14) 0%, transparent 70%)", filter: "blur(50px)" }} />
        <div style={{ position: "absolute", bottom: "20%", left: "30%", width: 500, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", top: "60%", right: "30%", width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, rgba(251,146,60,0.10) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>

      {dragging && (
        <div className="fixed inset-0 z-50 bg-purple-900/60 border-4 border-dashed border-purple-400 flex items-center justify-center text-2xl font-bold pointer-events-none">
          Déposer MP3 ou LRC ici
        </div>
      )}

      <header className="shrink-0 px-5 pt-4 pb-0 flex items-center gap-3 border-b border-white/10 relative z-10">
        <div className="text-2xl font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent shrink-0">
          Karaoké
        </div>

        <div className="flex gap-1 ml-2">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                mode === key
                  ? "border-violet-400 text-white bg-white/10"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "player" && (
          <div className="ml-auto flex items-center gap-3">
            {(lrcData.title || audioName) && (
              <div className="flex flex-col leading-tight text-right">
                <span className="font-semibold text-sm">{lrcData.title || audioName}</span>
                {lrcData.artist && <span className="text-gray-400 text-xs">{lrcData.artist}</span>}
              </div>
            )}
            <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(139,92,246,0.4)", border: "1px solid rgba(139,92,246,0.5)" }}>
              + MP3
              <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && handleAudioFile(e.target.files[0])} />
            </label>
            <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              + LRC
              <input type="file" accept=".lrc,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && handleLrcFile(e.target.files[0])} />
            </label>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-hidden relative z-10">
        {mode === "library" && (
          <div className="h-full">
            <SongLibrary onLoadSong={loadSongFromServer} />
          </div>
        )}

        {mode === "creator" && (
          <div className="h-full overflow-y-auto">
            <LrcCreator audioUrl={audioUrl} audioName={audioName} onLoadAudio={handleAudioFile} />
          </div>
        )}

        {mode === "editor" && (
          <div className="h-full">
            <LrcEditor audioUrl={audioUrl} audioName={audioName} onLoadAudio={handleAudioFile} />
          </div>
        )}

        {mode === "player" && (
          <div className="flex flex-col h-full">
            <div
              ref={lyricsRef}
              className="flex-1 px-4"
            >
              <LyricsDisplay
                lines={lrcData.lines}
                activeIndex={activeIndex}
                currentTime={currentTime}
                hasWordTimestamps={lrcData.hasWordTimestamps}
                onClickLine={(time) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = time;
                    setCurrentTime(time);
                    if (audioRef.current.paused) { audioRef.current.play(); setPlaying(true); }
                  }
                }}
              />
            </div>

            <div className="shrink-0 px-6 py-4 space-y-3" style={{ background: "rgba(10,5,30,0.65)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-3 text-xs text-white/50 font-mono">
                <span className="w-10 text-right">{formatTime(currentTime)}</span>
                <div className="relative flex-1 h-1.5">
                  <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
                  <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-violet-400 to-pink-400 rounded-full" style={{ width: `${progressPct}%` }} />
                  <input type="range" min={0} max={duration || 0} step={0.1} value={currentTime} onChange={seek} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <span className="w-10">{formatTime(duration)}</span>
              </div>

              <div className="flex items-center justify-center gap-6">
                <div className="flex items-center gap-2 text-white/40">
                  <span className="text-xs font-medium">{volume === 0 ? "0%" : `${Math.round(volume * 100)}%`}</span>
                  <input type="range" min={0} max={1} step={0.02} value={volume} onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }} className="w-20 accent-purple-400" />
                </div>

                <button onClick={() => { if (audioRef.current) { const t = Math.max(0, currentTime - 10); audioRef.current.currentTime = t; setCurrentTime(t); } }} className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center text-xs font-bold shadow-md shadow-purple-900/30 transition-all active:scale-95">
                  −10s
                </button>

                <button onClick={togglePlay} disabled={!audioUrl} className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 flex items-center justify-center text-2xl shadow-lg shadow-purple-900/40 transition-all active:scale-95 disabled:opacity-30">
                  {playing ? "II" : "▶"}
                </button>

                <button onClick={() => { if (audioRef.current) { const t = Math.min(duration, currentTime + 10); audioRef.current.currentTime = t; setCurrentTime(t); } }} className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center text-xs font-bold shadow-md shadow-purple-900/30 transition-all active:scale-95">
                  +10s
                </button>

                <div className="w-28" />
              </div>

              {!audioUrl && (
                <p className="text-center text-xs text-white/30">
                  Glissez un MP3 ici · créez les paroles dans <strong className="text-white/50">Créer</strong> · ajustez-les dans <strong className="text-white/50">Éditer</strong>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />
    </div>
  );
}
