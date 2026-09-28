"use client";

import { useEffect, useState } from "react";

type Game = { round_number: number; progress: number; completed_rounds: number };
const trays = ["PPN", "PPh", "Arsip"] as const;
const icons = ["🧾", "📊", "📁"];

export function OfficeGame({ onClose }: { onClose: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const target = game ? (game.progress + game.round_number) % trays.length : 0;

  async function refresh() {
    try {
      const response = await fetch("/api/office/game", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Game belum tersedia.");
      setGame(result.game); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Game belum tersedia."); }
  }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, []);

  async function file(index: number) {
    if (busy || !game) return;
    if (index !== target) { setFeedback("Ups, raknya belum cocok. Coba rak yang sesuai label berkas."); return; }
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/office/game", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Berkas gagal disusun.");
      setGame(result.game);
      setFeedback(result.game.completed_rounds > game.completed_rounds ? "🎉 Satu putaran selesai! Ruangan kembali rapi." : "✨ Berkas tersusun! Lanjutkan bersama tim.");
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Berkas gagal disusun."); }
    finally { setBusy(false); }
  }

  return <div className="office-game-overlay" role="dialog" aria-modal="true" aria-label="Mini game Susun Berkas">
    <div className="office-game-window"><div className="office-game-header"><div><span>✦ MINI GAME TIM</span><h2>Susun Berkas</h2></div><button type="button" onClick={onClose} aria-label="Tutup mini game">×</button></div>
      <div className="office-game-stage"><div className="office-game-cloud">☁</div><div className="office-game-cloud second">☁</div><div className="office-file-stack">📚</div><div className="office-paper"><span>{icons[target]}</span><strong>{trays[target]}</strong><small>Taruh di rak yang benar</small></div><div className="office-game-counter"><strong>{game?.progress || 0}<small> / 12</small></strong><span>BERKAS TIM</span></div></div>
      <p className="office-game-instruction">Pilih rak untuk berkas <strong>{trays[target]}</strong>. Setiap berkas yang benar menambah progres bersama.</p>
      <div className="office-trays">{trays.map((tray, index) => <button type="button" key={tray} className={`office-tray tray-${index}`} onClick={() => void file(index)} disabled={busy || !game}><span>{icons[index]}</span><strong>RAK {tray}</strong></button>)}</div>
      <div className="office-game-status" role="status">{error || feedback || `${game?.completed_rounds || 0} putaran selesai bersama`}</div><div className="office-progress"><div style={{ width: `${(game?.progress || 0) / 12 * 100}%` }} /></div><small className="office-game-disclaimer">Progres game terpisah dari poin kinerja pajak.</small>
    </div>
  </div>;
}
