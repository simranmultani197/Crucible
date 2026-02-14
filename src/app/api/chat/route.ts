import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyIntent } from '@/lib/llm/router'
import { discoverTools, getPackagesToInstall } from '@/lib/tools/discovery'
import { getOrCreateSandbox, installPackages } from '@/lib/sandbox/manager'
import { executeCode } from '@/lib/sandbox/executor'
import { generateCode, summarizeResults } from '@/lib/llm/executor'
import { createSSEStream } from '@/lib/utils/stream'
import { checkRateLimit, checkSandboxAccess, trackUsage } from '@/lib/usage/tracker'
import { getAnthropicClient } from '@/lib/llm/client'
import { MemoryManager } from '@/lib/memory/manager'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { message, conversationId, fileIds } = await req.json()
  const hasAttachment = fileIds && fileIds.length > 0

  // Check rate limits
  const rateLimitOk = await checkRateLimit(user.id, supabase)
  if (!rateLimitOk) {
    return new Response(
      JSON.stringify({ error: 'Daily session limit reached. Please try again tomorrow.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Get Anthropic client (supports BYOK)
  const client = await getAnthropicClient(user.id, supabase)

  // Create SSE stream
  const { stream, send, close } = createSSEStream()

  // Initialize Memory Manager
  const memoryManager = new MemoryManager(supabase)

  // Fetch conversation history (limit to last 10 messages for context)
  const history = await memoryManager.getContext(conversationId, 10)

    // Process in background
    ; (async () => {
      try {
        // Step 1: Route the query
        send('status', { stage: 'routing' })
        const intent = await classifyIntent(message, hasAttachment, client)
        send('status', { stage: 'classified', intent: intent.intent })

        if (intent.intent === 'chat') {
          // ---- CHAT PATH: Stream directly from LLM ----
          send('status', { stage: 'generating' })

          const streamResponse = client.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [
              ...history,
              { role: 'user', content: message }
            ],
          })

          for await (const event of streamResponse) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              send('text', { chunk: event.delta.text })
            }
          }

          const finalMessage = await streamResponse.finalMessage()

          // Save assistant message to DB
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content:
              finalMessage.content[0].type === 'text'
                ? finalMessage.content[0].text
                : '',
            intent_type: 'chat',
            model_used: 'haiku-4.5',
            tokens_in: finalMessage.usage.input_tokens,
            tokens_out: finalMessage.usage.output_tokens,
          })

          await trackUsage(user.id, supabase, {
            eventType: 'chat',
            tokensIn: finalMessage.usage.input_tokens,
            tokensOut: finalMessage.usage.output_tokens,
            model: 'haiku-4.5',
          })
        } else {
          // ---- CODE EXEC / FILE ANALYSIS PATH ----

          // Check sandbox access
          const sandboxOk = await checkSandboxAccess(user.id, supabase)
          if (!sandboxOk) {
            send('text', {
              chunk:
                'Sandbox execution requires a Pro or Dev plan. You can add your own Anthropic API key in Settings to unlock sandbox features for free.',
            })
            send('done', { totalTimeMs: Date.now() })
            close()
            return
          }

          // Step 2: Discover tools
          send('status', { stage: 'discovering' })
          const tools = discoverTools(
            message,
            intent.suggestedPackages,
            intent.language
          )
          const packages = getPackagesToInstall(tools, intent.language)
          send('status', {
            stage: 'tools_found',
            tools: tools.map((t) => t.name),
            packages,
          })

          // Step 3: Create/get sandbox
          send('status', { stage: 'sandbox_starting' })
          const sandbox = await getOrCreateSandbox(user.id)

          // Step 4: Install packages
          if (packages.length > 0) {
            send('status', { stage: 'installing', packages })
            const installResult = await installPackages(
              sandbox,
              packages,
              intent.language
            )
            if (!installResult.success) {
              send('error', {
                message: `Package install failed: ${installResult.output}`,
              })
            }
          }

          // Step 5: Upload files if any
          if (hasAttachment && fileIds) {
            send('status', { stage: 'uploading_files' })
            for (const fileId of fileIds) {
              const { data: file } = await supabase
                .from('files')
                .select('*')
                .eq('id', fileId)
                .single()

              if (file) {
                const { data: fileData } = await supabase.storage
                  .from('user-files')
                  .download(file.storage_path)

                if (fileData) {
                  const arrayBuf = await fileData.arrayBuffer()
                  await sandbox.files.write(
                    `/home/user/${file.filename}`,
                    new Blob([arrayBuf])
                  )
                }
              }
            }
          }

          // Step 6: Generate code
          send('status', { stage: 'generating_code' })
          const code = await generateCode(message, packages, history, client)
          send('code', { code, language: intent.language || 'python' })

          // Step 7: Execute code
          send('status', { stage: 'executing' })
          const result = await executeCode(
            sandbox,
            code,
            intent.language || 'python'
          )
          send('output', {
            stdout: result.stdout,
            stderr: result.stderr,
            success: result.success,
            executionTimeMs: result.executionTimeMs,
          })

          // Step 8: Handle output files
          if (result.files.length > 0) {
            for (const file of result.files) {
              const fileContent = await sandbox.files.read(file.path, { format: 'blob' })
              const contentType = inferContentType(file.name)
              const storagePath = `${user.id}/${Date.now()}_${file.name}`

              const { error: uploadError } = await supabase.storage
                .from('user-files')
                .upload(storagePath, fileContent, {
                  contentType,
                  upsert: true,
                })

              if (uploadError) {
                send('error', { message: `File upload failed: ${uploadError.message}` })
                continue
              }

              // Use signed URL (works for both public and private buckets)
              const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                .from('user-files')
                .createSignedUrl(storagePath, 60 * 60) // 1 hour expiry

              const fileUrl = signedUrlError
                ? supabase.storage.from('user-files').getPublicUrl(storagePath).data.publicUrl
                : signedUrlData.signedUrl

              send('file', {
                name: file.name,
                url: fileUrl,
                size: fileContent.size,
              })
            }
          }

          // Step 9: Summarize results
          send('status', { stage: 'summarizing' })
          const summary = await summarizeResults(
            message,
            result.output,
            result.error,
            result.files.map((f) => f.name),
            client
          )
          send('text', { chunk: summary })

          // Save assistant message to DB
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: summary,
            intent_type: intent.intent,
            model_used: 'haiku-4.5',
            sandbox_used: true,
            sandbox_duration_ms: result.executionTimeMs,
            metadata: {
              code,
              language: intent.language,
              packages_installed: packages,
              files_created: result.files.map((f) => f.name),
              stdout: result.stdout,
              stderr: result.stderr,
            },
          })

          // Track usage
          await trackUsage(user.id, supabase, {
            eventType: 'sandbox',
            tokensIn: 0,
            tokensOut: 0,
            sandboxDurationMs: result.executionTimeMs,
            model: 'haiku-4.5',
          })
        }

        send('done', { totalTimeMs: Date.now() })
      } catch (error) {
        send('error', { message: String(error) })
      } finally {
        close()
      }
    })()

  // Save user message to DB
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: message,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// GET: Fetch message history for a conversation
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) {
    return new Response(JSON.stringify({ error: 'conversationId required' }), {
      status: 400,
    })
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    })
  }

  // Transform to frontend format
  const formatted = (messages || []).map((m: Record<string, unknown>) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    intentType: m.intent_type,
    modelUsed: m.model_used,
    sandboxUsed: m.sandbox_used,
    metadata: m.metadata || {},
    createdAt: m.created_at,
  }))

  return new Response(JSON.stringify(formatted), {
    headers: { 'Content-Type': 'application/json' },
  })
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
