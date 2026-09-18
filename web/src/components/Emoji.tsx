import { useState } from 'react'

// Same Apple-style emoji artwork on every OS, drawn in black and white. Images come from the
// emoji-datasource-apple package via jsDelivr; if one can't load, the system emoji shows instead.
const BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/'

const fileFor = (emoji: string) => Array.from(emoji, (c) => c.codePointAt(0)!.toString(16)).join('-')

export default function Emoji({ char, className = '' }: { char: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className={`emoji emoji-native ${className}`} aria-hidden="true">{char}</span>
  }
  return (
    <img
      className={`emoji ${className}`}
      src={`${BASE}${fileFor(char)}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
