'use client'

import { useEffect, useState } from 'react';
import { Box, Activity, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Dashboard() {
    const [sandboxes, setSandboxes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSandboxes = async () => {
        try {
            const res = await fetch('/api/sandboxes');
            const data = await res.json();
            if (data.sandboxes) {
                setSandboxes(data.sandboxes);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSandboxes();
        const interval = setInterval(fetchSandboxes, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-forge-bg p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-forge-text flex items-center gap-3">
                        <Activity className="h-8 w-8 text-forge-accent" />
                        Crucible Control Room
                    </h1>
                    <Link href="/">
                        <Button variant="outline" className="border-forge-border text-forge-text">Back to Home</Button>
                    </Link>
                </div>

                <div className="bg-forge-card border border-forge-border rounded-lg overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-forge-border bg-forge-bg/50">
                        <h2 className="text-lg font-semibold text-forge-text flex items-center gap-2">
                            <Terminal className="h-5 w-5 text-forge-muted" />
                            Active Sandboxes
                        </h2>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-forge-border bg-forge-bg text-forge-muted text-sm">
                                <th className="p-4 font-medium uppercase tracking-wider text-xs">Sandbox ID</th>
                                <th className="p-4 font-medium uppercase tracking-wider text-xs">State</th>
                                <th className="p-4 font-medium uppercase tracking-wider text-xs">Image</th>
                                <th className="p-4 font-medium uppercase tracking-wider text-xs">Provider</th>
                                <th className="p-4 font-medium uppercase tracking-wider text-xs">GPU Accel</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && sandboxes.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-forge-muted animate-pulse">Establishing gRPC connection to Daemon...</td>
                                </tr>
                            ) : sandboxes.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-forge-muted">Daemon is idle. No active sandboxes.</td>
                                </tr>
                            ) : (
                                sandboxes.map((s) => (
                                    <tr key={s.sandbox_id} className="border-b border-forge-border hover:bg-forge-bg/50 transition-colors">
                                        <td className="p-4 font-mono text-xs text-forge-accent">{s.sandbox_id}</td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                                                <Box className="h-3 w-3" />
                                                Running
                                            </span>
                                        </td>
                                        <td className="p-4 text-forge-text text-sm font-medium">{s.spec?.base_image || 'unknown'}</td>
                                        <td className="p-4 text-forge-muted text-sm">{s.provider === 'PROVIDER_LOCAL_LIMA' || s.provider === 1 ? 'Lima' : 'Firecracker'}</td>
                                        <td className="p-4 text-forge-muted text-sm">
                                            {s.spec?.policy?.enable_gpu ? (
                                                <span className="text-forge-accent">Enabled (Venus)</span>
                                            ) : (
                                                <span>Disabled</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
