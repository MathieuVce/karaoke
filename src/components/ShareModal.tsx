"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  url: string;
  onClose: () => void;
  onStop: () => void;
}

export default function ShareModal({ url, onClose, onStop }: Props) {
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: "#1a0533", light: "#ffffff" } })
      .then(setQr)
      .catch(() => {});
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(5,2,15,0.8)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: "linear-gradient(135deg, #1e1040, #2a0a52)", border: "1px solid rgba(255,255,255,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Écoute partagée</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">×</button>
        </div>

        <p className="text-sm text-white/60">
          Scannez le QR code ou partagez le lien. Les autres appareils afficheront les paroles synchronisées et vous gardez le contrôle de la lecture.
        </p>

        {qr ? (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code" className="rounded-xl w-56 h-56" />
          </div>
        ) : (
          <div className="w-56 h-56 mx-auto rounded-xl bg-white/5 animate-pulse" />
        )}

        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-xs text-white/70 font-mono truncate"
            onFocus={(e) => e.target.select()}
          />
          <button onClick={copy} className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-xs font-semibold transition-all active:scale-95 shrink-0">
            {copied ? "Copié" : "Copier"}
          </button>
        </div>

        <button onClick={onStop} className="w-full py-2 rounded-lg bg-white/10 hover:bg-red-900/40 text-sm text-white/70 hover:text-red-300 transition-colors">
          Arrêter le partage
        </button>
      </div>
    </div>
  );
}
