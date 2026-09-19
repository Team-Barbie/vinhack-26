let audio: AudioContext | null = null

function context() {
  audio ??= new AudioContext()
  return audio
}

export function unlockAlertAudio() {
  if (typeof window === 'undefined' || !window.AudioContext) return
  const ctx = context()
  if (ctx.state === 'suspended') void ctx.resume()
}

function tone(ctx: AudioContext, start: number, frequency: number, seconds = 0.18) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + seconds + 0.02)
}

export async function playAlertBeep() {
  if (typeof window === 'undefined' || !window.AudioContext) return
  const ctx = context()
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  const t = ctx.currentTime
  tone(ctx, t, 880)
  tone(ctx, t + 0.22, 880)
  tone(ctx, t + 0.44, 1175, 0.26)
}
