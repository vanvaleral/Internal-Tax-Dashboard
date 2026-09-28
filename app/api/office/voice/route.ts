import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/access';
import { validSessionId, validVoiceSignal, voiceIceServers, VOICE_ROOMS, VOICE_TTL_MS } from '@/lib/office-voice';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const cutoff = () => new Date(Date.now() - VOICE_TTL_MS).toISOString();

export async function GET(request: Request) {
  if (process.env.VIRTUAL_OFFICE_VOICE_ENABLED === 'false') return json({ error: 'Meeting suara dinonaktifkan.' }, 404);
  const actor = await currentActor();
  if ('error' in actor) return json({ error: actor.error }, actor.status);
  const params = new URL(request.url).searchParams;
  const id = params.get('sessionId'); const after = params.get('after') || '0';
  if (!validSessionId(id) || !/^\d{1,16}$/.test(after)) return json({ error: 'Sesi tidak valid.' }, 400);
  const own = await actor.admin.from('virtual_office_voice_sessions').select('session_id, room').eq('session_id', id).eq('staff_profile_id', actor.profile.id).gt('last_seen_at', cutoff()).maybeSingle();
  if (own.error) return json({ error: 'Sesi meeting tidak dapat dibaca.' }, 500);
  if (!own.data) return json({ error: 'Sesi berakhir. Bergabung kembali.' }, 410);
  const [peers, signals] = await Promise.all([
    actor.admin.from('virtual_office_voice_sessions').select('session_id, muted, staff_profile_id, staff:staff_profiles!inner(display_name, full_name, directory_active)').eq('room', own.data.room).eq('staff.directory_active', true).gt('last_seen_at', cutoff()).neq('session_id', id).limit(30),
    actor.admin.from('virtual_office_voice_signals').select('id, sender_session_id, kind, payload').eq('recipient_session_id', id).gt('id', after).gt('created_at', new Date(Date.now() - 120_000).toISOString()).order('id', { ascending: true }).limit(100)
  ]);
  if (peers.error || signals.error) return json({ error: 'Koneksi meeting terganggu.' }, 500);
  return json({ peers: peers.data, signals: signals.data });
}

export async function POST(request: Request) {
  if (process.env.VIRTUAL_OFFICE_VOICE_ENABLED === 'false') return json({ error: 'Meeting suara dinonaktifkan.' }, 404);
  const actor = await currentActor();
  if ('error' in actor) return json({ error: actor.error }, actor.status);
  const body = await request.json().catch(() => null);
  if (!body || !validSessionId(body.sessionId)) return json({ error: 'Sesi tidak valid.' }, 400);
  const table = actor.admin.from('virtual_office_voice_sessions');
  if (body.action === 'join') {
    if (!VOICE_ROOMS.includes(body.room)) return json({ error: 'Ruang meeting tidak dikenal.' }, 400);
    let iceServers: RTCIceServer[];
    try { iceServers = voiceIceServers(process.env.OFFICE_VOICE_ICE_SERVERS); } catch { return json({ error: 'Konfigurasi koneksi suara belum valid.' }, 503); }
    // Only ephemeral, expired signaling is removed; no audio is ever stored.
    await actor.admin.from('virtual_office_voice_sessions').delete().lt('last_seen_at', new Date(Date.now() - 120_000).toISOString());
    await actor.admin.from('virtual_office_voice_signals').delete().lt('created_at', new Date(Date.now() - 120_000).toISOString());
    const result = await table.insert({ session_id: body.sessionId, staff_profile_id: actor.profile.id, room: body.room, muted: true });
    if (result.error) return json({ error: 'Sesi gagal dibuat. Silakan coba kembali.' }, result.error.code === '23505' ? 409 : 500);
    return json({ iceServers, relayConfigured: iceServers.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u))) });
  }
  const own = await table.select('session_id, room').eq('session_id', body.sessionId).eq('staff_profile_id', actor.profile.id).gt('last_seen_at', cutoff()).maybeSingle();
  if (own.error) return json({ error: 'Sesi tidak dapat diperiksa.' }, 500);
  if (!own.data) return json({ error: 'Sesi berakhir. Bergabung kembali.' }, 410);
  if (body.action === 'heartbeat') {
    if (typeof body.muted !== 'boolean') return json({ error: 'Status mikrofon tidak valid.' }, 400);
    const result = await actor.admin.from('virtual_office_voice_sessions').update({ muted: body.muted, last_seen_at: new Date().toISOString() }).eq('session_id', body.sessionId).eq('staff_profile_id', actor.profile.id);
    return result.error ? json({ error: 'Koneksi terputus.' }, 500) : json({ ok: true });
  }
  if (body.action !== 'signal' || !validSessionId(body.recipient) || body.recipient === body.sessionId || !validVoiceSignal(body.kind, body.payload)) return json({ error: 'Sinyal suara tidak valid.' }, 400);
  const peer = await actor.admin.from('virtual_office_voice_sessions').select('session_id, staff:staff_profiles!inner(directory_active)').eq('session_id', body.recipient).eq('room', own.data.room).eq('staff.directory_active', true).gt('last_seen_at', cutoff()).maybeSingle();
  if (peer.error) return json({ error: 'Peserta tidak dapat diperiksa.' }, 500);
  if (!peer.data) return json({ error: 'Peserta sudah meninggalkan ruang ini.' }, 404);
  const result = await actor.admin.from('virtual_office_voice_signals').insert({ sender_session_id: body.sessionId, recipient_session_id: body.recipient, kind: body.kind, payload: body.payload });
  return result.error ? json({ error: 'Gagal menghubungkan audio.' }, 500) : json({ ok: true });
}

export async function DELETE(request: Request) {
  const actor = await currentActor();
  if ('error' in actor) return json({ error: actor.error }, actor.status);
  const body = await request.json().catch(() => null);
  if (!body || !validSessionId(body.sessionId)) return json({ error: 'Sesi tidak valid.' }, 400);
  const result = await actor.admin.from('virtual_office_voice_sessions').delete().eq('session_id', body.sessionId).eq('staff_profile_id', actor.profile.id);
  return result.error ? json({ error: 'Gagal meninggalkan sesi.' }, 500) : json({ ok: true });
}
