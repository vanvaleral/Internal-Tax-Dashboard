"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OfficeGame } from "./office-game";
import "./virtual-office.css";

type Person = { staff_profile_id: string; avatar_color: string; desk_style: string; x: number; y: number; staff: { display_name: string | null; full_name: string } | null };
type Message = { id: number; staff_profile_id: string; message: string; created_at: string; staff: { display_name: string | null; full_name: string } | null };
type OfficeData = { me: { id: string; name: string }; profiles: Person[]; messages: Message[] };
const palette = ["teal", "blue", "coral", "violet", "gold"];
const furniture = [{ id: "plant", icon: "🪴", label: "Tanaman" }, { id: "lamp", icon: "💡", label: "Lampu" }, { id: "books", icon: "📚", label: "Buku" }, { id: "coffee", icon: "☕", label: "Kopi" }];
const nameOf = (person: { staff: { display_name: string | null; full_name: string } | null }) => person.staff?.display_name || person.staff?.full_name || "Rekan tim";

export function VirtualOffice({ gameEnabled }: { gameEnabled: boolean }) {
  const [data, setData] = useState<OfficeData | null>(null);
  const [position, setPosition] = useState({ x: 4, y: 4 });
  const [color, setColor] = useState("teal");
  const [desk, setDesk] = useState("plant");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const positionRef = useRef(position);
  const colorRef = useRef(color);
  const deskRef = useRef(desk);
  const chatEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/office", { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Kantor belum dapat dimuat.");
      setData(next);
      if (!initialized.current) {
        const mine = next.profiles.find((person: Person) => person.staff_profile_id === next.me.id);
        if (mine) {
          setPosition({ x: mine.x, y: mine.y }); setColor(mine.avatar_color); setDesk(mine.desk_style);
          positionRef.current = { x: mine.x, y: mine.y }; colorRef.current = mine.avatar_color; deskRef.current = mine.desk_style;
        }
        initialized.current = true;
      }
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Koneksi terputus."); }
  }, []);

  const save = useCallback(async (nextPosition = positionRef.current, nextColor = colorRef.current, nextDesk = deskRef.current) => {
    try {
      const response = await fetch("/api/office", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: nextPosition.x, y: nextPosition.y, avatarColor: nextColor, deskStyle: nextDesk }) });
      if (!response.ok) throw new Error((await response.json()).error || "Gagal menyimpan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal menyimpan."); }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 5000);
    const heartbeat = window.setInterval(() => void save(), 20000);
    return () => { window.clearInterval(poll); window.clearInterval(heartbeat); };
  }, [refresh, save]);

  useEffect(() => { if (initialized.current && data && !data.profiles.some(person => person.staff_profile_id === data.me.id)) void save(); }, [data, save]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [data?.messages.length]);

  function move(x: number, y: number) {
    const next = { x: Math.max(0, Math.min(11, x)), y: Math.max(0, Math.min(7, y)) };
    setPosition(next); positionRef.current = next; void save(next);
  }
  function chooseColor(next: string) { setColor(next); colorRef.current = next; void save(positionRef.current, next); }
  function chooseDesk(next: string) { setDesk(next); deskRef.current = next; void save(positionRef.current, colorRef.current, next); }
  async function sendMessage() {
    if (busy || !message.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/office", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", message }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Aksi gagal.");
      setMessage("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Aksi gagal."); }
    finally { setBusy(false); }
  }

  const people = data?.profiles || [];
  const occupants = people.filter(person => person.staff_profile_id !== data?.me.id);
  return <main className="office-page">
    <header className="office-header"><div><span className="office-eyebrow">LMATS · TAX DASHBOARD</span><h1>Kantor Virtual</h1><p>Tempat singgah bersama di sela pekerjaan.</p></div><Link href="/dashboard" className="office-back">← Kembali ke dashboard</Link></header>
    {error && <div className="office-error" role="alert">{error}</div>}
    <div className="office-layout">
      <section className="office-main-card"><div className="office-card-head"><div><span className="office-eyebrow">RUANG BERSAMA</span><h2>Studio Tax Team</h2></div><span className="office-online"><i />{people.length} online</span></div>
        <div className="office-room" role="grid" aria-label="Peta kantor virtual" onKeyDown={event => { if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) { event.preventDefault(); move(position.x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0), position.y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0)); } }} tabIndex={0}>
          <div className="office-room-label">THE COMMON ROOM <span>✦</span></div>
          <div className="office-table"><span>☕</span><small>MEJA BERSAMA</small></div>
          <div className="office-rug" />
          <div className="office-window">☀</div>
          <div className="office-bookshelf">▥<small>ARSIP</small></div>
          <div className="office-own-desk"><span>{furniture.find(item => item.id === desk)?.icon}</span><small>MEJAMU</small></div>
          {occupants.map(person => <div key={person.staff_profile_id} className="office-person" style={{ left: `${(person.x + .5) / 12 * 100}%`, top: `${(person.y + .5) / 8 * 100}%` }} title={nameOf(person)}><span className={`office-avatar ${person.avatar_color}`}>●</span><small>{nameOf(person)}</small></div>)}
          <div className="office-person office-me" style={{ left: `${(position.x + .5) / 12 * 100}%`, top: `${(position.y + .5) / 8 * 100}%` }}><span className={`office-avatar ${color}`}>●</span><small>{data?.me.name || "Kamu"} (kamu)</small></div>
          <div className="office-floor-grid">{Array.from({ length: 96 }, (_, index) => <button key={index} type="button" aria-label={`Berjalan ke petak ${index % 12 + 1}, ${Math.floor(index / 12) + 1}`} onClick={() => move(index % 12, Math.floor(index / 12))} />)}</div>
        </div>
        <p className="office-hint">Klik lantai untuk berjalan, atau gunakan tombol panah saat peta dipilih. Posisi rekan diperbarui setiap beberapa detik.</p>
        <div className="office-desk-panel"><div><span className="office-eyebrow">SUDUTMU</span><h3>Tata meja kerjamu</h3><p>Dekorasi dan warna avatar tersimpan untuk kunjungan berikutnya.</p></div><div className="office-picker"><span>Warna avatar</span><div>{palette.map(item => <button key={item} type="button" className={`office-color ${item} ${color === item ? "selected" : ""}`} onClick={() => chooseColor(item)} aria-label={`Warna ${item}`} aria-pressed={color === item} />)}</div></div><div className="office-picker"><span>Hiasan meja</span><div>{furniture.map(item => <button key={item.id} type="button" className={`office-furniture ${desk === item.id ? "selected" : ""}`} onClick={() => chooseDesk(item.id)} aria-pressed={desk === item.id} title={item.label}>{item.icon}<small>{item.label}</small></button>)}</div></div></div>
      </section>
      <aside className="office-side">
        <section className="office-card office-chat"><div className="office-card-head"><div><span className="office-eyebrow">OBROLAN</span><h2>Ruang ngobrol</h2></div><span>💬</span></div><div className="office-messages" aria-live="polite">{!data?.messages.length && <p className="office-empty">Belum ada pesan. Sapa rekanmu duluan!</p>}{data?.messages.map(item => <div className={`office-message ${item.staff_profile_id === data?.me.id ? "mine" : ""}`} key={item.id}><strong>{item.staff_profile_id === data?.me.id ? "Kamu" : nameOf(item)}</strong><p>{item.message}</p><time>{new Date(item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time></div>)}<div ref={chatEnd} /></div><form onSubmit={event => { event.preventDefault(); void sendMessage(); }}><input value={message} maxLength={280} onChange={event => setMessage(event.target.value)} placeholder="Tulis pesan untuk tim..." aria-label="Pesan untuk tim" /><button type="submit" disabled={busy || !message.trim()}>Kirim</button></form></section>
        {gameEnabled && <OfficeGame />}
      </aside>
    </div>
  </main>;
}
