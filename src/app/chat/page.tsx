'use client'

import { AuthGuard } from '@/components/layout/AuthGuard'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { BullIcon } from '@/components/ui/bull-icon'

export default function ChatPage() {
  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-forge-bg">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <BullIcon className="h-16 w-16 text-forge-accent/20 mx-auto" />
              <h2 className="text-xl font-medium text-forge-text">
                Welcome to Forge
              </h2>
              <p className="text-forge-muted text-sm max-w-md">
                Select a conversation from the sidebar or create a new one to get started.
              </p>
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
