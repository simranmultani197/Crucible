'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language = 'python' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-forge-border">
      <div className="flex items-center justify-between px-4 py-2 bg-forge-bg/50 border-b border-forge-border">
        <span className="text-xs text-forge-muted font-mono">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-forge-muted hover:text-forge-text"
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto bg-forge-bg/30">
        <code className="text-sm font-mono text-forge-text whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  )
}
