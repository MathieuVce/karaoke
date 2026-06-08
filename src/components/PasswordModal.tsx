"use client";

import { useEffect, useState } from "react";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PasswordModal({ onClose, onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onSuccess();
      } else {
        setError(data.error || "Mot de passe incorrect");
      }
    } catch {
      setError("Erreur réseau. Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-default"
      style={{ background: "rgba(5,2,15,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl relative"
        style={{
          background: "linear-gradient(135deg, #1e1040, #2a0a52)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2 text-white">
            <span>🔒 Accès Administrateur</span>
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            title="Fermer"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-white/60 leading-relaxed">
          La modification des fichiers existants sur le serveur (timestamps, voix, suppression) est protégée par un mot de passe.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <input
              type="password"
              placeholder="Mot de passe administrateur"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 transition-all placeholder-white/30"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-400 font-medium animate-pulse">
                ⚠️ {error}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/5 hover:bg-white/10 text-white/80 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 text-white"
            >
              {loading ? "Vérification..." : "Déverrouiller"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
