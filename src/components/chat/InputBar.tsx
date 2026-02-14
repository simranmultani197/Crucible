'use client'

import { useState, useRef, useCallback } from 'react'
import { Paperclip, ArrowUp, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FilePreview } from './FilePreview'
import { useChatStore } from '@/stores/chatStore'

interface InputBarProps {
  onSend: (
    message: string,
    files?: File[],
    options?: { allowDangerousActions?: boolean }
  ) => void
}

export function InputBar({ onSend }: InputBarProps) {
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [allowDangerousActions, setAllowDangerousActions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isStreaming, isLoading } = useChatStore()

  const isDisabled = isStreaming || isLoading

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed && files.length === 0) return
    if (isDisabled) return

    onSend(trimmed, files.length > 0 ? files : undefined, {
      allowDangerousActions,
    })
    setInput('')
    setFiles([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, files, isDisabled, onSend, allowDangerousActions])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const validFiles = selectedFiles.filter((f) => f.size <= 10 * 1024 * 1024) // 10MB limit
    setFiles((prev) => [...prev, ...validFiles])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  return (
    <div className="border-t border-forge-border bg-forge-bg p-4">
      <div className="max-w-3xl mx-auto">
        {/* File previews */}
        {files.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {files.map((file, i) => (
              <FilePreview
                key={i}
                file={file}
                onRemove={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            accept="*/*"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
            className="text-forge-muted hover:text-forge-text shrink-0 mb-0.5"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Button
            variant={allowDangerousActions ? 'default' : 'ghost'}
            size="icon"
            type="button"
            onClick={() => setAllowDangerousActions((prev) => !prev)}
            disabled={isDisabled}
            className={
              allowDangerousActions
                ? 'bg-amber-500 hover:bg-amber-500/90 text-black shrink-0 mb-0.5'
                : 'text-forge-muted hover:text-forge-text shrink-0 mb-0.5'
            }
            title="Allow risky actions"
          >
            <ShieldAlert className="h-4 w-4" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={isDisabled}
            rows={1}
            className="resize-none bg-forge-card border-forge-border text-forge-text placeholder:text-forge-muted/50 min-h-[40px] max-h-[150px]"
          />

          <Button
            onClick={handleSubmit}
            disabled={isDisabled || (!input.trim() && files.length === 0)}
            size="icon"
            className="bg-forge-accent hover:bg-forge-accent/90 text-white shrink-0 mb-0.5"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
