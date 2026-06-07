"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { parseLrc } from "@/lib/lrc-parser";

interface EditLine {
  id: number;
  timeS: number;
  text: string;
  words: { time: number; text: string }[] | null;
}

function toTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function parseTimestampInput(val: string): number | null {
  const m = /^(\d+):(\d{2})\.(\d{2,3})$/.exec(val.trim());
  if (!m) return null;
  const frac = m[3].length === 3 ? parseInt(m[3]) / 1000 : parseInt(m[3]) / 100;
  return parseInt(m[1]) * 60 + parseInt(m[2]) + frac;
}

function formatDisplay(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function buildLrcOutput(lines: EditLine[], title?: string, artist?: string): string {
  const parts: string[] = [];
  if (title) parts.push(`[ti:${title}]`);
  if (artist) parts.push(`[ar:${artist}]`);
  for (const line of lines) {
    if (line.words && line.words.length > 0) {
      const wordStr = line.words.map((w) => `<${toTimestamp(w.time)}>${w.text}`).join("");
      parts.push(`[${toTimestamp(line.timeS)}]${wordStr}`);
    } else {
      parts.push(`[${toTimestamp(line.timeS)}]${line.text}`);
    }
  }
  return parts.join("\n");
}

interface Props {
  audioUrl: string | null;
  audioName: string;
  onLoadAudio: (file: File) => void;
}

export default function LrcEditor({ audioUrl, audioName, onLoadAudio }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animRef = useRef<number>(0);

  const [lines, setLines] = useState<EditLine[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lrcLoaded, setLrcLoaded] = useState(false);
  // Track raw timestamp inputs per line (to allow free typing before parsing)
  const [tsInputs, setTsInputs] = useState<Record<number, string>>({});
  // Global offset apply
  const [offsetMs, setOffsetMs] = useState(0);

  const tick = useCallback(() => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (playing) animRef.current = requestAnimationFrame(tick);
    else cancelAnimationFrame(animRef.current);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, tick]);

  const loadLrcFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseLrc(text);
    setTitle(parsed.title ?? "");
    setArtist(parsed.artist ?? "");
    const editLines: EditLine[] = parsed.lines.map((l, i) => ({
      id: i,
      timeS: l.time,
      text: l.text,
      words: l.words ? l.words.map((w) => ({ time: w.time, text: w.text })) : null,
    }));
    setLines(editLines);
    setTsInputs(Object.fromEntries(editLines.map((l) => [l.id, toTimestamp(l.timeS)])));
    setLrcLoaded(true);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seekToLine = (timeS: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = timeS;
    setCurrentTime(timeS);
    if (a.paused) { a.play(); setPlaying(true); }
  };

  // Set line timestamp to current playback position and shift word timestamps by same delta
  const setLineToNow = (id: number) => {
    const a = audioRef.current;
    if (!a) return;
    const now = a.currentTime;
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const delta = now - l.timeS;
      const newWords = l.words
        ? l.words.map((w) => ({ ...w, time: Math.max(0, w.time + delta) }))
        : null;
      return { ...l, timeS: now, words: newWords };
    }));
    setTsInputs((prev) => ({ ...prev, [id]: toTimestamp(now) }));
  };

  const handleTsInput = (id: number, val: string) => {
    setTsInputs((prev) => ({ ...prev, [id]: val }));
  };

  const commitTsInput = (id: number) => {
    const val = tsInputs[id] ?? "";
    const parsed = parseTimestampInput(val);
    if (parsed === null) {
      // Reset to current value
      setTsInputs((prev) => ({ ...prev, [id]: toTimestamp(lines.find((l) => l.id === id)?.timeS ?? 0) }));
      return;
    }
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const delta = parsed - l.timeS;
      const newWords = l.words
        ? l.words.map((w) => ({ ...w, time: Math.max(0, w.time + delta) }))
        : null;
      return { ...l, timeS: parsed, words: newWords };
    }));
  };

  const handleTextChange = (id: number, val: string) => {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, text: val } : l));
  };

  const applyGlobalOffset = () => {
    if (offsetMs === 0) return;
    const delta = offsetMs / 1000;
    setLines((prev) => prev.map((l) => ({
      ...l,
      timeS: Math.max(0, l.timeS + delta),
      words: l.words ? l.words.map((w) => ({ ...w, time: Math.max(0, w.time + delta) })) : null,
    })));
    setTsInputs((prev) => {
      const next = { ...prev };
      lines.forEach((l) => { next[l.id] = toTimestamp(Math.max(0, l.timeS + delta)); });
      return next;
    });
    setOffsetMs(0);
  };

  const downloadLrc = () => {
    const content = buildLrcOutput(lines, title, artist);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || audioName || "karaoke"}_edit.lrc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: load files + audio controls */}
      <div className="shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-2 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-medium transition-colors">
            Charger .lrc
            <input type="file" accept=".lrc,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && loadLrcFile(e.target.files[0])} />
          </label>
          {!audioUrl ? (
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-xs font-medium transition-colors">
              Charger MP3
              <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && onLoadAudio(e.target.files[0])} />
            </label>
          ) : (
            <span className="text-xs text-green-400">✓ {audioName}</span>
          )}

          {lrcLoaded && (
            <>
              {/* Global offset */}
              <div className="flex items-center gap-2 ml-auto text-xs text-gray-400">
                <span>Décaler tout</span>
                <input
                  type="number" step={10} value={offsetMs}
                  onChange={(e) => setOffsetMs(parseInt(e.target.value) || 0)}
                  className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500 font-mono text-center"
                />
                <span>ms</span>
                <button onClick={applyGlobalOffset} className="px-3 py-1 rounded-lg bg-gradient-to-r from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 text-xs font-semibold transition-all active:scale-95">
                  Appliquer
                </button>
              </div>
              <button onClick={downloadLrc} className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-xs font-bold transition-all active:scale-95">
                Télécharger .lrc
              </button>
            </>
          )}
        </div>

        {/* Seekbar */}
        {audioUrl && (
          <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
            <span className="w-10 text-right">{formatDisplay(currentTime)}</span>
            <div className="relative flex-1 h-1.5">
              <div className="absolute inset-0 bg-gray-700 rounded-full" />
              <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: `${progressPct}%` }} />
              <input type="range" min={0} max={duration || 0} step={0.05} value={currentTime} onChange={(e) => { const t = parseFloat(e.target.value); if (audioRef.current) audioRef.current.currentTime = t; setCurrentTime(t); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
            <span className="w-10">{formatDisplay(duration)}</span>
            <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 flex items-center justify-center text-sm shadow-md shadow-purple-900/40 transition-all active:scale-95 ml-1">
              {playing ? "II" : "▶"}
            </button>
          </div>
        )}
      </div>

      {/* Lines list */}
      {!lrcLoaded ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500">
          <p className="text-sm">Chargez un fichier <strong className="text-gray-300">.lrc</strong> pour l&apos;éditer</p>
          <label className="cursor-pointer px-5 py-3 rounded-xl border-2 border-dashed border-gray-700 hover:border-purple-500 text-sm hover:text-purple-300 transition-colors">
            Ouvrir un fichier .lrc
            <input type="file" accept=".lrc,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && loadLrcFile(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Editable title/artist */}
          <div className="flex gap-3 px-4 pt-4 pb-2">
            <input className="flex-1 bg-gray-800/60 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-purple-500" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="flex-1 bg-gray-800/60 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-purple-500" placeholder="Artiste" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="px-4 py-1 text-left font-normal w-36">Timestamp</th>
                <th className="px-2 py-1 text-left font-normal">Paroles</th>
                <th className="px-4 py-1 text-right font-normal w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const isActive = currentTime >= line.timeS &&
                  (lines.indexOf(line) === lines.length - 1 || currentTime < lines[lines.indexOf(line) + 1].timeS);
                return (
                  <tr
                    key={line.id}
                    className={`border-b border-gray-800/50 transition-colors ${isActive ? "bg-purple-950/40" : "hover:bg-gray-800/30"}`}
                  >
                    <td className="px-4 py-1.5">
                      <input
                        className={`w-28 bg-gray-800 border rounded px-2 py-0.5 font-mono text-xs focus:outline-none transition-colors ${
                          isActive ? "border-purple-500 text-purple-200" : "border-gray-700 text-gray-300 focus:border-purple-500"
                        }`}
                        value={tsInputs[line.id] ?? toTimestamp(line.timeS)}
                        onChange={(e) => handleTsInput(line.id, e.target.value)}
                        onBlur={() => commitTsInput(line.id)}
                        onKeyDown={(e) => e.key === "Enter" && commitTsInput(line.id)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="w-full bg-transparent text-gray-200 text-sm focus:outline-none focus:bg-gray-800/60 rounded px-1 py-0.5 transition-colors"
                        value={line.text}
                        onChange={(e) => handleTextChange(line.id, e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-1.5">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => seekToLine(line.timeS)}
                          title="Écouter depuis ici"
                          className="px-2 py-1 rounded bg-gradient-to-r from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 text-xs font-medium transition-all active:scale-95"
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => setLineToNow(line.id)}
                          title="Mettre le timestamp à la position actuelle"
                          disabled={!audioUrl}
                          className="px-2 py-1 rounded bg-gradient-to-r from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 text-xs font-medium transition-all active:scale-95 disabled:opacity-30"
                        >
                          Ici
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="h-16" />
        </div>
      )}

      <audio ref={audioRef} src={audioUrl ?? undefined} onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)} onEnded={() => setPlaying(false)} preload="metadata" />
    </div>
  );
}
