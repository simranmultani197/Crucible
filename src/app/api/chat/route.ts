import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSSEStream } from '@/lib/utils/stream'
import { checkRateLimit } from '@/lib/usage/tracker'
import { enforceQuota } from '@/lib/usage/limiter'
import { runChatWorkflow } from '@/lib/workflow/chat-workflow'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { message, conversationId, fileIds, approval } = await req.json()

  if (!message || !conversationId) {
    return new Response(
      JSON.stringify({ error: 'message and conversationId are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Check rate limits
  const rateLimitOk = await checkRateLimit(user.id, supabase)
  if (!rateLimitOk) {
    return new Response(
      JSON.stringify({ error: 'Daily session limit reached. Please try again tomorrow.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const quota = await enforceQuota(user.id, supabase)
  if (!quota.allowed) {
    return new Response(
      JSON.stringify({ error: quota.reason || 'Usage quota exceeded.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Create SSE stream
  const { stream, send, close } = createSSEStream()

  // Process in background
  ;(async () => {
    try {
      await runChatWorkflow({
        supabase,
        userId: user.id,
        message,
        conversationId,
        fileIds,
        approval,
        send,
      })
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
