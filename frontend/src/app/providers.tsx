'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

const DynamicProviderInner = dynamic(
  () =>
    import('./providers-inner').then((m) => m.DynamicProviderInner),
  { ssr: false },
)

export function Providers({ children }: { children: ReactNode }) {
  return <DynamicProviderInner>{children}</DynamicProviderInner>
}
