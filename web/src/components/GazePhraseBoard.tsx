import { useCallback, useMemo, useState } from 'react'
import './GazePhraseBoard.css'

type PhraseNode = {
  id: string
  label: string
  hint?: string
  phrase?: string
  children?: readonly PhraseNode[]
}

type BoardLevel = {
  title: string
  choices: readonly PhraseNode[]
}

const leaf = (id: string, phrase: string): PhraseNode => ({ id, label: phrase, phrase })

const ROOT_LEVEL: BoardLevel = {
  title: 'What do you want to say?',
  choices: [
    {
      id: 'answer', label: 'I want to answer', hint: 'Yes, no, maybe, or unsure', children: [
        leaf('yes', 'Yes'), leaf('no', 'No'), leaf('maybe', 'Maybe'), leaf('unsure', "I don't know"),
      ],
    },
    {
      id: 'need', label: 'I need something', hint: 'A person, food, care, or an item', children: [
        { id: 'person', label: 'I need a person', hint: 'Nurse or family', children: [leaf('nurse', 'I need a nurse'), leaf('family', 'Please call my family')] },
        { id: 'food-drink', label: 'I need food or a drink', children: [leaf('water', 'I need water'), leaf('food', 'I need food')] },
        { id: 'personal-care', label: 'I need personal care', hint: 'Bathroom or medicine', children: [leaf('bathroom', 'I need help using the bathroom'), leaf('medicine', 'I need my medicine')] },
        { id: 'item', label: 'I need a comfort item', children: [leaf('blanket', 'I need a blanket or pillow'), leaf('phone', 'I need my phone or charger')] },
      ],
    },
    {
      id: 'unwell', label: 'I feel unwell', hint: 'Pain, breathing, sickness, or discomfort', children: [
        { id: 'pain-breathing', label: 'Pain or breathing', children: [leaf('pain', 'I am in pain'), leaf('breathing', 'I am having trouble breathing')] },
        { id: 'sick-dizzy', label: 'Sick or dizzy', children: [leaf('nauseous', 'I feel nauseous'), leaf('dizzy', 'I feel dizzy')] },
        { id: 'body-feeling', label: 'Body discomfort', children: [leaf('numb', 'I feel numbness'), leaf('uncomfortable', 'I am uncomfortable'), leaf('hot', 'I feel too hot'), leaf('cold', 'I feel too cold')] },
        { id: 'emotion-energy', label: 'Emotion or energy', children: [leaf('scared', 'I feel scared'), leaf('tired', 'I am tired')] },
      ],
    },
    {
      id: 'position', label: 'Please change my position', hint: 'Sit up, lie down, turn, or move', children: [
        { id: 'upper-position', label: 'Sit me up or lie me down', children: [leaf('sit-up', 'Please sit me up'), leaf('lie-down', 'Please help me lie down')] },
        { id: 'turn', label: 'Please turn me', children: [leaf('turn-left', 'Please turn me to the left'), leaf('turn-right', 'Please turn me to the right')] },
        leaf('help-move', 'Please help me move'),
      ],
    },
    {
      id: 'room', label: 'Please adjust my room', hint: 'Lights, curtains, or temperature', children: [
        { id: 'lights', label: 'Change the lights', children: [leaf('lights-on', 'Please turn the lights on'), leaf('lights-off', 'Please turn the lights off')] },
        { id: 'curtains', label: 'Change the curtains', children: [leaf('curtains-open', 'Please open the curtains'), leaf('curtains-close', 'Please close the curtains')] },
        { id: 'temperature', label: 'Change the temperature', children: [leaf('room-hot', 'I feel too hot'), leaf('room-cold', 'I feel too cold')] },
      ],
    },
    {
      id: 'communicate', label: 'Please help me communicate', hint: 'Pause, repeat, or simplify', children: [
        { id: 'pause', label: 'Stop or wait', children: [leaf('stop', 'Please stop'), leaf('wait', 'Please wait')] },
        { id: 'repeat', label: 'Repeat or slow down', children: [leaf('repeat-that', 'Please repeat that'), leaf('speak-slowly', 'Please speak slowly')] },
        leaf('yes-no-questions', 'Please ask me yes or no questions'),
      ],
    },
    {
      id: 'rest', label: 'I want to rest', hint: 'Rest, comfort, or lie down', children: [
        leaf('ready-rest', 'I am ready to rest'), leaf('rest-tired', 'I am tired'),
        leaf('rest-blanket', 'I need a blanket or pillow'), leaf('rest-lie-down', 'Please help me lie down'),
      ],
    },
  ],
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

function splitChoices(choices: readonly PhraseNode[]) {
  const middle = Math.ceil(choices.length / 2)
  return [choices.slice(0, middle), choices.slice(middle)] as const
}

export default function GazePhraseBoard() {
  const [level, setLevel] = useState<BoardLevel>(ROOT_LEVEL)
  const [history, setHistory] = useState<readonly BoardLevel[]>([])
  const [lastSpoken, setLastSpoken] = useState('')
  const [leftChoices, rightChoices] = useMemo(() => splitChoices(level.choices), [level.choices])

  const openLevel = useCallback((next: BoardLevel) => {
    setHistory((previous) => [...previous, level])
    setLevel(next)
  }, [level])

  const reset = useCallback(() => {
    setLevel(ROOT_LEVEL)
    setHistory([])
  }, [])

  const goBack = useCallback(() => {
    setHistory((previous) => {
      const parent = previous.at(-1)
      if (parent) setLevel(parent)
      return parent ? previous.slice(0, -1) : previous
    })
  }, [])

  const chooseNode = useCallback((node: PhraseNode) => {
    if (node.children?.length) {
      openLevel({ title: node.label, choices: node.children })
      return
    }
    const phrase = node.phrase ?? node.label
    speak(phrase)
    setLastSpoken(phrase)
    reset()
  }, [openLevel, reset])

  const chooseGroup = useCallback((side: 'left' | 'right') => {
    const selected = side === 'left' ? leftChoices : rightChoices
    if (selected.length === 0) return
    if (selected.length === 1) {
      chooseNode(selected[0])
      return
    }
    openLevel({ title: 'Which option fits best?', choices: selected })
  }, [chooseNode, leftChoices, openLevel, rightChoices])

  return (
    <section className="gaze-phrase-board" aria-label="Gaze phrase selector">
      <div className="gaze-phrase-toolbar">
        <button type="button" className="gaze-back" onClick={goBack} disabled={history.length === 0}>← Back one step</button>
        <span className="gaze-choice-count">{level.choices.length} choices</span>
        <button type="button" className="gaze-reset" onClick={reset}>Start over</button>
      </div>
      <div className="gaze-level-title">
        <span>Step {history.length + 1}</span>
        <h2>{level.title}</h2>
      </div>
      {lastSpoken && <div className="gaze-spoken" role="status">Spoke: “{lastSpoken}”</div>}

      <div className="gaze-choice-layout">
        <button type="button" className="gaze-choice gaze-choice-left" data-gaze-control="true" data-remote-label="Left option group" onClick={() => chooseGroup('left')}>
          <span className="gaze-direction">← Left group</span>
          <span className="gaze-choice-list">{leftChoices.map((choice) => <span key={choice.id}>{choice.label}</span>)}</span>
        </button>
        <button type="button" className="gaze-choice gaze-choice-right" data-gaze-control="true" data-remote-label="Right option group" onClick={() => chooseGroup('right')}>
          <span className="gaze-direction">Right group →</span>
          <span className="gaze-choice-list">{rightChoices.map((choice) => <span key={choice.id}>{choice.label}</span>)}</span>
        </button>
      </div>

      <p className="gaze-phrase-hint">Look to move the highlight, then hold a blink to choose. Only the current context is shown.</p>
    </section>
  )
}
