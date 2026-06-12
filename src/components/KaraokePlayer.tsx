"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Check, Pause, Play, Lock, Unlock, Menu, X } from "lucide-react";
import { parseLrc, type LrcData, type LrcLine } from "@/lib/lrc-parser";
import LrcCreator from "./LrcCreator";
import LrcEditor from "./LrcEditor";
import LyricsDisplay from "./LyricsDisplay";
import SongLibrary from "./SongLibrary";
import SearchKaraoke from "./SearchKaraoke";
import YoutubeKaraoke from "./YoutubeKaraoke";
import YoutubeSync from "./YoutubeSync";
import ShareModal from "./ShareModal";
import KLogo from "./KLogo";
import PasswordModal from "./PasswordModal";
import type { SongMeta } from "@/app/api/songs/route";

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

type Mode = "player" | "library" | "search" | "creator" | "editor";

export default function KaraokePlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const vocalsRef = useRef<HTMLAudioElement>(null);
  const animFrameRef = useRef<number>(0);

  const [mode, setMode] = useState<Mode>("player");
  const [ytSong, setYtSong] = useState<{ youtubeId: string; lrc: string; title: string; artist: string } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [vocalsUrl, setVocalsUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string>("");
  const [lrcData, setLrcData] = useState<LrcData>(() => parseLrc(DEMO_LRC));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [vocalVol, setVocalVol] = useState(1); // volume de la piste voix (stem)
  const [dragging, setDragging] = useState(false);
  const [editingSong, setEditingSong] = useState<{ id: string; lrcUrl: string | null } | null>(null);
  const [ytEdit, setYtEdit] = useState<{ youtubeId: string; text: string; title: string; artist: string; songId: string } | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // États d'administration pour la protection par mot de passe
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Vérifie l'état d'authentification au chargement
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) setIsUnlocked(true);
      })
      .catch(() => {});
  }, []);

  const requestUnlock = useCallback((onSuccess: () => void) => {
    if (isUnlocked) {
      onSuccess();
    } else {
      setPendingAction(() => onSuccess);
      setPasswordModalOpen(true);
    }
  }, [isUnlocked]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
      setIsUnlocked(false);
    } catch { /* ignorer */ }
  };

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(animFrameRef.current); return; }
    const loop = () => {
      const audio = audioRef.current;
      if (!audio) return;
      setCurrentTime(audio.currentTime);
      const v = vocalsRef.current;
      if (v && vocalsUrl) {
        if (Math.abs(v.currentTime - audio.currentTime) > 0.12) v.currentTime = audio.currentTime;
        if (audio.paused && !v.paused) v.pause();
        if (!audio.paused && v.paused) v.play().catch(() => {});
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, vocalsUrl]);

  // Volume de la piste voix
  useEffect(() => {
    if (vocalsRef.current) vocalsRef.current.volume = vocalVol;
  }, [vocalVol, vocalsUrl]);

  const isDemo = !audioUrl;

  // Période de la boucle démo = dernier timestamp + une marge pour finir la dernière ligne
  const demoPeriod = useMemo(() => {
    const lines = lrcData.lines;
    if (lines.length < 2) return 0;
    const last = lines[lines.length - 1].time;
    const lastGap = last - lines[lines.length - 2].time;
    return last + Math.max(lastGap, 3); // marge pour remplir le dernier mot
  }, [lrcData.lines]);

  // 3 copies des paroles décalées d'une période → permet un saut invisible (contenu identique)
  const demoLines: LrcLine[] = useMemo(() => {
    if (!isDemo || demoPeriod <= 0) return lrcData.lines;
    const base = lrcData.lines;
    const copies: LrcLine[] = [];
    for (let c = 0; c < 3; c++) {
      for (const line of base) {
        copies.push({
          time: line.time + c * demoPeriod,
          text: line.text,
          words: line.words?.map((w) => ({ time: w.time + c * demoPeriod, text: w.text })),
        });
      }
    }
    return copies;
  }, [isDemo, lrcData.lines, demoPeriod]);

  // Mode démo : défilement continu en boucle, sans coupure
  useEffect(() => {
    if (!isDemo || mode !== "player" || demoPeriod <= 0) return;
    // Démarre dans la copie du milieu (copie 1) → toujours une copie au-dessus et en-dessous
    let startMs = performance.now() - demoPeriod * 1000;
    let raf = 0;
    const loop = () => {
      let ct = (performance.now() - startMs) / 1000;
      // Quand on entre dans la dernière copie, recule la base d'une période exacte :
      // le contenu est identique → saut invisible, et il reste une copie en réserve
      while (ct >= 2 * demoPeriod) { startMs += demoPeriod * 1000; ct -= demoPeriod; }
      setCurrentTime(ct);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isDemo, mode, demoPeriod]);

  // ─── Écoute partagée (hôte) : push d'ancre ────────────────────────────────

  const pushAnchor = useCallback((playingNow: boolean, offset: number) => {
    if (!shareId) return;
    fetch(`/api/session/${shareId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playing: playingNow, offset }),
    }).catch(() => {});
  }, [shareId]);

  // Re-attacher les listeners à chaque remount de l'élément audio (clé change avec audioUrl)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay  = () => { setPlaying(true); const v = vocalsRef.current; if (v && vocalsUrl) { v.currentTime = audio.currentTime; v.play().catch(() => {}); } pushAnchor(true, audio.currentTime); };
    const onPause = () => { setPlaying(false); vocalsRef.current?.pause(); pushAnchor(false, audio.currentTime); };
    audio.addEventListener("play",  onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play",  onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioUrl, vocalsUrl, pushAnchor]); // dépend de audioUrl/vocalsUrl/pushAnchor : se réexécute après chaque remount

  const handleAudioFile = (file: File) => {
    if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    if (vocalsUrl && vocalsUrl.startsWith("blob:")) URL.revokeObjectURL(vocalsUrl);
    setYtSong(null); // on repasse en lecture audio classique
    setAudioUrl(URL.createObjectURL(file));
    setVocalsUrl(null); // nouveau fichier principal = on repart sans stem
    setVocalVol(1);
    setAudioName(file.name.replace(/\.[^.]+$/, ""));
    setCurrentTime(0);
    setDuration(0);
  };

  // Charge une chanson YouTube (entrée légère : iframe + LRC, pas de fichier audio)
  const handleLoadYoutube = async (song: SongMeta) => {
    if (!song.youtubeId) return;
    let lrc = "";
    if (song.lrcUrl) {
      try { lrc = await fetch(song.lrcUrl).then((r) => r.text()); } catch { /* ignore */ }
    }
    if (audioRef.current) audioRef.current.pause();
    setAudioUrl(null);
    setPlaying(false);
    setYtSong({ youtubeId: song.youtubeId, lrc, title: song.title, artist: song.artist });
    setMode("player");
  };

  // Charge un stem voix local (à jouer en synchro avec la piste principale)
  const handleVocalsFile = (file: File) => {
    if (vocalsUrl && vocalsUrl.startsWith("blob:")) URL.revokeObjectURL(vocalsUrl);
    setVocalsUrl(URL.createObjectURL(file));
    setVocalVol(1);
  };

  const loadSongFromServer = async (remoteAudioUrl: string, name: string, lrcUrl: string | null, vUrl: string | null = null) => {
    if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    setYtSong(null); // on repasse en lecture audio classique
    // Changer audioUrl change la key de <audio> → React démonte l'ancien (stop immédiat)
    // et monte un nouveau élément avec la nouvelle source, à currentTime = 0
    setAudioUrl(remoteAudioUrl);
    setVocalsUrl(vUrl);
    setVocalVol(0); // karaoké : instru pur par défaut, le curseur réinjecte la voix guide au besoin
    setAudioName(name);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    if (lrcUrl) {
      try {
        const text = await fetch(lrcUrl).then((r) => r.text());
        setLrcData(parseLrc(text));
      } catch {
        setLrcData(parseLrc(""));
      }
    } else {
      setLrcData(parseLrc(""));
    }
    setMode("player");
  };

  // Ouvre une chanson de la bibliothèque en édition.
  // Chanson YouTube : resynchronisation sur la vidéo (pas d'audio à éditer).
  // Chanson audio : éditeur de timestamps classique.
  const handleEditSong = async (song: SongMeta) => {
    if (song.youtubeId) {
      let lrc = "";
      if (song.lrcUrl) {
        try { lrc = await fetch(song.lrcUrl).then((r) => r.text()); } catch { /* ignore */ }
      }
      const text = parseLrc(lrc).lines.map((l) => l.text).join("\n");
      setEditingSong(null);
      setYtEdit({ youtubeId: song.youtubeId, text, title: song.title, artist: song.artist, songId: song.id });
      setMode("editor");
      return;
    }
    if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    setYtEdit(null);
    setAudioUrl(song.vocalsUrl || song.audioUrl);
    setAudioName(song.vocalsUrl ? `${song.title} (Voix)` : song.title);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    setEditingSong({ id: song.id, lrcUrl: song.lrcUrl });
    setMode("editor");
  };

  // Heartbeat audio : corrige une éventuelle dérive toutes les 5s (chansons audio seulement ;
  // pour YouTube, c'est handleYtProgress qui pousse l'ancre). Le follower interpole entre deux ancres.
  useEffect(() => {
    if (!shareId || ytSong) return;
    const iv = setInterval(() => {
      const a = audioRef.current;
      if (a && !a.paused) pushAnchor(true, a.currentTime);
    }, 5000);
    return () => clearInterval(iv);
  }, [shareId, ytSong, pushAnchor]);

  // Pour une chanson YouTube partagée : pousse l'ancre depuis la progression de la vidéo.
  // Push IMMÉDIAT sur play/pause ou sur saut (seek/dérive détectée), sinon heartbeat léger.
  // Entre deux pushes, le follower interpole avec sa propre horloge → lecture fluide.
  const lastYtPush = useRef<{ playing: boolean; time: number; at: number }>({ playing: false, time: 0, at: 0 });
  const handleYtProgress = useCallback((playing: boolean, lyricsTime: number) => {
    if (!shareId) return;
    const now = Date.now();
    const p = lastYtPush.current;
    const expected = p.playing ? p.time + (now - p.at) / 1000 : p.time;
    const jumped = Math.abs(lyricsTime - expected) > 0.35; // seek ou dérive
    if (playing !== p.playing || jumped || now - p.at > 1500) {
      lastYtPush.current = { playing, time: lyricsTime, at: now };
      pushAnchor(playing, lyricsTime);
    }
  }, [shareId, pushAnchor]);

  const handleShareSong = async (song: SongMeta) => {
    // Récupère le LRC pour la session partagée
    let lrc = "";
    if (song.lrcUrl) {
      try { lrc = await fetch(song.lrcUrl).then((r) => r.text()); } catch { /* ignore */ }
    }
    // Charge la chanson : audio (l'hôte diffuse le son) ou YouTube (l'hôte joue la vidéo)
    if (song.youtubeId) {
      await handleLoadYoutube(song);
    } else if (song.audioUrl) {
      await loadSongFromServer(song.audioUrl, song.title, song.lrcUrl, song.vocalsUrl);
    } else {
      alert("Rien à partager pour cette chanson.");
      return;
    }
    const parsed = parseLrc(lrc);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: song.title, artist: song.artist, lrc, hasWords: parsed.hasWordTimestamps }),
      });
      const data = await res.json();
      if (data.id) {
        setShareId(data.id);
        // shareUrl est calculé côté serveur (IP réseau en local, vrai domaine en prod)
        setShareUrl(data.shareUrl ?? `${window.location.origin}/share/${data.id}`);
        setModalOpen(true);
      } else {
        alert(data.error || "Impossible de créer la session partagée");
      }
    } catch (e) {
      alert(`Erreur partage : ${(e as Error).message}`);
    }
  };

  const stopShare = () => {
    if (shareId) fetch(`/api/session/${shareId}`, { method: "DELETE" }).catch(() => {});
    setShareId(null);
    setShareUrl(null);
    setModalOpen(false);
  };

  const handleLrcFile = async (file: File) => {
    const text = await file.text();
    setLrcData(parseLrc(text));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith("audio/") || file.name.endsWith(".mp3")) handleAudioFile(file);
      else if (file.name.endsWith(".lrc")) handleLrcFile(file);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch { /* autoplay bloqué ou src pas prête */ }
    } else {
      audio.pause();
    }
    // setPlaying + pushAnchor sont gérés par les événements play/pause de l'audio
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    if (vocalsRef.current) vocalsRef.current.currentTime = t;
    setCurrentTime(t);
    pushAnchor(!audioRef.current?.paused, t);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const tabs: { key: Mode; label: string }[] = [
    { key: "player", label: "Lecteur" },
    { key: "search", label: "Rechercher" },
    { key: "library", label: "Bibliothèque" },
    { key: "creator", label: "Créer" },
    { key: "editor", label: "Éditer" },
  ];

  return (
    <div
      className="flex flex-col text-white overflow-hidden"
      style={{ height: "100dvh", background: "linear-gradient(135deg, #1a0533 0%, #2d0a5e 25%, #1e1060 50%, #0f2060 75%, #0a1a4a 100%)" }}
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

      <header className="shrink-0 px-3 sm:px-5 pt-3 sm:pt-4 pb-0 flex items-center gap-2 sm:gap-3 border-b border-white/10 relative z-10">
        {/* Burger : mobile uniquement */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="sm:hidden shrink-0 w-8 h-8 -mb-1 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-white/70"
          aria-label="Menu"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <KLogo size={28} className="shrink-0" />
          <span className="hidden sm:inline text-2xl font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Karaoké
          </span>
        </div>

        {shareId && (
          <button
            onClick={() => setModalOpen(true)}
            title="Afficher le QR / lien de partage"
            className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-gradient-to-r from-violet-600/60 to-pink-600/60 border border-violet-400/40 hover:from-violet-600/80 hover:to-pink-600/80 transition-all"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
            <span className="hidden sm:inline">Partage actif</span>
            <span className="sm:hidden">Partage</span>
          </button>
        )}

        {/* Bouton d'administration global (cadenas) */}
        <button
          onClick={() => {
            if (isUnlocked) {
              handleLogout();
            } else {
              requestUnlock(() => {});
            }
          }}
          title={isUnlocked ? "Fermer la session d'édition (Verrouiller)" : "Ouvrir la session d'édition (Déverrouiller)"}
          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-all select-none active:scale-95 ${
            isUnlocked
              ? "bg-green-500/10 border-green-500/30 text-green-300 hover:bg-green-500/20"
              : "bg-white/5 border-white/10 hover:bg-white/10 text-white/70"
          }`}
        >
          {isUnlocked ? <Unlock size={13} className="shrink-0" /> : <Lock size={13} className="shrink-0" />}
          <span className="hidden md:inline">{isUnlocked ? "Admin déverrouillé" : "Admin verrouillé"}</span>
          <span className="md:hidden">{isUnlocked ? "Admin" : "Verrouillé"}</span>
        </button>

        {/* Onglets inline : desktop uniquement */}
        <div className="hidden sm:flex gap-1 -mb-px">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { if (key !== "editor") { setEditingSong(null); setYtEdit(null); } setMode(key); }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
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
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3 shrink-0">
            {(lrcData.title || audioName) && (
              <div className="hidden md:flex flex-col leading-tight text-right max-w-48">
                <span className="font-semibold text-sm truncate">{lrcData.title || audioName}</span>
                {lrcData.artist && <span className="text-gray-400 text-xs truncate">{lrcData.artist}</span>}
              </div>
            )}
            <label className="cursor-pointer px-2 sm:px-3 py-1.5 sm:py-2.5 mb-1.5 sm:mb-2 rounded-lg text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap" style={{ background: "rgba(139,92,246,0.4)", border: "1px solid rgba(139,92,246,0.5)" }}>
              + MP3
              <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && handleAudioFile(e.target.files[0])} />
            </label>
            <label className="cursor-pointer px-2 sm:px-3 py-1.5 sm:py-2.5 mb-1.5 sm:mb-2 rounded-lg text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              + LRC
              <input type="file" accept=".lrc,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && handleLrcFile(e.target.files[0])} />
            </label>
            {audioUrl && (
              <label className="cursor-pointer px-2 sm:px-3 py-1.5 sm:py-2.5 mb-1.5 sm:mb-2 rounded-lg text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap" style={{ background: vocalsUrl ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.08)", border: vocalsUrl ? "1px solid rgba(245,158,11,0.5)" : "1px solid rgba(255,255,255,0.12)" }}>
                {vocalsUrl ? (
                  <>
                    <Check size={16} /> Voix
                  </>
                ) : (
                  "+ Voix"
                )}
                <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && handleVocalsFile(e.target.files[0])} />
              </label>
            )}
          </div>
        )}
      </header>

      {/* Drawer mobile : navigation */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-50" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(5,2,15,0.7)", backdropFilter: "blur(4px)" }} />
          <div
            className="absolute left-0 top-0 bottom-0 w-64 max-w-[80vw] p-4 flex flex-col gap-1 shadow-2xl"
            style={{ background: "linear-gradient(160deg, #1e1040, #2a0a52)", borderRight: "1px solid rgba(255,255,255,0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="flex items-center gap-2">
                <KLogo size={24} />
                <span className="text-lg font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Karaoké</span>
              </span>
              <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { if (key !== "editor") { setEditingSong(null); setYtEdit(null); } setMode(key); setDrawerOpen(false); }}
                className={`text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  mode === key ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
            {!audioUrl && (
              <div className="mt-auto p-3.5 rounded-xl bg-purple-900/20 border border-purple-500/10 text-xs text-white/50 space-y-1">
                <span className="font-semibold text-purple-300 block">Aucune chanson</span>
                <span>Allez dans la Bibliothèque pour charger un titre.</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative z-10">
        {mode === "library" && (
          <div className="h-full">
            <SongLibrary
              onLoadSong={loadSongFromServer}
              onLoadYoutube={handleLoadYoutube}
              onEditSong={handleEditSong}
              onShareSong={handleShareSong}
              isUnlocked={isUnlocked}
              onRequestUnlock={requestUnlock}
            />
          </div>
        )}

        {mode === "search" && (
          <div className="h-full">
            <SearchKaraoke />
          </div>
        )}

        {mode === "creator" && (
          <div className="h-full overflow-y-auto">
            <LrcCreator audioUrl={audioUrl} audioName={audioName} onLoadAudio={handleAudioFile} />
          </div>
        )}

        {mode === "editor" && ytEdit && (
          <div className="h-full">
            <YoutubeSync
              key={ytEdit.songId}
              initialVideoId={ytEdit.youtubeId}
              initialText={ytEdit.text}
              title={ytEdit.title}
              artist={ytEdit.artist}
              existingSongId={ytEdit.songId}
              onBack={() => { setYtEdit(null); setMode("library"); }}
            />
          </div>
        )}

        {mode === "editor" && !ytEdit && (
          <div className="h-full">
            <LrcEditor
              audioUrl={audioUrl}
              audioName={audioName}
              onLoadAudio={handleAudioFile}
              editingSong={editingSong}
              isUnlocked={isUnlocked}
              onRequestUnlock={requestUnlock}
            />
          </div>
        )}

        {mode === "player" && ytSong && (
          <YoutubeKaraoke
            key={ytSong.youtubeId}
            lrc={ytSong.lrc}
            title={ytSong.title}
            artist={ytSong.artist}
            initialVideoId={ytSong.youtubeId}
            onProgress={shareId ? handleYtProgress : undefined}
          />
        )}

        {mode === "player" && !ytSong && (
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0 px-4 flex flex-col">
              {isDemo && (
                <div className="mx-auto my-3 p-3 w-full max-w-md rounded-xl bg-purple-950/40 border border-purple-500/20 flex items-center justify-between gap-3 text-xs text-white/70 relative z-20">
                  <span>Vous visualisez la démo. Chargez une chanson !</span>
                  <button
                    onClick={() => setMode("library")}
                    className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-semibold transition-all active:scale-95 whitespace-nowrap"
                  >
                    Bibliothèque
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0">
                <LyricsDisplay
                  lines={isDemo ? demoLines : lrcData.lines}
                  currentTime={currentTime}
                  hasWordTimestamps={lrcData.hasWordTimestamps}
                  onClickLine={(time) => {
                    // En mode démo (pas de source), le clic ne fait rien : la boucle continue
                    if (isDemo || !audioRef.current) return;
                    audioRef.current.currentTime = time;
                    setCurrentTime(time);
                    if (audioRef.current.paused) { audioRef.current.play(); setPlaying(true); }
                  }}
                />
              </div>
            </div>

            <div className="shrink-0 px-3 sm:px-6 py-3 sm:py-4 space-y-3" style={{ background: "rgba(10,5,30,0.65)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 sm:gap-3 text-xs text-white/50 font-mono">
                <span className="w-10 text-right shrink-0">{formatTime(currentTime)}</span>
                <div className="relative flex-1 h-1.5">
                  <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
                  <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-violet-400 to-pink-400 rounded-full" style={{ width: `${progressPct}%` }} />
                  <input type="range" min={0} max={duration || 0} step={0.1} value={currentTime} onChange={seek} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <span className="w-10 shrink-0">{formatTime(duration)}</span>
              </div>

              <div className="flex items-center justify-center gap-4 sm:gap-6">
                {/* Volume : caché sur mobile pour laisser la place aux boutons */}
                <div className="hidden sm:flex items-center gap-2 text-white/40 shrink-0">
                  <span className="text-xs font-medium w-9">{volume === 0 ? "0%" : `${Math.round(volume * 100)}%`}</span>
                  <input type="range" min={0} max={1} step={0.02} value={volume} onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }} className="w-20 accent-purple-400" />
                </div>

                <button onClick={() => { if (audioRef.current) { const t = Math.max(0, currentTime - 10); audioRef.current.currentTime = t; setCurrentTime(t); pushAnchor(!audioRef.current.paused, t); } }} className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center text-xs font-bold shadow-md shadow-purple-900/30 transition-all active:scale-95">
                  −10s
                </button>

                <button
                  onClick={togglePlay}
                  disabled={!audioUrl}
                  className="shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 flex items-center justify-center shadow-lg shadow-purple-900/40 transition-all active:scale-95 disabled:opacity-30 text-white"
                >
                  {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
                </button>

                <button onClick={() => { if (audioRef.current) { const t = Math.min(duration, currentTime + 10); audioRef.current.currentTime = t; setCurrentTime(t); pushAnchor(!audioRef.current.paused, t); } }} className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center text-xs font-bold shadow-md shadow-purple-900/30 transition-all active:scale-95">
                  +10s
                </button>

                {/* Voix (stem) : desktop, sinon espaceur d'équilibre */}
                {vocalsUrl ? (
                  <div className="hidden sm:flex items-center gap-2 text-white/40 shrink-0 w-28" title="Volume de la piste voix. 0% = instrumental seul.">
                    <span className="text-[11px] font-medium whitespace-nowrap tabular-nums w-[52px] shrink-0">Voix {Math.round(vocalVol * 100)}%</span>
                    <input type="range" min={0} max={1} step={0.05} value={vocalVol} onChange={(e) => setVocalVol(parseFloat(e.target.value))} className="w-16 accent-amber-400" />
                  </div>
                ) : (
                  <div className="hidden sm:block w-28 shrink-0" />
                )}
              </div>

              {/* Volume + Voix : mobile (sous les boutons) */}
              <div className="flex sm:hidden items-center justify-center gap-5">
                <div className="flex items-center gap-2 text-white/40">
                  <span className="text-[11px] font-medium tabular-nums w-[58px] shrink-0">Vol {Math.round(volume * 100)}%</span>
                  <input type="range" min={0} max={1} step={0.02} value={volume} onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }} className={vocalsUrl ? "w-20 accent-purple-400" : "w-32 accent-purple-400"} />
                </div>
                {vocalsUrl && (
                  <div className="flex items-center gap-2 text-white/40">
                    <span className="text-[11px] font-medium tabular-nums w-[58px] shrink-0">Voix {Math.round(vocalVol * 100)}%</span>
                    <input type="range" min={0} max={1} step={0.05} value={vocalVol} onChange={(e) => setVocalVol(parseFloat(e.target.value))} className="w-20 accent-amber-400" />
                  </div>
                )}
              </div>

              {!audioUrl && (
                <p className="text-center text-xs text-white/30 px-2">
                  Glissez un MP3 · chargez depuis la <strong className="text-white/50 cursor-pointer hover:text-white transition-colors underline" onClick={() => setMode("library")}>Bibliothèque</strong> · créez les paroles dans <strong className="text-white/50">Créer</strong> · ajustez dans <strong className="text-white/50">Éditer</strong>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <audio
        key={audioUrl ?? "empty"}
        ref={audioRef}
        src={audioUrl ?? undefined}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); vocalsRef.current?.pause(); pushAnchor(false, audioRef.current?.currentTime ?? 0); }}
        preload="metadata"
      />

      {/* Piste voix (stem) : suit la piste principale */}
      <audio
        key={vocalsUrl ?? "no-vocals"}
        ref={vocalsRef}
        src={vocalsUrl ?? undefined}
        preload="metadata"
      />

      {shareUrl && modalOpen && <ShareModal url={shareUrl} onClose={() => setModalOpen(false)} onStop={stopShare} />}

      {passwordModalOpen && (
        <PasswordModal
          onClose={() => {
            setPasswordModalOpen(false);
            setPendingAction(null);
          }}
          onSuccess={() => {
            setIsUnlocked(true);
            setPasswordModalOpen(false);
            if (pendingAction) {
              pendingAction();
              setPendingAction(null);
            }
          }}
        />
      )}
    </div>
  );
}
