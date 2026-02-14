'use client'

import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { useChatStore } from '@/stores/chatStore'
import type { Message } from '@/types/chat'

interface ChatWindowProps {
  conversationId: string
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const {
    addMessage,
    updateLastMessage,
    updateLastMessageMetadata,
    setStreaming,
    setLoading,
    setSandboxStatus,
  } = useChatStore()

  const handleSend = useCallback(
    async (
      message: string,
      files?: File[],
      options?: { allowDangerousActions?: boolean }
    ) => {
      // Add user message
      const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      }
      addMessage(userMsg)

      // Upload files if any
      const fileIds: string[] = []
      if (files && files.length > 0) {
        for (const file of files) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('conversationId', conversationId)

          try {
            const res = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            })
            if (res.ok) {
              const data = await res.json()
              fileIds.push(data.id)
            }
          } catch (error) {
            console.error('Failed to upload file:', error)
          }
        }
      }

      // Add empty assistant message placeholder
      const assistantMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        isStreaming: true,
        createdAt: new Date().toISOString(),
        metadata: {},
      }
      addMessage(assistantMsg)
      setStreaming(true)
      setLoading(true)

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            conversationId,
            fileIds: fileIds.length > 0 ? fileIds : undefined,
            approval: {
              allowDangerousActions: options?.allowDangerousActions ?? false,
            },
          }),
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Request failed' }))
          updateLastMessage(err.error || 'Something went wrong')
          setStreaming(false)
          setLoading(false)
          return
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulatedText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const eventMatch = line.match(/event: (\w+)\ndata: (.+)/)
            if (eventMatch) {
              const [, event, data] = eventMatch
              const parsed = JSON.parse(data)

              switch (event) {
                case 'status':
                  setSandboxStatus(parsed.stage)
                  setLoading(true)
                  break
                case 'text':
                  accumulatedText += parsed.chunk
                  updateLastMessage(accumulatedText)
                  setLoading(false)
                  break
                case 'code':
                  updateLastMessageMetadata({
                    code: parsed.code,
                    language: parsed.language,
                  })
                  break
                case 'output':
                  updateLastMessageMetadata({
                    sandboxOutput: parsed.stdout,
                    executionTimeMs: parsed.executionTimeMs,
                  })
                  if (parsed.stderr) {
                    updateLastMessageMetadata({ error: parsed.stderr })
                  }
                  break
                case 'file':
                  updateLastMessageMetadata({
                    filesCreated: [
                      ...(useChatStore.getState().messages.slice(-1)[0]?.metadata?.filesCreated || []),
                      { name: parsed.name, url: parsed.url, size: parsed.size },
                    ],
                  })
                  break
                case 'checkpoint':
                  updateLastMessageMetadata({
                    checkpoint: {
                      type: parsed.type,
                      reason: parsed.reason,
                      details: parsed.details,
                    },
                  })
                  setLoading(false)
                  break
                case 'error':
                  accumulatedText += `\n\nError: ${parsed.message}`
                  updateLastMessage(accumulatedText)
                  break
                case 'done':
                  break
              }
            }
          }
        }
      } catch (error) {
        updateLastMessage('Failed to get response. Please try again.')
        console.error('Chat error:', error)
      } finally {
        setStreaming(false)
        setLoading(false)
        setSandboxStatus(null)
      }
    },
    [
      conversationId,
      addMessage,
      updateLastMessage,
      updateLastMessageMetadata,
      setStreaming,
      setLoading,
      setSandboxStatus,
    ]
  )

  return (
    <div className="flex flex-col h-full">
      <MessageList />
      <InputBar onSend={handleSend} />
    </div>
  )
}
