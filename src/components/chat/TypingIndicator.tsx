'use client'

interface TypingIndicatorProps {
  status?: string | null
}

const statusMessages: Record<string, string> = {
  routing: 'Analyzing your query...',
  classified: 'Query classified',
  generating: 'Generating response...',
  discovering: 'Discovering tools...',
  tools_found: 'Tools found',
  sandbox_starting: 'Starting sandbox...',
  installing: 'Installing packages...',
  uploading_files: 'Uploading files...',
  generating_code: 'Writing code...',
  executing: 'Executing code...',
  summarizing: 'Summarizing results...',
}

export function TypingIndicator({ status }: TypingIndicatorProps) {
  const message = status ? statusMessages[status] || status : 'Thinking...'

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 bg-forge-accent rounded-full animate-bounce [animation-delay:0ms]" />
        <div className="w-2 h-2 bg-forge-accent rounded-full animate-bounce [animation-delay:150ms]" />
        <div className="w-2 h-2 bg-forge-accent rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="text-sm text-forge-muted">{message}</span>
    </div>
  )
}
