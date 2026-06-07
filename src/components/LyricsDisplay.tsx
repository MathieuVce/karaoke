"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentWordIndex, type LrcLine } from "@/lib/lrc-parser";

interface Props {
  lines: LrcLine[];
  activeIndex: number;
  currentTime: number;
  hasWordTimestamps: boolean;
  onClickLine: (time: number) => void;
}

// Returns how many seconds until the next line starts (for anticipation glow)
function timeUntilNext(lines: LrcLine[], activeIndex: number, currentTime: number): number {
  const next = lines[activeIndex + 1];
  if (!next) return Infinity;
  return next.time - currentTime;
}

// Font size that fills ~90% of viewport width for the given text, clamped to min/max
function dynSize(text: string, maxVw: number, minRem: number, maxRem: number): string {
  const len = Math.max(text.replace(/\s/g, "").length, 1);
  // Each character ≈ 0.55 × fontSize wide; solve for fontSize to fill 90vw:
  // fontSize * 0.55 * len = 90vw  →  fontSize = 90/(0.55*len) vw ≈ 163/len vw
  const vw = Math.min(163 / len, maxVw);
  return `clamp(${minRem}rem, ${vw.toFixed(2)}vw, ${maxRem}rem)`;
}

export default function LyricsDisplay({ lines, activeIndex, currentTime, hasWordTimestamps, onClickLine }: Props) {
  const [displayIndex, setDisplayIndex] = useState(activeIndex);
  const [transitioning, setTransitioning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth transition when active line changes
  useEffect(() => {
    if (activeIndex === displayIndex) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTransitioning(true);
    timeoutRef.current = setTimeout(() => {
      setDisplayIndex(activeIndex);
      setTransitioning(false);
    }, 120);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [activeIndex, displayIndex]);

  const until = timeUntilNext(lines, activeIndex, currentTime);
  // Next line "glows in" when < 2s away
  const nextGlow = until < 2 ? Math.max(0, 1 - until / 2) : 0;

  const prev = lines[displayIndex - 1] ?? null;
  const curr = lines[displayIndex] ?? null;
  const next = lines[displayIndex + 1] ?? null;
  const afterNext = lines[displayIndex + 2] ?? null;

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <p className="text-white/40 text-lg">Chargez un fichier .lrc</p>
        <p className="text-white/20 text-sm">ou créez-en un dans l&apos;onglet Créer</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center h-full gap-6 px-8 transition-opacity duration-100 ${transitioning ? "opacity-80" : "opacity-100"}`}>

      {/* Previous line — clairement passée : violet atténué */}
      <div
        className="text-center cursor-pointer transition-all duration-500 w-full px-6"
        style={{ opacity: prev ? 0.45 : 0 }}
        onClick={() => prev && onClickLine(prev.time)}
      >
        <span style={{ fontSize: dynSize(prev?.text ?? "x", 5, 0.9, 2.2), lineHeight: 1.4, fontWeight: 600, color: "#a78bfa" }}>
          {prev?.text ?? ""}
        </span>
      </div>

      {/* Current line — grande, pleine largeur, mots surlignés */}
      <div
        className="text-center cursor-pointer w-full px-4"
        onClick={() => curr && onClickLine(curr.time)}
      >
        {curr ? (
          hasWordTimestamps && curr.words && curr.words.length > 0 ? (
            <WordLine words={curr.words} currentTime={currentTime} text={curr.text} />
          ) : (
            <span
              className="font-extrabold"
              style={{
                fontSize: dynSize(curr.text || "x", 12, 1.6, 7),
                lineHeight: 1.2,
                letterSpacing: "0.01em",
                background: "linear-gradient(90deg, #ffffff 0%, #f0abfc 50%, #ffffff 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter: "drop-shadow(0 0 28px rgba(216,180,254,0.55))",
              }}
            >
              {curr.text || "♪"}
            </span>
          )
        ) : null}
      </div>

      {/* Next line — clairement à venir : blanc pur, s'illumine à l'approche */}
      <div
        className="text-center cursor-pointer transition-all duration-700 w-full px-5"
        style={{
          opacity: next ? 0.55 + nextGlow * 0.35 : 0,
          filter: nextGlow > 0.3 ? `drop-shadow(0 0 16px rgba(255,255,255,${(nextGlow * 0.35).toFixed(2)}))` : "none",
        }}
        onClick={() => next && onClickLine(next.time)}
      >
        <span style={{ fontSize: dynSize(next?.text ?? "x", 8, 1.1, 4), lineHeight: 1.4, fontWeight: 700, color: `rgba(255,255,255,${0.75 + nextGlow * 0.25})` }}>
          {next?.text ?? ""}
        </span>
      </div>

      {/* Ligne d'après — hint grisé */}
      <div
        className="text-center cursor-pointer transition-all duration-500 w-full px-8"
        style={{ opacity: afterNext ? 0.22 : 0 }}
        onClick={() => afterNext && onClickLine(afterNext.time)}
      >
        <span style={{ fontSize: dynSize(afterNext?.text ?? "x", 5, 0.8, 1.8), lineHeight: 1.4, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>
          {afterNext?.text ?? ""}
        </span>
      </div>
    </div>
  );
}

function WordLine({ words, currentTime, text }: { words: { time: number; text: string }[]; currentTime: number; text: string }) {
  const activeWordIndex = getCurrentWordIndex(words, currentTime);

  return (
    <span style={{ fontSize: dynSize(text || "x", 12, 1.6, 7), fontWeight: 800, lineHeight: 1.2, letterSpacing: "0.01em" }}>
      {words.map((word, wi) => {
        const isActive = wi === activeWordIndex;
        const isPast = wi < activeWordIndex;

        return (
          <span
            key={wi}
            style={{
              display: "inline",
              transition: "color 0.08s ease, filter 0.12s ease",
              // Passé : violet vif bien visible — clairement "chanté"
              // Actif  : gradient éclatant blanc→mauve→orange
              // À venir : gris foncé — clairement "pas encore"
              color: isActive ? "transparent" : isPast ? "#c084fc" : "rgba(255,255,255,0.22)",
              background: isActive ? "linear-gradient(90deg, #ffffff, #f0abfc, #fb923c)" : undefined,
              WebkitBackgroundClip: isActive ? "text" : undefined,
              backgroundClip: isActive ? "text" : undefined,
              filter: isActive
                ? "drop-shadow(0 0 22px rgba(251,146,60,0.65))"
                : isPast
                ? "drop-shadow(0 0 8px rgba(192,132,252,0.5))"
                : "none",
            }}
          >
            {word.text}
          </span>
        );
      })}
    </span>
  );
}
