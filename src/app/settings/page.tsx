'use client'

import { useCallback, useEffect, useState } from 'react'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserStore } from '@/stores/userStore'
import { ArrowLeft, Key, BarChart3, Shield, Cpu, Gauge } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRef } from 'react'

export default function SettingsPage() {
  const { settings, fetchSettings } = useUserStore()
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [providerSaving, setProviderSaving] = useState(false)
  const [probeLoading, setProbeLoading] = useState(false)
  const [probeResult, setProbeResult] = useState<{
    ok: boolean
    transport?: string
    platform?: string
    arch?: string
    backend?: string
    backendReady?: boolean | null
    backendProbeError?: string
    limaAutoStartAttempted?: boolean
    remoteCLI?: string
    backendFound?: boolean
    hypervBackendFound?: boolean
    sshHostConfigured?: boolean
    stderr?: string
  } | null>(null)
  const [sandboxStatus, setSandboxStatus] = useState<{
    provider?: string
    preferredProvider?: string | null
    resolvedProvider?: string
    fallbackActive?: boolean
    active?: boolean
  } | null>(null)
  const [setupGuide, setSetupGuide] = useState<{
    platform?: string
    arch?: string
    steps?: Array<{ title: string; description: string; command?: string }>
  } | null>(null)
  const [memorySaving, setMemorySaving] = useState(false)
  const [memorySettings, setMemorySettings] = useState<{
    autoMemoryEnabled: boolean
    retentionDays: number
    allowSensitiveMemory: boolean
    exportAllowed: boolean
  } | null>(null)
  const { toast } = useToast()
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetValues, setBudgetValues] = useState({
    maxAgentIterations: 16,
    maxCostUsd: 15,
    maxSandboxMs: 10 * 60_000,
    maxTokensPerSession: 200_000,
  })

  // Installation state
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [installLogs, setInstallLogs] = useState('')
  const [installing, setInstalling] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [installLogs])

  const fetchMemorySettings = useCallback(async () => {
    try {
      const res = await fetch('/api/memory/settings')
      if (res.ok) {
        const data = await res.json()
        setMemorySettings(data)
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load memory settings',
        variant: 'destructive',
      })
    }
  }, [toast])

  const fetchSandboxStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sandbox')
      if (!res.ok) return
      const data = await res.json()
      setSandboxStatus({
        provider: data?.provider,
        preferredProvider: data?.preferredProvider,
        resolvedProvider: data?.resolvedProvider,
        fallbackActive: data?.fallbackActive,
        active: data?.active,
      })
    } catch {
      // Best-effort diagnostics only.
    }
  }, [])

  const fetchSetupGuide = useCallback(async (fresh: boolean = false) => {
    try {
      const res = await fetch(`/api/sandbox/setup${fresh ? '?fresh=1' : ''}`)
      if (!res.ok) return
      const data = await res.json()
      setSetupGuide({
        platform: data?.platform,
        arch: data?.arch,
        steps: Array.isArray(data?.steps) ? data.steps : [],
      })
    } catch {
      // Best-effort diagnostics only.
    }
  }, [])

  const handleSaveApiKey = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropic_api_key: apiKey }),
      })

      if (res.ok) {
        toast({ title: 'API key saved', description: 'Your key has been validated and saved.' })
        setApiKey('')
        fetchSettings()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save API key', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveApiKey = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropic_api_key: null }),
      })
      toast({ title: 'API key removed' })
      fetchSettings()
    } catch {
      toast({ title: 'Error', description: 'Failed to remove API key', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleSetSandboxProvider = async (
    provider: 'auto' | 'remote_e2b' | 'local_microvm'
  ) => {
    // If user explicitly chooses local_microvm, verify it is ready first
    if (provider === 'local_microvm') {
      setProviderSaving(true)
      try {
        const res = await fetch('/api/sandbox/probe')
        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data.ok) {
          setInstallDialogOpen(true)
          setProviderSaving(false)
          return
        }
      } catch {
        setInstallDialogOpen(true)
        setProviderSaving(false)
        return
      }
    }

    setProviderSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox_provider: provider }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update sandbox provider')
      }

      await fetchSettings()
      await fetchSandboxStatus()
      await fetchSetupGuide()
      toast({
        title: 'Execution backend updated',
        description:
          provider === 'local_microvm'
            ? 'Local microVM mode selected. On macOS you can use a local worker VM via limactl, or SSH Linux worker.'
            : provider === 'auto'
              ? 'Auto mode selected. Forge will pick local microVM when ready, otherwise remote E2B.'
              : 'Remote E2B sandbox selected.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to update sandbox provider',
        variant: 'destructive',
      })
    } finally {
      setProviderSaving(false)
    }
  }

  const handleInstallAndSetLocal = async () => {
    setInstalling(true)
    setInstallLogs('Starting installation...\n')
    try {
      const response = await fetch('/api/sandbox/setup/run', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to start installation process.')
      }

      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          setInstallLogs((prev) => prev + decoder.decode(value, { stream: true }))
        }

        // Run probe again after streaming is done
        setInstallLogs((prev) => prev + '\nInstallation complete! Verifying probe...\n')
        await runMicrovmProbe({ silent: true, fresh: true })
        // Use updated state effectively
        setProviderSaving(true)
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandbox_provider: 'local_microvm' }),
        })
        if (res.ok) {
          await fetchSettings()
          toast({
            title: 'Setup Complete',
            description: 'Local microVM has been successfully installed and set as your provider.',
          })
          setInstallDialogOpen(false)
        }
      } else {
        throw new Error('Response body is null')
      }
    } catch (err) {
      setInstallLogs((prev) => prev + `\nError: ${err instanceof Error ? err.message : String(err)}`)
      toast({
        title: 'Installation failed',
        description: 'Check the logs for details.',
        variant: 'destructive',
      })
    } finally {
      setInstalling(false)
      setProviderSaving(false)
    }
  }

  const runMicrovmProbe = useCallback(async (options?: { silent?: boolean; fresh?: boolean }) => {
    const silent = options?.silent === true
    const fresh = options?.fresh === true
    setProbeLoading(true)
    if (!silent) {
      setProbeResult(null)
    }
    try {
      const res = await fetch(`/api/sandbox/probe${fresh ? '?fresh=1' : ''}`)
      const data = await res.json().catch(() => ({}))

      setProbeResult({
        ok: Boolean(res.ok && data.ok),
        transport: data?.details?.transport,
        platform: data?.details?.platform,
        arch: data?.details?.arch,
        backend: data?.details?.backend,
        backendReady: data?.details?.backendReady,
        backendProbeError: data?.details?.backendProbeError,
        limaAutoStartAttempted: data?.details?.limaAutoStartAttempted,
        remoteCLI: data?.details?.remoteCLI,
        backendFound: data?.details?.backendFound,
        hypervBackendFound: data?.details?.hypervBackendFound,
        sshHostConfigured: data?.details?.sshHostConfigured,
        stderr: data?.stderr,
      })
      await fetchSandboxStatus()
      await fetchSetupGuide(fresh)

      if (!silent && res.ok && data.ok) {
        toast({
          title: 'Local microVM probe passed',
          description: `Transport: ${data?.details?.transport || 'unknown'}`,
        })
      } else if (!silent) {
        toast({
          title: 'Local microVM probe failed',
          description: data?.stderr || 'Check SSH/backend configuration.',
          variant: 'destructive',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Probe failed'
      setProbeResult({ ok: false, stderr: message })
      if (!silent) {
        toast({
          title: 'Probe error',
          description: message,
          variant: 'destructive',
        })
      }
    } finally {
      setProbeLoading(false)
    }
  }, [toast, fetchSandboxStatus, fetchSetupGuide])

  const handleProbeMicrovm = async () => {
    await runMicrovmProbe({ fresh: true })
  }

  const handleToggleStrictNoFallback = async () => {
    const nextValue = !Boolean(settings?.strict_no_fallback)
    setProviderSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strict_no_fallback: nextValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update security mode')
      }

      await fetchSettings()
      await fetchSandboxStatus()
      await fetchSetupGuide()
      toast({
        title: nextValue ? 'Advanced Security Mode enabled' : 'Advanced Security Mode disabled',
        description: nextValue
          ? 'Strict mode prevents local->remote fallback for sandbox execution.'
          : 'Fallback is allowed based on configuration.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to update security mode',
        variant: 'destructive',
      })
    } finally {
      setProviderSaving(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    fetchMemorySettings()
    fetchSandboxStatus()
    // We intentionally DO NOT probe or fetch setup guide on mount,
    // as it can spin up the local worker instance unexpectedly.
    // Load budget settings from profile
    void (async () => {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.budget_settings) {
            setBudgetValues((prev) => ({ ...prev, ...data.budget_settings }))
          }
        }
      } catch { /* best-effort */ }
    })()
  }, [fetchSettings, fetchMemorySettings, fetchSandboxStatus])

  const handleSaveMemorySettings = async () => {
    if (!memorySettings) return

    setMemorySaving(true)
    try {
      const res = await fetch('/api/memory/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memorySettings),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save memory settings')
      }

      const updated = await res.json()
      setMemorySettings(updated)
      toast({
        title: 'Memory settings updated',
        description: 'Governance settings are now active.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save memory settings',
        variant: 'destructive',
      })
    } finally {
      setMemorySaving(false)
    }
  }

  const handleExportMemory = async () => {
    try {
      const res = await fetch('/api/memory/export')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to export memory')
      }

      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `memory-export-${new Date().toISOString()}.json`
      link.click()
      window.URL.revokeObjectURL(url)

      toast({ title: 'Memory export generated' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to export memory',
        variant: 'destructive',
      })
    }
  }

  const handleClearMemory = async () => {
    const confirmClear = window.confirm(
      'This will clear all saved memory facts and summaries. Continue?'
    )
    if (!confirmClear) return

    try {
      const res = await fetch('/api/memory/facts?scope=all', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to clear memory')
      }
      toast({ title: 'Memory cleared' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to clear memory',
        variant: 'destructive',
      })
    }
  }

  const handleExportRunAudit = async () => {
    try {
      const res = await fetch('/api/runs/export?limit=100')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to export run audit')
      }

      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `run-audit-export-${new Date().toISOString()}.json`
      link.click()
      window.URL.revokeObjectURL(url)
      toast({ title: 'Run audit export generated' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to export run audit',
        variant: 'destructive',
      })
    }
  }

  const handleSaveBudget = async () => {
    setBudgetSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_settings: budgetValues }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save budget')
      }
      toast({ title: 'Budget controls saved', description: 'Your per-session limits are now active.' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save budget',
        variant: 'destructive',
      })
    } finally {
      setBudgetSaving(false)
    }
  }

  const currentProvider = settings?.sandbox_provider || 'auto'
  const localReady = probeResult?.ok === true
  const fallbackActive = Boolean(sandboxStatus?.fallbackActive)

  const deviceRecommendation = (() => {
    const platform = probeResult?.platform
    const arch = probeResult?.arch

    if (!platform) return 'Auto mode is recommended for your device.'
    if (platform === 'linux') {
      return 'Linux detected: local microVM can be first-class when backend is installed.'
    }
    if (platform === 'darwin' && arch === 'arm64') {
      return 'Apple Silicon detected: local worker VM (Lima/VZ) is recommended for host-local isolation.'
    }
    if (platform === 'win32') {
      return 'Windows detected: Hyper-V backend or SSH Linux worker is recommended.'
    }
    return 'Auto mode is recommended for your device.'
  })()

  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-forge-bg">
        <Header />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
            <div className="flex items-center gap-3">
              <Link href="/chat">
                <Button variant="ghost" size="icon" className="text-forge-muted hover:text-forge-text">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-forge-text">Settings</h1>
            </div>

            {/* BYOK Section */}
            <div className="bg-forge-card border border-forge-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-forge-accent" />
                <h2 className="text-lg font-semibold text-forge-text">
                  Bring Your Own Key (BYOK)
                </h2>
              </div>
              <p className="text-sm text-forge-muted">
                Add your Anthropic API key to unlock sandbox execution and use your own token budget.
                Your key is encrypted at rest.
              </p>

              {settings?.anthropic_api_key ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-green-400">API key active</span>
                    <span className="text-sm text-forge-muted">
                      ({settings.anthropic_api_key})
                    </span>
                  </div>
                  <Button
                    onClick={handleRemoveApiKey}
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                  >
                    Remove Key
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="bg-forge-bg border-forge-border text-forge-text placeholder:text-forge-muted/50"
                  />
                  <Button
                    onClick={handleSaveApiKey}
                    disabled={!apiKey || saving}
                    className="bg-forge-accent hover:bg-forge-accent/90 text-white shrink-0"
                  >
                    {saving ? 'Validating...' : 'Save Key'}
                  </Button>
                </div>
              )}
            </div>

            {/* Execution Backend */}
            <div className="bg-forge-card border border-forge-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-forge-accent" />
                <h2 className="text-lg font-semibold text-forge-text">Execution Backend</h2>
              </div>
              <p className="text-sm text-forge-muted">
                Choose where code runs. Auto mode is recommended for smooth onboarding.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    currentProvider === 'auto'
                      ? 'default'
                      : 'outline'
                  }
                  className={
                    currentProvider === 'auto'
                      ? 'bg-forge-accent hover:bg-forge-accent/90 text-white'
                      : 'border-forge-border text-forge-text'
                  }
                  disabled={providerSaving}
                  onClick={() => handleSetSandboxProvider('auto')}
                >
                  Auto (Recommended)
                </Button>
                <Button
                  type="button"
                  variant={
                    currentProvider === 'remote_e2b'
                      ? 'default'
                      : 'outline'
                  }
                  className={
                    currentProvider === 'remote_e2b'
                      ? 'bg-forge-accent hover:bg-forge-accent/90 text-white'
                      : 'border-forge-border text-forge-text'
                  }
                  disabled={providerSaving}
                  onClick={() => handleSetSandboxProvider('remote_e2b')}
                >
                  Remote E2B
                </Button>
                <Button
                  type="button"
                  variant={
                    currentProvider === 'local_microvm'
                      ? 'default'
                      : 'outline'
                  }
                  className={
                    currentProvider === 'local_microvm'
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'border-forge-border text-forge-text'
                  }
                  disabled={providerSaving || Boolean(probeResult && !probeResult.ok)}
                  onClick={() => handleSetSandboxProvider('local_microvm')}
                >
                  {probeResult && !probeResult.ok ? 'Local MicroVM (Setup Needed)' : 'Local MicroVM'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-forge-border text-forge-text"
                  disabled={probeLoading}
                  onClick={handleProbeMicrovm}
                >
                  {probeLoading ? 'Testing...' : 'Test Local MicroVM'}
                </Button>
              </div>

              <p className="text-xs text-forge-muted">
                {deviceRecommendation}
              </p>

              <p className="text-xs text-forge-muted">
                Local mode uses bundled `node scripts/microvmctl.js`. On macOS, recommended host-local
                path is `LOCAL_MICROVM_BACKEND_CLI=&quot;limactl shell forge-worker -- microvmctl&quot;`.
                SSH Linux worker is the fallback path. Server falls back to remote E2B unless disabled.
              </p>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`text-xs rounded-full px-2 py-1 border ${localReady
                    ? 'border-green-500/50 text-green-300'
                    : 'border-yellow-500/50 text-yellow-300'
                    }`}
                >
                  {localReady ? 'Ready' : 'Needs setup'}
                </span>
                <span
                  className={`text-xs rounded-full px-2 py-1 border ${fallbackActive
                    ? 'border-amber-500/50 text-amber-300'
                    : 'border-forge-border text-forge-muted'
                    }`}
                >
                  {fallbackActive ? 'Fallback active' : 'Fallback inactive'}
                </span>
                <span className="text-xs rounded-full px-2 py-1 border border-forge-border text-forge-muted">
                  Active provider: {sandboxStatus?.provider || 'none'}
                </span>
                <span
                  className={`text-xs rounded-full px-2 py-1 border ${settings?.strict_no_fallback
                    ? 'border-red-500/50 text-red-300'
                    : 'border-forge-border text-forge-muted'
                    }`}
                >
                  {settings?.strict_no_fallback
                    ? 'Advanced Security Mode'
                    : 'Standard Security Mode'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-md border border-forge-border bg-forge-bg p-3">
                <div>
                  <p className="text-sm text-forge-text">Advanced Security Mode</p>
                  <p className="text-xs text-forge-muted">
                    Strict no-fallback mode. If local runtime fails, requests error instead of
                    silently using remote.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={settings?.strict_no_fallback ? 'default' : 'outline'}
                  className={
                    settings?.strict_no_fallback
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'border-forge-border text-forge-text'
                  }
                  disabled={providerSaving}
                  onClick={handleToggleStrictNoFallback}
                >
                  {settings?.strict_no_fallback ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              {probeResult && (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${probeResult.ok
                    ? 'border-green-500/40 bg-green-500/10 text-green-300'
                    : 'border-red-500/40 bg-red-500/10 text-red-300'
                    }`}
                >
                  <p>
                    Probe: {probeResult.ok ? 'Ready' : 'Not ready'}
                    {probeResult.transport ? ` | Transport: ${probeResult.transport}` : ''}
                  </p>
                  {currentProvider === 'auto' && !probeResult.ok && (
                    <p>Auto mode will use Remote E2B until local microVM is ready.</p>
                  )}
                  {probeResult.platform && (
                    <p>
                      Device: {probeResult.platform}
                      {probeResult.arch ? `/${probeResult.arch}` : ''}
                    </p>
                  )}
                  {probeResult.transport === 'ssh' && !probeResult.sshHostConfigured && (
                    <p>Set `LOCAL_MICROVM_SSH_HOST` (and user/key) to enable local_microvm.</p>
                  )}
                  {probeResult.transport === 'local' && probeResult.backendFound === false && (
                    <p>
                      Install/configure local backend command
                      {probeResult.backend ? ` (${probeResult.backend})` : ''}.
                    </p>
                  )}
                  {probeResult.transport === 'local' && probeResult.backendReady === false && (
                    <p>
                      Local backend command was found but is not ready.
                      {probeResult.backendProbeError ? ` ${probeResult.backendProbeError}` : ''}
                    </p>
                  )}
                  {probeResult.transport === 'local' &&
                    probeResult.backendReady === false &&
                    probeResult.backend?.includes('limactl shell') && (
                      <p>
                        Try: `limactl start forge-worker` then `npm run microvm:probe`. If this
                        keeps failing, run `npm run microvm:setup:macos` again.
                      </p>
                    )}
                  {probeResult.limaAutoStartAttempted && (
                    <p>Auto-recovery attempted: started Lima instance before re-probing.</p>
                  )}
                  {probeResult.transport === 'ssh' && probeResult.remoteCLI && (
                    <p>Remote CLI expected: {probeResult.remoteCLI}</p>
                  )}
                  {probeResult.transport === 'hyperv' &&
                    probeResult.hypervBackendFound === false && (
                      <p>
                        Install/configure Hyper-V backend command. Set `LOCAL_MICROVM_HYPERV_CLI` if
                        needed.
                      </p>
                    )}
                  {probeResult.backendFound !== undefined && (
                    <p>Local backend found: {probeResult.backendFound ? 'yes' : 'no'}</p>
                  )}
                  {probeResult.backendReady !== undefined && probeResult.backendReady !== null && (
                    <p>Local backend ready: {probeResult.backendReady ? 'yes' : 'no'}</p>
                  )}
                  {probeResult.hypervBackendFound !== undefined && (
                    <p>
                      Hyper-V backend found:{' '}
                      {probeResult.hypervBackendFound ? 'yes' : 'no'}
                    </p>
                  )}
                  {probeResult.sshHostConfigured !== undefined && (
                    <p>SSH host configured: {probeResult.sshHostConfigured ? 'yes' : 'no'}</p>
                  )}
                  {probeResult.stderr && <p>{probeResult.stderr}</p>}
                </div>
              )}

              {setupGuide?.steps && setupGuide.steps.length > 0 && (
                <div className="rounded-md border border-forge-border bg-forge-bg p-3">
                  <p className="text-sm text-forge-text font-medium">
                    Setup Wizard
                    {setupGuide.platform
                      ? ` (${setupGuide.platform}${setupGuide.arch ? `/${setupGuide.arch}` : ''})`
                      : ''}
                  </p>
                  <div className="mt-2 space-y-2">
                    {setupGuide.steps.map((step, idx) => (
                      <div key={`${idx}-${step.title}`} className="text-xs text-forge-muted">
                        <p className="text-forge-text">{idx + 1}. {step.title}</p>
                        <p>{step.description}</p>
                        {step.command && (
                          <p className="mt-1 font-mono text-[11px] text-forge-muted/90">
                            {step.command}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Usage Stats */}
            <div className="bg-forge-card border border-forge-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-forge-accent" />
                <h2 className="text-lg font-semibold text-forge-text">Usage</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-forge-bg rounded-lg p-4">
                  <p className="text-xs text-forge-muted uppercase tracking-wider">API Key</p>
                  <p className="text-lg font-semibold text-forge-text mt-1">
                    {settings?.anthropic_api_key ? 'BYOK' : 'Platform'}
                  </p>
                </div>
                <div className="bg-forge-bg rounded-lg p-4">
                  <p className="text-xs text-forge-muted uppercase tracking-wider">
                    Sessions Today
                  </p>
                  <p className="text-lg font-semibold text-forge-text mt-1">
                    {settings?.daily_sessions_used || 0}
                  </p>
                </div>
                <div className="bg-forge-bg rounded-lg p-4">
                  <p className="text-xs text-forge-muted uppercase tracking-wider">
                    Monthly Tokens
                  </p>
                  <p className="text-lg font-semibold text-forge-text mt-1">
                    {((settings?.monthly_tokens_used || 0) / 1000).toFixed(1)}K
                  </p>
                </div>
                <div className="bg-forge-bg rounded-lg p-4">
                  <p className="text-xs text-forge-muted uppercase tracking-wider">
                    Sandbox Time
                  </p>
                  <p className="text-lg font-semibold text-forge-text mt-1">
                    {Math.round((settings?.monthly_sandbox_seconds_used || 0) / 60)}m
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleExportRunAudit}
                  variant="outline"
                  className="border-forge-border text-forge-text"
                >
                  Export Run Audit
                </Button>
              </div>
            </div>

            {/* Budget Controls */}
            <div className="bg-forge-card border border-forge-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-forge-accent" />
                <h2 className="text-lg font-semibold text-forge-text">Budget Controls</h2>
              </div>
              <p className="text-sm text-forge-muted">
                Configure per-session limits. You control costs via your own API key.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-forge-text">Max Agent Iterations</label>
                  <Input
                    type="number"
                    min={1}
                    max={25}
                    value={budgetValues.maxAgentIterations}
                    onChange={(e) =>
                      setBudgetValues((prev) => ({
                        ...prev,
                        maxAgentIterations: Number(e.target.value || 16),
                      }))
                    }
                    className="bg-forge-bg border-forge-border text-forge-text"
                  />
                  <p className="text-xs text-forge-muted">How many times the agent can iterate (1–25)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-forge-text">Max Cost per Session ($)</label>
                  <Input
                    type="number"
                    min={0.5}
                    max={50}
                    step={0.5}
                    value={budgetValues.maxCostUsd}
                    onChange={(e) =>
                      setBudgetValues((prev) => ({
                        ...prev,
                        maxCostUsd: Number(e.target.value || 15),
                      }))
                    }
                    className="bg-forge-bg border-forge-border text-forge-text"
                  />
                  <p className="text-xs text-forge-muted">USD cap per session ($0.50–$50)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-forge-text">Max Sandbox Time (min)</label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={Math.round(budgetValues.maxSandboxMs / 60_000)}
                    onChange={(e) =>
                      setBudgetValues((prev) => ({
                        ...prev,
                        maxSandboxMs: Number(e.target.value || 10) * 60_000,
                      }))
                    }
                    className="bg-forge-bg border-forge-border text-forge-text"
                  />
                  <p className="text-xs text-forge-muted">Sandbox time limit per session (1–30 min)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-forge-text">Max Tokens per Session</label>
                  <Input
                    type="number"
                    min={10000}
                    max={500000}
                    step={10000}
                    value={budgetValues.maxTokensPerSession}
                    onChange={(e) =>
                      setBudgetValues((prev) => ({
                        ...prev,
                        maxTokensPerSession: Number(e.target.value || 200000),
                      }))
                    }
                    className="bg-forge-bg border-forge-border text-forge-text"
                  />
                  <p className="text-xs text-forge-muted">Token budget per session (10K–500K)</p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleSaveBudget}
                  disabled={budgetSaving}
                  className="bg-forge-accent hover:bg-forge-accent/90 text-white"
                >
                  {budgetSaving ? 'Saving...' : 'Save Budget Settings'}
                </Button>
              </div>
            </div>

            {/* Memory Governance */}
            <div className="bg-forge-card border border-forge-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-forge-accent" />
                <h2 className="text-lg font-semibold text-forge-text">Memory Governance</h2>
              </div>

              <p className="text-sm text-forge-muted">
                Control what is stored as long-term memory and for how long.
              </p>

              {memorySettings ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-forge-text">Auto memory</p>
                      <p className="text-xs text-forge-muted">
                        Enable storing summaries and durable facts.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={memorySettings.autoMemoryEnabled ? 'default' : 'outline'}
                      className={
                        memorySettings.autoMemoryEnabled
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'border-forge-border text-forge-text'
                      }
                      onClick={() =>
                        setMemorySettings((prev) =>
                          prev
                            ? { ...prev, autoMemoryEnabled: !prev.autoMemoryEnabled }
                            : prev
                        )
                      }
                    >
                      {memorySettings.autoMemoryEnabled ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-forge-text">Retention (days)</label>
                    <Input
                      type="number"
                      min={7}
                      max={3650}
                      value={memorySettings.retentionDays}
                      onChange={(e) =>
                        setMemorySettings((prev) =>
                          prev
                            ? {
                              ...prev,
                              retentionDays: Number(e.target.value || 180),
                            }
                            : prev
                        )
                      }
                      className="bg-forge-bg border-forge-border text-forge-text"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-forge-text">Allow sensitive memory</p>
                      <p className="text-xs text-forge-muted">
                        Off is recommended. Prevents storing secret-like values.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={memorySettings.allowSensitiveMemory ? 'default' : 'outline'}
                      className={
                        memorySettings.allowSensitiveMemory
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'border-forge-border text-forge-text'
                      }
                      onClick={() =>
                        setMemorySettings((prev) =>
                          prev
                            ? {
                              ...prev,
                              allowSensitiveMemory: !prev.allowSensitiveMemory,
                            }
                            : prev
                        )
                      }
                    >
                      {memorySettings.allowSensitiveMemory ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      onClick={handleSaveMemorySettings}
                      disabled={memorySaving}
                      className="bg-forge-accent hover:bg-forge-accent/90 text-white"
                    >
                      {memorySaving ? 'Saving...' : 'Save Memory Settings'}
                    </Button>
                    <Button
                      onClick={handleExportMemory}
                      variant="outline"
                      className="border-forge-border text-forge-text"
                    >
                      Export Memory
                    </Button>
                    <Button
                      onClick={handleClearMemory}
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      Clear All Memory
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-forge-muted">Loading memory settings...</p>
              )}
            </div>

            {/* Install Dialog */}
            <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
              <DialogContent className="bg-forge-card border-forge-border text-forge-text sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Automated Setup: Local MicroVM</DialogTitle>
                  <DialogDescription className="text-forge-muted">
                    This will download the host OS image, initialize the MicroVM, and install required packages inside it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {installLogs ? (
                    <ScrollArea className="h-64 w-full rounded-md border border-forge-border bg-black/80 font-mono text-xs p-4">
                      <pre className="text-green-400 whitespace-pre-wrap">
                        {installLogs}
                        <div ref={logsEndRef} />
                      </pre>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-forge-muted">
                      Your current execution backend is set to something else, or the local environment is missing. Would you like to provision and install the local execution worker now? Ensure you have homebrew installed on your machine.
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setInstallDialogOpen(false)}
                      disabled={installing}
                      className="border-forge-border text-forge-text"
                    >
                      Cancel
                    </Button>
                    {!installLogs && (
                      <Button
                        onClick={handleInstallAndSetLocal}
                        disabled={installing}
                        className="bg-forge-accent hover:bg-forge-accent/90 text-white"
                      >
                        Start Setup
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
