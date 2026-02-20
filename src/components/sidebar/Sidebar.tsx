'use client'

import { useEffect, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConversationItem } from './ConversationItem'
import { useChatStore } from '@/stores/chatStore'
import { useRouter } from 'next/navigation'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
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
        onClose?.()
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
    onClose?.()
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-forge-bg to-forge-card/50">
      {/* Header */}
      <div className="p-3 flex items-center gap-2">
        <Button
          onClick={handleNewConversation}
          className="flex-1 bg-forge-accent hover:bg-forge-accent/90 text-white shadow-sm transition-all duration-200 hover:shadow-md"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
        {/* Close button — mobile only */}
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="md:hidden text-forge-muted hover:text-forge-text shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-forge-border/60" />

      {/* Conversations */}
      <ScrollArea className="flex-1 px-2 pt-2">
        <div className="space-y-0.5 pb-4">
          {conversations.length === 0 ? (
            <p className="text-xs text-forge-muted text-center py-8 px-4">
              No conversations yet. Start a new chat!
            </p>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                id={conv.id}
                title={conv.title}
                isActive={conv.id === currentConversationId}
                onClick={() => handleSelectConversation(conv.id)}
                onDelete={() => handleDeleteConversation(conv.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar — always visible, hidden on mobile */}
      <div className="hidden md:block w-64 border-r border-forge-border h-full">
        {sidebarContent}
      </div>

      {/* Mobile sidebar — overlay */}
      {isOpen && (
        <>
          <div className="sidebar-backdrop md:hidden" onClick={onClose} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 border-r border-forge-border shadow-xl sidebar-enter md:hidden">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  )
}
