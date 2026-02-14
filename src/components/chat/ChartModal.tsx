
import React, { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

interface ChartModalProps {
    isOpen: boolean
    onClose: () => void
    url: string | null
    title: string
}

export function ChartModal({
    isOpen,
    onClose,
    url,
    title,
}: ChartModalProps) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!url || !isOpen) {
            setBlobUrl(null)
            return
        }

        let active = true
        const fetchContent = async () => {
            try {
                setLoading(true)
                setError(null)
                const res = await fetch(url)
                if (!res.ok) throw new Error('Failed to load chart')

                const text = await res.text()
                const blob = new Blob([text], { type: 'text/html; charset=utf-8' })
                const objectUrl = URL.createObjectURL(blob)

                if (active) {
                    setBlobUrl(objectUrl)
                } else {
                    URL.revokeObjectURL(objectUrl)
                }
            } catch (err) {
                if (active) setError('Failed to load chart content')
                console.error(err)
            } finally {
                if (active) setLoading(false)
            }
        }

        fetchContent()

        return () => {
            active = false
            if (blobUrl) URL.revokeObjectURL(blobUrl)
        }
    }, [url, isOpen])

    if (!url) return null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Interactive Chart Visualization
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 w-full border border-forge-border rounded-md overflow-hidden bg-white relative">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                            <Loader2 className="h-8 w-8 animate-spin text-forge-accent" />
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white z-10 text-red-500">
                            {error}
                        </div>
                    )}
                    {blobUrl && (
                        <iframe
                            src={blobUrl}
                            className="w-full h-full border-0"
                            title="Chart Visualization"
                            sandbox="allow-scripts allow-same-origin"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
