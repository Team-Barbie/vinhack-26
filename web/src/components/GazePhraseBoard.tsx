import { useCallback, useMemo, useState } from 'react'
import { choose, ROOT_LEVEL, splitChoices, type BoardLevel, type PhraseNode, type Side } from '../lib/phraseTree'
import { speak } from '../lib/speech'
import './GazePhraseBoard.css'

// Selection is driven entirely by the shared EyeRemote (app-wide calibration). Its
// highlight lands on the two panels marked data-gaze-control; data-remote-label
// is the short name for each control.

const listOf = (choices: readonly PhraseNode[]) => choices.map((c) => c.label).join(', ')

export default function GazePhraseBoard() {
  // The last entry is the level on screen; earlier entries are where Back returns to.
  const [stack, setStack] = useState<readonly BoardLevel[]>([ROOT_LEVEL])
  const [lastSpoken, setLastSpoken] = useState('')
  const level = stack[stack.length - 1]
  const [left, right] = useMemo(() => splitChoices(level.choices), [level.choices])

  const reset = useCallback(() => setStack([ROOT_LEVEL]), [])
  const goBack = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), [])

  const pick = useCallback((side: Side) => {
    const step = choose(level, side)
    if (!step) return
    if (step.kind === 'open') {
      setStack((s) => [...s, step.level])
      return
    }
    speak(step.phrase)
    setLastSpoken(step.phrase)
    reset()
  }, [level, reset])

  const panel = (side: Side, choices: readonly PhraseNode[]) => {
    const name = side === 'left' ? 'Left option group' : 'Right option group'
    return (
      <button
        key={`${side}-${choices.map((choice) => choice.id).join('-')}`}
        type="button"
        className={`gaze-choice gaze-choice-${side}`}
        data-gaze-control="true"
        data-remote-label={name}
        aria-label={`${name}: ${listOf(choices)}`}
        disabled={choices.length === 0}
        onClick={() => pick(side)}
      >
        <span className="gaze-direction">{side === 'left' ? '← Left group' : 'Right group →'}</span>
        <span className="gaze-choice-list">
          {choices.map((choice) => (
            <span key={choice.id}>
              <strong>{choice.label}</strong>
              {choice.hint && <small>{choice.hint}</small>}
            </span>
          ))}
        </span>
      </button>
    )
  }

  return (
    <section className="gaze-phrase-board" aria-label="Gaze phrase selector">
      <div className="gaze-phrase-toolbar">
        <button type="button" className="gaze-back" data-remote-label="Back one step" onClick={goBack} disabled={stack.length === 1}>
          ← Back one step
        </button>
        <button type="button" className="gaze-reset" data-remote-label="Start over" onClick={reset}>Start over</button>
      </div>

      <div className="gaze-level-title">
        <span>Step {stack.length}</span>
        <h2>{level.title}</h2>
        <span className="gaze-choice-count">{level.choices.length} choices</span>
      </div>
      {lastSpoken && <div className="gaze-spoken" role="status">Said: "{lastSpoken}"</div>}

      <div className="gaze-choice-layout">
        {panel('left', left)}
        {panel('right', right)}
      </div>

      <p className="gaze-phrase-hint">
        Look at an arrow to move the highlight between the two groups, then hold a blink to choose. Only the current step is shown.
      </p>
    </section>
  )
}
