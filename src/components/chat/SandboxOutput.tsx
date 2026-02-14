'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  FileDown,
  Terminal,
  ExternalLink,
} from 'lucide-react'
import { ChartModal } from './ChartModal'

interface SandboxOutputProps {
  success?: boolean
  stdout?: string
  stderr?: string
  executionTimeMs?: number
  packagesInstalled?: string[]
  filesCreated?: { name: string; url: string; size: number }[]
  error?: string
  code?: string
  language?: string
  checkpoint?: {
    type: string
    reason: string
    details?: string[]
  }
}

export function SandboxOutput({
  success,
  stdout,
  stderr,
  executionTimeMs,
  packagesInstalled,
  filesCreated,
  error,
  code,
  language = 'python',
  checkpoint,
}: SandboxOutputProps) {
  const [expanded, setExpanded] = useState(true)
  const [selectedChart, setSelectedChart] = useState<{ url: string; title: string } | null>(null)

  const statusIcon = success ? (
    <CheckCircle className="h-4 w-4 text-green-400" />
  ) : (
    <XCircle className="h-4 w-4 text-red-400" />
  )

  const handleChartClick = (url: string, name: string) => {
    setSelectedChart({ url, title: name })
  }

  const statusText = success ? 'Complete' : 'Error'
  const timeText = executionTimeMs
    ? `${(executionTimeMs / 1000).toFixed(1)}s`
    : ''

  return (
    <>
      <div className="my-2 rounded-lg border border-forge-border overflow-hidden">
        {/* Header */}
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
            <Terminal className="h-4 w-4 text-forge-accent" />
            <span className="text-sm font-medium text-forge-text">
              Sandbox Execution
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {statusIcon}
            <span className={success ? 'text-green-400' : 'text-red-400'}>
              {statusText}
            </span>
            {timeText && (
              <span className="text-forge-muted flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeText}
              </span>
            )}
            <span className="text-forge-muted">{language}</span>
          </div>
        </button>

        {/* Body */}
        {expanded && (
          <div className="px-4 py-3 space-y-3 bg-forge-bg/30">
            {/* Packages */}
            {packagesInstalled && packagesInstalled.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-3.5 w-3.5 text-forge-muted" />
                <span className="text-forge-muted">Installed:</span>
                <span className="text-forge-text">
                  {packagesInstalled.join(', ')}
                </span>
              </div>
            )}

            {/* Code */}
            {code && (
              <div className="rounded border border-forge-border overflow-hidden">
                <div className="px-3 py-1.5 bg-forge-bg/50 border-b border-forge-border">
                  <span className="text-xs text-forge-muted font-mono">
                    {language}
                  </span>
                </div>
                <pre className="p-3 overflow-x-auto text-sm font-mono text-forge-text bg-forge-bg/20">
                  {code}
                </pre>
              </div>
            )}

            {/* Terminal Output */}
            {(stdout || stderr) && (
              <div className="rounded border border-forge-border overflow-hidden">
                <div className="px-3 py-1.5 bg-forge-bg/50 border-b border-forge-border">
                  <span className="text-xs text-forge-muted">Terminal Output</span>
                </div>
                <pre className="p-3 overflow-x-auto text-sm font-mono max-h-64 overflow-y-auto">
                  {stdout && (
                    <span className="text-forge-text">{stdout}</span>
                  )}
                  {stderr && (
                    <span className="text-red-400">{stderr}</span>
                  )}
                </pre>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/5 p-3">
                <pre className="text-sm font-mono text-red-400 whitespace-pre-wrap">
                  {error}
                </pre>
              </div>
            )}

            {/* Safety checkpoint */}
            {checkpoint && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-sm font-medium text-amber-400">{checkpoint.reason}</p>
                {checkpoint.details && checkpoint.details.length > 0 && (
                  <ul className="mt-2 text-xs text-amber-200 list-disc list-inside space-y-1">
                    {checkpoint.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Files */}
            {filesCreated && filesCreated.length > 0 && (
              <div className="space-y-2">
                {filesCreated.map((file, i) => {
                  const isHtml = file.name.toLowerCase().endsWith('.html')
                  return (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      {isHtml ? (
                        <button
                          type="button"
                          onClick={() => handleChartClick(file.url, file.name)}
                          className="flex items-center gap-2 text-sm text-forge-accent hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span>{file.name}</span>
                          <span className="text-forge-muted text-xs">
                            ({formatBytes(file.size)}) — view chart
                          </span>
                        </button>
                      ) : (
                        <a
                          href={file.url}
                          download={file.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-forge-accent hover:underline"
                        >
                          <FileDown className="h-3.5 w-3.5 shrink-0" />
                          <span>{file.name}</span>
                          <span className="text-forge-muted text-xs">
                            ({formatBytes(file.size)})
                          </span>
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <ChartModal
        isOpen={!!selectedChart}
        onClose={() => setSelectedChart(null)}
        url={selectedChart?.url ?? null}
        title={selectedChart?.title ?? ''}
      />
    </>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

