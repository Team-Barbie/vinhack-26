import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDirection, DIRECTIONS, profileValid, RemoteRepeater, RemoteBlink, nextRemoteItem } from '../web/src/lib/eyeRemote.ts'

const p = { center: [0, 0, 0, 0], left: [-0.06, 0, -0.05, 0], right: [0.05, 0, 0.06, 0], up: [0, -0.04, 0, -0.05], down: [0, 0.05, 0, 0.04] }
test('five directions are learned independently of camera mirroring', () => {
  for (const sign of [1, -1]) {
    const profile = Object.fromEntries(DIRECTIONS.map((d) => [d, p[d].map((v) => v * sign)]))
    assert.ok(profileValid(profile))
    for (const d of DIRECTIONS) assert.equal(classifyDirection(profile, profile[d]), d)
  }
})
test('neutral noise, ambiguous diagonals and distant features do not move the remote', () => {
  assert.equal(classifyDirection(p, [0.003, -0.002, 0.003, 0.002]), 'center')
  assert.equal(classifyDirection(p, [0.025, 0.025, 0.03, 0.02]), 'center')
  assert.equal(classifyDirection(p, [10, 10, 10, 10]), 'center')
  assert.equal(classifyDirection(p, [NaN, 0, 0, 0]), 'center')
  assert.equal(profileValid({ ...p, down: p.center }), false)
})
test('short glances are ignored; sustained directions repeat at controlled intervals', () => {
  const remote = new RemoteRepeater(220, 700)
  assert.equal(remote.update('left', 0), null)
  assert.equal(remote.update('left', 190), null)
  assert.equal(remote.update('center', 200), null)
  assert.equal(remote.update('left', 300), null)
  assert.equal(remote.update('left', 520), 'left')
  assert.equal(remote.update('left', 1000), null)
  assert.equal(remote.update('left', 1220), 'left')
  remote.reset()
  assert.equal(remote.update('left', 1300), null)
})

test('comfortable partial looks engage without reaching the calibration endpoints', () => {
  for (const d of DIRECTIONS.slice(1)) {
    for (const amount of [0.35, 0.45, 0.6, 1.2]) {
      const features = p[d].map((v, i) => p.center[i] + amount * (v - p.center[i]))
      assert.equal(classifyDirection(p, features), d, `${d} at ${amount}`)
    }
  }
})

test('one uncertain camera sample does not permanently prevent movement', () => {
  const remote = new RemoteRepeater(220, 700)
  remote.update('right', 100)
  remote.update('right', 200)
  assert.equal(remote.update('center', 230), null)
  assert.equal(remote.update('right', 265), null)
  assert.equal(remote.update('right', 330), 'right')
  assert.equal(remote.update('center', 350), null)
  assert.equal(remote.update('center', 500), null)
  assert.equal(remote.update('right', 550), null)
  assert.equal(remote.update('right', 770), 'right')
})

test('steady pace gives time to settle and never accelerates while held', () => {
  const remote = new RemoteRepeater()
  assert.equal(remote.update('right', 100), null)
  assert.equal(remote.update('right', 350), null)
  assert.ok(remote.progress(350) > 0.5 && remote.progress(350) < 0.7)
  assert.equal(remote.update('right', 520), 'right')
  assert.equal(remote.progress(520), 0)
  assert.equal(remote.update('right', 1200), null)
  assert.equal(remote.update('right', 1470), 'right')
  assert.equal(remote.update('right', 2000), null)
  assert.equal(remote.update('right', 2420), 'right')
  assert.equal(remote.update('center', 2450), null)
  assert.equal(remote.progress(2450), 0)
})
test('navigation follows rows and columns and does not wrap at an edge', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ id: String(i), x: (i % 3) * 300, y: Math.floor(i / 3) * 200, width: 280, height: 180 }))
  assert.equal(nextRemoteItem(items, '1', 'right'), '2')
  assert.equal(nextRemoteItem(items, '1', 'down'), '4')
  assert.equal(nextRemoteItem(items, '4', 'up'), '1')
  assert.equal(nextRemoteItem(items, '0', 'left'), '0')
  assert.equal(nextRemoteItem(items, '2', 'right'), '2')
  assert.equal(nextRemoteItem(items, '4', 'down'), '4')
  items.push({ id: 'navigation', x: 700, y: -500, width: 100, height: 60 })
  assert.equal(nextRemoteItem(items, '2', 'right'), '2')
})
const arm = () => {
  const blink = new RemoteBlink()
  for (let t = 100; t <= 500; t += 50) blink.update(0, 0, t, 'water')
  return blink
}
test('only a deliberate bilateral blink selects the same highlighted control', () => {
  const blink = arm()
  blink.update(0.8, 0.8, 550, 'water')
  assert.equal(blink.update(0, 0, 1050, 'water'), 'water')
  assert.equal(blink.update(0, 0, 1100, 'water'), null)
  const natural = arm()
  natural.update(0.8, 0.8, 550, 'water')
  assert.equal(natural.update(0, 0, 690, 'water'), null)
  const wink = arm()
  wink.update(0.8, 0, 550, 'water')
  assert.equal(wink.update(0, 0, 1050, 'water'), null)
  const lost = arm()
  lost.update(0.8, 0.8, 550, 'water')
  lost.reset()
  assert.equal(lost.update(0, 0, 1000, 'water'), null)
  const changed = arm()
  changed.update(0.8, 0.8, 550, 'water')
  assert.equal(changed.update(0, 0, 1050, 'nurse'), null)
})
