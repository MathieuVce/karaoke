"use client";

import { useRef, useEffect } from "react";
import { type LrcLine } from "@/lib/lrc-parser";

interface Props {
  lines: LrcLine[];
  currentTime: number;
  hasWordTimestamps: boolean;
  onClickLine: (time: number) => void;
}

const SLOT_VH = 0.22;

// Échelle relative selon la distance au centre (0 = actif → 1.0)
// Indexé par distance : dist 0, 1, 2, 3+
const SCALE_LEVELS = [1.0, 0.74, 0.55, 0.4];
const OPACITY_LEVELS = [1, 0.55, 0.22, 0.1, 0.04];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function levelAt(arr: number[], d: number): number {
  const clamped = Math.min(Math.max(d, 0), arr.length - 1);
  const lo = Math.floor(clamped);
  const hi = Math.min(lo + 1, arr.length - 1);
  return lerp(arr[lo], arr[hi], clamped - lo);
}

// Distance effective avec PLATEAU : la ligne active (e ∈ [-1,0]) reste à distance 0
// → garde son zoom max toute sa durée. Continu des deux côtés.
//   e = dist - t (distance signée au centre)
//   ligne suivante (e ∈ [0,1])   → distance = e        (grandit en approchant)
//   ligne active   (e ∈ [-1,0])  → distance = 0        (zoom max maintenu)
//   ligne passée   (e < -1)      → distance = -e - 1   (rétrécit en s'éloignant)
function plateauDist(e: number): number {
  if (e >= 0) return e;
  if (e >= -1) return 0;
  return -e - 1;
}

// Taille de base d'une ligne = sa taille quand elle est ACTIVE.
// Ne dépend que de la longueur du texte → constante par ligne → AUCUN reflow au scroll.
// Renvoie une string clamp() : plancher rem (lisible sur mobile) + remplissage vw + plafond rem.
// La largeur dispo ≈ 92vw, ratio caractère ≈ 0.52 → fill ≈ 92/(0.52*len) ≈ 177/len (en vw).
function baseSize(text: string): string {
  const len = Math.max(text.length, 1);
  const fillVw = Math.max(4, Math.min(177 / len, 9)); // borne vw
  // clamp : jamais < 1.5rem (24px, lisible mobile), jamais > 3.6rem (desktop)
  return `clamp(1.5rem, ${fillVw.toFixed(2)}vw, 3.6rem)`;
}

export default function LyricsDisplay({ lines, currentTime, hasWordTimestamps, onClickLine }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Indice actif + progression dérivés DIRECTEMENT de currentTime (pas du prop activeIndex
  // qui a un frame de retard) → zoom et scroll toujours synchronisés, aucun saut.
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) active = i; else break;
  }
  let t = 0;
  if (active >= 0 && lines[active + 1]) {
    const dur = lines[active + 1].time - lines[active].time;
    const elapsed = currentTime - lines[active].time;
    t = dur > 0 ? Math.max(0, Math.min(1, elapsed / dur)) : 0;
  }

  // Transform continu sur le DOM : zéro React re-render, zéro saut
  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || lines.length === 0 || active < 0) return;

    // Hauteur RÉELLE d'un slot mesurée dans le DOM (évite le décalage vh ↔ window.innerHeight
    // sur mobile, qui s'accumule au fil de la chanson). Repli sur le calcul si pas encore monté.
    const first = inner.firstElementChild as HTMLElement | null;
    const slot = first?.offsetHeight || window.innerHeight * SLOT_VH;
    const frac = active + t;
    const translateY = -(frac * slot + slot / 2) + outer.clientHeight / 2;
    inner.style.transform = `translateY(${translateY}px)`;
  }, [currentTime, active, lines, t]);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/30 text-sm gap-2">
        <p>Chargez un fichier .lrc</p>
        <p className="text-xs">ou créez-en un dans l&apos;onglet Créer</p>
      </div>
    );
  }

  const slotPx = `${SLOT_VH * 100}vh`;

  return (
    <div
      ref={outerRef}
      className="h-full overflow-hidden relative"
      style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)" }}
    >
      <div ref={innerRef} style={{ willChange: "transform" }}>
        {lines.map((line, i) => {
          const dist = i - active;
          const isActive = dist === 0;
          const isPast = dist < 0;

          // Distance effective signée + version "plateau" (zoom max maintenu sur l'active)
          const effDist = dist - t;
          const pd = plateauDist(effDist);

          const opacity = levelAt(OPACITY_LEVELS, pd);
          // font-size FIXE par ligne (jamais recalculée) ; seul scale varie → GPU, pas de reflow
          const fontSize = baseSize(line.text || "x");
          const scale = levelAt(SCALE_LEVELS, pd);

          // Seule la ligne active (dist===0) a le gradient : les autres restent blanches jusqu'à leur tour
          const isNearActive = dist === 0;
          const color = isNearActive
            ? "transparent"
            : effDist < 0
            ? `rgba(167,139,250,${lerp(0.9, 0.5, Math.min(Math.abs(effDist) - 0.5, 1))})`
            : `rgba(255,255,255,${lerp(0.85, 0.4, Math.min(effDist - 0.5, 1))})`;

          return (
            <div
              key={i}
              onClick={() => onClickLine(line.time)}
              className="flex items-center justify-center cursor-pointer text-center px-6"
              style={{ height: slotPx, opacity }}
            >
              {isActive && hasWordTimestamps && line.words?.length ? (
                <WordLine words={line.words} currentTime={currentTime} text={line.text} scale={scale} lineEnd={lines[active + 1]?.time ?? (line.words[line.words.length - 1].time + 4)} />
              ) : (
                <span
                  style={{
                    display: "block",
                    fontSize,
                    // poids CONSTANT → le texte a toujours la même largeur → wrapping identique
                    // quel que soit l'état (actif/passé/suivant)
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: isNearActive ? "transparent" : color,
                    WebkitTextFillColor: isNearActive ? "transparent" : undefined,
                    transform: `scale(${scale.toFixed(3)})`,
                    transformOrigin: "center",
                    willChange: "transform",
                    backgroundImage: isNearActive ? "linear-gradient(90deg,#fff,#f0abfc,#fff)" : undefined,
                    WebkitBackgroundClip: isNearActive ? "text" : undefined,
                    backgroundClip: isNearActive ? "text" : undefined,
                    filter: dist === 0 ? "drop-shadow(0 0 28px rgba(216,180,254,0.55))" : "none",
                  }}
                >
                  {line.text || "♪"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Couleurs du remplissage karaoké
const SUNG_A = "#f0abfc";              // début zone chantée (rose)
const SUNG_B = "#fb923c";              // fin zone chantée (orange)
const UNSUNG = "rgba(255,255,255,0.30)"; // pas encore chanté (blanc atténué)

function WordLine({ words, currentTime, text, scale, lineEnd }: { words: { time: number; text: string }[]; currentTime: number; text: string; scale: number; lineEnd: number }) {
  const fontSize = baseSize(text || "x");
  // Mêmes propriétés que le span normal (poids 700, pas de letter-spacing) → wrapping identique
  return (
    <span style={{ display: "block", fontSize, fontWeight: 700, lineHeight: 1.3, transform: `scale(${scale.toFixed(3)})`, transformOrigin: "center", willChange: "transform" }}>
      {words.map((word, wi) => {
        const wStart = word.time;
        const wEnd = wi < words.length - 1 ? words[wi + 1].time : lineEnd;
        // Ratio de progression du mot : 0 = pas commencé, 1 = entièrement chanté
        const wp = wEnd > wStart
          ? Math.max(0, Math.min(1, (currentTime - wStart) / (wEnd - wStart)))
          : (currentTime >= wStart ? 1 : 0);

        const isSinging = wp > 0 && wp < 1;
        const fill = (wp * 100).toFixed(1);

        // Dégradé avec coupure nette à `fill` : chanté à gauche, non-chanté à droite
        const backgroundImage = `linear-gradient(90deg, ${SUNG_A} 0%, ${SUNG_B} ${fill}%, ${UNSUNG} ${fill}%, ${UNSUNG} 100%)`;

        return (
          <span
            key={wi}
            style={{
              display: "inline",
              color: "transparent",
              WebkitTextFillColor: "transparent",
              backgroundImage,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              // glow uniquement sur le mot en cours de chant
              filter: isSinging ? "drop-shadow(0 0 18px rgba(251,146,60,0.55))" : "none",
            }}
          >
            {word.text}
          </span>
        );
      })}
    </span>
  );
}
