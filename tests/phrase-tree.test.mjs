import test from 'node:test'
import assert from 'node:assert/strict'
import { choose, NARROW_TITLE, ROOT_LEVEL, splitChoices } from '../web/src/lib/phraseTree.ts'

// Collect every leaf phrase defined in the tree, and every id.
function collect(nodes, leaves = [], ids = []) {
  for (const n of nodes) {
    ids.push(n.id)
    if (n.children?.length) collect(n.children, leaves, ids)
    else leaves.push(n.phrase ?? n.label)
  }
  return { leaves, ids }
}

// Explore every sequence of left/right picks and record the phrases they end on.
function explore() {
  const reached = new Map()
  const stack = [{ level: ROOT_LEVEL, steps: 0 }]
  let levels = 0
  while (stack.length) {
    const { level, steps } = stack.pop()
    levels += 1
    assert.ok(level.choices.length >= 2, `level "${level.title}" needs two choices to fill both panels`)
    for (const side of ['left', 'right']) {
      const step = choose(level, side)
      assert.ok(step, `${side} panel of "${level.title}" must not be empty`)
      if (step.kind === 'say') {
        const best = reached.get(step.phrase)
        if (best === undefined || steps + 1 < best) reached.set(step.phrase, steps + 1)
      } else stack.push({ level: step.level, steps: steps + 1 })
    }
  }
  return { reached, levels }
}

test('every phrase in the tree is reachable using only left and right, word for word', () => {
  const { leaves } = collect(ROOT_LEVEL.choices)
  const { reached } = explore()
  for (const phrase of new Set(leaves)) assert.ok(reached.has(phrase), `"${phrase}" cannot be reached`)
  for (const phrase of reached.keys()) assert.ok(leaves.includes(phrase), `"${phrase}" is not a defined phrase`)
})

test('phrases are never more than a handful of steps away', () => {
  const { reached } = explore()
  assert.ok(Math.max(...reached.values()) <= 7, `deepest phrase takes ${Math.max(...reached.values())} steps`)
})

test('node ids are unique so React keys and remote labels never collide', () => {
  const { ids } = collect(ROOT_LEVEL.choices)
  assert.equal(new Set(ids).size, ids.length)
})

test('odd counts give the left panel the larger half; narrowing keeps that half', () => {
  const [left, right] = splitChoices(ROOT_LEVEL.choices)
  assert.equal(left.length, 4)
  assert.equal(right.length, 3)
  const step = choose(ROOT_LEVEL, 'left')
  assert.equal(step.kind, 'open')
  assert.equal(step.level.title, NARROW_TITLE)
  assert.deepEqual(step.level.choices.map((c) => c.id), left.map((c) => c.id))
})

test('a lone choice opens its own children, and an empty panel does nothing', () => {
  const twoAndOne = { title: 't', choices: ROOT_LEVEL.choices.slice(0, 3) }
  const step = choose(twoAndOne, 'right')
  assert.equal(step.kind, 'open')
  assert.equal(step.level.title, 'I feel unwell')
  assert.equal(choose({ title: 'single', choices: ROOT_LEVEL.choices.slice(0, 1) }, 'right'), null)
})
