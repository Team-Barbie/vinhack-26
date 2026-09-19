// Turns an emoji image into a dot-matrix mask, in the spirit of Nothing OS monochrome icons:
// every glyph is normalised to the same optical size, sampled on a square grid, and drawn as
// round dots. Dot size follows brightness, so highlights are big dots and shadows are small.
// The result is a black-on-transparent PNG used as a CSS mask, so the icon takes the text colour.

const GRID = 30 // dots per side
const SIZE = 240 // mask resolution in px
const FILL = 0.94 // share of the grid the glyph occupies (rest is breathing room)
const SHAPE_ALPHA = 0.35 // cells at least this opaque are part of the glyph
const MIN_DOT = 0.24 // smallest dot radius, as a share of a cell, so the silhouette never breaks
const GAP_TONE = 0.07 // solid cells this dark drop out entirely, so eyes and mouths read as gaps

const cache = new Map<string, Promise<string>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${src}`))
    img.src = src
  })
}

// Smallest square (in source pixels) that contains every visible pixel, centred on the glyph.
function glyphBox(img: HTMLImageElement) {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, side: Math.max(width, height) }
  const side = Math.max(maxX - minX + 1, maxY - minY + 1) / FILL
  return { x: (minX + maxX + 1) / 2 - side / 2, y: (minY + maxY + 1) / 2 - side / 2, side }
}

async function render(src: string): Promise<string> {
  const img = await loadImage(src)
  const box = glyphBox(img)

  const small = document.createElement('canvas')
  small.width = small.height = GRID
  const sctx = small.getContext('2d', { willReadFrequently: true })!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, box.x, box.y, box.side, box.side, 0, 0, GRID, GRID)
  const { data } = sctx.getImageData(0, 0, GRID, GRID)

  // Stretch each glyph's own brightness range to 0..1, so a dark icon (wheelchair) and a
  // light one (drop) both use the full range of dot sizes, and same-hue detail separates.
  const lumas: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] / 255 >= SHAPE_ALPHA) lumas.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255)
  }
  lumas.sort((a, b) => a - b)
  const lo = lumas[Math.floor(lumas.length * 0.06)] ?? 0
  const hi = lumas[Math.floor(lumas.length * 0.94)] ?? 1
  const span = Math.max(0.12, hi - lo)

  const out = document.createElement('canvas')
  out.width = out.height = SIZE
  const octx = out.getContext('2d')!
  octx.fillStyle = '#000'
  const cell = SIZE / GRID
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = (gy * GRID + gx) * 4
      const a = data[i + 3] / 255
      if (a < SHAPE_ALPHA) continue
      const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
      const linear = Math.min(1, Math.max(0, (luma - lo) / span))
      // S-curve: pushes features apart so a face's dark eyes and mouth stand out from its skin.
      const tone = linear * linear * (3 - 2 * linear)
      if (a > 0.9 && tone < GAP_TONE) continue
      const radius = cell * 0.5 * (MIN_DOT + (0.98 - MIN_DOT) * tone * Math.min(1, a * 1.2))
      octx.beginPath()
      octx.arc((gx + 0.5) * cell, (gy + 0.5) * cell, radius, 0, Math.PI * 2)
      octx.fill()
    }
  }
  return out.toDataURL('image/png')
}

export function dotEmojiMask(src: string): Promise<string> {
  let hit = cache.get(src)
  if (!hit) {
    hit = render(src)
    // A failed image (offline, blocked) must not be cached, so a later mount can retry.
    hit.catch(() => cache.delete(src))
    cache.set(src, hit)
  }
  return hit
}
