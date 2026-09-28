import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_SEATS, studioDestination, studioWalkable, studioWalkingRoute } from '../lib/office-studio-map.ts';

test('every desk group in the illustration has a selectable chair', () => {
  assert.equal(STUDIO_SEATS.length, 11);
  assert.equal(new Set(STUDIO_SEATS.map(seat => seat.id)).size, STUDIO_SEATS.length);
  assert.equal(new Set(STUDIO_SEATS.map(seat => seat.desk)).size, 7);
  for (const seat of STUDIO_SEATS) {
    const result = studioDestination({ x: seat.x, y: seat.y });
    assert.equal(result?.kind, 'seat');
    if (result?.kind === 'seat') assert.equal(result.seat.id, seat.id);
    assert.ok(studioWalkable(seat.stand), `${seat.id} needs a walkable standing point`);
  }
});

test('the foreground and office aisles are reachable while desk surfaces remain blocked', () => {
  for (const point of [{ x: 30, y: 80 }, { x: 43, y: 40 }, { x: 64, y: 45 }, { x: 74, y: 58 }]) {
    assert.ok(studioWalkable(point), `expected walkable: ${JSON.stringify(point)}`);
  }
  for (const point of [{ x: 26, y: 30 }, { x: 53, y: 25 }, { x: 84, y: 56 }, { x: 50, y: 10 }]) {
    assert.equal(studioDestination(point), null, `expected blocked: ${JSON.stringify(point)}`);
  }
  assert.equal(studioDestination({ x: 45, y: 75 })?.kind, 'floor');
});

test('a character can travel from every desk to both sides of the office without crossing furniture', () => {
  for (const seat of STUDIO_SEATS) for (const destination of [{ x: 20, y: 78 }, { x: 73, y: 75 }]) {
    const route = studioWalkingRoute(seat.stand, destination);
    assert.ok(route, `no route from ${seat.id}`);
    for (let i = 1; i < route.length; i++) {
      for (let step = 0; step <= 30; step++) {
        const t = step / 30;
        const point = { x: route[i - 1].x + (route[i].x - route[i - 1].x) * t, y: route[i - 1].y + (route[i].y - route[i - 1].y) * t };
        assert.ok(studioWalkable(point), `${seat.id} crosses furniture at ${JSON.stringify(point)}`);
      }
    }
  }
});
