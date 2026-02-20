'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, Bot } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { SandboxOutput } from './SandboxOutput'
import { AgentThinking } from './AgentThinking'
import type { Message } from '@/types/chat'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const meta = message.metadata

  // Don't render empty assistant bubble while streaming — TypingIndicator handles that
  if (!isUser && !message.content && message.isStreaming && !meta?.sandboxOutput && !meta?.code && !meta?.thinkingSteps?.length) {
    return null
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-forge-accent/20 flex items-center justify-center shrink-0 mt-1">
          <Bot className="h-4 w-4 text-forge-accent" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        {/* Agent Thinking Steps */}
        {!isUser && meta?.thinkingSteps && meta.thinkingSteps.length > 0 && (
          <AgentThinking steps={meta.thinkingSteps} />
        )}

        <div
          className={`rounded-lg px-4 py-3 ${isUser
            ? 'bg-forge-accent text-white'
            : 'bg-forge-card border border-forge-border text-forge-text'
            }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '')
                    const codeStr = String(children).replace(/\n$/, '')

                    if (match) {
                      return <CodeBlock code={codeStr} language={match[1]} />
                    }

                    return (
                      <code
                        className="bg-forge-bg/50 px-1.5 py-0.5 rounded text-sm font-mono text-forge-accent"
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  },
                  pre({ children }) {
                    return <>{children}</>
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>


        {/* Sandbox Output */}
        {!isUser && meta && (meta.sandboxOutput || meta.code || meta.error) && (
          <SandboxOutput
            success={!meta.error}
            stdout={meta.sandboxOutput}
            executionTimeMs={meta.executionTimeMs}
            packagesInstalled={meta.packagesInstalled}
            filesCreated={meta.filesCreated}
            error={meta.error}
            code={meta.code}
            language={meta.language}
            checkpoint={meta.checkpoint}
          />
        )}

        {/* Timestamp */}
        <p className={`text-xs text-forge-muted mt-1 ${isUser ? 'text-right' : ''}`}>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-forge-accent flex items-center justify-center shrink-0 mt-1">
          <User className="h-4 w-4 text-white" />
        </div>
      )}
    </div>
  )
}
