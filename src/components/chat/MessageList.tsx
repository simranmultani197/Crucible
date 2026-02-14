'use client'

import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { useChatStore } from '@/stores/chatStore'
import { Zap } from 'lucide-react'

export function MessageList() {
  const { messages, isStreaming, isLoading, sandboxStatus } = useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Zap className="h-12 w-12 text-forge-accent/30 mx-auto" />
          <div>
            <h3 className="text-lg font-medium text-forge-text">Start a conversation</h3>
            <p className="text-sm text-forge-muted mt-1">
              Ask anything — from simple questions to complex code execution tasks.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
            {[
              'Plot Apple stock price for the last year',
              'Scrape top 10 Hacker News stories',
              'Explain how async/await works',
              'Generate a QR code for my website',
            ].map((suggestion) => (
              <button
                key={suggestion}
                className="text-left text-sm px-3 py-2 rounded-lg border border-forge-border hover:bg-forge-card text-forge-muted hover:text-forge-text transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="max-w-3xl mx-auto py-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {(isStreaming || isLoading) && (
          <TypingIndicator status={sandboxStatus} />
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
