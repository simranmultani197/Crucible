import { createHash, createHmac } from 'node:crypto'

export interface RunManifestInput {
  runId: string
  userId: string
  conversationId: string
  status: 'completed' | 'failed' | 'awaiting_approval'
  intentType?: string
  modelUsed: string
  usage: {
    inputTokens: number
    outputTokens: number
    sandboxMs: number
    estimatedCostUsd: number
  }
  sandboxProvider?: string
  errorMessage?: string
}

export interface RunManifestOutput {
  manifest: Record<string, unknown>
  checksumSha256: string
  signature: string | null
  signatureAlgo: string | null
}

export function buildSignedRunManifest(input: RunManifestInput): RunManifestOutput {
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runId: input.runId,
    userId: input.userId,
    conversationId: input.conversationId,
    status: input.status,
    intentType: input.intentType || null,
    modelUsed: input.modelUsed,
    usage: input.usage,
    sandboxProvider: input.sandboxProvider || null,
    errorMessage: input.errorMessage || null,
  }

  const serialized = JSON.stringify(manifest)
  const checksumSha256 = createHash('sha256').update(serialized).digest('hex')
  const signingKey = process.env.RUN_MANIFEST_SIGNING_KEY || ''

  if (!signingKey) {
    return {
      manifest,
      checksumSha256,
      signature: null,
      signatureAlgo: null,
    }
  }

  const signature = createHmac('sha256', signingKey).update(serialized).digest('hex')
  return {
    manifest,
    checksumSha256,
    signature,
    signatureAlgo: 'hmac-sha256',
  }
}
