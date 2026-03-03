'use client'
import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)
  const prevTargetRef = useRef(0)

  useEffect(() => {
    // Don't re-animate if target hasn't changed (prevents re-animation on SWR refetch with same data)
    if (target === prevTargetRef.current) return
    prevTargetRef.current = target

    if (target === 0) { setValue(0); return }
    fromRef.current = value
    startRef.current = null

    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)  // ease-out cubic
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return value
}
