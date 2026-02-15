import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyIntent } from '@/lib/llm/router'
import { discoverTools, getPackagesToInstall } from '@/lib/tools/discovery'
import { getOrCreateSandbox, installPackages, destroySandbox } from '@/lib/sandbox/manager'
import { executeCode } from '@/lib/sandbox/executor'
import { generateCode, summarizeResults } from '@/lib/llm/executor'
import { checkSandboxAccess, trackUsage } from '@/lib/usage/tracker'
import {
  buildRunBudget,
  estimateUsageCostUsd,
  inspectCodeRisk,
  isBudgetExceeded,
} from '@/lib/usage/budgets'
import { getAnthropicClient } from '@/lib/llm/client'
import { MemoryManager } from '@/lib/memory/manager'
import { RunLedger, type RunUsage } from '@/lib/runs/ledger'
import { buildSignedRunManifest } from '@/lib/runs/manifest'
import { evaluateEgressPolicy } from '@/lib/security/egress'
import type { PlanType } from '@/lib/usage/constants'
import type { SandboxProviderPreference } from '@/types/sandbox'

const MODEL_ID = 'claude-haiku-4-5-20251001'
const MODEL_LABEL = 'haiku-4.5'

interface ApprovalInput {
  allowDangerousActions?: boolean
}

interface ChatWorkflowInput {
  supabase: SupabaseClient
  userId: string
  message: string
  conversationId: string
  fileIds?: string[]
  approval?: ApprovalInput
  send: (event: string, data: unknown) => void
}

interface WorkflowResult {
  runId: string | null
  status: 'completed' | 'failed' | 'awaiting_approval'
}

export async function runChatWorkflow(input: ChatWorkflowInput): Promise<WorkflowResult> {
  const startTime = Date.now()
  const hasAttachment = Boolean(input.fileIds && input.fileIds.length > 0)
  const ledger = new RunLedger(input.supabase)
  const userExecution = await getUserExecutionSettings(input.userId, input.supabase)
  const budget = buildRunBudget(userExecution.plan)
  const usage: RunUsage = {
    inputTokens: 0,
    outputTokens: 0,
    sandboxMs: 0,
    estimatedCostUsd: 0,
  }

  const runId = await ledger.createRun({
    userId: input.userId,
    conversationId: input.conversationId,
    modelUsed: MODEL_LABEL,
    budget,
  })

  let intentType: string | undefined
  let status: WorkflowResult['status'] = 'completed'
  let sandboxProviderUsed: string | undefined

  try {
    const client = await getAnthropicClient(input.userId, input.supabase)
    const memoryManager = new MemoryManager(input.supabase)
    input.send('status', { stage: 'memory_loading' })
    const memoryContext = await memoryManager.buildContext({
      userId: input.userId,
      conversationId: input.conversationId,
      query: input.message,
      recentLimit: 10,
      factLimit: 6,
    })
    const history = memoryContext.messages

    input.send('status', { stage: 'routing' })
    const routeStepId = await ledger.startStep(runId, 'route_intent', {
      hasAttachment,
      historyMessages: history.length,
    })
    const routeStartedAt = Date.now()
    const intent = await classifyIntent(input.message, hasAttachment, client)
    intentType = intent.intent

    await ledger.recordToolCall({
      runId,
      runStepId: routeStepId,
      toolName: 'intent_router',
      provider: 'anthropic',
      status: 'completed',
      input: { hasAttachment },
      output: {
        intent: intent.intent,
        language: intent.language,
        suggestedPackages: intent.suggestedPackages,
      },
      durationMs: Date.now() - routeStartedAt,
    })
    await ledger.completeStep(routeStepId, {
      intent: intent.intent,
      language: intent.language,
    })
    input.send('status', { stage: 'classified', intent: intent.intent })

    if (intent.intent === 'chat') {
      await runChatPath({
        ...input,
        runId,
        usage,
        budget,
        history,
        client,
        memoryManager,
        ledger,
      })
    } else {
      status = await runExecutionPath({
        ...input,
        preferredSandboxProvider: userExecution.sandboxProvider,
        strictNoFallback: userExecution.strictNoFallback,
        onSandboxProviderResolved: (provider) => {
          sandboxProviderUsed = provider
        },
        runId,
        usage,
        budget,
        history,
        intent,
        client,
        memoryManager,
        ledger,
      })
    }

    if (isBudgetExceeded(usage, budget)) {
      input.send('error', {
        message: 'Run budget was exceeded. Narrow the task scope or try again with smaller input.',
      })
    }

    if (status === 'completed') {
      await ledger.completeRun(runId, {
        status: 'completed',
        intentType,
        usage,
      })
    } else if (status === 'awaiting_approval') {
      await ledger.completeRun(runId, {
        status: 'awaiting_approval',
        intentType,
        usage,
      })
    }

    await recordRunManifestArtifact({
      ledger,
      runId,
      userId: input.userId,
      conversationId: input.conversationId,
      status,
      intentType,
      usage,
      sandboxProviderUsed,
      errorMessage: undefined,
    })
  } catch (error) {
    status = 'failed'
    const message = error instanceof Error ? error.message : String(error)
    input.send('error', { message })
    await ledger.completeRun(runId, {
      status: 'failed',
      intentType,
      usage,
      errorMessage: message,
    })

    await recordRunManifestArtifact({
      ledger,
      runId,
      userId: input.userId,
      conversationId: input.conversationId,
      status: 'failed',
      intentType,
      usage,
      sandboxProviderUsed,
      errorMessage: message,
    })
  } finally {
    input.send('done', {
      totalTimeMs: Date.now() - startTime,
      runId,
      status,
    })
  }

  return { runId, status }
}

async function runChatPath(input: {
  supabase: SupabaseClient
  userId: string
  message: string
  conversationId: string
  send: (event: string, data: unknown) => void
  runId: string | null
  usage: RunUsage
  budget: { maxOutputTokens: number }
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  client: Awaited<ReturnType<typeof getAnthropicClient>>
  memoryManager: MemoryManager
  ledger: RunLedger
}) {
  input.send('status', { stage: 'generating' })
  const stepId = await input.ledger.startStep(input.runId, 'chat_response', {
    historyMessages: input.history.length,
  })
  const startedAt = Date.now()

  const streamResponse = input.client.messages.stream({
    model: MODEL_ID,
    max_tokens: input.budget.maxOutputTokens,
    messages: [...input.history, { role: 'user', content: input.message }],
  })

  for await (const event of streamResponse) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      input.send('text', { chunk: event.delta.text })
    }
  }

  const finalMessage = await streamResponse.finalMessage()
  const content = getAnthropicText(finalMessage)
  const tokensIn = finalMessage.usage.input_tokens ?? 0
  const tokensOut = finalMessage.usage.output_tokens ?? 0
  const cost = estimateUsageCostUsd(MODEL_LABEL, tokensIn, tokensOut)

  input.usage.inputTokens += tokensIn
  input.usage.outputTokens += tokensOut
  input.usage.estimatedCostUsd += cost

  await input.ledger.recordToolCall({
    runId: input.runId,
    runStepId: stepId,
    toolName: 'chat_stream',
    provider: 'anthropic',
    status: 'completed',
    input: { maxTokens: input.budget.maxOutputTokens },
    output: { tokensIn, tokensOut, contentLength: content.length },
    durationMs: Date.now() - startedAt,
    costEstimateUsd: cost,
  })
  await input.ledger.completeStep(stepId, {
    tokensIn,
    tokensOut,
  })

  await input.supabase.from('messages').insert({
    conversation_id: input.conversationId,
    role: 'assistant',
    content,
    intent_type: 'chat',
    model_used: MODEL_LABEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  })

  queueMemoryUpdate(input.memoryManager, {
    userId: input.userId,
    conversationId: input.conversationId,
    userMessage: input.message,
    assistantMessage: content,
    client: input.client,
  })

  await trackUsage(input.userId, input.supabase, {
    eventType: 'chat',
    tokensIn,
    tokensOut,
    model: MODEL_LABEL,
  })
}

async function runExecutionPath(input: {
  supabase: SupabaseClient
  userId: string
  message: string
  conversationId: string
  preferredSandboxProvider?: SandboxProviderPreference | null
  strictNoFallback?: boolean
  onSandboxProviderResolved?: (provider: string) => void
  fileIds?: string[]
  approval?: ApprovalInput
  send: (event: string, data: unknown) => void
  runId: string | null
  usage: RunUsage
  budget: { maxSandboxMs: number }
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  intent: Awaited<ReturnType<typeof classifyIntent>>
  client: Awaited<ReturnType<typeof getAnthropicClient>>
  memoryManager: MemoryManager
  ledger: RunLedger
}): Promise<'completed' | 'awaiting_approval'> {
  const sandboxOk = await checkSandboxAccess(input.userId, input.supabase)
  if (!sandboxOk) {
    input.send('text', {
      chunk:
        'Sandbox execution requires a Pro or Dev plan. You can add your own Anthropic API key in Settings to unlock sandbox features for free.',
    })
    return 'completed'
  }

  input.send('status', { stage: 'discovering' })
  const discoveryStepId = await input.ledger.startStep(input.runId, 'discover_tools', {
    language: input.intent.language,
  })
  const tools = discoverTools(
    input.message,
    input.intent.suggestedPackages,
    input.intent.language
  )
  const packages = getPackagesToInstall(tools, input.intent.language)
  await input.ledger.completeStep(discoveryStepId, {
    tools: tools.map((tool) => tool.name),
    packages,
  })
  input.send('status', {
    stage: 'tools_found',
    tools: tools.map((tool) => tool.name),
    packages,
  })

  input.send('status', { stage: 'sandbox_starting' })
  const sandboxStepId = await input.ledger.startStep(input.runId, 'sandbox_start')
  const { sandbox, provider } = await getOrCreateSandbox(
    input.userId,
    input.preferredSandboxProvider,
    { strictNoFallback: input.strictNoFallback }
  )
  input.onSandboxProviderResolved?.(provider)
  await input.ledger.completeStep(sandboxStepId, { success: true, provider })
  input.send('status', { stage: 'sandbox_ready', provider })

  if (packages.length > 0) {
    input.send('status', { stage: 'installing', packages })
    const installStepId = await input.ledger.startStep(input.runId, 'install_packages', {
      packages,
    })
    const installStartedAt = Date.now()
    const installResult = await installPackages(sandbox, packages, input.intent.language)
    await input.ledger.recordToolCall({
      runId: input.runId,
      runStepId: installStepId,
      toolName: 'sandbox_install',
      provider,
      status: installResult.success ? 'completed' : 'failed',
      input: { packages, language: input.intent.language },
      output: { output: installResult.output.slice(0, 4000) },
      durationMs: Date.now() - installStartedAt,
    })

    if (!installResult.success) {
      input.send('error', { message: `Package install failed: ${installResult.output}` })
    }
    await input.ledger.completeStep(installStepId, {
      success: installResult.success,
    })
  }

  if (input.fileIds && input.fileIds.length > 0) {
    input.send('status', { stage: 'uploading_files' })
    const uploadStepId = await input.ledger.startStep(input.runId, 'upload_files', {
      fileCount: input.fileIds.length,
    })

    for (const fileId of input.fileIds) {
      const { data: file } = await input.supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (!file) continue

      const { data: fileData } = await input.supabase.storage
        .from('user-files')
        .download(file.storage_path)

      if (!fileData) continue
      const arrayBuf = await fileData.arrayBuffer()
      await sandbox.writeFile(`/home/user/${file.filename}`, new Blob([arrayBuf]))
    }

    await input.ledger.completeStep(uploadStepId, { uploaded: input.fileIds.length })
  }

  input.send('status', { stage: 'generating_code' })
  const codeStepId = await input.ledger.startStep(input.runId, 'generate_code', {
    language: input.intent.language,
  })
  const codeStartedAt = Date.now()
  const code = await generateCode(input.message, packages, input.history, input.client)
  await input.ledger.recordToolCall({
    runId: input.runId,
    runStepId: codeStepId,
    toolName: 'generate_code',
    provider: 'anthropic',
    status: 'completed',
    input: { packages, language: input.intent.language || 'python' },
    output: { codeLength: code.length },
    durationMs: Date.now() - codeStartedAt,
  })
  await input.ledger.recordArtifact({
    runId: input.runId,
    runStepId: codeStepId,
    artifactType: 'code',
    name: `generated.${input.intent.language === 'javascript' ? 'js' : 'py'}`,
    metadata: { code },
  })
  await input.ledger.completeStep(codeStepId, {
    codeLength: code.length,
  })
  input.send('code', { code, language: input.intent.language || 'python' })

  const risk = inspectCodeRisk(code)
  if (risk.requiresApproval && !input.approval?.allowDangerousActions) {
    const checkpointMessage =
      'Execution paused for safety. Enable "Allow risky actions" and resend to continue with this generated code.'

    input.send('checkpoint', {
      type: 'approval_required',
      reason: 'Potentially destructive operations detected.',
      details: risk.reasons,
    })
    input.send('text', {
      chunk: checkpointMessage,
    })

    await input.supabase.from('messages').insert({
      conversation_id: input.conversationId,
      role: 'assistant',
      content: checkpointMessage,
      intent_type: input.intent.intent,
      model_used: MODEL_LABEL,
      metadata: {
        code,
        language: input.intent.language,
        checkpoint: {
          type: 'approval_required',
          reason: 'Potentially destructive operations detected.',
          details: risk.reasons,
        },
      },
    })

    queueMemoryUpdate(input.memoryManager, {
      userId: input.userId,
      conversationId: input.conversationId,
      userMessage: input.message,
      assistantMessage: checkpointMessage,
      client: input.client,
    })

    return 'awaiting_approval'
  }

  const egressPolicy = evaluateEgressPolicy(code)
  if (egressPolicy.enabled && egressPolicy.blockedHosts.length > 0) {
    const blockedMessage =
      'Execution blocked by egress policy. The generated code attempted outbound hosts outside your allowlist.'

    input.send('checkpoint', {
      type: 'policy_violation',
      reason: 'Egress allowlist violation',
      details: egressPolicy.blockedHosts,
    })
    input.send('error', {
      message: `${blockedMessage} Blocked hosts: ${egressPolicy.blockedHosts.join(', ')}`,
    })

    await input.supabase.from('messages').insert({
      conversation_id: input.conversationId,
      role: 'assistant',
      content: blockedMessage,
      intent_type: input.intent.intent,
      model_used: MODEL_LABEL,
      metadata: {
        checkpoint: {
          type: 'policy_violation',
          reason: 'Egress allowlist violation',
          details: egressPolicy.blockedHosts,
        },
        egress_allowlist: egressPolicy.allowlist,
      },
    })

    return 'awaiting_approval'
  }

  input.send('status', { stage: 'executing' })
  const executeStepId = await input.ledger.startStep(input.runId, 'execute_code', {
    language: input.intent.language || 'python',
  })
  const executeStartedAt = Date.now()
  const result = await executeCode(
    sandbox,
    code,
    input.intent.language || 'python',
    { timeoutMs: input.budget.maxSandboxMs }
  )

  input.usage.sandboxMs += result.executionTimeMs

  await input.ledger.recordToolCall({
    runId: input.runId,
    runStepId: executeStepId,
    toolName: 'sandbox_execute',
    provider,
    status: result.success ? 'completed' : 'failed',
    input: { language: input.intent.language || 'python' },
    output: {
      success: result.success,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
      files: result.files.map((file) => file.name),
    },
    durationMs: Date.now() - executeStartedAt,
  })
  await input.ledger.completeStep(executeStepId, {
    success: result.success,
    executionTimeMs: result.executionTimeMs,
    filesCreated: result.files.length,
  })

  input.send('output', {
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.success,
    executionTimeMs: result.executionTimeMs,
  })

  if (result.files.length > 0) {
    const filesStepId = await input.ledger.startStep(input.runId, 'publish_files', {
      fileCount: result.files.length,
    })
    for (const file of result.files) {
      const fileContentData = await sandbox.readFile(file.path, { format: 'blob' })
      const fileContent =
        fileContentData instanceof Blob ? fileContentData : new Blob([fileContentData])
      const contentType = inferContentType(file.name)
      const storagePath = `${input.userId}/${Date.now()}_${file.name}`

      const { error: uploadError } = await input.supabase.storage
        .from('user-files')
        .upload(storagePath, fileContent, {
          contentType,
          upsert: true,
        })

      if (uploadError) {
        input.send('error', { message: `File upload failed: ${uploadError.message}` })
        continue
      }

      const { data: signedUrlData, error: signedUrlError } = await input.supabase.storage
        .from('user-files')
        .createSignedUrl(storagePath, 60 * 60)

      const fileUrl = signedUrlError
        ? input.supabase.storage.from('user-files').getPublicUrl(storagePath).data.publicUrl
        : signedUrlData.signedUrl

      input.send('file', {
        name: file.name,
        url: fileUrl,
        size: fileContent.size,
      })

      await input.ledger.recordArtifact({
        runId: input.runId,
        runStepId: filesStepId,
        artifactType: 'file',
        name: file.name,
        storagePath,
        mimeType: contentType,
        sizeBytes: fileContent.size,
      })
    }

    await input.ledger.completeStep(filesStepId, { success: true })
  }

  input.send('status', { stage: 'summarizing' })
  const summarizeStepId = await input.ledger.startStep(input.runId, 'summarize_results')
  const summarizeStartedAt = Date.now()
  const summary = await summarizeResults(
    input.message,
    result.output,
    result.error,
    result.files.map((file) => file.name),
    input.client
  )
  await input.ledger.recordToolCall({
    runId: input.runId,
    runStepId: summarizeStepId,
    toolName: 'summarize_results',
    provider: 'anthropic',
    status: 'completed',
    input: { outputLength: result.output.length, hasError: Boolean(result.error) },
    output: { summaryLength: summary.length },
    durationMs: Date.now() - summarizeStartedAt,
  })
  await input.ledger.completeStep(summarizeStepId, {
    summaryLength: summary.length,
  })
  input.send('text', { chunk: summary })

  await input.supabase.from('messages').insert({
    conversation_id: input.conversationId,
    role: 'assistant',
    content: summary,
    intent_type: input.intent.intent,
    model_used: MODEL_LABEL,
    sandbox_used: true,
    sandbox_duration_ms: result.executionTimeMs,
    metadata: {
      sandbox_provider: provider,
      code,
      language: input.intent.language,
      packages_installed: packages,
      files_created: result.files.map((file) => file.name),
      stdout: result.stdout,
      stderr: result.stderr,
    },
  })

  queueMemoryUpdate(input.memoryManager, {
    userId: input.userId,
    conversationId: input.conversationId,
    userMessage: input.message,
    assistantMessage: summary,
    client: input.client,
  })

  await trackUsage(input.userId, input.supabase, {
    eventType: 'sandbox',
    tokensIn: 0,
    tokensOut: 0,
    sandboxDurationMs: result.executionTimeMs,
    model: MODEL_LABEL,
  })

  // Eager cleanup: destroy sandbox after execution completes.
  // Files are already uploaded to Supabase, sandbox is no longer needed.
  void destroySandbox(input.userId).catch(() => {})

  return 'completed'
}

async function getUserExecutionSettings(
  userId: string,
  supabase: SupabaseClient
): Promise<{
  plan: PlanType
  sandboxProvider: SandboxProviderPreference
  strictNoFallback: boolean
}> {
  const { data: profileWithStrict, error: profileStrictError } = await supabase
    .from('profiles')
    .select('plan, sandbox_provider, strict_no_fallback')
    .eq('id', userId)
    .single()

  let profile: {
    plan?: string
    sandbox_provider?: string
    strict_no_fallback?: boolean
  } | null = profileWithStrict as {
    plan?: string
    sandbox_provider?: string
    strict_no_fallback?: boolean
  } | null

  if (profileStrictError) {
    const { data: fallbackProfile } = await supabase
      .from('profiles')
      .select('plan, sandbox_provider')
      .eq('id', userId)
      .single()
    profile = fallbackProfile as { plan?: string; sandbox_provider?: string } | null
  }

  let plan: PlanType = 'free'
  if (profile?.plan === 'pro' || profile?.plan === 'dev') {
    plan = profile.plan
  }

  const sandboxProvider =
    profile?.sandbox_provider === 'local_microvm'
      ? 'local_microvm'
      : profile?.sandbox_provider === 'remote_e2b'
        ? 'remote_e2b'
        : 'auto'
  const strictNoFallback = Boolean(profile?.strict_no_fallback)

  return { plan, sandboxProvider, strictNoFallback }
}

function getAnthropicText(message: { content: Array<{ type: string; text?: string }> }): string {
  const first = message.content[0]
  return first?.type === 'text' ? first.text || '' : ''
}

function inferContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    txt: 'text/plain',
    md: 'text/markdown',
    xml: 'application/xml',
    zip: 'application/zip',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return mimeTypes[ext || ''] || 'application/octet-stream'
}

async function recordRunManifestArtifact(input: {
  ledger: RunLedger
  runId: string | null
  userId: string
  conversationId: string
  status: 'completed' | 'failed' | 'awaiting_approval'
  intentType?: string
  usage: RunUsage
  sandboxProviderUsed?: string
  errorMessage?: string
}) {
  if (!input.runId) return

  try {
    const signed = buildSignedRunManifest({
      runId: input.runId,
      userId: input.userId,
      conversationId: input.conversationId,
      status: input.status,
      intentType: input.intentType,
      modelUsed: MODEL_LABEL,
      usage: input.usage,
      sandboxProvider: input.sandboxProviderUsed,
      errorMessage: input.errorMessage,
    })

    await input.ledger.recordArtifact({
      runId: input.runId,
      artifactType: 'log',
      name: 'run-manifest.json',
      metadata: {
        manifest: signed.manifest,
        checksumSha256: signed.checksumSha256,
        signature: signed.signature,
        signatureAlgo: signed.signatureAlgo,
      },
    })
  } catch (error) {
    console.error('Failed to record run manifest artifact:', error)
  }
}

function queueMemoryUpdate(
  memoryManager: MemoryManager,
  input: {
    userId: string
    conversationId: string
    userMessage: string
    assistantMessage: string
    client: Awaited<ReturnType<typeof getAnthropicClient>>
  }
) {
  void memoryManager.rememberTurn(input).catch((error) => {
    console.error('Memory update failed:', error)
  })
}
