"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

type Peer = { session_id: string; muted: boolean; staff: { display_name: string | null; full_name: string } };
type Connection = { pc: RTCPeerConnection; audio: HTMLAudioElement; pending: RTCIceCandidateInit[] };

async function send(body: unknown, method = 'POST') {
  const response = await fetch('/api/office/voice', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: method === 'DELETE' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Koneksi suara terganggu.');
  return result;
}

export function OfficeVoice() {
  const [room, setRoom] = useState('office');
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined'>('idle');
  const [muted, setMuted] = useState(true);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [states, setStates] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const session = useRef<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const connections = useRef(new Map<string, Connection>());
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const generation = useRef(0);
  const mutedRef = useRef(true);

  const leave = useCallback(() => {
    generation.current++;
    const id = session.current; session.current = null;
    timers.current.forEach(clearInterval); timers.current = [];
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    connections.current.forEach(({ pc, audio }) => { pc.close(); audio.pause(); audio.srcObject = null; }); connections.current.clear();
    setStatus('idle'); setPeers([]); setStates({}); setMuted(true); mutedRef.current = true; setAudioBlocked(false);
    if (id) void send({ sessionId: id }, 'DELETE').catch(() => {});
  }, []);
  useEffect(() => { const close = () => leave(); window.addEventListener('pagehide', close); return () => { window.removeEventListener('pagehide', close); leave(); }; }, [leave]);

  async function join() {
    if (status !== 'idle') return;
    const attempt = ++generation.current;
    setStatus('joining'); setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Meeting suara membutuhkan browser modern dan koneksi HTTPS.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (attempt !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      media.getAudioTracks().forEach(track => { track.enabled = false; track.onended = () => { if (session.current) { leave(); setError('Mikrofon terputus. Sambungkan perangkat dan bergabung kembali.'); } }; });
      const id = crypto.randomUUID(); session.current = id;
      const setup = await send({ action: 'join', sessionId: id, room });
      if (attempt !== generation.current) { void send({ sessionId: id }, 'DELETE').catch(() => {}); return; }
      setStatus('joined'); setMuted(true); mutedRef.current = true;
      let cursor = '0'; let polling = false; let lastSuccess = Date.now();
      const signal = async (recipient: string, kind: string, payload: unknown) => {
        if (session.current === id) await send({ action: 'signal', sessionId: id, recipient, kind, payload });
      };
      function ensurePeer(peerId: string) {
        const existing = connections.current.get(peerId); if (existing) return existing;
        const pc = new RTCPeerConnection({ iceServers: setup.iceServers });
        const audio = new Audio(); audio.autoplay = true;
        const connection: Connection = { pc, audio, pending: [] }; connections.current.set(peerId, connection);
        media.getTracks().forEach(track => pc.addTrack(track, media));
        pc.onicecandidate = event => { if (event.candidate) void signal(peerId, 'ice', event.candidate.toJSON()).catch(() => { if (session.current === id) setError('Sinyal audio terganggu. Coba keluar lalu bergabung kembali.'); }); };
        pc.ontrack = event => { if (session.current !== id) return; audio.srcObject = event.streams[0] || new MediaStream([event.track]); void audio.play().catch(() => setAudioBlocked(true)); };
        pc.onconnectionstatechange = () => {
          if (session.current !== id) return;
          setStates(previous => ({ ...previous, [peerId]: pc.connectionState }));
          if (pc.connectionState === 'failed') setError(setup.relayConfigured ? 'Audio tidak tersambung. Coba bergabung kembali.' : 'Audio belum tersambung di jaringan ini. Admin perlu mengatur relay TURN untuk koneksi lintas jaringan.');
        };
        return connection;
      }
      async function poll() {
        if (polling || session.current !== id) return;
        polling = true;
        try {
          const response = await fetch(`/api/office/voice?sessionId=${id}&after=${cursor}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
          const result = await response.json();
          if (!response.ok) { if (response.status === 410 || response.status === 403 || response.status === 401) leave(); throw new Error(result.error); }
          if (session.current !== id) return;
          lastSuccess = Date.now(); setPeers(result.peers);
          const active = new Set<string>(result.peers.map((p: Peer) => p.session_id));
          for (const [peerId, connection] of connections.current) if (!active.has(peerId)) { connection.pc.close(); connection.audio.pause(); connection.audio.srcObject = null; connections.current.delete(peerId); }
          for (const peer of result.peers as Peer[]) {
            if (connections.current.has(peer.session_id)) continue;
            const connection = ensurePeer(peer.session_id);
            if (id < peer.session_id) {
              await connection.pc.setLocalDescription(await connection.pc.createOffer());
              await signal(peer.session_id, 'offer', connection.pc.localDescription?.toJSON());
            }
          }
          for (const message of result.signals) {
            if (session.current !== id) return;
            if (!active.has(message.sender_session_id)) { cursor = String(message.id); continue; }
            const connection = ensurePeer(message.sender_session_id); const pc = connection.pc;
            if (message.kind === 'ice') {
              if (pc.remoteDescription) await pc.addIceCandidate(message.payload);
              else connection.pending.push(message.payload);
            } else {
              await pc.setRemoteDescription(message.payload);
              for (const candidate of connection.pending.splice(0)) await pc.addIceCandidate(candidate);
              if (message.kind === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); await signal(message.sender_session_id, 'answer', pc.localDescription?.toJSON()); }
            }
            cursor = String(message.id);
          }
        } catch (cause) { if (session.current === id || attempt === generation.current) setError(cause instanceof Error ? cause.message : 'Koneksi suara terganggu.'); }
        finally { polling = false; }
      }
      timers.current.push(setInterval(() => { if (Date.now() - lastSuccess > 40000) { leave(); setError('Koneksi meeting terputus. Mikrofon sudah dimatikan.'); } else void poll(); }, 2000));
      timers.current.push(setInterval(() => { if (session.current === id) void send({ action: 'heartbeat', sessionId: id, muted: mutedRef.current }).catch(() => setError('Sesi suara sedang mencoba terhubung kembali.')); }, 12000));
      void poll();
    } catch (cause) {
      if (attempt !== generation.current) return;
      leave();
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'Izin mikrofon belum diberikan. Izinkan mikrofon di pengaturan browser lalu coba lagi.' : cause instanceof Error ? cause.message : 'Tidak dapat mengakses mikrofon.');
    }
  }
  function toggleMute() {
    const next = !mutedRef.current; mutedRef.current = next; setMuted(next);
    stream.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    if (session.current) void send({ action: 'heartbeat', sessionId: session.current, muted: next }).catch(() => setError('Status mikrofon belum tersinkron.'));
  }
  return <section className="office-voice-panel" aria-label="Meeting suara">
    <div className="office-panel-heading"><span className="office-feature-icon">◉</span><div><h2>Meeting suara</h2><p>{status === 'joined' ? `${peers.length + 1} peserta · ${muted ? 'mikrofon mati' : 'mikrofon aktif'}` : 'Temui rekanmu, langsung di kantor.'}</p></div><span className={`office-status-dot ${status === 'joined' ? 'live' : ''}`} /></div>
    <label className="office-voice-label">Ruang meeting<select value={room} onChange={event => setRoom(event.target.value)} disabled={status !== 'idle'}><option value="office">Ruang kerja</option><option value="partner">Ruang partner</option></select></label>
    {status === 'idle' ? <button className="office-primary" onClick={() => void join()}>Gabung dengan suara</button> : status === 'joining' ? <button className="office-secondary" onClick={leave}>Batalkan menghubungkan…</button> : <div className="office-voice-controls"><button className={muted ? 'office-primary' : 'office-secondary'} onClick={toggleMute}>{muted ? 'Aktifkan mikrofon' : 'Matikan mikrofon'}</button><button className="office-leave" onClick={leave}>Keluar</button></div>}
    {status === 'joined' && <div className="office-voice-peers">{peers.length === 0 ? <p>Menunggu rekan bergabung di ruang yang sama.</p> : peers.map(peer => <div key={peer.session_id}><span>{peer.staff.display_name || peer.staff.full_name}</span><small>{states[peer.session_id] === 'connected' ? peer.muted ? 'Mic mati' : 'Tersambung' : states[peer.session_id] === 'failed' ? 'Gagal tersambung' : 'Menghubungkan…'}</small></div>)}</div>}
    {audioBlocked && <button className="office-secondary" onClick={() => { void Promise.all([...connections.current.values()].map(c => c.audio.play())).then(() => setAudioBlocked(false)).catch(() => setError('Browser masih memblokir audio. Periksa izin suara situs.')); }}>Aktifkan suara peserta</button>}
    {error && <p role="alert" className="office-voice-error">{error}</p>}
    <small className="office-voice-note">Audio hanya aktif setelah bergabung. Semua staf aktif dapat bergabung; kedua ruang punya kanal audio terpisah.</small>
  </section>;
}
