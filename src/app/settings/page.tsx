'use client'

import { useEffect, useState } from 'react'
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
  const { toast } = useToast()

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

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
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
