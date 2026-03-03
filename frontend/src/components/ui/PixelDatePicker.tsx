'use client'

import { useState, useMemo } from 'react'

/** Returns a UTC unix timestamp (seconds), or null if incomplete */
export type DatePickerValue = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toUtcUnix(v: DatePickerValue): number {
  return Math.floor(
    Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute) / 1000,
  )
}

function formatPreview(v: DatePickerValue): string {
  return `${v.year}-${pad(v.month)}-${pad(v.day)} ${pad(v.hour)}:${pad(v.minute)} UTC`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function PixelDatePicker({
  value,
  onChange,
}: {
  value: DatePickerValue | null
  onChange: (v: DatePickerValue, utcUnix: number) => void
}) {
  const now = new Date()
  const currentYear = now.getUTCFullYear()

  const [year, setYear] = useState(value?.year ?? currentYear)
  const [month, setMonth] = useState(value?.month ?? now.getUTCMonth() + 1)
  const [day, setDay] = useState(value?.day ?? now.getUTCDate())
  const [hour, setHour] = useState(value?.hour ?? now.getUTCHours())
  const [minute, setMinute] = useState(value?.minute ?? 0)
  const [open, setOpen] = useState(false)

  const maxDay = useMemo(() => daysInMonth(year, month), [year, month])

  // Clamp day if month changes
  const clampedDay = Math.min(day, maxDay)
  if (clampedDay !== day) setDay(clampedDay)

  const current: DatePickerValue = { year, month, day: clampedDay, hour, minute }
  const preview = formatPreview(current)

  function confirm() {
    onChange(current, toUtcUnix(current))
    setOpen(false)
  }

  const selectClass =
    'bg-[#0C0C1D] border border-[#1E1E32] px-2 py-1.5 font-mono text-xs text-[#EEEEF5] focus:border-[#6EE7B7] focus:outline-none appearance-none text-center'

  return (
    <div className="relative">
      {/* Display field */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-left transition-colors hover:border-[#6EE7B7] focus:border-[#6EE7B7] focus:outline-none"
      >
        {value ? (
          <span className="flex flex-col gap-0.5">
            <span className="text-sm text-[#EEEEF5]">{preview}</span>
            <span className="text-[9px] text-[#C4B5FD]">
              {new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute)).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short',
              })} (local)
            </span>
          </span>
        ) : (
          <span className="text-sm text-[#3A3A58]">select date & time (UTC)</span>
        )}
        <span className="text-[#5E5E7A] text-[10px]">[UTC]</span>
      </button>

      {/* Picker popup */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-[340px] mx-4 border border-[#1E1E32] bg-[#0A0B14] shadow-[4px_4px_0_0_rgba(58,58,88,0.6)]">
              {/* Title bar */}
              <div className="flex items-center justify-between border-b border-[#1E1E32] bg-[#06070f] px-4 py-2.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#5E5E7A]">
                  {"// deadline (UTC)"}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                className="font-mono text-[10px] text-[#5E5E7A] transition-colors hover:text-[#F87171]"
              >
                [X]
              </button>
            </div>

            <div className="px-4 py-4 flex flex-col gap-4">
              {/* Date row */}
              <div>
                <p className="mb-2 font-mono text-[8px] uppercase tracking-widest text-[#6EE7B7]">
                  date
                </p>
                <div className="flex items-center gap-2">
                  {/* Year */}
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className={`${selectClass} w-[72px]`}
                  >
                    {Array.from({ length: 5 }, (_, i) => currentYear + i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <span className="font-mono text-[#5E5E7A] text-xs">/</span>

                  {/* Month */}
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className={`${selectClass} w-[64px]`}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <span className="font-mono text-[#5E5E7A] text-xs">/</span>

                  {/* Day */}
                  <select
                    value={clampedDay}
                    onChange={(e) => setDay(Number(e.target.value))}
                    className={`${selectClass} w-[52px]`}
                  >
                    {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{pad(d)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Time row */}
              <div>
                <p className="mb-2 font-mono text-[8px] uppercase tracking-widest text-[#6EE7B7]">
                  time (UTC)
                </p>
                <div className="flex items-center gap-2">
                  {/* Hour */}
                  <select
                    value={hour}
                    onChange={(e) => setHour(Number(e.target.value))}
                    className={`${selectClass} w-[52px]`}
                  >
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <option key={h} value={h}>{pad(h)}</option>
                    ))}
                  </select>
                  <span className="font-mono text-lg text-[#5E5E7A]">:</span>

                  {/* Minute */}
                  <select
                    value={minute}
                    onChange={(e) => setMinute(Number(e.target.value))}
                    className={`${selectClass} w-[52px]`}
                  >
                    {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                      <option key={m} value={m}>{pad(m)}</option>
                    ))}
                  </select>

                  <span className="ml-1 font-mono text-[10px] text-[#C4B5FD]">UTC</span>
                </div>
              </div>

              {/* Preview */}
              <div className="border border-[#1E1E32] bg-[#06070f] px-3 py-2">
                <p className="font-mono text-[8px] uppercase tracking-widest text-[#5E5E7A]">
                  utc
                </p>
                <p className="mt-1 font-mono text-sm text-[#F5C46E]">
                  {preview}
                </p>
                <p className="mt-2 font-mono text-[8px] uppercase tracking-widest text-[#5E5E7A]">
                  your local time
                </p>
                <p className="mt-1 font-mono text-xs text-[#C4B5FD]">
                  {new Date(Date.UTC(year, month - 1, clampedDay, hour, minute)).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZoneName: 'short',
                  })}
                </p>
              </div>

              {/* Confirm */}
              <button
                type="button"
                onClick={confirm}
                className="w-full border border-b-[2px] border-[#F5C46E] bg-[#6EE7B7] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#0C0C1D] transition-colors hover:bg-[#82f4c6]"
              >
                [ set_deadline ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
