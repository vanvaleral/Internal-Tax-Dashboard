export type StudioPoint = { x: number; y: number };
export type StudioSeat = {
  id: string;
  label: string;
  desk: string;
  x: number;
  y: number;
  stand: StudioPoint;
  occluded: boolean;
};

// Percent coordinates are pinned to the rendered 1672 × 941 room illustration.
// Each visible desk group has at least one real, selectable chair.
export const STUDIO_SEATS: StudioSeat[] = [
  { id: 'west', label: 'Meja sisi jendela', desk: 'Sisi jendela', x: 12, y: 48, stand: { x: 23, y: 54 }, occluded: false },
  { id: 'north-west-1', label: 'Meja belakang kiri · 1', desk: 'Belakang kiri', x: 22, y: 38, stand: { x: 20, y: 54 }, occluded: true },
  { id: 'north-west-2', label: 'Meja belakang kiri · 2', desk: 'Belakang kiri', x: 31, y: 38, stand: { x: 35, y: 54 }, occluded: true },
  { id: 'spine-west-1', label: 'Meja tengah kiri · 1', desk: 'Tengah kiri', x: 28, y: 46, stand: { x: 40, y: 56 }, occluded: true },
  { id: 'spine-west-2', label: 'Meja tengah kiri · 2', desk: 'Tengah kiri', x: 31, y: 51, stand: { x: 40, y: 63 }, occluded: true },
  { id: 'north-east-1', label: 'Meja belakang kanan · 1', desk: 'Belakang kanan', x: 53, y: 38, stand: { x: 45, y: 55 }, occluded: true },
  { id: 'north-east-2', label: 'Meja belakang kanan · 2', desk: 'Belakang kanan', x: 62, y: 38, stand: { x: 65, y: 54 }, occluded: true },
  { id: 'spine-east-1', label: 'Meja tengah kanan · 1', desk: 'Tengah kanan', x: 53, y: 46, stand: { x: 64, y: 56 }, occluded: true },
  { id: 'spine-east-2', label: 'Meja tengah kanan · 2', desk: 'Tengah kanan', x: 53, y: 51, stand: { x: 63, y: 65 }, occluded: true },
  { id: 'partner-side', label: 'Meja samping ruang partner', desk: 'Samping partner', x: 69, y: 45, stand: { x: 66, y: 66 }, occluded: true },
  { id: 'partner', label: 'Meja ruang partner', desk: 'Ruang partner', x: 85, y: 35, stand: { x: 73, y: 57 }, occluded: true },
];

const inside = ({ x, y }: StudioPoint, left: number, top: number, right: number, bottom: number) =>
  x >= left && x <= right && y >= top && y <= bottom;

export function studioWalkable(point: StudioPoint) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  // Broad foreground, central aisle, side corridors, partner entrance.
  return inside(point, 9, 58, 88, 92) ||
    inside(point, 36, 27, 47, 92) ||
    inside(point, 58, 31, 70, 92) ||
    inside(point, 14, 42, 37, 62) ||
    inside(point, 70, 43, 77, 62) ||
    inside(point, 8, 43, 16, 60);
}

export function studioDestination(point: StudioPoint): { kind: 'seat'; seat: StudioSeat } | { kind: 'floor'; point: StudioPoint } | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const seat = STUDIO_SEATS.map(seat => ({ seat, distance: Math.hypot((point.x - seat.x) * .7, point.y - seat.y) }))
    .filter(item => item.distance <= 5.4)
    .sort((a, b) => a.distance - b.distance)[0]?.seat;
  if (seat) return { kind: 'seat', seat };
  return studioWalkable(point) ? { kind: 'floor', point } : null;
}

function segmentWalkable(start: StudioPoint, end: StudioPoint) {
  const steps = Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 1.5);
  for (let step = 0; step <= steps; step++) {
    const t = step / Math.max(steps, 1);
    if (!studioWalkable({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })) return false;
  }
  return true;
}

// The aisle at y=60 connects the room's side corridors and central lanes.
export function studioWalkingRoute(start: StudioPoint, end: StudioPoint): StudioPoint[] | null {
  if (!studioWalkable(start) || !studioWalkable(end)) return null;
  if (segmentWalkable(start, end)) return [start, end];
  const route = [start, { x: start.x, y: 60 }, { x: end.x, y: 60 }, end];
  return route.every((point, i) => i === 0 || segmentWalkable(route[i - 1], point)) ? route : null;
}
