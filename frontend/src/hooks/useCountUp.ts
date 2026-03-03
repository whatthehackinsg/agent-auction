'use client'
import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)
  const prevTargetRef = useRef(0)
  // Track current value via ref so effect doesn't need it as a dependency
  const valueRef = useRef(0)

  // Keep valueRef in sync with state
  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    // Don't re-animate if target hasn't changed (prevents re-animation on SWR refetch with same data)
    if (target === prevTargetRef.current) return
    prevTargetRef.current = target

    // Cancel any in-flight animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    fromRef.current = valueRef.current
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
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // Reset so re-mount re-triggers animation (fixes React Strict Mode
      // double-effect cancelling animation on client-side navigation
      // when SWR returns cached data immediately)
      prevTargetRef.current = NaN
    }
  }, [target, duration])

  return value
}
