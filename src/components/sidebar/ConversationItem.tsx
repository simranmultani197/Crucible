'use client'

import { MessageSquare, Trash2 } from 'lucide-react'

interface ConversationItemProps {
  id: string
  title: string
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}

export function ConversationItem({
  title,
  isActive,
  onClick,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 relative ${isActive
          ? 'bg-forge-accent/10 text-forge-text shadow-sm'
          : 'text-forge-muted hover:bg-forge-card hover:text-forge-text'
        }`}
      onClick={onClick}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-forge-accent rounded-r-full" />
      )}

      <MessageSquare className={`h-4 w-4 shrink-0 transition-colors duration-200 ${isActive ? 'text-forge-accent' : ''}`} />
      <span className="text-sm truncate flex-1">{title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 text-forge-muted hover:text-red-400 transition-all duration-200 p-0.5 rounded hover:bg-red-400/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
