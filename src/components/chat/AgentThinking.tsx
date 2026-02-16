'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'

interface AgentThinkingProps {
  steps: string[]
}

export function AgentThinking({ steps }: AgentThinkingProps) {
  const [expanded, setExpanded] = useState(false)

  if (steps.length === 0) return null

  return (
    <div className="my-2 rounded-lg border border-forge-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 bg-forge-card hover:bg-forge-card/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-forge-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-forge-muted" />
          )}
          <Brain className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-forge-text">
            Agent Reasoning ({steps.length} step{steps.length !== 1 ? 's' : ''})
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-2 bg-forge-bg/30">
          {steps.map((step, i) => (
            <div key={i} className="text-sm text-forge-muted">
              <span className="text-purple-400 font-mono text-xs mr-2">
                [{i + 1}]
              </span>
              {step}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
