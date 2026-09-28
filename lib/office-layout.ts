export type OfficePoint = { x: number; y: number };
export type OfficeSeat = OfficePoint & { id: string; deskId: string; facing: number };
export const OFFICE_SIZE = { width: 1100, height: 600 };
export const OFFICE_SPAWN = { x: 590, y: 315 };
export const OFFICE_DESKS = [
  { id: 'north-west', name: 'Meja A', x: 195, y: 160, w: 210, h: 56 },
  { id: 'north-east', name: 'Meja B', x: 490, y: 160, w: 265, h: 56 },
  { id: 'spine-west', name: 'Meja C', x: 405, y: 160, w: 42, h: 365 },
  { id: 'spine-east', name: 'Meja D', x: 453, y: 160, w: 37, h: 365 },
  { id: 'west', name: 'Meja E', x: 85, y: 382, w: 48, h: 143 },
  { id: 'south-west', name: 'Meja F', x: 133, y: 480, w: 272, h: 45 },
  { id: 'south', name: 'Meja G', x: 490, y: 470, w: 105, h: 55 },
  { id: 'partner-side', name: 'Meja H', x: 650, y: 390, w: 150, h: 50 },
  { id: 'partner', name: 'Meja Partner', x: 902, y: 255, w: 120, h: 65 }
] as const;
export const OFFICE_SEATS: OfficeSeat[] = [
  ...[250, 345].map((x, i) => ({ id: `a${i + 1}`, deskId: 'north-west', x, y: 250, facing: 0 })),
  ...[540, 625, 710].map((x, i) => ({ id: `b${i + 1}`, deskId: 'north-east', x, y: 250, facing: 0 })),
  ...[295, 365, 435].map((y, i) => ({ id: `c${i + 1}`, deskId: 'spine-west', x: 370, y, facing: 90 })),
  ...[295, 365, 435].map((y, i) => ({ id: `d${i + 1}`, deskId: 'spine-east', x: 525, y, facing: -90 })),
  ...[410, 490].map((y, i) => ({ id: `e${i + 1}`, deskId: 'west', x: 55, y, facing: 90 })),
  ...[215, 305].map((x, i) => ({ id: `f${i + 1}`, deskId: 'south-west', x, y: 445, facing: 180 })),
  { id: 'g1', deskId: 'south', x: 580, y: 434, facing: 180 },
  { id: 'h1', deskId: 'partner-side', x: 724, y: 478, facing: 0 },
  { id: 'partner1', deskId: 'partner', x: 962, y: 350, facing: 0 }
];
export function nearestSeat(point: OfficePoint, radius = 32) {
  return OFFICE_SEATS.slice().sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y)).find(seat => Math.hypot(seat.x - point.x, seat.y - point.y) <= radius);
}
export function validFloorPoint(point: OfficePoint) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 48 || point.x > 1050 || point.y < 80 || point.y > 545) return false;
  if (OFFICE_DESKS.some(d => point.x >= d.x - 14 && point.x <= d.x + d.w + 14 && point.y >= d.y - 10 && point.y <= d.y + d.h + 10)) return false;
  if (Math.abs(point.x - 810) < 18 && point.y >= 178 && !(point.y > 340 && point.y < 413)) return false;
  if (point.x >= 800 && Math.abs(point.y - 178) < 19) return false;
  if (point.x >= 890 && point.y >= 447 && point.y <= 523) return false;
  return true;
}
export function resolveOfficeDrop(point: OfficePoint) {
  const seat = nearestSeat(point);
  if (seat) return { x: seat.x, y: seat.y, seatId: seat.id };
  return validFloorPoint(point) ? { x: Math.round(point.x), y: Math.round(point.y), seatId: null } : null;
}
