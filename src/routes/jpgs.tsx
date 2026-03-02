import { createFileRoute } from '@tanstack/react-router'
import { JpgVolumePage } from '../components/JpgVolumePage'

export const Route = createFileRoute('/jpgs')({
  component: JpgsPage,
})

function JpgsPage() {
  return <JpgVolumePage />
}
