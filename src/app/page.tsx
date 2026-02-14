import Link from 'next/link'
import { Zap, Code, Package, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-forge-bg">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Zap className="h-12 w-12 text-forge-accent" />
          <h1 className="text-5xl font-bold text-forge-text">Termless</h1>
        </div>
        <p className="text-xl text-forge-muted mb-8 max-w-2xl mx-auto">
          AI chatbot with sandboxed code execution. Ask anything — Termless dynamically discovers
          tools, installs packages, and runs code in isolated environments.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/signup">
            <Button size="lg" className="bg-forge-accent hover:bg-forge-accent/90 text-white">
              Get Started Free
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="border-forge-border text-forge-text hover:bg-forge-card">
              Sign In
            </Button>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-forge-card border border-forge-border rounded-lg p-6">
            <Code className="h-8 w-8 text-forge-accent mb-4" />
            <h3 className="text-lg font-semibold text-forge-text mb-2">Code Execution</h3>
            <p className="text-forge-muted text-sm">
              Run Python, JavaScript, and bash in isolated sandboxes with full network access.
            </p>
          </div>
          <div className="bg-forge-card border border-forge-border rounded-lg p-6">
            <Package className="h-8 w-8 text-forge-accent mb-4" />
            <h3 className="text-lg font-semibold text-forge-text mb-2">Dynamic Tools</h3>
            <p className="text-forge-muted text-sm">
              Automatically discovers and installs packages needed for your query.
            </p>
          </div>
          <div className="bg-forge-card border border-forge-border rounded-lg p-6">
            <Terminal className="h-8 w-8 text-forge-accent mb-4" />
            <h3 className="text-lg font-semibold text-forge-text mb-2">Sandboxed Environment</h3>
            <p className="text-forge-muted text-sm">
              Each execution runs in an isolated E2B sandbox — safe, secure, disposable.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
