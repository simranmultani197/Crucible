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
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-forge-accent/10 text-forge-text'
          : 'text-forge-muted hover:bg-forge-card hover:text-forge-text'
      }`}
      onClick={onClick}
    >
      <MessageSquare className="h-4 w-4 shrink-0" />
      <span className="text-sm truncate flex-1">{title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 text-forge-muted hover:text-red-400 transition-opacity"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
