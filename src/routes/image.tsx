import { createFileRoute } from '@tanstack/react-router'
import { ConverterPage } from '../components/ConverterPage'

export const Route = createFileRoute('/image')({
  component: ImagePage,
})

function ImagePage() {
  return (
    <ConverterPage
      fileType="image"
      notice="Convert image files to XTC with dedicated scaling modes for wallpapers and covers."
    />
  )
}
