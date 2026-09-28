"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import './office-studio.css';

type Point = { x: number; y: number };
type Pose = 'standing' | 'seated' | 'working';
const HOME: Point = { x: 40, y: 81 };
const SEAT: Point = { x: 61, y: 86 };
const ART = '/office-art/';

function destination(point: Point): 'desk' | 'floor' | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  if (point.x >= 50 && point.x <= 76 && point.y >= 64 && point.y <= 91) return 'desk';
  if (point.x >= 23 && point.x <= 77 && point.y >= 62 && point.y <= 89) return 'floor';
  return null;
}

export function OfficeStudio() {
  const stage = useRef<HTMLDivElement>(null);
  const held = useRef<{ pointer: number; offset: Point } | null>(null);
  const [position, setPosition] = useState<Point>(HOME);
  const [drag, setDrag] = useState<Point | null>(null);
  const [pose, setPose] = useState<Pose>('standing');
  const [landing, setLanding] = useState(false);
  const [notice, setNotice] = useState('Seret Arif ke meja untuk duduk.');
  const [ready, setReady] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(false);
  const [achieved, setAchieved] = useState<string[]>([]);
  const soundEnabled = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const loaded = ready.length === 3 && !failed;
  const here = drag || position;
  const target = drag ? destination(drag) : null;
  const seated = pose !== 'standing' && !drag;

  useEffect(() => {
    // Cached images can finish before React attaches their load handlers.
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

  function loadedArt(name: string) { setReady(previous => previous.includes(name) ? previous : [...previous, name]); }
  function mark(action: string) { setAchieved(previous => previous.includes(action) ? previous : [...previous, action]); }
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
  function sit() {
    if (!loaded) return;
    held.current = null; setDrag(null); setPosition(SEAT); setPose('seated'); setLanding(true);
    setNotice('Nyaman di meja. Siap mulai bekerja?'); chime(true);
    mark('sit');
  }
  function stand() {
    held.current = null; setDrag(null); setPose('standing'); setPosition({ x: 41, y: 85 }); setLanding(true);
    setNotice('Waktunya meregangkan kaki. Seret Arif untuk berpindah.');
  }
  function coordinates(event: PointerEvent): Point {
    const rect = stage.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 };
  }
  function lift(event: PointerEvent<HTMLButtonElement>) {
    if (!loaded || held.current || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    const at = coordinates(event);
    held.current = { pointer: event.pointerId, offset: { x: at.x - position.x, y: at.y - position.y } };
    stage.current?.setPointerCapture(event.pointerId); setLanding(false); setDrag(position);
    mark('lift');
    setNotice('Lepas di lingkaran meja untuk duduk, atau di lantai untuk berpindah.');
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!held.current || held.current.pointer !== event.pointerId) return;
    const at = coordinates(event);
    setDrag({ x: Math.max(3, Math.min(97, at.x - held.current.offset.x)), y: Math.max(25, Math.min(97, at.y - held.current.offset.y)) });
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    const hold = held.current;
    if (!hold || hold.pointer !== event.pointerId) return;
    const at = coordinates(event);
    const point = { x: at.x - hold.offset.x, y: at.y - hold.offset.y };
    const next = destination(point);
    held.current = null; setDrag(null);
    if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
    if (next === 'desk') sit();
    else if (next === 'floor') { setPosition(point); setPose('standing'); setLanding(true); setNotice('Sampai. Coba angkat lagi, atau duduk di meja.'); chime(false); mark('move'); }
    else { setLanding(true); setNotice('Di sana belum bisa ditempati. Arif kembali ke posisi sebelumnya.'); }
  }
  function cancel() { held.current = null; setDrag(null); }
  function reset() { cancel(); setPosition(HOME); setPose('standing'); setLanding(false); setAchieved([]); setNotice('Mulai lagi. Angkat Arif dan bawa ke meja.'); }

  return <main className="studio-page">
    <header className="studio-header"><Link href="/office" className="studio-brand"><span className="studio-monogram">L<span>m</span></span><span>LMATS<span className="studio-brand-sub">OUR LITTLE OFFICE</span></span></Link><div className="studio-header-right"><span className="studio-edition">STUDI VISUAL · 01</span><Link href="/office">Kantor bersama <span aria-hidden="true">↗</span></Link></div></header>
    <section className="studio-intro"><div><p className="studio-eyebrow">SEBUAH SUDUT UNTUK MEMULAI</p><h1>Make yourself <em>at work.</em></h1><p>Kenali Arif. Angkat, pindahkan, lalu buat ia nyaman di meja kerjanya.</p></div><button className="studio-help-button" onClick={() => setHelp(!help)} aria-expanded={help}>Cara bermain <span aria-hidden="true">?</span></button></section>
    {help && <div className="studio-help"><strong>Ruang kecil, banyak gerakan.</strong><span>Tekan dan tahan Arif, seret, lalu lepas. Lingkaran hijau berarti bisa ditempati. Klik meja untuk langsung duduk. Dengan keyboard, fokuskan Arif lalu gunakan tombol panah, Enter untuk duduk, dan Escape untuk membatalkan drag.</span></div>}
    <section className="studio-frame" aria-label="Demo kantor ilustrasi interaktif">
      <div ref={stage} className={`studio-stage ${drag ? 'holding' : ''}`} onPointerMove={move} onPointerUp={release} onPointerCancel={cancel} onLostPointerCapture={cancel}>
        {/* Native images keep original generated artwork and its alpha intact. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-art="room" className="studio-room-art" src={`${ART}studio-room-v2.png`} alt="Kantor dengan meja kayu, ruang partner berkaca, tanaman dan cahaya sore" draggable={false} onLoad={() => loadedArt('room')} onError={() => setFailed(true)} />
        <div className="studio-room-badge"><span className="studio-sun" aria-hidden="true">☀</span><div><strong>LMATS OFFICE</strong><span>Ruang latihan · Arif</span></div></div>
        <button className={`studio-seat-target ${target === 'desk' ? 'welcome' : ''} ${seated ? 'occupied' : ''}`} onClick={sit} disabled={!loaded || seated || !!drag} aria-label="Duduk di meja"><span aria-hidden="true">{seated ? '✓' : '+'}</span><span>{target === 'desk' ? 'Lepas untuk duduk' : seated ? 'Meja Arif' : 'Duduk di sini'}</span></button>
        <div className="studio-desk-shadow" />
        <button className="studio-desk" onClick={sit} disabled={!loaded || !!drag} aria-label="Meja kerja Arif, klik untuk duduk">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-art="desk" src={`${ART}studio-desk-v1.png`} alt="Meja kayu dengan komputer, tanaman dan secangkir kopi" draggable={false} onLoad={() => loadedArt('desk')} onError={() => setFailed(true)} />
        </button>
        {pose === 'working' && !drag && <div className="studio-working-bubble"><span /><span /><span /><small>Sedang fokus</small></div>}
        <div className={`studio-ground-shadow ${drag ? 'floating' : ''}`} style={{ left: `${here.x}%`, top: `${here.y}%` }} />
        {drag && <div className={`studio-drop-marker ${target ? 'valid' : 'invalid'}`} style={{ left: `${here.x}%`, top: `${here.y}%` }}><span>{target === 'desk' ? 'Ke meja' : target ? 'Lepas di sini' : 'Cari lantai kosong'}</span></div>}
        <button className={`studio-avatar ${drag ? 'lifted' : ''} ${seated ? 'seated' : ''} ${pose === 'working' ? 'working' : ''} ${landing ? 'landing' : ''}`} style={{ left: `${here.x}%`, top: `${here.y}%`, zIndex: drag ? 60 : seated || here.y < 80 ? 20 : 40 } as CSSProperties} onPointerDown={lift} onKeyDown={event => {
          if (event.key === 'Escape') { cancel(); return; }
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (seated) stand(); else sit(); return; }
          const offset: Record<string, Point> = { ArrowLeft: { x: -3, y: 0 }, ArrowRight: { x: 3, y: 0 }, ArrowUp: { x: 0, y: -3 }, ArrowDown: { x: 0, y: 3 } };
          if (offset[event.key]) { event.preventDefault(); if (seated) { stand(); return; } const at = { x: position.x + offset[event.key].x, y: position.y + offset[event.key].y }; const next = destination(at); if (next === 'desk') sit(); else if (next) { setPosition(at); setLanding(true); } }
        }} disabled={!loaded} aria-label={`Arif, ${seated ? 'duduk di meja' : 'berdiri'}. Seret untuk mengangkat, atau gunakan tombol panah.`}>
          <span className="studio-sprite-motion"><span className={`studio-sprite-window frame-${drag ? 1 : seated ? 2 : 0}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-art="character" src={`${ART}character-poses-v2.png`} alt="" draggable={false} onLoad={() => loadedArt('character')} onError={() => setFailed(true)} />
          </span></span>
          <span className="studio-name"><i />Arif<span>{drag ? 'Diangkat' : pose === 'working' ? 'Fokus' : seated ? 'Duduk' : 'Itu kamu'}</span></span>
        </button>
        {!loaded && <div className="studio-loading" role="status"><span className="studio-loading-mark">Lm</span><strong>{failed ? 'Ilustrasi belum berhasil dimuat.' : 'Menyiapkan sudut kerjamu…'}</strong><span>{failed ? 'Periksa koneksi lalu muat ulang halaman.' : `${ready.length} dari 3 ilustrasi siap`}</span>{failed && <button onClick={() => window.location.reload()}>Muat ulang</button>}</div>}
        <div className="studio-scene-note"><span aria-hidden="true">✥</span> {drag ? 'Pegang sebentar. Pilih tempatmu.' : 'Cahaya hangat. Ide yang segar.'}</div>
      </div>
      <aside className="studio-side-panel" aria-label="Panduan ruang latihan">
        <div className="studio-side-title"><span aria-hidden="true">♧</span><strong>Ruang latihan</strong><span className="studio-private">Pribadi</span></div>
        <div className="studio-side-tabs"><button className={!help ? 'selected' : ''} onClick={() => setHelp(false)}>Interaksi</button><button className={help ? 'selected' : ''} onClick={() => setHelp(true)}>Panduan</button></div>
        <div className="studio-side-profile"><div className="studio-portrait" aria-hidden="true" /><div><strong>Arif</strong><span>{drag ? 'Sedang diangkat' : pose === 'working' ? 'Sedang fokus' : seated ? 'Duduk di meja' : 'Siap menjelajah'}</span></div><i /></div>
        {help ? <div className="studio-side-guide"><p><strong>01 · Angkat</strong>Tahan karakter, lalu seret. Bayangan menunjukkan lokasi mendarat.</p><p><strong>02 · Temukan tempat</strong>Lepas di lantai kosong. Bawa ke meja di depan untuk duduk otomatis.</p><p><strong>03 · Mulai bekerja</strong>Pilih Mulai bekerja, atau Berdiri untuk kembali bergerak.</p></div> : <><div className="studio-guide-message"><span>PANDUAN</span><p>{notice}</p></div><div className="studio-checklist"><span>COBA EMPAT GERAKAN</span>{[['lift','Angkat karakter'],['move','Pindahkan ke lantai'],['sit','Duduk di meja'],['work','Mulai bekerja']].map(([id,label]) => <div className={achieved.includes(id) ? 'done' : ''} key={id}><i>{achieved.includes(id) ? '✓' : '○'}</i>{label}</div>)}</div></>}
        <div className="studio-social-link"><span>LANJUT BERSAMA TIM</span><strong>Obrolan yang membuat<br />kantor terasa hidup.</strong><p>Chat dan meeting suara tersedia di kantor bersama.</p><Link href="/office">Masuk kantor bersama <span aria-hidden="true">↗</span></Link></div>
      </aside>
      <div className="studio-control-bar"><div className="studio-live-caption"><span className={`studio-presence ${pose === 'working' ? 'focused' : ''}`} /><div><strong>{drag ? 'Sedang diangkat' : pose === 'working' ? 'Arif sedang bekerja' : seated ? 'Sudah nyaman di meja' : 'Ruang untuk bereksplorasi'}</strong><span role="status" aria-live="polite">{notice}</span></div></div><div className="studio-actions">{seated ? <><button className="studio-primary" onClick={() => { setPose(pose === 'working' ? 'seated' : 'working'); mark('work'); setNotice(pose === 'working' ? 'Istirahat sebentar juga boleh.' : 'Mode fokus dimulai. Ambil waktu untuk ide terbaikmu.'); }} disabled={!!drag}>{pose === 'working' ? 'Istirahat' : 'Mulai bekerja'}</button><button onClick={stand} disabled={!!drag}>Berdiri</button></> : <button className="studio-primary" onClick={sit} disabled={!loaded || !!drag}>Duduk di meja <span aria-hidden="true">↗</span></button>}<button className="studio-sound" aria-pressed={sound} aria-label={sound ? 'Matikan efek suara' : 'Aktifkan efek suara'} onClick={() => { soundEnabled.current = !sound; setSound(!sound); if (!sound) chime(true); }}>{sound ? '♪' : '♩'}<span>{sound ? 'Suara aktif' : 'Efek suara'}</span></button><button className="studio-reset" onClick={reset} disabled={!loaded} aria-label="Ulangi demo">↺</button></div></div>
    </section>
    <footer className="studio-footer"><span><i /> Demo ilustrasi & interaksi</span><p>Gerakan di ruang latihan ini hanya berlaku di perangkatmu.</p><Link href="/office">Chat & meeting di kantor bersama →</Link></footer>
  </main>;
}

