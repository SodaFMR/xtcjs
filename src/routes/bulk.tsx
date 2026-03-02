import { createFileRoute } from '@tanstack/react-router'
import { JpgVolumePage } from '../components/JpgVolumePage'

export const Route = createFileRoute('/bulk')({
  component: BulkPage,
})

function BulkPage() {
  return <JpgVolumePage />
}
