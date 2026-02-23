import { Badge } from '@/components/ui/Badge'

export function StatusPill({ status }: { status: 'NONE' | 'OPEN' | 'CLOSED' | 'SETTLED' | 'CANCELLED' }) {
  if (status === 'OPEN') {
    return <Badge variant="active">OPEN</Badge>
  }
  if (status === 'CLOSED') {
    return <Badge variant="warn">CLOSED</Badge>
  }
  if (status === 'SETTLED') {
    return <Badge variant="live">SETTLED</Badge>
  }
  if (status === 'CANCELLED') {
    return <Badge variant="warn">CANCELLED</Badge>
  }
  return <Badge variant="default">NONE</Badge>
}
