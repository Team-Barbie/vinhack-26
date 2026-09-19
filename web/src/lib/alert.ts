let audio: AudioContext | null = null

function context() {
  audio ??= new AudioContext()
  if (audio.state === 'suspended') void audio.resume()
  return audio
}

function tone(ctx: AudioContext, start: number, frequency: number, seconds = 0.16) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + seconds + 0.02)
}

export function playAlertBeep() {
  if (typeof window === 'undefined' || !window.AudioContext) return
  const ctx = context()
  const t = ctx.currentTime
  tone(ctx, t, 880)
  tone(ctx, t + 0.2, 880)
  tone(ctx, t + 0.4, 1175, 0.22)
}
