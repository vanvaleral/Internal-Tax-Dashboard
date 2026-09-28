import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/access';
import { OFFICE_SEATS, OFFICE_SPAWN, validFloorPoint } from '@/lib/office-layout';

const colors = new Set(['teal', 'blue', 'coral', 'violet', 'gold']);
const desks = new Set(['plant', 'lamp', 'books', 'coffee']);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fields = 'staff_profile_id, avatar_color, desk_style, position_x, position_y, seat_id, activity, last_seen_at, staff:staff_profiles!virtual_office_profiles_staff_profile_id_fkey(display_name, full_name)';

export async function GET() {
  const actor = await currentActor();
  if ('error' in actor) return json({ error: actor.error }, actor.status);
  const [profiles, messages, mine] = await Promise.all([
    actor.admin.from('virtual_office_profiles').select(fields).gt('last_seen_at', new Date(Date.now() - 45000).toISOString()).limit(100),
    actor.admin.from('virtual_office_messages').select('id, staff_profile_id, message, created_at, staff:staff_profiles!virtual_office_messages_staff_profile_id_fkey(display_name, full_name)').order('created_at', { ascending: false }).limit(40),
    actor.admin.from('virtual_office_profiles').select(fields).eq('staff_profile_id', actor.profile.id).maybeSingle()
  ]);
  if (profiles.error || messages.error || mine.error) return json({ error: 'Kantor belum dapat dimuat. Coba lagi.' }, 500);
  return json({ me: { id: actor.profile.id, name: actor.profile.display_name || actor.profile.full_name }, mine: mine.data, profiles: profiles.data, messages: (messages.data || []).reverse() });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ('error' in actor) return json({ error: actor.error }, actor.status);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Permintaan tidak valid.' }, 400);
  const action = body.action || 'appearance';
  const update: Record<string, unknown> = { last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (action === 'move') {
    if (body.seatId !== null && typeof body.seatId !== 'string') return json({ error: 'Kursi tidak valid.' }, 400);
    const seat = OFFICE_SEATS.find(s => s.id === body.seatId);
    if (body.seatId && !seat) return json({ error: 'Kursi tidak dikenal.' }, 400);
    if (!seat && (!validFloorPoint({ x: body.x, y: body.y }))) return json({ error: 'Lepaskan karakter di lantai atau kursi.' }, 400);
    Object.assign(update, { position_x: seat?.x ?? Math.round(body.x), position_y: seat?.y ?? Math.round(body.y), seat_id: seat?.id ?? null, activity: seat ? 'seated' : 'idle' });
  } else if (action === 'appearance') {
    if (!colors.has(body.avatarColor) || !desks.has(body.deskStyle)) return json({ error: 'Pilihan avatar tidak valid.' }, 400);
    Object.assign(update, { avatar_color: body.avatarColor, desk_style: body.deskStyle });
  } else if (action === 'activity') {
    if (!['working', 'seated'].includes(body.activity)) return json({ error: 'Aktivitas tidak valid.' }, 400);
    update.activity = body.activity;
  } else if (action !== 'heartbeat') return json({ error: 'Aksi tidak dikenal.' }, 400);

  // Expired chairs become available. The unique seat index resolves simultaneous claims.
  const stale = await actor.admin.from('virtual_office_profiles').update({ seat_id: null, activity: 'idle', position_x: OFFICE_SPAWN.x, position_y: OFFICE_SPAWN.y }).lt('last_seen_at', new Date(Date.now() - 45000).toISOString()).not('seat_id', 'is', null);
  if (stale.error) return json({ error: 'Kursi belum dapat diperiksa.' }, 500);
  const init = await actor.admin.from('virtual_office_profiles').upsert({ staff_profile_id: actor.profile.id }, { onConflict: 'staff_profile_id', ignoreDuplicates: true });
  if (init.error) return json({ error: 'Profil kantor gagal dibuat.' }, 500);
  let query = actor.admin.from('virtual_office_profiles').update(update).eq('staff_profile_id', actor.profile.id);
  if (action === 'activity') query = query.not('seat_id', 'is', null);
  const result = await query.select(fields).maybeSingle();
  if (result.error?.code === '23505') return json({ error: 'Kursi ini sudah dipakai rekan lain. Pilih kursi kosong.' }, 409);
  if (result.error) return json({ error: 'Perubahan belum tersimpan. Coba lagi.' }, 500);
  if (!result.data) return json({ error: 'Duduk di kursi sebelum mulai bekerja.' }, 409);
  return json({ profile: result.data });
}

export async function PATCH(request: Request) {
  const actor = await currentActor();
  if ('error' in actor) return json({ error: actor.error }, actor.status);
  const body = await request.json().catch(() => null);
  if (body?.action !== 'chat' || typeof body.message !== 'string') return json({ error: 'Pesan tidak valid.' }, 400);
  const message = body.message.trim();
  if (!message || message.length > 280) return json({ error: 'Pesan harus berisi 1–280 karakter.' }, 400);
  const latest = await actor.admin.from('virtual_office_messages').select('created_at').eq('staff_profile_id', actor.profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latest.error) return json({ error: 'Chat belum tersedia.' }, 500);
  if (latest.data && Date.now() - new Date(latest.data.created_at).getTime() < 1500) return json({ error: 'Tunggu sebentar sebelum mengirim pesan lagi.' }, 429);
  const result = await actor.admin.from('virtual_office_messages').insert({ staff_profile_id: actor.profile.id, message });
  return result.error ? json({ error: 'Pesan belum terkirim.' }, 500) : json({ ok: true });
}
