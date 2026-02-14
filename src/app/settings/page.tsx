'use client'

import { useCallback, useEffect, useState } from 'react'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserStore } from '@/stores/userStore'
import { ArrowLeft, Key, BarChart3, Shield } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

export default function SettingsPage() {
  const { settings, fetchSettings } = useUserStore()
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [memorySaving, setMemorySaving] = useState(false)
  const [memorySettings, setMemorySettings] = useState<{
    autoMemoryEnabled: boolean
    retentionDays: number
    allowSensitiveMemory: boolean
    exportAllowed: boolean
  } | null>(null)
  const { toast } = useToast()

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

  useEffect(() => {
    fetchSettings()
    fetchMemorySettings()
  }, [fetchSettings, fetchMemorySettings])

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

            {/* Usage Stats */}
            <div className="bg-forge-card border border-forge-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-forge-accent" />
                <h2 className="text-lg font-semibold text-forge-text">Usage</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-forge-bg rounded-lg p-4">
                  <p className="text-xs text-forge-muted uppercase tracking-wider">Plan</p>
                  <p className="text-lg font-semibold text-forge-text capitalize mt-1">
                    {settings?.plan || 'free'}
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
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
