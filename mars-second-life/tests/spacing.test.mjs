import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { separatePeople } from '../public/js/spacing.js';
import { Crowd } from '../public/js/people.js';
const person = (x, z, posing = 0) => ({ pos: new THREE.Vector3(x, 0, z), posing });

test('stationary bodies, exact overlaps and head-on movement keep personal space', () => {
  const people = [person(0, 0), person(0, 0), person(0.1, 0.1), person(-0.1, 0.1)];
  for (let frame = 0; frame < 300; frame++) {
    people[0].pos.x += 0.02; people[1].pos.x -= 0.02;
    separatePeople(people);
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++)
      assert.ok(people[i].pos.distanceTo(people[j].pos) > 1.04);
  }
});
test('separation honours props and leaves a portrait subject stationary', () => {
  const subject = person(3, 0, 10), other = person(3, 0);
  separatePeople([subject, other], [{ x: 0, z: 0, r: 1 }]);
  assert.deepEqual(subject.pos.toArray(), [3, 0, 0]);
  assert.ok(subject.pos.distanceTo(other.pos) >= 1.04);
  const trapped = person(0, 0);
  separatePeople([trapped], [{ x: 0, z: 0, r: 1 }]);
  assert.ok(trapped.pos.length() >= 1.45);
});
test('town simulation keeps walking and chatting without entering a dance state', () => {
  const center = new THREE.Vector3();
  const places = Object.fromEntries(['plaza','park','cafe','cathedral','studio','skyport'].map(id => [id, {
    center: center.clone(), yaw: 0, gate: center.clone(), spots: Array.from({length: 40}, (_, i) => new THREE.Vector3(i % 8 * 2 - 8, 0, Math.floor(i / 8) * 2 - 4))
  }]));
  const crowd = new Crowd(new THREE.Scene(), { places, obstacles: [] }, {}, { bubble() {} });
  for (let i = 0; i < 12; i++) {
    const p = person(i % 4 * 2, Math.floor(i / 4) * 2);
    Object.assign(p, { id: i, state: 'idle', timer: i * 0.2, place: 'plaza', path: [], heading: 0, speed: 1.3, appear: 1,
      root: { rotation: {} }, mixer: { update() {} }, play() {}, gesture() {},
      forward(out) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); } });
    crowd.people.push(p);
  }
  const observed = new Set(); let stroll = false;
  for (let i = 0; i < 3600; i++) {
    crowd.update(1 / 30, i / 30);
    for (const p of crowd.people) { observed.add(p.state); assert.ok(Number.isFinite(p.pos.x)); }
    stroll ||= crowd.groups.some(g => g.strolling);
  }
  assert.ok(observed.has('walk')); assert.ok(observed.has('talk')); assert.ok(stroll);
  assert.ok(!observed.has('dance')); assert.equal(crowd.people.length, 12);
});
