"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { STUDIO_SEATS, studioDestination, studioWalkable, studioWalkingRoute, type StudioPoint, type StudioSeat } from '@/lib/office-studio-map';
import './office-studio.css';

type Pose = 'standing' | 'seated' | 'working';
const HOME: StudioPoint = { x: 40, y: 81 };
const ART = '/office-art/';

export function OfficeStudio() {
  const stage = useRef<HTMLDivElement>(null);
  const held = useRef<{ pointer: number; offset: StudioPoint } | null>(null);
  const skipClick = useRef(false);
  const soundEnabled = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const walkFrame = useRef<number | null>(null);
  const walkRun = useRef(0);
  const [position, setPosition] = useState<StudioPoint>(HOME);
  const [drag, setDrag] = useState<StudioPoint | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(STUDIO_SEATS[0].id);
  const [pose, setPose] = useState<Pose>('standing');
  const [landing, setLanding] = useState(false);
  const [walking, setWalking] = useState(false);
  const [notice, setNotice] = useState('Klik kursi yang bercahaya, atau seret Arif ke salah satu meja.');
  const [ready, setReady] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(false);
  const [achieved, setAchieved] = useState<string[]>([]);
  const loaded = ready.length === 2 && !failed;
  const activeSeat = STUDIO_SEATS.find(seat => seat.id === seatId);
  const here = drag || position;
  const target = drag ? studioDestination(drag) : null;
  const seated = !!activeSeat && !drag;
  const animation = drag ? 'lifted' : seated ? 'seated' : 'standing';

  useEffect(() => {
    const completed = Array.from(stage.current?.querySelectorAll<HTMLImageElement>('img[data-art]') || []);
    setReady(previous => [...new Set([...previous, ...completed.filter(img => img.complete && img.naturalWidth > 0).map(img => img.dataset.art!)])]);
    if (completed.some(img => img.complete && !img.naturalWidth)) setFailed(true);
  }, []);
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    const cancel = () => { held.current = null; setDrag(null); };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);
  useEffect(() => {
    if (!landing) return;
    const timer = setTimeout(() => setLanding(false), 480);
    return () => clearTimeout(timer);
  }, [landing]);
  useEffect(() => () => { if (walkFrame.current !== null) cancelAnimationFrame(walkFrame.current); }, []);

  function loadedArt(name: string) { setReady(previous => previous.includes(name) ? previous : [...previous, name]); }
  function mark(action: string) { setAchieved(previous => previous.includes(action) ? previous : [...previous, action]); }
  function stopWalk() {
    walkRun.current++;
    if (walkFrame.current !== null) cancelAnimationFrame(walkFrame.current);
    walkFrame.current = null; setWalking(false);
  }
  function walkTo(from: StudioPoint, to: StudioPoint) {
    const route = studioWalkingRoute(from, to);
    if (!route) { setNotice('Lorong menuju titik itu belum terbuka. Pilih lantai lain.'); return; }
    stopWalk(); setPosition(from); setWalking(true);
    const run = walkRun.current;
    const lengths = route.slice(1).map((point, i) => Math.hypot((point.x - route[i].x) * 1.77, point.y - route[i].y));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let started = 0;
    function tick(time: number) {
      if (run !== walkRun.current) return;
      if (!started) started = time;
      let distance = Math.min(total, (time - started) * .055);
      for (let i = 0; i < lengths.length; i++) {
        if (distance <= lengths[i] || i === lengths.length - 1) {
          const fraction = lengths[i] ? Math.min(1, distance / lengths[i]) : 1;
          setPosition({ x: route![i].x + (route![i + 1].x - route![i].x) * fraction, y: route![i].y + (route![i + 1].y - route![i].y) * fraction });
          break;
        }
        distance -= lengths[i];
      }
      if (time - started < total / .055) walkFrame.current = requestAnimationFrame(tick);
      else { walkFrame.current = null; setPosition(to); setWalking(false); setLanding(true); }
    }
    walkFrame.current = requestAnimationFrame(tick);
  }
  function chime(sit: boolean) {
    if (!soundEnabled.current) return;
    try {
      const context = audio.current || new AudioContext(); audio.current = context;
      void context.resume();
      const oscillator = context.createOscillator(); const volume = context.createGain();
      oscillator.connect(volume); volume.connect(context.destination);
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(sit ? 660 : 440, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(sit ? 880 : 300, context.currentTime + .12);
      volume.gain.setValueAtTime(.045, context.currentTime);
      volume.gain.exponentialRampToValueAtTime(.001, context.currentTime + .2);
      oscillator.start(); oscillator.stop(context.currentTime + .22);
    } catch { /* The visual interaction remains available if audio is unsupported. */ }
  }
  function sit(seat: StudioSeat) {
    if (!loaded) return;
    held.current = null; setDrag(null); stopWalk();
    setSeatId(seat.id); setSelectedId(seat.id); setPosition({ x: seat.x, y: seat.y });
    setPose('seated'); setLanding(true); mark('sit'); chime(true);
    setNotice(`Arif duduk di ${seat.label.toLowerCase()}. Pilih Mulai bekerja atau meja lain.`);
  }
  function toFloor(point: StudioPoint, animate = true) {
    const from = activeSeat?.stand || position;
    setSeatId(null); setPose('standing'); setLanding(false);
    if (animate) walkTo(from, point);
    else { stopWalk(); setPosition(point); setLanding(true); }
    mark('move'); chime(false);
    setNotice('Arif berpindah. Lorong dan area lantai kini bisa dijelajahi.');
  }
  function stand() {
    const seat = activeSeat;
    if (!seat) return;
    held.current = null; setDrag(null);
    toFloor(seat.stand);
  }
  function coordinates(event: { clientX: number; clientY: number }): StudioPoint {
    const rect = stage.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 };
  }
  function lift(event: PointerEvent<HTMLButtonElement>) {
    if (!loaded || held.current || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    const at = coordinates(event);
    held.current = { pointer: event.pointerId, offset: { x: at.x - position.x, y: at.y - position.y } };
    stage.current?.setPointerCapture(event.pointerId); setLanding(false); stopWalk(); setDrag(position);
    mark('lift'); setNotice('Lepas dekat salah satu kursi untuk duduk, atau di lorong untuk berpindah.');
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!held.current || held.current.pointer !== event.pointerId) return;
    const at = coordinates(event);
    setDrag({ x: Math.max(2, Math.min(98, at.x - held.current.offset.x)), y: Math.max(18, Math.min(97, at.y - held.current.offset.y)) });
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    const hold = held.current;
    if (!hold || hold.pointer !== event.pointerId) return;
    const at = coordinates(event);
    const point = { x: at.x - hold.offset.x, y: at.y - hold.offset.y };
    const next = studioDestination(point);
    held.current = null; skipClick.current = true; setTimeout(() => { skipClick.current = false; }, 0); setDrag(null);
    if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
    if (next?.kind === 'seat') sit(next.seat);
    else if (next?.kind === 'floor') toFloor(next.point, false);
    else { setLanding(true); setNotice('Area itu terhalang furnitur. Arif kembali ke posisi sebelumnya.'); }
  }
  function clickFloor(event: React.MouseEvent<HTMLDivElement>) {
    if (skipClick.current) { skipClick.current = false; return; }
    if (event.target !== stage.current || held.current || !loaded) return;
    const point = coordinates(event);
    if (studioWalkable(point)) toFloor(point);
  }
  function cancel() { held.current = null; setDrag(null); }
  function reset() {
    cancel(); stopWalk(); setPosition(HOME); setSeatId(null); setSelectedId(STUDIO_SEATS[0].id);
    setPose('standing'); setLanding(false); setAchieved([]);
    setNotice('Mulai lagi. Pilih meja, atau bawa Arif menyusuri kantor.');
  }

  return <main className="studio-page">
    <header className="studio-header"><Link href="/office" className="studio-brand"><span className="studio-monogram">L<span>m</span></span><span>LMATS<span className="studio-brand-sub">OUR LITTLE OFFICE</span></span></Link><div className="studio-header-right"><span className="studio-edition">STUDI VISUAL · 02</span><Link href="/office">Kantor bersama <span aria-hidden="true">↗</span></Link></div></header>
    <section className="studio-intro"><div><p className="studio-eyebrow">RUANG YANG BISA DIJELAJAHI</p><h1>Find your <em>place at work.</em></h1><p>Setiap meja pada ilustrasi kini punya kursi. Pilih satu, atau jelajahi lorong bersama Arif.</p></div><button className="studio-help-button" onClick={() => setHelp(!help)} aria-expanded={help}>Cara bermain <span aria-hidden="true">?</span></button></section>
    {help && <div className="studio-help"><strong>Semua meja bisa diduduki.</strong><span>Klik penanda kursi, pilih meja dari daftar, atau seret Arif ke kursi. Klik lantai untuk berpindah. Keyboard: fokuskan Arif, gunakan tombol panah untuk bergerak, Enter untuk duduk di meja pilihan, Escape untuk membatalkan drag.</span></div>}
    <section className="studio-frame" aria-label="Demo kantor ilustrasi interaktif">
      <div ref={stage} className={`studio-stage ${drag ? 'holding' : ''}`} onPointerMove={move} onPointerUp={release} onPointerCancel={cancel} onLostPointerCapture={cancel} onClick={clickFloor}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-art="room" className="studio-room-art" src={`${ART}studio-room-v2.png`} alt="Kantor dengan meja kayu, ruang partner berkaca, tanaman dan cahaya sore" draggable={false} onLoad={() => loadedArt('room')} onError={() => setFailed(true)} />
        <div className="studio-room-badge"><span className="studio-sun" aria-hidden="true">☀</span><div><strong>LMATS OFFICE</strong><span>{STUDIO_SEATS.length} kursi · semua meja dapat dipilih</span></div></div>
        {STUDIO_SEATS.map(seat => <button key={seat.id} className={`studio-seat-pin ${seatId === seat.id && !drag ? 'active' : ''} ${target?.kind === 'seat' && target.seat.id === seat.id ? 'welcome' : ''}`} style={{ left: `${seat.x}%`, top: `${seat.y}%` }} aria-label={`Duduk di ${seat.label}`} data-label={seat.label} title={seat.label} onClick={() => sit(seat)} disabled={!loaded || !!drag}><span aria-hidden="true">{seatId === seat.id && !drag ? '✓' : '+'}</span></button>)}
        {pose === 'working' && !drag && <div className="studio-working-bubble" style={{ left: `${position.x}%`, top: `${position.y - 20}%` }}><span /><span /><span /><small>Sedang fokus</small></div>}
        <div className={`studio-ground-shadow ${drag ? 'floating' : ''}`} style={{ left: `${here.x}%`, top: `${here.y}%` }} />
        {drag && <div className={`studio-drop-marker ${target ? 'valid' : 'invalid'}`} style={{ left: `${here.x}%`, top: `${here.y}%` }}><span>{target?.kind === 'seat' ? target.seat.desk : target ? 'Lepas di sini' : 'Cari lorong'}</span></div>}
        <button className={`studio-avatar ${drag ? 'lifted' : ''} ${seated ? 'seated' : ''} ${seated && activeSeat?.occluded ? 'occluded' : ''} ${walking ? 'walking' : ''} ${pose === 'working' ? 'working' : ''} ${landing ? 'landing' : ''}`} style={{ left: `${here.x}%`, top: `${here.y}%`, width: `${seated ? Math.max(7.2, Math.min(11, here.y * .15 + 1.5)) : Math.max(6.5, Math.min(10, here.y * .12 + .5))}%`, zIndex: drag ? 60 : seated ? 36 : 40 } as CSSProperties} onPointerDown={lift} onKeyDown={event => {
          if (event.key === 'Escape') { cancel(); return; }
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (seated) stand(); else sit(STUDIO_SEATS.find(seat => seat.id === selectedId)!); return; }
          const offset: Record<string, StudioPoint> = { ArrowLeft: { x: -3, y: 0 }, ArrowRight: { x: 3, y: 0 }, ArrowUp: { x: 0, y: -3 }, ArrowDown: { x: 0, y: 3 } };
          if (offset[event.key]) { event.preventDefault(); const from = seated ? activeSeat!.stand : position; const at = { x: from.x + offset[event.key].x, y: from.y + offset[event.key].y }; const next = studioDestination(at); if (next?.kind === 'seat') sit(next.seat); else if (next?.kind === 'floor') toFloor(next.point); }
        }} disabled={!loaded} aria-label={`Arif, ${seated ? `duduk di ${activeSeat?.label}` : 'berdiri'}. Seret untuk mengangkat, atau gunakan tombol panah.`}>
          <span className="studio-sprite-motion"><span className="studio-sprite-window">
            <picture>
              <source media="(prefers-reduced-motion: reduce)" srcSet={`${ART}character-${animation}-still-v3.webp`} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-art="character" className="studio-character-anim" src={`${ART}character-${animation}-v3.webp`} alt="" draggable={false} onLoad={() => loadedArt('character')} onError={() => setFailed(true)} />
            </picture>
          </span></span>
          <span className="studio-name"><i />Arif<span>{drag ? 'Diangkat' : pose === 'working' ? 'Fokus' : seated ? activeSeat?.desk : 'Itu kamu'}</span></span>
        </button>
        {!loaded && <div className="studio-loading" role="status"><span className="studio-loading-mark">Lm</span><strong>{failed ? 'Ilustrasi belum berhasil dimuat.' : 'Menyiapkan kantormu…'}</strong><span>{failed ? 'Periksa koneksi lalu muat ulang halaman.' : `${ready.length} dari 2 ilustrasi siap`}</span>{failed && <button onClick={() => window.location.reload()}>Muat ulang</button>}</div>}
        <div className="studio-scene-note"><span aria-hidden="true">✥</span> {drag ? 'Pilih tempatmu.' : 'Klik lantai atau seret Arif untuk berpindah.'}</div>
      </div>
      <aside className="studio-side-panel" aria-label="Panduan ruang latihan">
        <div className="studio-side-title"><span aria-hidden="true">♧</span><strong>Ruang latihan</strong><span className="studio-private">Pribadi</span></div>
        <div className="studio-side-tabs"><button className={!help ? 'selected' : ''} onClick={() => setHelp(false)}>Interaksi</button><button className={help ? 'selected' : ''} onClick={() => setHelp(true)}>Panduan</button></div>
        <div className="studio-side-profile"><div className="studio-portrait" aria-hidden="true" /><div><strong>Arif</strong><span>{drag ? 'Sedang diangkat' : pose === 'working' ? 'Sedang fokus' : seated ? `Di ${activeSeat?.desk}` : walking ? 'Berpindah' : 'Siap menjelajah'}</span></div><i /></div>
        {help ? <div className="studio-side-guide"><p><strong>01 · Angkat</strong>Tahan karakter, lalu seret. Bayangan menunjukkan lokasi mendarat.</p><p><strong>02 · Jelajahi kantor</strong>Klik lantai atau lepas Arif di lorong. Penanda hijau menunjukkan kursi.</p><p><strong>03 · Pilih meja</strong>Setiap kelompok meja, termasuk ruang partner, bisa diduduki.</p></div> : <><div className="studio-guide-message"><span>PANDUAN</span><p>{notice}</p></div><div className="studio-checklist"><span>COBA EMPAT GERAKAN</span>{[['lift','Angkat karakter'],['move','Pindah di kantor'],['sit','Duduk di meja'],['work','Mulai bekerja']].map(([id,label]) => <div className={achieved.includes(id) ? 'done' : ''} key={id}><i>{achieved.includes(id) ? '✓' : '○'}</i>{label}</div>)}</div></>}
        <div className="studio-social-link"><span>LANJUT BERSAMA TIM</span><Link href="/office">Chat & meeting <span aria-hidden="true">↗</span></Link></div>
      </aside>
      <div className="studio-control-bar"><div className="studio-live-caption"><span className={`studio-presence ${pose === 'working' ? 'focused' : ''}`} /><div><strong>{drag ? 'Sedang diangkat' : pose === 'working' ? 'Arif sedang bekerja' : seated ? `Duduk di ${activeSeat?.desk}` : walking ? 'Menjelajahi kantor' : 'Pilih kursi atau berjalan'}</strong><span role="status" aria-live="polite">{notice}</span></div></div><div className="studio-actions"><select aria-label="Pilih meja kerja" value={selectedId} onChange={event => { const seat = STUDIO_SEATS.find(item => item.id === event.target.value)!; setSelectedId(seat.id); sit(seat); }} disabled={!loaded || !!drag}>{STUDIO_SEATS.map(seat => <option value={seat.id} key={seat.id}>{seat.label}</option>)}</select>{seated ? <><button className="studio-primary" onClick={() => { setPose(pose === 'working' ? 'seated' : 'working'); mark('work'); setNotice(pose === 'working' ? 'Istirahat sebentar juga boleh.' : `Arif mulai bekerja di ${activeSeat?.label.toLowerCase()}.`); }} disabled={!!drag}>{pose === 'working' ? 'Istirahat' : 'Mulai bekerja'}</button><button onClick={stand} disabled={!!drag}>Berdiri</button></> : <button className="studio-primary" onClick={() => sit(STUDIO_SEATS.find(seat => seat.id === selectedId)!)} disabled={!loaded || !!drag}>Duduk <span aria-hidden="true">↗</span></button>}<button className="studio-sound" aria-pressed={sound} aria-label={sound ? 'Matikan efek suara' : 'Aktifkan efek suara'} onClick={() => { soundEnabled.current = !sound; setSound(!sound); if (!sound) chime(true); }}>{sound ? '♪' : '♩'}<span>{sound ? 'Suara aktif' : 'Efek suara'}</span></button><button className="studio-reset" onClick={reset} disabled={!loaded} aria-label="Ulangi demo">↺</button></div></div>
    </section>
    <footer className="studio-footer"><span><i /> Demo ilustrasi & interaksi</span><p>Gerakan di ruang latihan ini hanya berlaku di perangkatmu.</p><Link href="/office">Chat & meeting di kantor bersama →</Link></footer>
  </main>;
}
