export interface ConversionOptions {
  device: 'X4' | 'X3'
  splitMode: string
  dithering: string
  contrast: number
  horizontalMargin: number
  verticalMargin: number
  orientation: 'landscape' | 'portrait'
  landscapeFlipClockwise: boolean
  showProgressPreview: boolean
}

export interface ConversionResult {
  name: string
  data?: ArrayBuffer
  size?: number
  pageCount?: number
  pageImages?: string[]
  previewMode?: 'sparse' | 'full'
  error?: string
}
