// Hierarchical phrase tree for Gaze Phrases (ported from the gaze branch).
// Every step shows the same two panels, left and right. Choosing a panel keeps
// only that half of the choices; once a single choice is left it either opens its
// own children or, if it is a leaf, its exact phrase is spoken.

export type PhraseNode = {
  id: string
  label: string
  hint?: string
  phrase?: string
  children?: readonly PhraseNode[]
}

export type BoardLevel = {
  title: string
  choices: readonly PhraseNode[]
}

export type Side = 'left' | 'right'

export type Step =
  | { kind: 'open'; level: BoardLevel }
  | { kind: 'say'; phrase: string }

const leaf = (id: string, phrase: string): PhraseNode => ({ id, label: phrase, phrase })

export const NARROW_TITLE = 'Which option fits best?'

export const ROOT_LEVEL: BoardLevel = {
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

// The left panel gets the larger half when the count is odd.
export function splitChoices(choices: readonly PhraseNode[]): readonly [readonly PhraseNode[], readonly PhraseNode[]] {
  const middle = Math.ceil(choices.length / 2)
  return [choices.slice(0, middle), choices.slice(middle)]
}

// What happens when a single node is picked: open its children or say its phrase.
export function stepInto(node: PhraseNode): Step {
  if (node.children?.length) return { kind: 'open', level: { title: node.label, choices: node.children } }
  return { kind: 'say', phrase: node.phrase ?? node.label }
}

// What happens when the left or right panel of `level` is picked.
export function choose(level: BoardLevel, side: Side): Step | null {
  const [left, right] = splitChoices(level.choices)
  const picked = side === 'left' ? left : right
  if (picked.length === 0) return null
  if (picked.length === 1) return stepInto(picked[0])
  return { kind: 'open', level: { title: NARROW_TITLE, choices: picked } }
}
