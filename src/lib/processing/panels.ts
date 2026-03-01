export interface PanelSegment {
  x: number
  y: number
  w: number
  h: number
}

interface AnalysisRect {
  x: number
  y: number
  w: number
  h: number
}

interface SplitCandidate {
  axis: 'horizontal' | 'vertical'
  gapStart: number
  gapEnd: number
  score: number
}

const MAX_ANALYSIS_DIMENSION = 320
const INK_THRESHOLD = 235
const BLANK_EDGE_RATIO = 0.003
const GUTTER_ROW_INK_RATIO = 0.015
const GUTTER_COL_INK_RATIO = 0.015
const MAX_RECURSION_DEPTH = 6

export function calculatePanelSegments(imageData: ImageData): PanelSegment[] {
  const scaled = downscaleInkMask(imageData)
  if (!scaled) return []

  const contentBounds = trimBlankEdges({
    x: 0,
    y: 0,
    w: scaled.width,
    h: scaled.height
  }, scaled.mask, scaled.width, scaled.height)

  if (!contentBounds || contentBounds.w < 24 || contentBounds.h < 24) {
    return []
  }

  const regions = splitRegion(contentBounds, scaled.mask, scaled.width, scaled.height, 0)
  const deduped = dedupeAndFilterRegions(regions, contentBounds)
  if (deduped.length < 2) {
    return []
  }

  return sortPanelsRightToLeft(deduped).map((rect) => mapToOriginal(rect, scaled.scale, imageData.width, imageData.height))
}

function downscaleInkMask(imageData: ImageData): { mask: Uint8Array; width: number; height: number; scale: number } | null {
  const { width, height, data } = imageData
  if (width <= 0 || height <= 0) return null

  const scale = Math.min(1, MAX_ANALYSIS_DIMENSION / Math.max(width, height))
  const scaledWidth = Math.max(1, Math.round(width * scale))
  const scaledHeight = Math.max(1, Math.round(height * scale))
  const mask = new Uint8Array(scaledWidth * scaledHeight)

  for (let y = 0; y < scaledHeight; y++) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale))
    for (let x = 0; x < scaledWidth; x++) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale))
      const idx = (sourceY * width + sourceX) * 4
      const gray = data[idx]
      mask[y * scaledWidth + x] = gray < INK_THRESHOLD ? 1 : 0
    }
  }

  return { mask, width: scaledWidth, height: scaledHeight, scale }
}

function trimBlankEdges(region: AnalysisRect, mask: Uint8Array, width: number, height: number): AnalysisRect | null {
  let { x, y, w, h } = region
  const minRowInk = Math.max(1, Math.floor(w * BLANK_EDGE_RATIO))
  const minColInk = Math.max(1, Math.floor(h * BLANK_EDGE_RATIO))

  while (h > 0 && countRowInk(mask, width, x, w, y) <= minRowInk) {
    y++
    h--
  }
  while (h > 0 && countRowInk(mask, width, x, w, y + h - 1) <= minRowInk) {
    h--
  }
  while (w > 0 && countColInk(mask, width, x, y, h) <= minColInk) {
    x++
    w--
  }
  while (w > 0 && countColInk(mask, width, x + w - 1, y, h) <= minColInk) {
    w--
  }

  if (w <= 0 || h <= 0) return null
  return { x, y, w, h }
}

function splitRegion(
  region: AnalysisRect,
  mask: Uint8Array,
  width: number,
  height: number,
  depth: number
): AnalysisRect[] {
  const trimmed = trimBlankEdges(region, mask, width, height)
  if (!trimmed) return []

  const minArea = Math.max(140, Math.floor(trimmed.w * trimmed.h * 0.03))
  if (depth >= MAX_RECURSION_DEPTH || trimmed.w * trimmed.h <= minArea) {
    return [trimmed]
  }

  const horizontal = findHorizontalSplit(trimmed, mask, width)
  const vertical = findVerticalSplit(trimmed, mask, width)
  const best = chooseBestSplit(horizontal, vertical)

  if (!best) {
    return [trimmed]
  }

  const childRects = splitRect(trimmed, best)
  if (childRects.length < 2) {
    return [trimmed]
  }

  const result: AnalysisRect[] = []
  for (const child of childRects) {
    const childTrimmed = trimBlankEdges(child, mask, width, height)
    if (!childTrimmed) continue

    const childArea = childTrimmed.w * childTrimmed.h
    if (childArea < Math.max(90, minArea * 0.55)) {
      continue
    }

    result.push(...splitRegion(childTrimmed, mask, width, height, depth + 1))
  }

  return result.length >= 2 ? result : [trimmed]
}

function chooseBestSplit(
  horizontal: SplitCandidate | null,
  vertical: SplitCandidate | null
): SplitCandidate | null {
  if (!horizontal) return vertical
  if (!vertical) return horizontal
  return horizontal.score >= vertical.score ? horizontal : vertical
}

function findHorizontalSplit(region: AnalysisRect, mask: Uint8Array, width: number): SplitCandidate | null {
  const minGap = Math.max(4, Math.round(region.h * 0.035))
  const edgePadding = Math.max(6, Math.round(region.h * 0.12))
  const maxInk = Math.max(1, Math.floor(region.w * GUTTER_ROW_INK_RATIO))
  const minChild = Math.max(18, Math.round(region.h * 0.18))

  let runStart = -1
  let best: SplitCandidate | null = null

  for (let y = region.y; y <= region.y + region.h; y++) {
    const isGap = y < region.y + region.h &&
      countRowInk(mask, width, region.x, region.w, y) <= maxInk

    if (isGap) {
      if (runStart === -1) runStart = y
      continue
    }

    if (runStart !== -1) {
      const runEnd = y
      const gapSize = runEnd - runStart
      const topSize = runStart - region.y
      const bottomSize = region.y + region.h - runEnd

      if (
        gapSize >= minGap &&
        topSize >= minChild &&
        bottomSize >= minChild &&
        topSize >= edgePadding &&
        bottomSize >= edgePadding
      ) {
        const score = gapSize / region.h
        if (!best || score > best.score) {
          best = { axis: 'horizontal', gapStart: runStart, gapEnd: runEnd, score }
        }
      }

      runStart = -1
    }
  }

  return best
}

function findVerticalSplit(region: AnalysisRect, mask: Uint8Array, width: number): SplitCandidate | null {
  const minGap = Math.max(4, Math.round(region.w * 0.03))
  const edgePadding = Math.max(6, Math.round(region.w * 0.08))
  const maxInk = Math.max(1, Math.floor(region.h * GUTTER_COL_INK_RATIO))
  const minChild = Math.max(18, Math.round(region.w * 0.18))

  let runStart = -1
  let best: SplitCandidate | null = null

  for (let x = region.x; x <= region.x + region.w; x++) {
    const isGap = x < region.x + region.w &&
      countColInk(mask, width, x, region.y, region.h) <= maxInk

    if (isGap) {
      if (runStart === -1) runStart = x
      continue
    }

    if (runStart !== -1) {
      const runEnd = x
      const gapSize = runEnd - runStart
      const leftSize = runStart - region.x
      const rightSize = region.x + region.w - runEnd

      if (
        gapSize >= minGap &&
        leftSize >= minChild &&
        rightSize >= minChild &&
        leftSize >= edgePadding &&
        rightSize >= edgePadding
      ) {
        const score = gapSize / region.w
        if (!best || score > best.score) {
          best = { axis: 'vertical', gapStart: runStart, gapEnd: runEnd, score }
        }
      }

      runStart = -1
    }
  }

  return best
}

function splitRect(region: AnalysisRect, split: SplitCandidate): AnalysisRect[] {
  if (split.axis === 'horizontal') {
    return [
      { x: region.x, y: region.y, w: region.w, h: split.gapStart - region.y },
      { x: region.x, y: split.gapEnd, w: region.w, h: region.y + region.h - split.gapEnd }
    ]
  }

  return [
    { x: region.x, y: region.y, w: split.gapStart - region.x, h: region.h },
    { x: split.gapEnd, y: region.y, w: region.x + region.w - split.gapEnd, h: region.h }
  ]
}

function dedupeAndFilterRegions(regions: AnalysisRect[], root: AnalysisRect): AnalysisRect[] {
  const minArea = Math.max(150, Math.floor(root.w * root.h * 0.025))
  const filtered = regions
    .filter((rect) => rect.w > 10 && rect.h > 10 && rect.w * rect.h >= minArea)
    .sort((a, b) => (b.w * b.h) - (a.w * a.h))

  const deduped: AnalysisRect[] = []
  for (const rect of filtered) {
    const duplicate = deduped.some((existing) => intersectionOverUnion(rect, existing) > 0.82)
    if (!duplicate) {
      deduped.push(rect)
    }
  }

  return deduped
}

function sortPanelsRightToLeft(rects: AnalysisRect[]): AnalysisRect[] {
  const remaining = [...rects].sort((a, b) => a.y - b.y || b.x - a.x)
  const rows: AnalysisRect[][] = []

  while (remaining.length > 0) {
    const current = remaining.shift()!
    const row = [current]
    let top = current.y
    let bottom = current.y + current.h

    for (let i = 0; i < remaining.length;) {
      const candidate = remaining[i]
      const overlap = verticalOverlap(top, bottom, candidate.y, candidate.y + candidate.h)
      const overlapRatio = overlap / Math.max(1, Math.min(bottom - top, candidate.h))
      const rowDistance = Math.abs(candidate.y - top)
      const candidateTolerance = Math.max(8, Math.round(Math.min(bottom - top, candidate.h) * 0.28))

      if (overlapRatio >= 0.3 || rowDistance <= candidateTolerance) {
        row.push(candidate)
        top = Math.min(top, candidate.y)
        bottom = Math.max(bottom, candidate.y + candidate.h)
        remaining.splice(i, 1)
      } else {
        i++
      }
    }

    row.sort((a, b) => b.x - a.x || a.y - b.y)
    rows.push(row)
  }

  rows.sort((a, b) => minTop(a) - minTop(b))
  return rows.flat()
}

function mapToOriginal(rect: AnalysisRect, scale: number, originalWidth: number, originalHeight: number): PanelSegment {
  const inverseScale = 1 / scale
  const x = Math.max(0, Math.floor(rect.x * inverseScale))
  const y = Math.max(0, Math.floor(rect.y * inverseScale))
  const w = Math.min(originalWidth - x, Math.ceil(rect.w * inverseScale))
  const h = Math.min(originalHeight - y, Math.ceil(rect.h * inverseScale))
  const padding = Math.max(4, Math.floor(Math.min(w, h) * 0.03))

  const paddedX = Math.max(0, x - padding)
  const paddedY = Math.max(0, y - padding)
  const paddedW = Math.min(originalWidth - paddedX, w + padding * 2)
  const paddedH = Math.min(originalHeight - paddedY, h + padding * 2)

  return {
    x: paddedX,
    y: paddedY,
    w: Math.max(1, paddedW),
    h: Math.max(1, paddedH)
  }
}

function countRowInk(mask: Uint8Array, width: number, x: number, w: number, y: number): number {
  let count = 0
  const offset = y * width
  for (let i = 0; i < w; i++) {
    count += mask[offset + x + i]
  }
  return count
}

function countColInk(mask: Uint8Array, width: number, x: number, y: number, h: number): number {
  let count = 0
  for (let i = 0; i < h; i++) {
    count += mask[(y + i) * width + x]
  }
  return count
}

function intersectionOverUnion(a: AnalysisRect, b: AnalysisRect): number {
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const intersection = overlapX * overlapY
  if (intersection <= 0) return 0

  const union = a.w * a.h + b.w * b.h - intersection
  return union > 0 ? intersection / union : 0
}

function verticalOverlap(topA: number, bottomA: number, topB: number, bottomB: number): number {
  return Math.max(0, Math.min(bottomA, bottomB) - Math.max(topA, topB))
}

function minTop(row: AnalysisRect[]): number {
  let value = Number.POSITIVE_INFINITY
  for (const rect of row) {
    value = Math.min(value, rect.y)
  }
  return value
}
