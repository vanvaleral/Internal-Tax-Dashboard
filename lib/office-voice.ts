export const VOICE_ROOMS = ['office', 'partner'] as const;
export const VOICE_TTL_MS = 45_000;
export const validSessionId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validVoiceSignal(kind: unknown, payload: any) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (JSON.stringify(payload).length > 32_000) return false;
  if (kind === 'offer' || kind === 'answer') return payload.type === kind && typeof payload.sdp === 'string' && payload.sdp.startsWith('v=0') && payload.sdp.length < 30_000;
  return kind === 'ice' && typeof payload.candidate === 'string' && payload.candidate.length < 3000 && (payload.sdpMid === null || typeof payload.sdpMid === 'string') && (payload.sdpMLineIndex === null || Number.isInteger(payload.sdpMLineIndex));
}
export function voiceIceServers(raw?: string): RTCIceServer[] {
  if (!raw) return [{ urls: 'stun:stun.l.google.com:19302' }];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 10) throw new Error('Invalid voice ICE configuration.');
  for (const server of parsed) {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    if (!urls.length || urls.some((url: unknown) => typeof url !== 'string' || !/^(stun|stuns|turn|turns):/.test(url))) throw new Error('Invalid voice ICE configuration.');
  }
  return parsed;
}
