"use client";

import { useState, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import type { SongMeta } from "@/app/api/songs/route";

interface Props {
  onLoadSong: (audioUrl: string, audioName: string, lrcUrl: string | null) => void;
}

type UploadStep = "form" | "uploading" | "done" | "error";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function SongLibrary({ onLoadSong }: Props) {
  const [songs, setSongs] = useState<SongMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Upload form state
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep>("form");
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");

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

      // Upload meta JSON
      setUploadProgress("Sauvegarde des informations…");
      const meta = { id, title: title.trim(), artist: artist.trim(), lrcUrl, createdAt: new Date().toISOString() };
      const metaFile = new File([JSON.stringify(meta)], `${id}.meta.json`, { type: "application/json" });
      await upload(`karaoke/${id}.meta.json`, metaFile, {
        access: "public",
        handleUploadUrl: "/api/songs/upload",
      });

      setUploadStep("done");
      setTitle("");
      setArtist("");
      setAudioFile(null);
      setLrcFile(null);
      await fetchSongs();
      setTimeout(() => setUploadStep("form"), 2000);

      // Auto-load into player
      onLoadSong(audioBlob.url, title.trim(), lrcUrl);
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

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Upload section */}
      <div className="p-5 border-b border-white/10 space-y-3">
        <h2 className="text-sm font-semibold text-white/70">Ajouter une chanson</h2>

        {uploadStep === "form" && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <input
                className="flex-1 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-400"
                placeholder="Titre *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className="flex-1 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-400"
                placeholder="Artiste"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <label className={`flex-1 flex items-center justify-center py-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${audioFile ? "border-violet-500 bg-violet-900/30 text-violet-200" : "border-white/15 bg-white/5 text-white/40 hover:border-white/30"}`}>
                {audioFile ? audioFile.name : "+ MP3"}
                <input type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && setAudioFile(e.target.files[0])} />
              </label>
              <label className={`flex-1 flex items-center justify-center py-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${lrcFile ? "border-pink-500 bg-pink-900/30 text-pink-200" : "border-white/15 bg-white/5 text-white/40 hover:border-white/30"}`}>
                {lrcFile ? lrcFile.name : "+ LRC (optionnel)"}
                <input type="file" accept=".lrc,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && setLrcFile(e.target.files[0])} />
              </label>
            </div>

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
            onClick={() => onLoadSong(song.audioUrl, song.title, song.lrcUrl)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{song.title}</p>
              {song.artist && <p className="text-xs text-white/40 truncate">{song.artist}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {song.lrcUrl && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.3)", color: "rgba(196,181,253,1)" }}>LRC</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onLoadSong(song.audioUrl, song.title, song.lrcUrl); }}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 flex items-center justify-center text-xs font-bold transition-all active:scale-95"
              >
                ▶
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(song.id); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-900/30 transition-all text-sm opacity-0 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
