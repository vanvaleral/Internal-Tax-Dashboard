"use client";

import { useEffect, useState } from "react";

type Game = { round_number: number; progress: number; completed_rounds: number };

export function OfficeGame() {
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const response = await fetch("/api/office/game", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Game unavailable.");
      setGame(result.game); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Game unavailable."); }
  }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, []);
  async function play() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/office/game", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Aksi gagal.");
      setGame(result.game); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Aksi gagal."); }
    finally { setBusy(false); }
  }
  return <section className="office-card office-game"><span className="office-eyebrow">MINI GAME TIM</span><h2>Susun Berkas 📁</h2><p>Bantu tim merapikan 12 berkas bersama. Setiap klik menyusun satu berkas.</p>{error && <p role="alert">{error}</p>}<div className="office-progress"><div style={{ width: `${(game?.progress || 0) / 12 * 100}%` }} /></div><div className="office-game-stats"><span>{game?.progress || 0} / 12 berkas</span><span>{game?.completed_rounds || 0} putaran selesai</span></div><button className="office-play" disabled={busy || !game} onClick={() => void play()}>Rapikan satu berkas +</button><small>Permainan ini tidak mengubah poin kinerja pajak.</small></section>;
}
