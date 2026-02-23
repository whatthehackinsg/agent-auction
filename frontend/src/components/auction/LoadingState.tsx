'use client'

import Shuffle from '@/components/effects/Shuffle'

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="rounded border border-[#2e3f60] bg-[#101b27]/60 p-4">
      <Shuffle
        text={label}
        tag="p"
        shuffleDirection="up"
        duration={0.3}
        animationMode="evenodd"
        shuffleTimes={1}
        ease="power3.out"
        stagger={0.02}
        threshold={0.1}
        triggerOnce
        triggerOnHover={false}
        respectReducedMotion
        className="font-mono text-xs uppercase tracking-[0.1em] text-[#6EE7B7]"
        textAlign="left"
      />
    </div>
  )
}
