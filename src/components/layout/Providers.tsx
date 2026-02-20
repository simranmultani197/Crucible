'use client'

import { Toaster } from '@/components/ui/toaster'
import { SandboxHeartbeat } from '@/components/layout/SandboxHeartbeat'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SandboxHeartbeat />
      {children}
      <Toaster />
    </>
  )
}
