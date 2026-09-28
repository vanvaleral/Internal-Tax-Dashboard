"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OfficeGame } from './office-game';
import { OfficeScene } from './office-scene';
import { OfficeVoice } from './office-voice';
import { OFFICE_DESKS, OFFICE_SEATS, OFFICE_SPAWN, validFloorPoint, type OfficePoint } from '@/lib/office-layout';
import './virtual-office.css';

type Person = { staff_profile_id: string; avatar_color: string; desk_style: string; position_x: number; position_y: number; seat_id: string | null; activity: string; staff: { display_name: string | null; full_name: string } | null };
type Message = { id: number; staff_profile_id: string; message: string; created_at: string; staff: { display_name: string | null; full_name: string } | null };
type OfficeData = { me: { id: string; name: string }; mine: Person | null; profiles: Person[]; messages: Message[] };
const palette = ['teal', 'blue', 'coral', 'violet', 'gold'];
const furniture = [{ id: 'plant', label: 'Tanaman', icon: '✿' }, { id: 'lamp', label: 'Lampu', icon: '☀' }, { id: 'books', label: 'Buku', icon: '▤' }, { id: 'coffee', label: 'Kopi', icon: '☕' }];
const personName = (p: { staff: Person['staff'] }) => p.staff?.display_name || p.staff?.full_name || 'Rekan tim';

export function VirtualOffice({ gameEnabled, voiceEnabled = true }: { gameEnabled: boolean; voiceEnabled?: boolean }) {
  const [data, setData] = useState<OfficeData | null>(null);
  const [mine, setMine] = useState<Person | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDesk, setSelectedDesk] = useState<string | null>(null);
  const [customize, setCustomize] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [tab, setTab] = useState('chat');
  const pending = useRef(0);
  const revision = useRef(0);
  const queue = useRef(Promise.resolve());
  const chatEnd = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    const startedAtRevision = revision.current;
    try {
      const response = await fetch('/api/office', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'Kantor belum dapat dimuat.');
      setData(next);
      if (pending.current === 0 && startedAtRevision === revision.current) setMine(next.mine);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Koneksi terputus.'); }
  }, []);
  const mutate = useCallback((body: Record<string, unknown>) => {
    revision.current++; pending.current++; setSaving(true);
    queue.current = queue.current.then(async () => {
      try {
        const response = await fetch('/api/office', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Perubahan belum tersimpan.');
        setMine(result.profile); setError('');
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal menyimpan.'); }
      finally { pending.current--; setSaving(pending.current > 0); }
    });
    return queue.current;
  }, []);
  useEffect(() => {
    void refresh().then(() => mutate({ action: 'heartbeat' }));
    const poll = setInterval(() => void refresh(), 4000);
    const heartbeat = setInterval(() => void mutate({ action: 'heartbeat' }), 15000);
    return () => { clearInterval(poll); clearInterval(heartbeat); };
  }, [refresh, mutate]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); }, [data?.messages.at(-1)?.id, tab]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  const others = (data?.profiles || []).filter(p => p.staff_profile_id !== data?.me.id);
  const recent = (id: string) => data?.messages.slice().reverse().find(m => m.staff_profile_id === id && Date.now() - new Date(m.created_at).getTime() < 18000)?.message;
  const avatars = [...others.map(p => ({ id: p.staff_profile_id, name: personName(p), color: p.avatar_color, x: p.position_x, y: p.position_y, seatId: p.seat_id, activity: p.activity, bubble: recent(p.staff_profile_id) })), { id: 'me', name: data?.me.name || 'Kamu', color: mine?.avatar_color || 'teal', x: mine?.position_x ?? OFFICE_SPAWN.x, y: mine?.position_y ?? OFFICE_SPAWN.y, mine: true, seatId: mine?.seat_id, activity: mine?.activity, bubble: data ? recent(data.me.id) : undefined }];
  const occupied = new Set(others.map(p => p.seat_id).filter(Boolean));
  const deskInfo = OFFICE_DESKS.find(d => d.id === selectedDesk);
  const deskSeats = OFFICE_SEATS.filter(s => s.deskId === selectedDesk);
  const ownSeat = OFFICE_SEATS.find(s => s.id === mine?.seat_id);
  const online = others.length + (data ? 1 : 0);

  function move(point: OfficePoint, seatId: string | null) {
    if (!data || saving) { setNotice('Tunggu sampai posisi sebelumnya tersimpan.'); return; }
    if (seatId && occupied.has(seatId)) { setNotice('Kursi itu sedang dipakai. Pilih kursi kosong.'); return; }
    if (mine) setMine({ ...mine, position_x: point.x, position_y: point.y, seat_id: seatId, activity: seatId ? 'seated' : 'idle' });
    void mutate({ action: 'move', x: point.x, y: point.y, seatId }).then(() => refresh());
    setNotice(seatId ? 'Duduk di meja. Pilih Mulai bekerja untuk menggunakan meja.' : 'Posisi karakter diperbarui.');
  }
  function standUp() {
    if (!mine) return;
    const candidates = [{ x: mine.position_x + 52, y: mine.position_y }, { x: mine.position_x - 52, y: mine.position_y }, { x: mine.position_x, y: mine.position_y + 54 }, { x: mine.position_x, y: mine.position_y - 54 }];
    move(candidates.find(validFloorPoint) || OFFICE_SPAWN, null);
  }
  async function sendMessage() {
    if (sending || !message.trim()) return; setSending(true);
    try {
      const response = await fetch('/api/office', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'chat', message }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setMessage(''); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pesan belum terkirim.'); }
    finally { setSending(false); }
  }
  return <main className="office-page">
    <header className="office-topbar"><div className="office-brand"><span className="office-brand-icon">L<span>m</span></span><div><span>LMATS CONSULTING</span><strong>Our workspace</strong></div></div><div className="office-top-actions"><Link href="/office/studio" className="office-back">Coba studio 2D ↗</Link><span className="office-online"><i />{online} di kantor</span><Link href="/dashboard" className="office-back">Kembali ke dashboard ↗</Link></div></header>
    <div className="office-game-shell"><div className="office-world-heading"><div><span className="office-eyebrow">VIRTUAL OFFICE</span><h1>Ruang untuk bekerja. Tempat untuk bertemu.</h1></div><div className="office-toolbar"><button onClick={() => setCustomize(!customize)} aria-expanded={customize}>◈ Karakter & dekorasi</button>{gameEnabled && <button onClick={() => setGameOpen(true)}>▧ Mini game</button>}</div></div>
      {error && <div className="office-error" role="alert">{error}</div>}
      <div className="office-workspace"><div className="office-room-column"><div className="office-room-caption"><span><i /> Denah kantor LMATS</span><small>{saving ? 'Menyimpan…' : 'Seret karaktermu · lepas di kursi untuk duduk'}</small></div>
        <div className="office-scene-wrap"><div className="office-map-scroll"><OfficeScene avatars={avatars} decoration={mine?.desk_style || 'plant'} onDrop={move} onDesk={setSelectedDesk} onInvalidDrop={() => setNotice('Lokasi terhalang meja atau dinding. Lepas di lantai atau kursi.')} /></div>{notice && <div className="office-scene-toast" role="status">{notice}</div>}{gameEnabled && gameOpen && <OfficeGame onClose={() => setGameOpen(false)} />}</div>
        <div className="office-desk-inspector"><div><span className="office-eyebrow">{deskInfo ? 'MEJA TERPILIH' : 'AKTIVITASMU'}</span><strong>{deskInfo?.name || (ownSeat ? OFFICE_DESKS.find(d => d.id === ownSeat.deskId)?.name : 'Sedang di ruang kerja')}</strong><small>{mine?.activity === 'working' ? 'Bekerja di meja · bisa tetap mengikuti meeting suara' : ownSeat ? 'Duduk · siap mulai bekerja' : 'Pilih meja atau seret karakter ke salah satu kursi.'}</small></div><div className="office-desk-actions">{deskInfo && deskSeats.map(seat => <button key={seat.id} disabled={saving || occupied.has(seat.id) || mine?.seat_id === seat.id} onClick={() => move(seat, seat.id)}>{seat.id.toUpperCase()} · {occupied.has(seat.id) ? 'Terisi' : mine?.seat_id === seat.id ? 'Kursimu' : 'Duduk'}</button>)}{ownSeat && <><button className="office-primary" disabled={saving} onClick={() => void mutate({ action: 'activity', activity: mine?.activity === 'working' ? 'seated' : 'working' })}>{mine?.activity === 'working' ? 'Selesai bekerja' : 'Mulai bekerja'}</button><button disabled={saving} onClick={standUp}>Berdiri</button></>}</div></div>
        {customize && <div className="office-customize-panel"><div><span>Warna pakaian</span><div>{palette.map(color => <button key={color} aria-label={`Pakaian ${color}`} aria-pressed={mine?.avatar_color === color} className={`office-color ${color} ${mine?.avatar_color === color ? 'selected' : ''}`} onClick={() => void mutate({ action: 'appearance', avatarColor: color, deskStyle: mine?.desk_style || 'plant' })} />)}</div></div><div><span>Dekorasi personal di kursimu</span><div>{furniture.map(item => <button key={item.id} aria-pressed={mine?.desk_style === item.id} className={`office-furniture ${mine?.desk_style === item.id ? 'selected' : ''}`} onClick={() => void mutate({ action: 'appearance', avatarColor: mine?.avatar_color || 'teal', deskStyle: item.id })}>{item.icon} {item.label}</button>)}</div></div></div>}
        <div className="office-room-footer"><span><b className="office-legend empty" /> Kursi tersedia</span><span><b className="office-legend active" /> Sedang bekerja</span><small>Denah mengikuti referensi ruanganmu.</small></div>
      </div><aside className="office-sidebar"><div className="office-sidebar-tabs"><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Percakapan</button>{voiceEnabled && <button className={tab === 'voice' ? 'active' : ''} onClick={() => setTab('voice')}>Meeting suara</button>}</div>
        <section className="office-chat-dock" hidden={tab !== 'chat'}><div className="office-panel-heading"><span className="office-feature-icon">☷</span><div><h2>Chat kantor</h2><p>Semua rekan dalam satu percakapan.</p></div></div><div className="office-messages" aria-live="polite">{!data?.messages.length && <div className="office-empty"><span>✧</span><strong>Mulai percakapan</strong><p>Sapa rekanmu atau ajak mereka bergabung ke meeting.</p></div>}{data?.messages.map(item => <div className={`office-message ${item.staff_profile_id === data.me.id ? 'own' : ''}`} key={item.id}><strong>{item.staff_profile_id === data.me.id ? 'Kamu' : personName(item)}</strong><p>{item.message}</p><time>{new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</time></div>)}<div ref={chatEnd} /></div><form onSubmit={event => { event.preventDefault(); void sendMessage(); }}><input maxLength={280} value={message} onChange={event => setMessage(event.target.value)} placeholder="Pesan untuk rekan…" aria-label="Pesan chat kantor" /><button disabled={sending || !message.trim()} aria-label="Kirim pesan">↑</button></form></section>
        {voiceEnabled && <div hidden={tab !== 'voice'}><OfficeVoice /></div>}
        <div className="office-present-people"><span className="office-eyebrow">DI RUANGAN INI</span><div className="office-person-row"><i className={`office-person-dot ${mine?.avatar_color || 'teal'}`} /><span>{data?.me.name || 'Memuat…'} <small>(kamu)</small></span><small>{mine?.activity === 'working' ? 'Bekerja' : 'Online'}</small></div>{others.map(p => <div className="office-person-row" key={p.staff_profile_id}><i className={`office-person-dot ${p.avatar_color}`} /><span>{personName(p)}</span><small>{p.activity === 'working' ? 'Bekerja' : 'Online'}</small></div>)}</div>
      </aside></div>
    </div>
  </main>;
}
