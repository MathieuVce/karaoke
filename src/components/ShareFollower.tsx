"use client";

import { useEffect, useRef, useState } from "react";
import { parseLrc, type LrcData } from "@/lib/lrc-parser";
import LyricsDisplay from "./LyricsDisplay";
import KLogo from "./KLogo";

interface Anchor {
  playing: boolean;
  offset: number;
  at: number; // server ms
}

export default function ShareFollower({ sessionId }: { sessionId: string }) {
  const [lrcData, setLrcData] = useState<LrcData | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [debug, setDebug] = useState("");

  // Ancre + décalage d'horloge client↔serveur
  const anchorRef = useRef<Anchor>({ playing: false, offset: 0, at: 0 });
  const skewRef = useRef<number>(0); // clientNow - serverNow
  const notFoundCount = useRef<number>(0);
  const connectedRef = useRef<boolean>(false);

  // Récupère l'état de session
  const poll = async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}`, { cache: "no-store" });
      setDebug(`HTTP ${res.status}`);
      if (!res.ok) {
        if (res.status !== 404) setDebug(`HTTP ${res.status} : ${(await res.text()).slice(0, 120)}`);
        if (res.status === 404) {
          notFoundCount.current += 1;
          // Tolère quelques 404 au démarrage (création récente / cohérence du store)
          if (notFoundCount.current >= 6 && !connectedRef.current) {
            setStatus("error");
            setErrorMsg("Session introuvable. Le lien est peut-être expiré.");
          } else if (connectedRef.current) {
            setStatus("error");
            setErrorMsg("Le partage a été arrêté.");
          }
        }
        return;
      }
      notFoundCount.current = 0;
      connectedRef.current = true;
      const data = await res.json();
      const session = data.session;
      skewRef.current = Date.now() - data.serverNow;
      anchorRef.current = session.anchor;
      if (!lrcData) {
        setLrcData(parseLrc(session.lrc));
        setTitle(session.title);
        setArtist(session.artist);
      }
      setStatus("ok");
    } catch (e) {
      setDebug(`Réseau: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Boucle d'animation : calcule le temps courant depuis l'ancre + l'horloge locale
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const a = anchorRef.current;
      if (a.playing) {
        // convertit l'heure client en heure serveur via le skew
        const serverNow = Date.now() - skewRef.current;
        setCurrentTime(a.offset + (serverNow - a.at) / 1000);
      } else {
        setCurrentTime(a.offset);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="flex flex-col text-white overflow-hidden"
      style={{ height: "100dvh", background: "linear-gradient(135deg, #1a0533 0%, #2d0a5e 25%, #1e1060 50%, #0f2060 75%, #0a1a4a 100%)" }}
    >
      {/* Blobs chauds */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: "absolute", top: "10%", left: "15%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "20%", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.14) 0%, transparent 70%)", filter: "blur(50px)" }} />
      </div>

      <header className="shrink-0 px-3 sm:px-5 py-3 flex items-center gap-2 sm:gap-3 border-b border-white/10 relative z-10">
        <KLogo size={26} className="shrink-0" />
        <span className="hidden sm:inline text-lg font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent shrink-0">Karaoké</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60 whitespace-nowrap shrink-0">
          <span className="hidden sm:inline">écoute partagée</span>
          <span className="sm:hidden">partagé</span>
        </span>
        {(title || artist) && (
          <div className="ml-auto text-right leading-tight min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            {artist && <div className="text-xs text-white/40 truncate">{artist}</div>}
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 px-4 relative z-10">
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/40 text-sm">
            <span>Connexion à la session…</span>
            {debug && <span className="text-xs text-white/30 font-mono">{debug}</span>}
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/50">
            <p className="text-sm">{errorMsg}</p>
          </div>
        )}
        {status === "ok" && lrcData && (
          <LyricsDisplay
            lines={lrcData.lines}
            currentTime={currentTime}
            hasWordTimestamps={lrcData.hasWordTimestamps}
            onClickLine={() => {}}
          />
        )}
      </div>

      <div className="shrink-0 px-6 py-3 text-center text-xs text-white/30 relative z-10" style={{ background: "rgba(10,5,30,0.6)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        Lecture contrôlée par l&apos;appareil hôte · le son est sur l&apos;appareil principal
      </div>
    </div>
  );
}
