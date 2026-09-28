import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_DESKS, OFFICE_SEATS, OFFICE_SPAWN, resolveOfficeDrop, validFloorPoint } from '../lib/office-layout.ts';
import { validSessionId, validVoiceSignal, voiceIceServers } from '../lib/office-voice.ts';

test('floor plan preserves the desk capacities in the supplied reference', () => {
  const expected = [2,3,3,3,2,2,1,1,1];
  OFFICE_DESKS.forEach((desk, i) => assert.equal(OFFICE_SEATS.filter(s => s.deskId === desk.id).length, expected[i]));
  assert.equal(new Set(OFFICE_SEATS.map(s => s.id)).size, OFFICE_SEATS.length);
});
test('drag drops snap to chairs and reject desks, partition walls and outside the office', () => {
  for (const seat of OFFICE_SEATS) assert.equal(resolveOfficeDrop({ x: seat.x + 5, y: seat.y - 5 })?.seatId, seat.id);
  assert.equal(resolveOfficeDrop({x:210, y:180}), null);
  assert.equal(resolveOfficeDrop({x:810, y:300}), null);
  assert.equal(resolveOfficeDrop({x:-30, y:0}), null);
  assert.equal(resolveOfficeDrop({x:NaN, y:200}), null);
  assert.equal(resolveOfficeDrop({x:810, y:375})?.seatId, null);
  assert.equal(validFloorPoint(OFFICE_SPAWN), true);
});
test('voice only accepts bounded RTC signals and proper session identifiers', () => {
  assert.equal(validSessionId('2e0ce1f2-f525-45b2-82bb-ad82a27d21c0'), true);
  assert.equal(validSessionId('someone-else'), false);
  assert.equal(validVoiceSignal('offer', { type:'offer', sdp:'v=0\r\n' }), true);
  assert.equal(validVoiceSignal('offer', { type:'answer', sdp:'v=0' }), false);
  assert.equal(validVoiceSignal('offer', { type:'offer', sdp:'v=0'+'x'.repeat(40000) }), false);
  assert.equal(validVoiceSignal('ice', {candidate:'candidate:1', sdpMid:'0', sdpMLineIndex:0}), true);
  assert.equal(validVoiceSignal('unknown', {}), false);
  assert.equal(validVoiceSignal('ice', null), false);
});
test('TURN configuration accepts RTC schemes and rejects arbitrary URLs', () => {
  assert.equal(voiceIceServers()[0].urls, 'stun:stun.l.google.com:19302');
  assert.throws(() => voiceIceServers('[{"urls":"https://example.com"}]'));
  assert.throws(() => voiceIceServers('{}'));
  assert.throws(() => voiceIceServers('[]'));
  assert.equal(voiceIceServers('[{"urls":"turns:relay.example.com:443","username":"user","credential":"test"}]').length, 1);
});
