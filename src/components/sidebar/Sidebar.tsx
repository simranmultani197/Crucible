'use client'

import { useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConversationItem } from './ConversationItem'
import { useChatStore } from '@/stores/chatStore'
import { useRouter } from 'next/navigation'

export function Sidebar() {
  const {
    conversations,
    currentConversationId,
    setConversations,
    setCurrentConversation,
    addConversation,
    removeConversation,
  } = useChatStore()
  const router = useRouter()

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    }
  }, [setConversations])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleNewConversation = async () => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Conversation' }),
      })
      if (res.ok) {
        const data = await res.json()
        addConversation(data)
        setCurrentConversation(data.id)
        router.push(`/chat/${data.id}`)
      }
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' })
      removeConversation(id)
      if (currentConversationId === id) {
        router.push('/chat')
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const handleSelectConversation = (id: string) => {
    setCurrentConversation(id)
    router.push(`/chat/${id}`)
  }

  return (
    <div className="w-64 bg-forge-bg border-r border-forge-border flex flex-col h-full">
      <div className="p-3">
        <Button
          onClick={handleNewConversation}
          className="w-full bg-forge-accent hover:bg-forge-accent/90 text-white"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-4">
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              id={conv.id}
              title={conv.title}
              isActive={conv.id === currentConversationId}
              onClick={() => handleSelectConversation(conv.id)}
              onDelete={() => handleDeleteConversation(conv.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
