"use client";

import { X, Download, Play, Music2, Mic2, FileText } from "lucide-react";
import type { SongMeta } from "@/app/api/songs/route";

interface Props {
  song: SongMeta;
  onClose: () => void;
  onPlay: (song: SongMeta) => void;
  onDownload: (url: string, filename: string) => void;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "karaoke";
}

// Modale affichée après la préparation IA : écouter les pistes, télécharger, lire.
export default function PrepareResultModal({ song, onClose, onPlay, onDownload }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5,2,15,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl relative"
        style={{ background: "linear-gradient(135deg, #1e1040, #2a0a52)", border: "1px solid rgba(255,255,255,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          title="Fermer"
        >
          <X size={18} />
        </button>

        <div className="pr-10">
          <h2 className="text-lg font-bold text-white">Préparation terminée</h2>
          <p className="text-sm text-white/50 truncate">{song.title}</p>
        </div>

        {/* Écoute des pistes */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-white/60 mb-1">
              <Music2 size={14} /> Instrumental (karaoké)
            </div>
            {song.audioUrl && <audio controls src={song.audioUrl} className="w-full h-9" />}
          </div>
          {song.vocalsUrl && (
            <div>
              <div className="flex items-center gap-2 text-xs text-white/60 mb-1">
                <Mic2 size={14} /> Voix (guide)
              </div>
              <audio controls src={song.vocalsUrl} className="w-full h-9" />
            </div>
          )}
        </div>

        {/* Téléchargements */}
        <div className="grid grid-cols-3 gap-2">
          {song.audioUrl && (
            <button onClick={() => onDownload(song.audioUrl!, `${slug(song.title)}-instru.mp3`)} className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs transition-colors">
              <Download size={16} /> Instru
            </button>
          )}
          {song.vocalsUrl && (
            <button onClick={() => onDownload(song.vocalsUrl!, `${slug(song.title)}-voix.mp3`)} className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs transition-colors">
              <Mic2 size={16} /> Voix
            </button>
          )}
          {song.lrcUrl && (
            <button onClick={() => onDownload(song.lrcUrl!, `${slug(song.title)}.lrc`)} className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs transition-colors">
              <FileText size={16} /> LRC
            </button>
          )}
        </div>

        <button
          onClick={() => { onPlay(song); onClose(); }}
          className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Play size={18} fill="currentColor" /> Lire dans le karaoké
        </button>
      </div>
    </div>
  );
}
