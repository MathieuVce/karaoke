"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { upload } from "@vercel/blob/client";
import {
  Play, MoreHorizontal, Pencil, Share2, RefreshCw, Plus, Lock,
  Sparkles, Sliders, Download, Trash2, FileText, Mic2, Music2, Video, Check, X, Loader2,
} from "lucide-react";
import PrepareResultModal from "./PrepareResultModal";
import type { SongMeta } from "@/app/api/songs/route";

interface Props {
  onLoadSong: (audioUrl: string, audioName: string, lrcUrl: string | null, vocalsUrl: string | null) => void;
  onLoadYoutube: (song: SongMeta) => void;
  onEditSong: (song: SongMeta) => void;
  onShareSong: (song: SongMeta) => void;
  isUnlocked: boolean;
  onRequestUnlock: (onSuccess: () => void) => void;
}

type UploadStep = "form" | "uploading" | "done" | "error";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function SongLibrary({ onLoadSong, onLoadYoutube, onEditSong, onShareSong, isUnlocked, onRequestUnlock }: Props) {

  // Joue la chanson : via YouTube si c'est une entrée légère, sinon via l'audio Blob
  const playSong = (song: SongMeta) => {
    if (song.youtubeId) onLoadYoutube(song);
    else if (song.audioUrl) onLoadSong(song.audioUrl, song.title, song.lrcUrl, song.vocalsUrl);
  };
  const [songs, setSongs] = useState<SongMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Upload form state
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [vocalsFile, setVocalsFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep>("form");
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const aiBusy = !!preparingId || !!transcribingId; // backend mono-CPU : une seule tâche IA à la fois
  const [prepareMsg, setPrepareMsg] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [resultSong, setResultSong] = useState<SongMeta | null>(null);

  // Position fixe du menu (rendu en portail → hors de tout ancêtre overflow/opacity)
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });

  // Ouvre le menu vers le haut s'il manque de place en bas
  const openMenu = (id: string, btn: HTMLElement) => {
    if (menuOpenId === id) { setMenuOpenId(null); return; }
    const rect = btn.getBoundingClientRect();
    const up = window.innerHeight - rect.bottom < 320;
    setMenuPos({
      right: Math.max(8, window.innerWidth - rect.right),
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
    setMenuOpenId(id);
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(`Erreur téléchargement : ${(e as Error).message}`);
    }
  };

  const slug = (s: string) => slugify(s) || "karaoke";

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/songs");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSongs(data.songs);
    } catch (e) {
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSongs(); }, [fetchSongs]); // eslint-disable-line react-hooks/set-state-in-effect

  // Disparition auto du toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleUpload = async () => {
    if (!audioFile || !title.trim()) return;
    setUploadStep("uploading");
    setUploadError("");

    try {
      const id = `${Date.now()}-${slugify(title)}`;

      // Upload audio
      setUploadProgress("Envoi du MP3…");
      const ext = audioFile.name.split(".").pop() ?? "mp3";
      await upload(`karaoke/${id}.${ext}`, audioFile, {
        access: "public",
        handleUploadUrl: "/api/songs/upload",
      });

      // Upload LRC if present
      let lrcUrl: string | null = null;
      if (lrcFile) {
        setUploadProgress("Envoi des paroles…");
        const lrcBlob = await upload(`karaoke/${id}.lrc`, lrcFile, {
          access: "public",
          handleUploadUrl: "/api/songs/upload",
        });
        lrcUrl = lrcBlob.url;
      }

      // Upload piste voix (stem) si présente
      let vocalsUrl: string | null = null;
      if (vocalsFile) {
        setUploadProgress("Envoi de la piste voix…");
        const vext = vocalsFile.name.split(".").pop() ?? "mp3";
        const vBlob = await upload(`karaoke/${id}.vocals.${vext}`, vocalsFile, {
          access: "public",
          handleUploadUrl: "/api/songs/upload",
        });
        vocalsUrl = vBlob.url;
      }

      // Upload meta (text/plain pour compatibilité Vercel Blob)
      setUploadProgress("Sauvegarde des informations…");
      const meta = { id, title: title.trim(), artist: artist.trim(), lrcUrl, vocalsUrl, createdAt: new Date().toISOString() };
      const metaFile = new File([JSON.stringify(meta)], `${id}.meta.txt`, { type: "text/plain" });
      await upload(`karaoke/${id}.meta.txt`, metaFile, {
        access: "public",
        handleUploadUrl: "/api/songs/upload",
      });

      setUploadStep("done");
      setTitle("");
      setArtist("");
      setAudioFile(null);
      setVocalsFile(null);
      setLrcFile(null);
      await fetchSongs();
      setTimeout(() => setUploadStep("form"), 2000);

    } catch (e) {
      setUploadError((e as Error).message);
      setUploadStep("error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette chanson du serveur ?")) return;
    await fetch("/api/songs", { method: "DELETE", body: JSON.stringify({ id }), headers: { "Content-Type": "application/json" } });
    setSongs((prev) => prev.filter((s) => s.id !== id));
  };

  const handleFileUpload = async (
    song: SongMeta,
    file: File,
    type: "lrc" | "audio" | "vocals",
  ) => {
    const ext = file.name.split(".").pop() ?? "mp3";
    const pathMap = {
      lrc: `karaoke/${song.id}.lrc`,
      audio: `karaoke/${song.id}.${ext}`,
      vocals: `karaoke/${song.id}.vocals.${ext}`,
    };
    const stateKey = { lrc: "lrcUrl", audio: "audioUrl", vocals: "vocalsUrl" } as const;
    try {
      await fetch("/api/songs", { method: "PATCH", body: JSON.stringify({ id: song.id, type }), headers: { "Content-Type": "application/json" } });
      const blob = await upload(pathMap[type], file, { access: "public", handleUploadUrl: "/api/songs/upload" });
      setSongs((prev) => prev.map((s) => s.id === song.id ? { ...s, [stateKey[type]]: blob.url } : s));
    } catch (e) {
      alert(`Erreur upload : ${(e as Error).message}`);
    }
  };

  // Prépare une chanson avec l'IA : Demucs sépare voix/instru, Groq transcrit.
  // L'audio principal devient l'instrumental, le stem voix et le LRC sont ajoutés.
  const handlePrepareAI = async (song: SongMeta) => {
    if (!song.audioUrl) return;
    setPreparingId(song.id);
    setPrepareMsg("Démarrage…");
    try {
      // Lance le job (retour immédiat), puis sonde le statut en arrière-plan
      const res = await fetch("/api/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: song.id, url: song.audioUrl, title: song.title, artist: song.artist }),
      });
      const data = await res.json();
      if (data.error || !data.jobId) throw new Error(data.error || "Échec du lancement");

      const deadline = Date.now() + 12 * 60 * 1000; // garde-fou : 12 min max
      for (;;) {
        if (Date.now() > deadline) throw new Error("Délai dépassé (le backend met trop de temps)");
        await new Promise((r) => setTimeout(r, 4000));
        const jr = await fetch(`/api/separate?job=${data.jobId}`, { cache: "no-store" }).then((r) => r.json());
        if (jr.status === "processing") { setPrepareMsg(jr.progress || "Traitement…"); continue; }
        if (jr.status === "done") {
          // Recharge et ouvre la modale de résultats avec la version mise à jour
          const fresh = await fetch("/api/songs").then((r) => r.json()).catch(() => null);
          if (fresh?.songs) setSongs(fresh.songs);
          const updated = (fresh?.songs as SongMeta[] | undefined)?.find((s) => s.id === song.id);
          setResultSong(updated ?? song);
          break;
        }
        throw new Error(jr.message || jr.error || "Échec de la préparation");
      }
    } catch (e) {
      setToast({ text: `Erreur : ${(e as Error).message}`, error: true });
    } finally {
      setPreparingId(null);
      setPrepareMsg("");
    }
  };

  // Génère le LRC par IA (Groq Whisper) depuis le stem voix (ou l'audio), puis le stocke
  const handleTranscribe = async (song: SongMeta) => {
    setTranscribingId(song.id);
    try {
      const src = song.vocalsUrl ?? song.audioUrl; // le stem voix donne de meilleurs résultats
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: src, title: song.title, artist: song.artist }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Remplace le LRC existant
      await fetch("/api/songs", { method: "PATCH", body: JSON.stringify({ id: song.id }), headers: { "Content-Type": "application/json" } });
      const file = new File([data.lrc], `${song.id}.lrc`, { type: "text/plain" });
      const blob = await upload(`karaoke/${song.id}.lrc`, file, {
        access: "public",
        handleUploadUrl: "/api/songs/upload",
      });
      setSongs((prev) => prev.map((s) => s.id === song.id ? { ...s, lrcUrl: blob.url } : s));
    } catch (e) {
      alert(`Erreur génération IA : ${(e as Error).message}`);
    } finally {
      setTranscribingId(null);
    }
  };

  const requestProtectedAction = (action: () => void, keepMenu = false) => {
    onRequestUnlock(action);
    if (!keepMenu) setMenuOpenId(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      {/* Upload section */}
      <div className="p-5 border-b border-white/10 space-y-3">
        <h2 className="text-sm font-semibold text-white/70">Ajouter une chanson</h2>

        {uploadStep === "form" && (
          <div className="space-y-3">
            <div className="flex gap-3 min-w-0">
              <input
                className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-400"
                placeholder="Titre *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-400"
                placeholder="Artiste"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              />
            </div>

            <div className="flex gap-3 min-w-0">
              <label className={`flex-1 min-w-0 flex items-center justify-center py-2.5 px-2 rounded-lg border text-sm cursor-pointer transition-colors ${audioFile ? "border-violet-500 bg-violet-900/30 text-violet-200" : "border-white/15 bg-white/5 text-white/40 hover:border-white/30"}`}>
                <span className="truncate">{audioFile ? audioFile.name : "+ MP3"}</span>
                <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && setAudioFile(e.target.files[0])} />
              </label>
              <label className={`flex-1 min-w-0 flex items-center justify-center py-2.5 px-2 rounded-lg border text-sm cursor-pointer transition-colors ${lrcFile ? "border-pink-500 bg-pink-900/30 text-pink-200" : "border-white/15 bg-white/5 text-white/40 hover:border-white/30"}`}>
                <span className="truncate">{lrcFile ? lrcFile.name : "+ LRC (optionnel)"}</span>
                <input type="file" accept=".lrc,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && setLrcFile(e.target.files[0])} />
              </label>
            </div>

            <label className={`flex items-center justify-center py-2.5 px-2 rounded-lg border text-sm cursor-pointer transition-colors ${vocalsFile ? "border-amber-500 bg-amber-900/30 text-amber-200" : "border-white/15 bg-white/5 text-white/40 hover:border-white/30"}`}>
              <span className="truncate">{vocalsFile ? `Voix : ${vocalsFile.name}` : "+ Piste voix / stem (optionnel)"}</span>
              <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && setVocalsFile(e.target.files[0])} />
            </label>
            <p className="text-[11px] text-white/30 -mt-1">
              Ajoute le stem (voix) pour activer le curseur Voix dans le lecteur.
            </p>

            <button
              onClick={handleUpload}
              disabled={!audioFile || !title.trim()}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              Envoyer sur le serveur
            </button>
          </div>
        )}

        {uploadStep === "uploading" && (
          <div className="space-y-2">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full animate-pulse w-full" />
            </div>
            <p className="text-xs text-white/50 text-center">{uploadProgress}</p>
          </div>
        )}

        {uploadStep === "done" && (
          <p className="text-sm text-green-400 text-center py-2">Chanson enregistrée et chargée dans le lecteur !</p>
        )}

        {uploadStep === "error" && (
          <div className="space-y-2">
            <p className="text-xs text-red-400">{uploadError}</p>
            <button onClick={() => setUploadStep("form")} className="text-xs text-white/40 hover:text-white/70 transition-colors">Réessayer</button>
          </div>
        )}
      </div>

      {/* Songs list */}
      <div className="flex-1 p-5 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/70">Bibliothèque ({songs.length})</h2>
          <button onClick={fetchSongs} className="text-xs text-white/30 hover:text-white/60 transition-colors">Actualiser</button>
        </div>

        {loading && (
          <p className="text-xs text-white/30 text-center py-8">Chargement…</p>
        )}

        {fetchError && (
          <div className="text-center py-8 space-y-2">
            <p className="text-xs text-red-400">{fetchError}</p>
            <p className="text-xs text-white/30">Vérifiez que <code className="bg-white/10 px-1 rounded">BLOB_READ_WRITE_TOKEN</code> est configuré</p>
          </div>
        )}

        {!loading && !fetchError && songs.length === 0 && (
          <p className="text-xs text-white/25 text-center py-8">Aucune chanson. Ajoutez-en une ci-dessus.</p>
        )}

        {songs.map((song) => (
          <div
            key={song.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer group bg-white/5 border border-white/10 hover:bg-white/10 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-900/30 hover:-translate-y-px"
            onClick={() => playSong(song)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{song.title}</p>
              {song.artist && <p className="text-xs text-white/40 truncate">{song.artist}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Badges informatifs (lecture seule) avec infobulle au survol */}
              {song.youtubeId && <Badge bg="rgba(239,68,68,0.25)" label="Vidéo YouTube"><Video size={13} color="#fca5a5" /></Badge>}
              {song.lrcUrl && <Badge bg="rgba(139,92,246,0.25)" label="Paroles synchronisées"><FileText size={13} color="#c4b5fd" /></Badge>}
              {song.vocalsUrl && <Badge bg="rgba(245,158,11,0.22)" label="Voix disponible"><Mic2 size={13} color="#fcd34d" /></Badge>}

              {/* Lecture (action principale) */}
              <button
                onClick={(e) => { e.stopPropagation(); playSong(song); }}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 flex items-center justify-center transition-all active:scale-95"
                title="Lire"
              >
                <Play size={15} fill="currentColor" />
              </button>

              {/* Menu d'actions */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); openMenu(song.id, e.currentTarget); }}
                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all active:scale-95"
                  title="Actions"
                >
                  <MoreHorizontal size={13} />
                </button>

                {menuOpenId === song.id && createPortal(
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                    <div
                      className="fixed z-[101] w-60 rounded-xl py-1 shadow-2xl shadow-black/80 ring-1 ring-white/15 text-sm"
                      style={{ ...menuPos, backgroundColor: "#160a30", border: "1px solid rgba(255,255,255,0.22)", opacity: 1 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuItem onClick={() => requestProtectedAction(() => onEditSong(song))} locked={!isUnlocked}>
                        {isUnlocked ? <Pencil size={15} className="shrink-0" /> : <Lock size={15} className="shrink-0" />}{song.lrcUrl ? "Modifier les paroles" : "Créer les paroles"}
                      </MenuItem>
                      <MenuItem onClick={() => { onShareSong(song); setMenuOpenId(null); }}>
                        <Share2 size={15} className="shrink-0" />Écoute partagée
                      </MenuItem>

                      <div className="my-1 border-t border-white/10" />

                      {isUnlocked ? (
                        <MenuFileItem accept=".lrc,text/plain" onFile={(f) => { handleFileUpload(song, f, "lrc"); setMenuOpenId(null); }}>
                          {song.lrcUrl ? <RefreshCw size={15} className="shrink-0" /> : <Plus size={15} className="shrink-0" />}{song.lrcUrl ? "Remplacer le LRC" : "Ajouter un LRC"}
                        </MenuFileItem>
                      ) : (
                        <MenuItem locked onClick={() => requestProtectedAction(() => {})}>
                          <Lock size={15} className="shrink-0" />{song.lrcUrl ? "Remplacer le LRC" : "Ajouter un LRC"}
                        </MenuItem>
                      )}

                      {/* Instrumental (audio principal) : remplaçable, inutile pour YouTube */}
                      {song.audioUrl && (isUnlocked ? (
                        <MenuFileItem accept="audio/*,.mp3" onFile={(f) => { handleFileUpload(song, f, "audio"); setMenuOpenId(null); }}>
                          <Music2 size={15} className="shrink-0" />Remplacer l&apos;instrumental
                        </MenuFileItem>
                      ) : (
                        <MenuItem locked onClick={() => requestProtectedAction(() => {})}>
                          <Lock size={15} className="shrink-0" />Remplacer l&apos;instrumental
                        </MenuItem>
                      ))}

                      {/* Stem voix : mixage voix/instru sur le fichier audio, inutile pour YouTube */}
                      {song.audioUrl && (isUnlocked ? (
                        <MenuFileItem accept="audio/*,.mp3" onFile={(f) => { handleFileUpload(song, f, "vocals"); setMenuOpenId(null); }}>
                          {song.vocalsUrl ? <RefreshCw size={15} className="shrink-0" /> : <Plus size={15} className="shrink-0" />}{song.vocalsUrl ? "Remplacer la voix" : "Ajouter la voix"}
                        </MenuFileItem>
                      ) : (
                        <MenuItem locked onClick={() => requestProtectedAction(() => {})}>
                          <Lock size={15} className="shrink-0" />{song.vocalsUrl ? "Remplacer la voix" : "Ajouter la voix"}
                        </MenuItem>
                      ))}

                      {/* Préparation complète IA (Demucs + Groq) — bloquée si une tâche IA tourne (backend mono-CPU) */}
                      {song.audioUrl && (
                        <MenuItem disabled={aiBusy} locked={!isUnlocked} onClick={() => requestProtectedAction(() => handlePrepareAI(song), true)}>
                          {preparingId ? <Loader2 size={15} className="shrink-0 animate-spin" /> : isUnlocked ? <Sliders size={15} className="shrink-0" /> : <Lock size={15} className="shrink-0" />}{preparingId ? "Préparation en cours…" : "Préparer avec l'IA (voix, instru, paroles)"}
                        </MenuItem>
                      )}

                      {/* Génération des paroles seules par IA (Groq) — bloquée si une tâche IA tourne */}
                      {(song.audioUrl || song.vocalsUrl) && (
                        <MenuItem disabled={aiBusy} locked={!isUnlocked} onClick={() => requestProtectedAction(() => handleTranscribe(song), true)}>
                          {transcribingId ? <Loader2 size={15} className="shrink-0 animate-spin" /> : isUnlocked ? <Sparkles size={15} className="shrink-0" /> : <Lock size={15} className="shrink-0" />}{transcribingId ? "Génération en cours…" : song.lrcUrl ? "Régénérer les paroles (IA)" : "Générer les paroles (IA)"}
                        </MenuItem>
                      )}

                      <div className="my-1 border-t border-white/10" />

                      {song.audioUrl && (
                        <MenuItem onClick={() => { downloadFile(song.audioUrl!, `${slug(song.title)}.mp3`); setMenuOpenId(null); }}><Download size={15} className="shrink-0" />Télécharger le MP3</MenuItem>
                      )}
                      {song.vocalsUrl && (
                        <MenuItem onClick={() => { downloadFile(song.vocalsUrl!, `${slug(song.title)}-voix.mp3`); setMenuOpenId(null); }}><Download size={15} className="shrink-0" />Télécharger la voix</MenuItem>
                      )}
                      {song.lrcUrl && (
                        <MenuItem onClick={() => { downloadFile(song.lrcUrl!, `${slug(song.title)}.lrc`); setMenuOpenId(null); }}><Download size={15} className="shrink-0" />Télécharger le LRC</MenuItem>
                      )}

                      <div className="my-1 border-t border-white/10" />

                      <MenuItem danger locked={!isUnlocked} onClick={() => requestProtectedAction(() => handleDelete(song.id))}>
                        {isUnlocked ? <Trash2 size={15} className="shrink-0" /> : <Lock size={15} className="shrink-0" />}Supprimer
                      </MenuItem>
                    </div>
                  </>,
                  document.body
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bannière de progression pendant la préparation IA (en arrière-plan) */}
      {preparingId && (
        <div className="sticky bottom-0 z-30 mx-4 mb-3 px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: "rgba(36,16,72,0.95)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }}>
          <Loader2 size={18} className="shrink-0 animate-spin text-violet-300" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Préparation avec l&apos;IA…</div>
            <div className="text-xs text-white/50 truncate">{prepareMsg || "Traitement…"} Tu peux continuer à naviguer.</div>
          </div>
        </div>
      )}

      {/* Modale de résultats après préparation IA */}
      {resultSong && (
        <PrepareResultModal
          song={resultSong}
          onClose={() => setResultSong(null)}
          onPlay={playSong}
          onDownload={downloadFile}
        />
      )}

      {/* Notification de fin */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl flex items-center gap-2 shadow-2xl" style={{ background: toast.error ? "rgba(120,20,30,0.95)" : "rgba(20,90,50,0.95)", border: "1px solid rgba(255,255,255,0.15)" }}>
          {toast.error ? <X size={16} className="shrink-0" /> : <Check size={16} className="shrink-0" />}
          <span className="text-sm font-medium text-white">{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-1 text-white/50 hover:text-white"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

// Badge rond avec infobulle stylée au survol (explique l'icône : YouTube, LRC, voix…)
function Badge({ children, bg, label }: { children: React.ReactNode; bg: string; label: string }) {
  return (
    <span className="relative group/badge w-6 h-6 rounded-full flex items-center justify-center" style={{ background: bg }}>
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap text-white bg-[#160a30] ring-1 ring-white/15 shadow-lg opacity-0 group-hover/badge:opacity-100 transition-opacity z-50">
        {label}
      </span>
    </span>
  );
}

function MenuItem({ children, onClick, danger, disabled, locked }: { children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; locked?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-40 ${danger ? "text-red-300 hover:bg-red-900/30" : locked ? "text-white/40 hover:bg-white/5" : "text-white/80 hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}

function MenuFileItem({ children, accept, onFile }: { children: React.ReactNode; accept: string; onFile: (f: File) => void }) {
  return (
    <label className="w-full text-left px-4 py-2 flex items-center gap-2 text-white/80 hover:bg-white/10 transition-colors cursor-pointer">
      {children}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}
