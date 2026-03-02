import { useCallback, useEffect, useRef, useState } from 'react'
import { Dropzone } from './Dropzone'
import { FileList } from './FileList'
import { Options } from './Options'
import { Progress } from './Progress'
import { Results } from './Results'
import { Viewer } from './Viewer'
import { buildCbzFromImages, convertImageSequenceToXtc } from '../lib/converter'
import type { ConversionOptions } from '../lib/conversion/types'
import { recordConversion } from '../lib/api'
import { useStoredResults, type StoredResult } from '../hooks/useStoredResults'
import { extractXtcPages } from '../lib/xtc-reader'

const FILE_NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const MAX_FALLBACK_PREVIEW_PAGES = 200
const PROGRESS_UPDATE_INTERVAL_MS = 120

type OutputFormat = 'xtc' | 'cbz'

function sortFilesNaturally(files: File[]): File[] {
  return [...files].sort((a, b) => FILE_NAME_COLLATOR.compare(a.name, b.name))
}

export function JpgVolumePage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('xtc')
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('Processing...')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [viewerPages, setViewerPages] = useState<string[]>([])
  const progressPreviewRef = useRef<string | null>(null)
  const pendingProgressRef = useRef<number | null>(null)
  const pendingPreviewRef = useRef<string | undefined>(undefined)
  const progressTimerRef = useRef<number | null>(null)
  const lastProgressFlushRef = useRef(0)
  const previewCacheRef = useRef<Map<string, string[]>>(new Map())
  const [options, setOptions] = useState<ConversionOptions>({
    device: 'X4',
    splitMode: 'overlap',
    dithering: 'floyd',
    contrast: 4,
    horizontalMargin: 0,
    verticalMargin: 0,
    orientation: 'landscape',
    landscapeFlipClockwise: false,
    showProgressPreview: true,
    imageMode: 'letterbox',
    videoFps: 1.0,
  })

  const {
    results,
    recoveredResults,
    recoveredCount,
    addResult,
    clearSession,
    clearAll,
    dismissRecovered,
    downloadResult,
    getPreviewImages,
    getResultData,
  } = useStoredResults()

  const handleFiles = useCallback((files: File[]) => {
    setSelectedFiles((prev) => sortFilesNaturally([...prev, ...files]))
  }, [])

  const handleRemove = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const flushProgressUi = useCallback((force = false) => {
    const now = performance.now()
    if (!force && now - lastProgressFlushRef.current < PROGRESS_UPDATE_INTERVAL_MS) {
      return
    }

    if (pendingProgressRef.current !== null) {
      setProgress(pendingProgressRef.current)
      pendingProgressRef.current = null
    }

    if (pendingPreviewRef.current !== undefined) {
      const nextPreview = pendingPreviewRef.current
      pendingPreviewRef.current = undefined

      if (progressPreviewRef.current && progressPreviewRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(progressPreviewRef.current)
      }
      progressPreviewRef.current = nextPreview ?? null
      setPreviewUrl(nextPreview ?? null)
    }

    lastProgressFlushRef.current = now
  }, [])

  const scheduleProgressUiFlush = useCallback((force = false) => {
    if (force) {
      if (progressTimerRef.current !== null) {
        clearTimeout(progressTimerRef.current)
        progressTimerRef.current = null
      }
      flushProgressUi(true)
      return
    }

    if (progressTimerRef.current !== null) {
      return
    }

    const elapsed = performance.now() - lastProgressFlushRef.current
    const delay = Math.max(0, PROGRESS_UPDATE_INTERVAL_MS - elapsed)
    progressTimerRef.current = window.setTimeout(() => {
      progressTimerRef.current = null
      flushProgressUi(true)
    }, delay)
  }, [flushProgressUi])

  const handleConvert = useCallback(async () => {
    if (selectedFiles.length === 0) return

    setIsConverting(true)
    await clearSession()
    setProgress(0)
    setProgressText(outputFormat === 'xtc' ? 'Building XTC volume...' : 'Building CBZ volume...')
    if (progressPreviewRef.current && progressPreviewRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(progressPreviewRef.current)
      progressPreviewRef.current = null
    }
    if (progressTimerRef.current !== null) {
      clearTimeout(progressTimerRef.current)
      progressTimerRef.current = null
    }
    pendingProgressRef.current = null
    pendingPreviewRef.current = undefined
    lastProgressFlushRef.current = performance.now()
    setPreviewUrl(null)

    try {
      const result = outputFormat === 'xtc'
        ? await convertImageSequenceToXtc(selectedFiles, options, (fileProgress, preview) => {
            pendingProgressRef.current = fileProgress
            if (preview) {
              pendingPreviewRef.current = preview
            }
            scheduleProgressUiFlush(fileProgress >= 0.999)
          })
        : await buildCbzFromImages(selectedFiles, (fileProgress, preview) => {
            pendingProgressRef.current = fileProgress
            if (preview) {
              pendingPreviewRef.current = preview
            }
            scheduleProgressUiFlush(fileProgress >= 0.999)
          })

      await addResult(result)
      recordConversion('cbz').catch(() => {})
    } catch (err) {
      console.error('Error converting image sequence:', err)
      await addResult({
        name: `manga_volume.${outputFormat}`,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }

    pendingProgressRef.current = 1
    scheduleProgressUiFlush(true)
    if (progressTimerRef.current !== null) {
      clearTimeout(progressTimerRef.current)
      progressTimerRef.current = null
    }
    pendingProgressRef.current = null
    pendingPreviewRef.current = undefined
    setProgress(1)
    setProgressText('Complete')
    if (progressPreviewRef.current && progressPreviewRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(progressPreviewRef.current)
      progressPreviewRef.current = null
    }
    setPreviewUrl(null)
    setIsConverting(false)
  }, [selectedFiles, outputFormat, options, addResult, clearSession, scheduleProgressUiFlush])

  const handlePreview = useCallback(async (result: StoredResult) => {
    const cached = previewCacheRef.current.get(result.id)
    if (cached && cached.length > 0) {
      setViewerPages(cached)
      return
    }

    const images = await getPreviewImages(result)
    if (images.length > 0) {
      previewCacheRef.current.set(result.id, images)
      setViewerPages(images)
      return
    }

    const data = await getResultData(result)
    if (!data || data.byteLength === 0) {
      return
    }

    const decodeLimit = result.pageCount > MAX_FALLBACK_PREVIEW_PAGES
      ? MAX_FALLBACK_PREVIEW_PAGES
      : undefined
    const canvases = await extractXtcPages(data, decodeLimit)
    const decodedImages = canvases.map((canvas) => canvas.toDataURL('image/png'))
    previewCacheRef.current.set(result.id, decodedImages)
    setViewerPages(decodedImages)
  }, [getPreviewImages, getResultData])

  const handleClearResults = useCallback(async () => {
    await clearSession()
    previewCacheRef.current.clear()
  }, [clearSession])

  useEffect(() => {
    return () => {
      if (progressTimerRef.current !== null) {
        clearTimeout(progressTimerRef.current)
      }
      if (progressPreviewRef.current && progressPreviewRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(progressPreviewRef.current)
      }
    }
  }, [])

  const allResults = [...recoveredResults, ...results]

  return (
    <>
      <div className="converter-notice">
        <p>Bundle ordered JPG/image pages into a single manga volume. XTC uses the manga processing pipeline; CBZ just packs the pages as one archive.</p>
      </div>

      {recoveredCount > 0 && (
        <div className="recovered-notice">
          <p>
            Recovered {recoveredCount} file{recoveredCount > 1 ? 's' : ''} from previous session
          </p>
          <div className="recovered-actions">
            <button onClick={dismissRecovered} className="btn-dismiss">
              Dismiss
            </button>
            <button onClick={clearAll} className="btn-clear-all">
              Clear All
            </button>
          </div>
        </div>
      )}

      <Dropzone onFiles={handleFiles} fileType="jpgs" />

      <FileList
        files={selectedFiles}
        onRemove={handleRemove}
        onConvert={handleConvert}
        isConverting={isConverting}
      />

      <div className="options-stack">
        <aside className="options-panel output-format-panel">
          <div className="section-header">
            <h2>Output Format</h2>
          </div>

          <div className="device-toggle" role="group" aria-label="Output format">
            <button
              type="button"
              className={outputFormat === 'xtc' ? 'active' : ''}
              aria-pressed={outputFormat === 'xtc'}
              onClick={() => setOutputFormat('xtc')}
            >
              [XTC]
            </button>
            <button
              type="button"
              className={outputFormat === 'cbz' ? 'active' : ''}
              aria-pressed={outputFormat === 'cbz'}
              onClick={() => setOutputFormat('cbz')}
            >
              [CBZ]
            </button>
          </div>

          <p className="option-hint">
            Files are ordered naturally by filename, for example `001`, `002`, `010`.
          </p>
          <p className="option-hint">
            {outputFormat === 'xtc'
              ? 'XTC applies the same manga conversion settings as the main Comics tool.'
              : 'CBZ stores the selected pages as one archive without manga image processing.'}
          </p>
        </aside>

        {outputFormat === 'xtc' && (
          <Options options={options} onChange={setOptions} fileType="cbz" />
        )}
      </div>

      <Progress
        visible={isConverting}
        progress={progress}
        text={progressText}
        previewUrl={previewUrl}
      />

      <Results
        results={allResults}
        onDownload={downloadResult}
        onPreview={handlePreview}
        onClear={results.length > 0 ? handleClearResults : undefined}
      />

      <Viewer pages={viewerPages} onClose={() => setViewerPages([])} />
    </>
  )
}
