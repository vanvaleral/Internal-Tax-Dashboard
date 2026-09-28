"use client";
import { useRef, useState, type PointerEvent } from "react";
import { OFFICE_DESKS, OFFICE_SEATS, resolveOfficeDrop, type OfficePoint } from "@/lib/office-layout";

export type SceneAvatar = OfficePoint & { id: string; name: string; color: string; mine?: boolean; bubble?: string; seatId?: string | null; activity?: string };
const colors: Record<string, string> = { teal: '#2a9d8f', blue: '#628bce', coral: '#d27d6e', violet: '#9a80b8', gold: '#c49d54' };

function Plant({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`} filter="url(#softShadow)"><circle r="20" fill="#d1c5b5" /><circle r="15" fill="#746553" />{[0,60,120,180,240,300].map(angle => <ellipse key={angle} cy="-16" rx="9" ry="20" transform={`rotate(${angle})`} fill={angle % 120 ? '#55886c' : '#75a888'} stroke="#3f7157" strokeWidth="1.5" />)}<circle r="8" fill="#89b799" /></g>;
}
function AvatarArt({ avatar, lifted }: { avatar: SceneAvatar; lifted: boolean }) {
  return <g transform={`translate(${avatar.x} ${avatar.y - (lifted ? 22 : 0)}) scale(${lifted ? 1.12 : 1})`} className="office-person-art">
    <g filter="url(#softShadow)">
      <ellipse cy="12" rx="20" ry="13" fill={colors[avatar.color] || colors.teal} />
      <ellipse cx="-18" cy="12" rx="5" ry="9" fill="#edc1a1" /><ellipse cx="18" cy="12" rx="5" ry="9" fill="#edc1a1" />
      {!avatar.seatId && <><rect x="-12" y="20" width="10" height="10" rx="4" fill="#3d4656" /><rect x="3" y="20" width="10" height="10" rx="4" fill="#3d4656" /></>}
      <circle cy="-4" r="18" fill="url(#skinTone)" stroke="#bb9277" strokeWidth="1" />
      <path d="M-17 -2 Q-25 -27 0 -26 Q24 -25 18 -2 L12 -12 Q-2 -8 -13 -13Z" fill="url(#hairTone)" />
      <circle cx="-6" cy="-3" r="1.7" fill="#3b3435" /><circle cx="7" cy="-3" r="1.7" fill="#3b3435" /><path d="M-3 5 Q1 8 5 5" stroke="#b67468" strokeWidth="1.6" fill="none" />
    </g>
    <g transform="translate(0 39)"><rect x="-55" y="0" width="110" height="22" rx="11" fill={avatar.mine ? '#214f48' : '#fffffff0'} stroke={avatar.mine ? '#9dc8b4' : '#d7e0da'} /><text y="15" textAnchor="middle" fontSize="10" fontWeight="700" fill={avatar.mine ? '#fff' : '#40544e'}>{avatar.name.slice(0, 16)}{avatar.mine ? ' · kamu' : ''}</text></g>
    {avatar.activity === 'working' && <g transform="translate(19 -20)"><circle r="10" fill="#428f6a" stroke="white" strokeWidth="2" /><path d="M-4 0 L-1 3 L5 -4" stroke="white" fill="none" strokeWidth="2" /></g>}
    {avatar.bubble && <g transform="translate(0 -62)"><rect x="-80" y="-23" width="160" height="36" rx="10" fill="white" stroke="#d0dcd4" /><path d="M-5 13 L0 20 L6 13" fill="white" /><text textAnchor="middle" y="0" fill="#355047" fontSize="10">{avatar.bubble.slice(0, 25)}{avatar.bubble.length > 25 ? '…' : ''}</text></g>}
  </g>;
}

export function OfficeScene({ avatars, decoration, onDrop, onDesk, onInvalidDrop }: { avatars: SceneAvatar[]; decoration: string; onDrop: (point: OfficePoint, seatId: string | null) => void; onDesk: (id: string) => void; onInvalidDrop: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<OfficePoint | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const mine = avatars.find(a => a.mine);
  function location(event: PointerEvent<SVGSVGElement | SVGGElement>) {
    const root = svg.current!; const point = root.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const matrix = root.getScreenCTM(); return matrix ? point.matrixTransform(matrix.inverse()) : { x: 0, y: 0 };
  }
  function lift(event: PointerEvent<SVGGElement>) {
    if (!mine || event.button !== 0) return;
    event.preventDefault(); const point = location(event);
    offset.current = { x: point.x - mine.x, y: point.y - mine.y };
    svg.current?.setPointerCapture(event.pointerId); setDrag({ x: mine.x, y: mine.y });
  }
  function drop(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const point = location(event); const target = resolveOfficeDrop({ x: point.x - offset.current.x, y: point.y - offset.current.y });
    setDrag(null); if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    if (target) onDrop(target, target.seatId); else onInvalidDrop();
  }
  const target = drag ? resolveOfficeDrop(drag) : null;
  return <svg ref={svg} className="office-scene" viewBox="0 0 1100 600" aria-label="Denah kantor. Seret karaktermu, lalu lepas di lantai atau kursi." onPointerMove={event => { if (drag) { const point = location(event); setDrag({ x: point.x - offset.current.x, y: point.y - offset.current.y }); } }} onPointerUp={drop} onPointerCancel={() => setDrag(null)} onLostPointerCapture={() => setDrag(null)}>
    <defs>
      <linearGradient id="deskWood" x2="0" y2="1"><stop stopColor="#e6cda3" /><stop offset="1" stopColor="#c8a778" /></linearGradient>
      <linearGradient id="chairFabric" x2="0" y2="1"><stop stopColor="#829c96" /><stop offset="1" stopColor="#536f6a" /></linearGradient>
      <radialGradient id="skinTone"><stop stopColor="#f5d3b4" /><stop offset="1" stopColor="#dba780" /></radialGradient>
      <linearGradient id="hairTone"><stop stopColor="#534744" /><stop offset="1" stopColor="#292b30" /></linearGradient>
      <pattern id="floorWood" width="150" height="38" patternUnits="userSpaceOnUse"><rect width="150" height="38" fill="#e9e1d3" /><path d="M0 0 H150 M0 38 H150 M149 0 V38" stroke="#d8cebc" /><path d="M5 9 Q70 5 140 12 M12 29 Q85 24 135 30" stroke="#e2d7c6" fill="none" /></pattern>
      <pattern id="partnerCarpet" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#d6dfd8" /><path d="M0 0 L8 8 M8 0 L0 8" stroke="#cbd6ce" strokeWidth=".6" /></pattern>
      <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#2f3d36" floodOpacity=".22" /></filter>
      <filter id="deskShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1" dy="8" stdDeviation="5" floodColor="#584c39" floodOpacity=".24" /></filter>
    </defs>
    <rect width="1100" height="600" rx="18" fill="#eff2ec" />
    <rect x="27" y="43" width="1046" height="523" rx="5" fill="#adb5aa" opacity=".3" />
    <rect x="30" y="35" width="1040" height="522" fill="url(#floorWood)" stroke="#fdfcf8" strokeWidth="12" />
    <rect x="38" y="42" width="1024" height="508" fill="none" stroke="#b7b7a7" strokeWidth="2" />
    <path d="M110 35 H320 M555 35 H745 M886 35 H1015" stroke="#c4dfe0" strokeWidth="11" /><path d="M110 35 H320 M555 35 H745 M886 35 H1015" stroke="#92b6b8" strokeWidth="2" />
    <path d="M110 48 L210 135 H320 L260 48Z M555 48 L635 135 H745 L700 48Z" fill="#fffde8" opacity=".4" />
    <text x="76" y="100" fontSize="10" fontWeight="800" letterSpacing="3" fill="#839082">LMATS / WORKSPACE</text>
    <text x="76" y="124" fontSize="20" fontWeight="600" fill="#3f564c">A good place to work.</text>
    <rect x="817" y="183" width="245" height="365" fill="url(#partnerCarpet)" />
    <path d="M810 550 V414 M810 340 V178 H1066" stroke="#9ca99e" strokeWidth="13" fill="none" /><path d="M810 550 V414 M810 340 V178 H1066" stroke="#f9fbf6" strokeWidth="7" fill="none" />
    <path d="M810 340 L866 389" stroke="#8ba697" strokeWidth="3" /><path d="M810 414 A74 74 0 0 0 866 389" stroke="#a5b7aa" strokeWidth="1" fill="none" strokeDasharray="4 4" />
    <text x="936" y="212" textAnchor="middle" fill="#5e7b69" fontSize="10" fontWeight="800" letterSpacing="2">RUANG PARTNER</text>
    <rect x="888" y="448" width="151" height="70" rx="10" fill="#b2c7bb" filter="url(#softShadow)" /><rect x="895" y="452" width="137" height="14" rx="5" fill="#8fae9b" />{[897,943,989].map(x => <rect key={x} x={x} y="469" width="42" height="37" rx="5" fill="#c7d7cc" stroke="#a4baab" />)}
    <rect x="896" y="396" width="131" height="31" rx="12" fill="#b79c77" filter="url(#softShadow)" /><circle cx="920" cy="410" r="8" fill="#f7f3e9" /><circle cx="920" cy="410" r="5" fill="#87644a" /><rect x="956" y="402" width="29" height="15" rx="2" fill="#738779" />
    <Plant x={1040} y={94} /><Plant x={75} y={315} scale={.75} /><Plant x={850} y={516} scale={.6} />
    {OFFICE_SEATS.map(seat => <g key={seat.id} transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facing})`} className="office-seat" onClick={() => onDesk(seat.deskId)}><title>{`Duduk di kursi ${seat.id.toUpperCase()}`}</title><g filter="url(#softShadow)"><path d="M-15 17 L15 -17 M-15 -17 L15 17" stroke="#788982" strokeWidth="4" /><rect x="-17" y="-19" width="34" height="36" rx="10" fill="url(#chairFabric)" stroke="#526e62" /><rect x="-20" y="8" width="40" height="14" rx="5" fill="#6e8a7e" stroke="#587367" /><path d="M-20 -9 V10 M20 -9 V10" stroke="#3f5650" strokeWidth="4" strokeLinecap="round" /></g></g>)}
    {OFFICE_DESKS.map(d => <g key={d.id} role="button" tabIndex={0} aria-label={`Interaksi ${d.name}`} className="office-desk" onClick={() => onDesk(d.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDesk(d.id); } }}><rect x={d.x} y={d.y + 5} width={d.w} height={d.h} rx="5" fill="#a98a63" filter="url(#deskShadow)" /><rect x={d.x} y={d.y} width={d.w} height={d.h} rx="5" fill="url(#deskWood)" stroke="#bca074" /><path d={`M${d.x + 5} ${d.y + 7} H${d.x + d.w - 5} M${d.x + 5} ${d.y + d.h - 7} H${d.x + d.w - 5}`} stroke="#f0dab7" strokeWidth="1" /></g>)}
    {OFFICE_SEATS.map(seat => {
      const desk = OFFICE_DESKS.find(d => d.id === seat.deskId)!;
      const x = seat.facing === 90 || seat.facing === -90 ? desk.x + desk.w / 2 : seat.x;
      const y = seat.facing === 90 || seat.facing === -90 ? seat.y : desk.y + desk.h / 2;
      return <g key={`computer-${seat.id}`} transform={`translate(${x} ${y}) rotate(${seat.facing})`} pointerEvents="none"><rect x="-16" y="-16" width="32" height="20" rx="3" fill="#3e5058" filter="url(#softShadow)" /><rect x="-13" y="-13" width="26" height="14" rx="1" fill="#99c3c4" /><path d="M-9 -9 H7 M-9 -6 H2" stroke="#d4eff0" strokeWidth="1.4" /><path d="M0 4 V9 M-7 9 H7" stroke="#6a7a7c" strokeWidth="3" /><rect x="-15" y="11" width="26" height="7" rx="2" fill="#e6ece7" stroke="#acb6ac" /><rect x="15" y="10" width="5" height="8" rx="2.5" fill="#e7e9de" /></g>;
    })}
    <rect x="43" y="541" width="730" height="9" fill="#c8bdab" opacity=".5" />
    {avatars.filter(a => !(a.mine && drag)).map(a => <g key={a.id} className={a.mine ? 'office-draggable' : ''} onPointerDown={a.mine ? lift : undefined} tabIndex={a.mine ? 0 : undefined} role={a.mine ? 'button' : undefined} aria-label={a.mine ? 'Angkat dan seret karaktermu. Tombol panah untuk bergeser.' : a.name} onKeyDown={event => { if (!a.mine || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault(); const result = resolveOfficeDrop({ x: a.x + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), y: a.y + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0) }); if (result) onDrop(result, result.seatId); }}><AvatarArt avatar={a} lifted={false} />{a.mine && a.seatId && <g pointerEvents="none" transform={`translate(${a.x + 34} ${a.y + 8})`}><circle r="9" fill="#f7f9f3" /><text y="4" fontSize="11" textAnchor="middle">{decoration === 'plant' ? '✿' : decoration === 'coffee' ? '☕' : decoration === 'books' ? '▤' : '☀'}</text></g>}</g>)}
    {drag && mine && <g pointerEvents="none"><ellipse cx={drag.x} cy={drag.y + 11} rx="26" ry="12" fill="#223b33" opacity=".22" /><circle cx={target?.x ?? drag.x} cy={target?.y ?? drag.y} r="27" fill={target ? '#74b79530' : '#dd827c30'} stroke={target ? '#428969' : '#c96861'} strokeDasharray="5 4" /><AvatarArt avatar={{ ...mine, ...drag, seatId: null }} lifted /><text x={drag.x} y={drag.y + 80} textAnchor="middle" fill="#355447" fontSize="11" fontWeight="700">{target?.seatId ? 'Lepas untuk duduk' : target ? 'Lepas di sini' : 'Pilih lantai atau kursi'}</text></g>}
  </svg>;
}
