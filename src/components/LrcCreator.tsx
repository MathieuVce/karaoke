"use client";

import { useRef, useState, useEffect } from "react";
import { Pause, Play } from "lucide-react";
import { buildEnhancedLrc } from "@/lib/lrc-parser";
import { stripEmojis, shouldSkipWord } from "@/lib/text-utils";

function formatDisplay(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface TapWord {
  display: string;
  raw: string;
  lineIndex: number;
  time: number | null;
  skip: boolean;
}

interface Props {
  audioUrl: string | null;
  audioName: string;
  onLoadAudio: (file: File) => void;
}

type Step = "lyrics" | "tap" | "done";

const DEFAULT_LATENCY_MS = 150;

export default function LrcCreator({ audioUrl, audioName, onLoadAudio }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animRef = useRef<number>(0);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  const [step, setStep] = useState<Step>("lyrics");
  const [rawLyrics, setRawLyrics] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [tapWords, setTapWords] = useState<TapWord[]>([]);
  const [lineTexts, setLineTexts] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [latencyMs, setLatencyMs] = useState(DEFAULT_LATENCY_MS);

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(animRef.current); return; }
    const loop = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing]);

  const tap = () => {
    const a = audioRef.current;
    if (!a) return;
    const t = Math.max(0, a.currentTime - latencyMs / 1000);
    let nextIdx = currentIdx + 1;
    const updated = [...tapWords];
    updated[currentIdx] = { ...updated[currentIdx], time: t };
    while (nextIdx < updated.length && updated[nextIdx].skip) {
      updated[nextIdx] = { ...updated[nextIdx], time: t };
      nextIdx++;
    }
    setTapWords(updated);
    setCurrentIdx(nextIdx);
    if (nextIdx >= updated.length) setStep("done");
  };

  const undoTap = () => {
    let idx = currentIdx - 1;
    while (idx > 0 && tapWords[idx]?.skip) idx--;
    idx = Math.max(0, idx);
    setTapWords((ws) => {
      const next = [...ws];
      for (let i = idx; i < next.length; i++) next[i] = { ...next[i], time: null };
      return next;
    });
    setCurrentIdx(idx);
  };

  useEffect(() => {
    if (step !== "tap") return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); tap(); }
      if (e.code === "Backspace") { e.preventDefault(); undoTap(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentIdx, currentTime, latencyMs]);

  useEffect(() => {
    activeWordRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIdx]);

  const buildTapWords = (lines: string[]): TapWord[] => {
    const words: TapWord[] = [];
    lines.forEach((line, li) => {
      const parts = line.split(" ");
      parts.forEach((word, wi) => {
        if (!word) return;
        const raw = wi < parts.length - 1 ? word + " " : word;
        words.push({ display: stripEmojis(word), raw, lineIndex: li, time: null, skip: shouldSkipWord(word) });
      });
    });
    return words;
  };

  const startTapping = () => {
    const lines = rawLyrics.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;
    setLineTexts(lines);
    const words = buildTapWords(lines);
    setTapWords(words);
    const firstTappable = words.findIndex((w) => !w.skip);
    setCurrentIdx(firstTappable >= 0 ? firstTappable : 0);
    setStep("tap");
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };


  const buildOutput = () => {
    const grouped: { text: string; words: { time: number; text: string }[] }[] = lineTexts.map((t) => ({ text: t, words: [] }));
    for (const tw of tapWords) {
      if (tw.time !== null) grouped[tw.lineIndex].words.push({ time: tw.time, text: tw.raw });
    }
    return buildEnhancedLrc(grouped, title || audioName || undefined, artist || undefined);
  };

  const downloadLrc = () => {
    const content = buildOutput();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || audioName || "karaoke"}.lrc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const tappedCount = tapWords.filter((w) => w.time !== null && !w.skip).length;
  const totalTappable = tapWords.filter((w) => !w.skip).length;

  const wordsByLine: { lineIdx: number; words: (TapWord & { globalIdx: number })[] }[] = [];
  tapWords.forEach((w, gi) => {
    if (!wordsByLine[w.lineIndex]) wordsByLine[w.lineIndex] = { lineIdx: w.lineIndex, words: [] };
    wordsByLine[w.lineIndex].words.push({ ...w, globalIdx: gi });
  });

  const wordCount = rawLyrics.split(/\s+/).filter((w) => {
    const c = stripEmojis(w).trim();
    return c && !shouldSkipWord(w);
  }).length;

  return (
    <div className="flex flex-col h-full">
      {step === "lyrics" && (
        <div className="flex flex-col gap-5 p-6 max-w-2xl mx-auto w-full">
          <h2 className="text-xl font-bold text-white">Vos paroles</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Titre</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" placeholder="Ma chanson" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Artiste</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" placeholder="Nom artiste" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Paroles: une ligne par phrase chantée</label>
            <textarea
              className="w-full h-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-purple-500 font-mono leading-6"
              placeholder={"Première ligne\nDeuxième ligne\n\nRefrain\nEncore le refrain"}
              value={rawLyrics}
              onChange={(e) => setRawLyrics(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              {rawLyrics.split("\n").filter((l) => l.trim()).length} ligne(s) · {wordCount} mot(s) à synchroniser
            </p>
          </div>

          {!audioUrl ? (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-600 rounded-xl py-5 cursor-pointer hover:border-purple-500 transition-colors text-gray-400 hover:text-purple-300 text-sm">
              Charger votre MP3
              <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && onLoadAudio(e.target.files[0])} />
            </label>
          ) : (
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm text-green-400">
              <span>Check {audioName || "Audio chargé"}</span>
              <label className="text-xs text-gray-400 hover:text-gray-200 cursor-pointer transition-colors">
                changer
                <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && onLoadAudio(e.target.files[0])} />
              </label>
            </div>
          )}

          <button
            onClick={startTapping}
            disabled={!audioUrl || rawLyrics.trim().length === 0}
            className="w-full py-3 rounded-xl font-bold text-base bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            Synchroniser mot par mot
          </button>
        </div>
      )}

      {step === "tap" && (
        <div className="flex flex-col h-full">
          <div className="shrink-0 px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">Espace</kbd> = mot suivant ·{" "}
              <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">⌫</kbd> = annuler
            </span>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Latence</span>
              <input type="range" min={0} max={400} step={10} value={latencyMs} onChange={(e) => setLatencyMs(parseInt(e.target.value))} className="w-20 accent-purple-500" />
              <span className="font-mono w-12 text-purple-300">{latencyMs} ms</span>
            </div>
            <span className="font-mono text-xs text-purple-300">{tappedCount}/{totalTappable}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {wordsByLine.map((lineGroup) => {
              const lineActive = lineGroup.words.some((w) => w.globalIdx === currentIdx);
              const lineAllDone = lineGroup.words.every((w) => w.time !== null);
              return (
                <div key={lineGroup.lineIdx} className={`transition-all duration-300 ${lineAllDone ? "opacity-35" : lineActive ? "opacity-100" : "opacity-45"}`}>
                  <div className="flex flex-wrap gap-y-1 leading-loose">
                    {lineGroup.words.map((w) => {
                      const isNext = w.globalIdx === currentIdx;
                      if (w.skip) return <span key={w.globalIdx} className="px-0.5 text-sm text-gray-600 italic">{w.raw}</span>;
                      return (
                        <span
                          key={w.globalIdx}
                          ref={isNext ? activeWordRef : undefined}
                          className={`px-1 py-0.5 rounded text-sm font-medium transition-all duration-100 ${isNext ? "ring-2 ring-purple-400 bg-purple-900/50 text-white scale-110 inline-block" : w.time !== null ? "text-green-400" : "text-gray-400"}`}
                        >
                          {w.display}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="h-24" />
          </div>

          <div className="shrink-0 bg-gray-900 border-t border-gray-800 px-5 py-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              <span className="w-10 text-right">{formatDisplay(currentTime)}</span>
              <div className="relative flex-1 h-1.5">
                <div className="absolute inset-0 bg-gray-700 rounded-full" />
                <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: `${progressPct}%` }} />
                <input type="range" min={0} max={duration || 0} step={0.05} value={currentTime} onChange={(e) => { const t = parseFloat(e.target.value); if (audioRef.current) audioRef.current.currentTime = t; setCurrentTime(t); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
              <span className="w-10">{formatDisplay(duration)}</span>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <button onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, currentTime - 3); }} className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center text-xs font-bold shadow-md shadow-purple-900/30 transition-all active:scale-95">−3s</button>
              <button onClick={togglePlay} className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 flex items-center justify-center shadow-lg shadow-purple-900/40 transition-all active:scale-95">
                {playing ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white" fill="white" />}
              </button>
              <button onClick={tap} className="flex-1 max-w-xs py-3 rounded-xl font-bold text-base bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-95 transition-all shadow-lg shadow-purple-900/40">TAP Espace</button>
              <button onClick={undoTap} disabled={currentIdx === 0} className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center text-xs font-bold shadow-md shadow-purple-900/30 transition-all active:scale-95 disabled:opacity-30">Annuler</button>
              <button onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, currentTime + 3); }} className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center text-xs font-bold shadow-md shadow-purple-900/30 transition-all active:scale-95">+3s</button>
            </div>
            <button onClick={() => setStep("done")} className="w-full py-1 rounded text-xs text-gray-600 hover:text-gray-400 transition-colors">Terminer ({tappedCount}/{totalTappable} mots)</button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-5 p-6 max-w-2xl mx-auto w-full">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">Terminé !</h2>
            <p className="text-gray-400 text-sm mt-1">{tappedCount} mot(s) synchronisé(s)</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-gray-300 max-h-44 overflow-y-auto border border-gray-800 leading-relaxed">{buildOutput()}</div>
          <button onClick={downloadLrc} className="w-full py-3 rounded-xl font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-95 transition-all">Télécharger le fichier .lrc</button>
          <p className="text-center text-sm text-gray-400">Retournez en <strong>Lecteur</strong> · chargez votre MP3 + ce fichier .lrc</p>
          <button onClick={() => { setStep("lyrics"); setCurrentIdx(0); setTapWords([]); }} className="text-sm text-gray-500 hover:text-gray-300 transition-colors text-center">Recommencer</button>
        </div>
      )}

      <audio ref={audioRef} src={audioUrl ?? undefined} onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)} onEnded={() => setPlaying(false)} preload="metadata" />
    </div>
  );
}
