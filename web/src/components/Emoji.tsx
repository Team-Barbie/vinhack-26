import { useEffect, useState, type CSSProperties } from 'react'
import { dotEmojiMask } from '../lib/dotEmoji'

// Each emoji is the Apple artwork (emoji-datasource-apple via jsDelivr), redrawn as a
// dot matrix in the current text colour. If the image can't load, the system emoji shows.
const BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/'

const fileFor = (emoji: string) => Array.from(emoji, (c) => c.codePointAt(0)!.toString(16)).join('-')

export default function Emoji({ char, className = '' }: { char: string; className?: string }) {
  const [mask, setMask] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    dotEmojiMask(`${BASE}${fileFor(char)}.png`).then(
      (url) => { if (live) setMask(url) },
      () => { if (live) setFailed(true) },
    )
    return () => { live = false }
  }, [char])

  if (failed) {
    return <span className={`emoji emoji-native ${className}`} aria-hidden="true">{char}</span>
  }
  return (
    <span
      className={`emoji emoji-dots ${mask ? 'is-ready' : ''} ${className}`}
      style={mask ? ({ '--emoji-mask': `url(${mask})` } as CSSProperties) : undefined}
      aria-hidden="true"
    />
  )
}
