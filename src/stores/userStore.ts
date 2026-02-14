import { create } from 'zustand'
import type { UserSettings } from '@/types/user'

interface UserStore {
  settings: UserSettings | null
  loading: boolean
  setSettings: (settings: UserSettings | null) => void
  setLoading: (loading: boolean) => void
  fetchSettings: () => Promise<void>
}

export const useUserStore = create<UserStore>((set) => ({
  settings: null,
  loading: false,
  setSettings: (settings) => set({ settings }),
  setLoading: (loading) => set({ loading }),
  fetchSettings: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        set({ settings: data })
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      set({ loading: false })
    }
  },
}))
