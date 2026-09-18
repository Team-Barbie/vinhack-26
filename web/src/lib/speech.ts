let pendingSpeech: number | null = null
let activeUtterance: SpeechSynthesisUtterance | null = null
let selectedVoice: SpeechSynthesisVoice | null = null

function clearPendingSpeech() {
  if (pendingSpeech === null) return
  window.clearTimeout(pendingSpeech)
  pendingSpeech = null
}

export function speak(text: string) {
  const message = text.trim()
  if (!message || !('speechSynthesis' in window)) return

  clearPendingSpeech()
  window.speechSynthesis.cancel()
  activeUtterance = null

  // Let cancellation settle before starting the only allowed utterance.
  pendingSpeech = window.setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(message)
    if (!selectedVoice) {
      const voices = window.speechSynthesis.getVoices()
      selectedVoice = voices.find((voice) => voice.default && voice.lang.startsWith('en'))
        ?? voices.find((voice) => voice.lang.startsWith('en'))
        ?? voices[0]
        ?? null
    }
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onend = utterance.onerror = () => {
      if (activeUtterance === utterance) activeUtterance = null
    }
    activeUtterance = utterance
    pendingSpeech = null
    window.speechSynthesis.speak(utterance)
  }, 40)
}
