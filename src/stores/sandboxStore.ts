import { create } from 'zustand'
import type { SandboxStatus } from '@/types/sandbox'

interface SandboxStore {
  status: SandboxStatus
  setStatus: (status: SandboxStatus) => void
}

export const useSandboxStore = create<SandboxStore>((set) => ({
  status: { active: false },
  setStatus: (status) => set({ status }),
}))
