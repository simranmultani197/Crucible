'use client'

import { useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { useChatStore } from '@/stores/chatStore'

export default function ConversationPage() {
  const params = useParams()
  const conversationId = params.id as string
  const { setCurrentConversation, setMessages } = useChatStore()

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?conversationId=${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }, [conversationId, setMessages])

  useEffect(() => {
    setCurrentConversation(conversationId)
    fetchMessages()
  }, [conversationId, setCurrentConversation, fetchMessages])

  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-forge-bg">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <ChatWindow conversationId={conversationId} />
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
