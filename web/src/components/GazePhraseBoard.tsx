import { useCallback, useMemo, useState } from 'react'
import './GazePhraseBoard.css'

const PHRASES = [
  'Yes', 'No', 'Maybe', "I don't know", 'I need a nurse', 'I need water',
  'I need help using the bathroom', 'I need my medicine', 'Please help me move',
  'Please change my position', 'I need food', 'I need a blanket or pillow',
  'I need my phone or charger', 'Please call my family', 'I am in pain',
  'I am having trouble breathing', 'I feel nauseous', 'I feel dizzy', 'I feel too hot',
  'I feel too cold', 'I feel numbness', 'I am uncomfortable', 'I feel scared', 'I am tired',
  'Please stop', 'Please repeat that', 'Please speak slowly', 'Please wait',
  'Please ask me yes or no questions', 'Please turn the lights on', 'Please turn the lights off',
  'Please open the curtains', 'Please close the curtains', 'Please sit me up',
  'Please help me lie down', 'Please turn me to the left', 'Please turn me to the right',
  'I am ready to rest',
] as const

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

function splitPhrases(phrases: readonly string[]) {
  const middle = Math.ceil(phrases.length / 2)
  return [phrases.slice(0, middle), phrases.slice(middle)] as const
}

export default function GazePhraseBoard() {
  const [choices, setChoices] = useState<readonly string[]>(PHRASES)
  const [history, setHistory] = useState<readonly string[][]>([])
  const [lastSpoken, setLastSpoken] = useState('')
  const [leftChoices, rightChoices] = useMemo(() => splitPhrases(choices), [choices])

  const reset = useCallback(() => {
    setChoices(PHRASES)
    setHistory([])
  }, [])

  const goBack = useCallback(() => {
    setHistory((previous) => {
      const parent = previous.at(-1)
      if (parent) setChoices(parent)
      return parent ? previous.slice(0, -1) : previous
    })
  }, [])

  const chooseSide = useCallback((side: 'left' | 'right') => {
    const selected = side === 'left' ? leftChoices : rightChoices
    if (selected.length === 0) return
    if (selected.length === 1) {
      const phrase = selected[0]
      speak(phrase)
      setLastSpoken(phrase)
      reset()
      return
    }
    setHistory((previous) => [...previous, [...choices]])
    setChoices(selected)
  }, [choices, leftChoices, reset, rightChoices])

  return (
    <section className="gaze-phrase-board" aria-label="Gaze phrase selector">
      <div className="gaze-phrase-toolbar">
        <button type="button" className="gaze-back" onClick={goBack} disabled={history.length === 0}>← Back one step</button>
        <span className="gaze-choice-count">{choices.length} phrases remaining</span>
        <button type="button" className="gaze-reset" onClick={reset}>Reset phrases</button>
      </div>
      {lastSpoken && <div className="gaze-spoken" role="status">Spoke: “{lastSpoken}”</div>}
      <div className="gaze-choice-layout">
        <button type="button" className="gaze-choice gaze-choice-left" data-remote-label="Left phrase group" onClick={() => chooseSide('left')}>
          <span className="gaze-direction">← Left group</span>
          <span className="gaze-choice-list">{leftChoices.map((phrase) => <span key={phrase}>{phrase}</span>)}</span>
        </button>
        <button type="button" className="gaze-choice gaze-choice-right" data-remote-label="Right phrase group" onClick={() => chooseSide('right')}>
          <span className="gaze-direction">Right group →</span>
          <span className="gaze-choice-list">{rightChoices.map((phrase) => <span key={phrase}>{phrase}</span>)}</span>
        </button>
      </div>
      <p className="gaze-phrase-hint">Use the Eye Remote to highlight a group, then hold a blink to choose it.</p>
    </section>
  )
}
