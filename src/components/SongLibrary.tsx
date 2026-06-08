"use client";

import { useState, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import type { SongMeta } from "@/app/api/songs/route";

interface Props {
  onLoadSong: (audioUrl: string, audioName: string, lrcUrl: string | null, vocalsUrl: string | null) => void;
  onEditSong: (song: SongMeta) => void;
  onShareSong: (song: SongMeta) => void;
  isUnlocked: boolean;
  onRequestUnlock: (onSuccess: () => void) => void;
}

type UploadStep = "form" | "uploading" | "done" | "error";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function SongLibrary({ onLoadSong, onEditSong, onShareSong, isUnlocked, onRequestUnlock }: Props) {
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
  const [menuUp, setMenuUp] = useState(false);

  // Ouvre le menu vers le haut s'il manque de place en bas
  const openMenu = (id: string, btn: HTMLElement) => {
    if (menuOpenId === id) { setMenuOpenId(null); return; }
    const rect = btn.getBoundingClientRect();
    setMenuUp(window.innerHeight - rect.bottom < 300);
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

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  const handleUpload = async () => {
    if (!audioFile || !title.trim()) return;
    setUploadStep("uploading");
    setUploadError("");

    try {
      const id = `${Date.now()}-${slugify(title)}`;

      // Upload audio
      setUploadProgress("Envoi du MP3…");
      const ext = audioFile.name.split(".").pop() ?? "mp3";
      const audioBlob = await upload(`karaoke/${id}.${ext}`, audioFile, {
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

      // Auto-load into player
      onLoadSong(audioBlob.url, title.trim(), lrcUrl, vocalsUrl);
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

  const handleLrcUpload = async (song: SongMeta, file: File) => {
    try {
      // Supprime tous les LRC existants de cette chanson (évite l'accumulation)
      await fetch("/api/songs", { method: "PATCH", body: JSON.stringify({ id: song.id }), headers: { "Content-Type": "application/json" } });
      // Uploade le nouveau
      const blob = await upload(`karaoke/${song.id}.lrc`, file, {
        access: "public",
        handleUploadUrl: "/api/songs/upload",
      });
      setSongs((prev) => prev.map((s) => s.id === song.id ? { ...s, lrcUrl: blob.url } : s));
    } catch (e) {
      alert(`Erreur upload LRC : ${(e as Error).message}`);
    }
  };

  const handleVocalsUpload = async (song: SongMeta, file: File) => {
    try {
      // Supprime tout stem voix existant (évite la collision "blob already exists")
      await fetch("/api/songs", { method: "PATCH", body: JSON.stringify({ id: song.id, type: "vocals" }), headers: { "Content-Type": "application/json" } });
      const ext = file.name.split(".").pop() ?? "mp3";
      const blob = await upload(`karaoke/${song.id}.vocals.${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/songs/upload",
      });
      setSongs((prev) => prev.map((s) => s.id === song.id ? { ...s, vocalsUrl: blob.url } : s));
    } catch (e) {
      alert(`Erreur upload voix : ${(e as Error).message}`);
    }
  };

  const lockIcon = isUnlocked ? "🔓" : "🔒";

  const requestProtectedAction = (action: () => void) => {
    onRequestUnlock(action);
    setMenuOpenId(null);
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
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer group"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={() => onLoadSong(song.audioUrl, song.title, song.lrcUrl, song.vocalsUrl)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{song.title}</p>
              {song.artist && <p className="text-xs text-white/40 truncate">{song.artist}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Badges informatifs (lecture seule) */}
              {song.lrcUrl && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.3)", color: "rgba(196,181,253,1)" }}>LRC</span>}
              {song.vocalsUrl && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.25)", color: "rgba(252,211,77,1)" }}>Voix</span>}

              {/* Lecture (action principale) */}
              <button
                onClick={(e) => { e.stopPropagation(); onLoadSong(song.audioUrl, song.title, song.lrcUrl, song.vocalsUrl); }}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 flex items-center justify-center text-xs font-bold transition-all active:scale-95"
              >
                ▶
              </button>

              {/* Menu "..." */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); openMenu(song.id, e.currentTarget); }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-base transition-all active:scale-95"
                  title="Actions"
                >
                  ⋯
                </button>

                {menuOpenId === song.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                    <div
                      className={`absolute right-0 z-50 w-56 rounded-xl py-1 shadow-2xl text-sm ${menuUp ? "bottom-9" : "top-9"}`}
                      style={{ background: "linear-gradient(160deg, #241048, #2e0c56)", border: "1px solid rgba(255,255,255,0.14)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuItem onClick={() => {
                        requestProtectedAction(() => onEditSong(song));
                      }}>
                        <span className="mr-2">{lockIcon}</span>✎ Modifier les paroles
                      </MenuItem>
                      <MenuItem onClick={() => { onShareSong(song); setMenuOpenId(null); }}>⤴ Écoute partagée</MenuItem>

                      <div className="my-1 border-t border-white/10" />

                      {isUnlocked ? (
                        <MenuFileItem accept=".lrc,text/plain" onFile={(f) => { handleLrcUpload(song, f); setMenuOpenId(null); }}>
                          <span className="mr-2">🔓</span>{song.lrcUrl ? "↻ Remplacer le LRC" : "+ Ajouter un LRC"}
                        </MenuFileItem>
                      ) : (
                        <MenuItem onClick={() => {
                          requestProtectedAction(() => {});
                        }}>
                          <span className="mr-2">🔒</span>{song.lrcUrl ? "↻ Remplacer le LRC" : "+ Ajouter un LRC"}
                        </MenuItem>
                      )}

                      {isUnlocked ? (
                        <MenuFileItem accept="audio/*,.mp3" onFile={(f) => { handleVocalsUpload(song, f); setMenuOpenId(null); }}>
                          <span className="mr-2">🔓</span>{song.vocalsUrl ? "↻ Remplacer la voix" : "+ Ajouter la voix (stem)"}
                        </MenuFileItem>
                      ) : (
                        <MenuItem onClick={() => {
                          requestProtectedAction(() => {});
                        }}>
                          <span className="mr-2">🔒</span>{song.vocalsUrl ? "↻ Remplacer la voix" : "+ Ajouter la voix (stem)"}
                        </MenuItem>
                      )}

                      <div className="my-1 border-t border-white/10" />

                      <MenuItem onClick={() => { downloadFile(song.audioUrl, `${slug(song.title)}.mp3`); setMenuOpenId(null); }}>⬇ Télécharger le MP3</MenuItem>
                      {song.vocalsUrl && (
                        <MenuItem onClick={() => { downloadFile(song.vocalsUrl!, `${slug(song.title)}-voix.mp3`); setMenuOpenId(null); }}>⬇ Télécharger la voix</MenuItem>
                      )}
                      {song.lrcUrl && (
                        <MenuItem onClick={() => { downloadFile(song.lrcUrl!, `${slug(song.title)}.lrc`); setMenuOpenId(null); }}>⬇ Télécharger le LRC</MenuItem>
                      )}

                      <div className="my-1 border-t border-white/10" />

                      <MenuItem danger onClick={() => {
                        requestProtectedAction(() => handleDelete(song.id));
                      }}>
                        <span className="mr-2">{lockIcon}</span>🗑 Supprimer
                      </MenuItem>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 transition-colors ${danger ? "text-red-300 hover:bg-red-900/30" : "text-white/80 hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}

function MenuFileItem({ children, accept, onFile }: { children: React.ReactNode; accept: string; onFile: (f: File) => void }) {
  return (
    <label className="block w-full text-left px-4 py-2 text-white/80 hover:bg-white/10 transition-colors cursor-pointer">
      {children}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}
