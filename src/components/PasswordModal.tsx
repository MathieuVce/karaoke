"use client";

import { useEffect, useState } from "react";
import { X, Eye, EyeOff, ShieldAlert } from "lucide-react";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PasswordModal({ onClose, onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/10 hover:bg-red-500/30 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          title="Fermer"
        >
          <X size={18} />
        </button>

        <h2 className="text-lg font-bold text-white pr-10">Accès administrateur</h2>

        <p className="text-xs text-white/60 leading-relaxed">
          La modification des fichiers existants sur le serveur (timestamps, voix, suppression) est protégée par un mot de passe.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Mot de passe administrateur"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 transition-all placeholder-white/30"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors"
                title={showPassword ? "Masquer" : "Afficher"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-400 font-medium flex items-center gap-1.5">
                <ShieldAlert size={14} className="shrink-0" /> {error}
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
