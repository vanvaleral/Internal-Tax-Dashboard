"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OfficeGame } from "./office-game";
import { OfficeScene } from "./office-scene";
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
  const [chatOpen, setChatOpen] = useState(true);
  const [gameOpen, setGameOpen] = useState(false);
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

  const others = (data?.profiles || []).filter(person => person.staff_profile_id !== data?.me.id);
  const online = others.length + (data ? 1 : 0);
  const recent = (staffId: string) => data?.messages.slice().reverse().find(item => item.staff_profile_id === staffId && Date.now() - new Date(item.created_at).getTime() < 18000)?.message;
  const avatars = [
    ...others.map(person => ({ id: person.staff_profile_id, name: nameOf(person), color: person.avatar_color, x: person.x, y: person.y, bubble: recent(person.staff_profile_id) })),
    { id: "me", name: data?.me.name || "Kamu", color, x: position.x, y: position.y, mine: true }
  ];

  return <main className="office-page">
    <div className="office-topbar"><div className="office-brand"><span className="office-brand-icon">✦</span><div><span>LMATS WORLD</span><strong>Kantor Virtual</strong></div></div><div className="office-top-actions"><span className="office-online"><i />{online} online</span><Link href="/dashboard" className="office-back">← Dashboard</Link></div></div>
    {error && <div className="office-error" role="alert">{error}</div>}
    <div className="office-game-shell">
      <div className="office-scene-wrap" tabIndex={0} onKeyDown={event => { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); move(position.x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0), position.y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0)); } }}>
        <OfficeScene avatars={avatars} decoration={desk} gameEnabled={gameEnabled} onMove={move} onGame={() => setGameOpen(true)} />
        <div className="office-scene-title"><span>✧ RUANG 01</span><strong>Common Room</strong><small>Klik lantai untuk berjalan · gunakan tombol panah</small></div>
        <div className="office-scene-actions"><button onClick={() => setChatOpen(!chatOpen)}>💬 {chatOpen ? "Tutup chat" : "Buka chat"}</button>{gameEnabled && <button onClick={() => setGameOpen(true)}>📁 Main bersama</button>}</div>
        {chatOpen && <section className="office-chat-dock" aria-label="Chat dalam game"><div className="office-chat-head"><span>💬 Chatroom</span><small>{online} pemain online</small><button onClick={() => setChatOpen(false)} aria-label="Tutup chat">×</button></div><div className="office-messages" aria-live="polite">{!data?.messages.length && <p className="office-empty">Belum ada pesan. Sapa rekanmu!</p>}{data?.messages.map(item => <div className="office-message" key={item.id}><strong>{item.staff_profile_id === data?.me.id ? "Kamu" : nameOf(item)}</strong><span>{item.message}</span></div>)}<div ref={chatEnd} /></div><form onSubmit={event => { event.preventDefault(); void sendMessage(); }}><input value={message} maxLength={280} onChange={event => setMessage(event.target.value)} placeholder="Ketik pesan ke ruangan..." aria-label="Pesan untuk chatroom" /><button type="submit" disabled={busy || !message.trim()}>➤</button></form></section>}
        {gameEnabled && gameOpen && <OfficeGame onClose={() => setGameOpen(false)} />}
      </div>
      <div className="office-bottom-bar"><div className="office-character-panel"><span className={`office-mini-avatar ${color}`}>●</span><div><strong>{data?.me.name || "Kamu"}</strong><small>Penghuni kantor</small></div></div><div className="office-customize"><span>Warna avatar</span>{palette.map(item => <button key={item} type="button" className={`office-color ${item} ${color === item ? "selected" : ""}`} onClick={() => chooseColor(item)} aria-label={`Warna ${item}`} aria-pressed={color === item} />)}</div><div className="office-customize"><span>Hiasan mejamu</span>{furniture.map(item => <button key={item.id} type="button" className={`office-furniture ${desk === item.id ? "selected" : ""}`} onClick={() => chooseDesk(item.id)} aria-label={item.label} aria-pressed={desk === item.id}>{item.icon}</button>)}</div></div>
    </div>
  </main>;
}
