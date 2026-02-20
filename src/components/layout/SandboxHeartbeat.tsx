'use client'

import { useEffect, useRef } from 'react'

const HEARTBEAT_INTERVAL_MS = 15_000

export function SandboxHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const beat = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetch('/api/sandbox/heartbeat', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {
        /* ignore - may be unauthenticated or server down */
      })
    }

    beat()
    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  return null
}
