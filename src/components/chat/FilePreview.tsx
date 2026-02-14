'use client'

import { X, File, Image, FileText } from 'lucide-react'

interface FilePreviewProps {
  file: File
  onRemove: () => void
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf'

  const Icon = isImage ? Image : isPdf ? FileText : File

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex items-center gap-2 bg-forge-card border border-forge-border rounded-lg px-3 py-2 max-w-xs">
      <Icon className="h-4 w-4 text-forge-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-forge-text truncate">{file.name}</p>
        <p className="text-xs text-forge-muted">{formatSize(file.size)}</p>
      </div>
      <button
        onClick={onRemove}
        className="text-forge-muted hover:text-forge-text shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
