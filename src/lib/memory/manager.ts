import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { MEMORY_SUMMARY_SYSTEM_PROMPT } from '@/lib/llm/prompts'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MemoryContext {
  messages: ChatMessage[]
  summary: string | null
  facts: string[]
}

export interface MemorySettings {
  autoMemoryEnabled: boolean
  retentionDays: number
  allowSensitiveMemory: boolean
  exportAllowed: boolean
}

export interface MemoryFact {
  id: string
  factType: 'preference' | 'profile' | 'goal' | 'constraint' | 'context'
  content: string
  confidence: number
  conversationId: string | null
  updatedAt: string
  lastObservedAt: string
  expiresAt: string | null
}

export interface ConversationSummary {
  id: string
  summaryText: string
  keyTopics: string[]
  sourceMessageCount: number
  createdAt: string
  expiresAt: string | null
}

interface BuildContextInput {
  userId: string
  conversationId: string
  query: string
  recentLimit?: number
  factLimit?: number
}

interface RememberTurnInput {
  userId: string
  conversationId: string
  userMessage: string
  assistantMessage: string
  client?: Anthropic
}

interface MemoryFactCandidate {
  type: 'preference' | 'profile' | 'goal' | 'constraint' | 'context'
  content: string
  confidence: number
}

const SUMMARY_REFRESH_INTERVAL = 8
const SUMMARY_WINDOW_MESSAGES = 24
const MODEL_ID = 'claude-haiku-4-5-20251001'

const DEFAULT_SETTINGS: MemorySettings = {
  autoMemoryEnabled: true,
  retentionDays: 180,
  allowSensitiveMemory: false,
  exportAllowed: true,
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'and', 'or', 'of', 'to', 'for', 'with',
  'in', 'on', 'at', 'from', 'it', 'this', 'that', 'as', 'be', 'by', 'i',
  'you', 'we', 'they', 'he', 'she', 'them', 'our', 'your', 'my', 'me',
])

export class MemoryManager {
  constructor(private readonly supabase: SupabaseClient) {}

  // Legacy method kept for compatibility.
  async getContext(conversationId: string, limit: number = 10): Promise<ChatMessage[]> {
    return this.fetchRecentMessages(conversationId, limit)
  }

  async getSettings(userId: string): Promise<MemorySettings> {
    const { data, error } = await this.supabase
      .from('memory_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch memory settings:', error)
      return DEFAULT_SETTINGS
    }

    if (!data) {
      await this.supabase.from('memory_settings').upsert({
        user_id: userId,
        auto_memory_enabled: DEFAULT_SETTINGS.autoMemoryEnabled,
        retention_days: DEFAULT_SETTINGS.retentionDays,
        allow_sensitive_memory: DEFAULT_SETTINGS.allowSensitiveMemory,
        export_allowed: DEFAULT_SETTINGS.exportAllowed,
      })
      return DEFAULT_SETTINGS
    }

    return {
      autoMemoryEnabled: Boolean(data.auto_memory_enabled),
      retentionDays: Number(data.retention_days || DEFAULT_SETTINGS.retentionDays),
      allowSensitiveMemory: Boolean(data.allow_sensitive_memory),
      exportAllowed: Boolean(data.export_allowed),
    }
  }

  async updateSettings(
    userId: string,
    updates: Partial<MemorySettings>
  ): Promise<MemorySettings> {
    const current = await this.getSettings(userId)
    const merged: MemorySettings = {
      autoMemoryEnabled: updates.autoMemoryEnabled ?? current.autoMemoryEnabled,
      retentionDays: this.normalizeRetentionDays(
        updates.retentionDays ?? current.retentionDays
      ),
      allowSensitiveMemory:
        updates.allowSensitiveMemory ?? current.allowSensitiveMemory,
      exportAllowed: updates.exportAllowed ?? current.exportAllowed,
    }

    await this.supabase.from('memory_settings').upsert({
      user_id: userId,
      auto_memory_enabled: merged.autoMemoryEnabled,
      retention_days: merged.retentionDays,
      allow_sensitive_memory: merged.allowSensitiveMemory,
      export_allowed: merged.exportAllowed,
      updated_at: new Date().toISOString(),
    })

    await this.logMemoryEvent(userId, 'settings_updated', {
      autoMemoryEnabled: merged.autoMemoryEnabled,
      retentionDays: merged.retentionDays,
      allowSensitiveMemory: merged.allowSensitiveMemory,
      exportAllowed: merged.exportAllowed,
    })
    return merged
  }

  async buildContext(input: BuildContextInput): Promise<MemoryContext> {
    const settings = await this.getSettings(input.userId)
    await this.pruneExpiredMemory(input.userId)

    const recentMessages = await this.fetchRecentMessages(
      input.conversationId,
      input.recentLimit ?? 10
    )

    if (!settings.autoMemoryEnabled) {
      return {
        messages: recentMessages,
        summary: null,
        facts: [],
      }
    }

    const [summary, facts] = await Promise.all([
      this.fetchLatestSummary(input.conversationId),
      this.fetchRelevantFacts(
        input.userId,
        input.conversationId,
        input.query,
        input.factLimit ?? 6
      ),
    ])

    const memoryMessage = this.composeMemoryMessage(summary, facts)
    const messages = memoryMessage ? [memoryMessage, ...recentMessages] : recentMessages

    return {
      messages,
      summary,
      facts,
    }
  }

  async rememberTurn(input: RememberTurnInput): Promise<void> {
    const settings = await this.getSettings(input.userId)
    if (!settings.autoMemoryEnabled) return

    await this.pruneExpiredMemory(input.userId)

    const heuristicFacts = this.extractHeuristicFacts(input.userMessage)
    await this.persistFacts(
      input.userId,
      input.conversationId,
      heuristicFacts,
      settings
    )

    const { count: messageCount } = await this.supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', input.conversationId)

    if (!messageCount || messageCount % SUMMARY_REFRESH_INTERVAL !== 0) {
      return
    }

    const recentForSummary = await this.fetchRecentMessages(
      input.conversationId,
      SUMMARY_WINDOW_MESSAGES
    )
    if (recentForSummary.length < 4) return

    const summarized = await this.generateSummary(recentForSummary, input.client)
    await this.supabase.from('conversation_summaries').insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      summary_text: summarized.summary,
      key_topics: summarized.keyTopics,
      source_message_count: recentForSummary.length,
      expires_at: this.computeExpiry(settings.retentionDays),
    })

    if (summarized.facts.length > 0) {
      await this.persistFacts(
        input.userId,
        input.conversationId,
        summarized.facts,
        settings
      )
    }

    await this.logMemoryEvent(input.userId, 'summary_created', {
      conversationId: input.conversationId,
      factCount: summarized.facts.length,
    })
  }

  async listFacts(userId: string, limit: number = 100): Promise<MemoryFact[]> {
    const { data, error } = await this.supabase
      .from('memory_facts')
      .select(
        'id, fact_type, content, confidence, conversation_id, updated_at, last_observed_at, expires_at'
      )
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(Math.min(limit, 500))

    if (error || !data) {
      if (error) console.error('Failed to list memory facts:', error)
      return []
    }

    const now = Date.now()
    return data
      .filter((fact) => !fact.expires_at || new Date(String(fact.expires_at)).getTime() > now)
      .map((fact) => ({
      id: fact.id as string,
      factType: this.normalizeFactType(String(fact.fact_type)),
      content: String(fact.content),
      confidence: Number(fact.confidence || 0.6),
      conversationId: (fact.conversation_id as string | null) || null,
      updatedAt: String(fact.updated_at),
      lastObservedAt: String(fact.last_observed_at),
      expiresAt: (fact.expires_at as string | null) || null,
      }))
  }

  async listSummaries(
    userId: string,
    limit: number = 50
  ): Promise<ConversationSummary[]> {
    const { data, error } = await this.supabase
      .from('conversation_summaries')
      .select(
        'id, summary_text, key_topics, source_message_count, created_at, expires_at'
      )
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 200))

    if (error || !data) {
      if (error) console.error('Failed to list summaries:', error)
      return []
    }

    const now = Date.now()
    return data
      .filter((row) => !row.expires_at || new Date(String(row.expires_at)).getTime() > now)
      .map((row) => ({
      id: row.id as string,
      summaryText: String(row.summary_text),
      keyTopics: Array.isArray(row.key_topics)
        ? row.key_topics.map((t) => String(t))
        : [],
      sourceMessageCount: Number(row.source_message_count || 0),
      createdAt: String(row.created_at),
      expiresAt: (row.expires_at as string | null) || null,
      }))
  }

  async updateFact(
    userId: string,
    factId: string,
    updates: Partial<Pick<MemoryFact, 'content' | 'factType' | 'confidence'>>
  ): Promise<boolean> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      last_observed_at: new Date().toISOString(),
    }

    if (updates.content !== undefined) {
      const content = this.normalizeFact(updates.content)
      if (!content || !this.isFactSafe(content, true)) {
        return false
      }
      payload.content = content
    }
    if (updates.factType !== undefined) {
      payload.fact_type = this.normalizeFactType(updates.factType)
    }
    if (updates.confidence !== undefined) {
      payload.confidence = this.normalizeConfidence(updates.confidence)
    }

    const { error } = await this.supabase
      .from('memory_facts')
      .update(payload)
      .eq('id', factId)
      .eq('user_id', userId)
      .eq('is_deleted', false)

    if (error) {
      console.error('Failed to update fact:', error)
      return false
    }

    await this.logMemoryEvent(userId, 'fact_updated', { factId })
    return true
  }

  async deleteFact(userId: string, factId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('memory_facts')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', factId)
      .eq('user_id', userId)
      .eq('is_deleted', false)

    if (error) {
      console.error('Failed to delete fact:', error)
      return false
    }

    await this.logMemoryEvent(userId, 'fact_deleted', { factId })
    return true
  }

  async clearAllMemory(userId: string): Promise<void> {
    const now = new Date().toISOString()
    await this.supabase
      .from('memory_facts')
      .update({ is_deleted: true, deleted_at: now, updated_at: now })
      .eq('user_id', userId)
      .eq('is_deleted', false)

    await this.supabase
      .from('conversation_summaries')
      .update({ is_deleted: true, deleted_at: now })
      .eq('user_id', userId)
      .eq('is_deleted', false)

    await this.logMemoryEvent(userId, 'memory_cleared', {})
  }

  async exportMemory(userId: string): Promise<{
    exportedAt: string
    settings: MemorySettings
    facts: MemoryFact[]
    summaries: ConversationSummary[]
  }> {
    const settings = await this.getSettings(userId)
    const facts = await this.listFacts(userId, 500)
    const summaries = await this.listSummaries(userId, 200)

    await this.logMemoryEvent(userId, 'memory_exported', {
      facts: facts.length,
      summaries: summaries.length,
    })

    return {
      exportedAt: new Date().toISOString(),
      settings,
      facts,
      summaries,
    }
  }

  async pruneExpiredMemory(userId: string): Promise<void> {
    const now = new Date().toISOString()

    await this.supabase
      .from('memory_facts')
      .update({
        is_deleted: true,
        deleted_at: now,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .lt('expires_at', now)

    await this.supabase
      .from('conversation_summaries')
      .update({
        is_deleted: true,
        deleted_at: now,
      })
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .lt('expires_at', now)
  }

  private async fetchRecentMessages(
    conversationId: string,
    limit: number
  ): Promise<ChatMessage[]> {
    const { data: messages, error } = await this.supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching conversation history:', error)
      return []
    }

    if (!messages) return []

    return messages
      .reverse()
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))
  }

  private async fetchLatestSummary(conversationId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('conversation_summaries')
      .select('summary_text, expires_at')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Error fetching conversation summary:', error)
      return null
    }

    if (!data || data.length === 0) return null
    const now = Date.now()
    const active = data.find(
      (row) => !row.expires_at || new Date(String(row.expires_at)).getTime() > now
    )
    return active?.summary_text || null
  }

  private async fetchRelevantFacts(
    userId: string,
    conversationId: string,
    query: string,
    limit: number
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('memory_facts')
      .select('content, conversation_id, updated_at, expires_at')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(100)

    if (error || !data) {
      if (error) console.error('Error fetching memory facts:', error)
      return []
    }

    const now = Date.now()
    const activeData = data.filter(
      (fact) => !fact.expires_at || new Date(String(fact.expires_at)).getTime() > now
    )
    const terms = this.extractQueryTerms(query)
    const ranked = activeData
      .filter((fact) => !fact.conversation_id || fact.conversation_id === conversationId)
      .map((fact) => ({
        content: fact.content as string,
        score: this.scoreFact(
          fact.content as string,
          terms,
          fact.conversation_id === conversationId
        ),
      }))
      .filter((fact) => fact.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    if (ranked.length > 0) {
      return ranked.map((fact) => fact.content)
    }

    return activeData
      .filter((fact) => !fact.conversation_id || fact.conversation_id === conversationId)
      .slice(0, limit)
      .map((fact) => fact.content as string)
  }

  private composeMemoryMessage(summary: string | null, facts: string[]): ChatMessage | null {
    if (!summary && facts.length === 0) return null

    const lines: string[] = []
    lines.push('Memory context (use only when relevant):')

    if (summary) {
      lines.push(`Conversation summary: ${summary}`)
    }

    if (facts.length > 0) {
      lines.push('Durable facts:')
      for (const fact of facts) {
        lines.push(`- ${fact}`)
      }
    }

    return {
      role: 'assistant',
      content: lines.join('\n'),
    }
  }

  private extractQueryTerms(query: string): string[] {
    return Array.from(
      new Set(
        query
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
      )
    )
  }

  private scoreFact(content: string, terms: string[], inConversation: boolean): number {
    const lower = content.toLowerCase()
    let score = inConversation ? 1 : 0
    for (const term of terms) {
      if (lower.includes(term)) {
        score += 2
      }
    }
    return score
  }

  private extractHeuristicFacts(userMessage: string): MemoryFactCandidate[] {
    const text = userMessage.trim()
    const facts: MemoryFactCandidate[] = []

    const patterns: Array<{
      regex: RegExp
      type: MemoryFactCandidate['type']
      confidence: number
      transform: (match: RegExpMatchArray) => string
    }> = [
      {
        regex: /\bmy name is ([a-zA-Z][a-zA-Z\s'-]{1,40})/i,
        type: 'profile',
        confidence: 0.9,
        transform: (m) => `User name is ${m[1].trim()}`,
      },
      {
        regex: /\bcall me ([a-zA-Z][a-zA-Z\s'-]{1,40})/i,
        type: 'preference',
        confidence: 0.85,
        transform: (m) => `User prefers to be called ${m[1].trim()}`,
      },
      {
        regex: /\bI prefer (.+)/i,
        type: 'preference',
        confidence: 0.75,
        transform: (m) => `User preference: ${m[1].trim().replace(/[.?!]+$/, '')}`,
      },
      {
        regex: /\bI want (.+)/i,
        type: 'goal',
        confidence: 0.7,
        transform: (m) => `User goal: ${m[1].trim().replace(/[.?!]+$/, '')}`,
      },
      {
        regex: /\b(do not|don't) (.+)/i,
        type: 'constraint',
        confidence: 0.72,
        transform: (m) => `User constraint: ${m[1]} ${m[2].trim().replace(/[.?!]+$/, '')}`,
      },
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern.regex)
      if (!match) continue
      const content = this.normalizeFact(pattern.transform(match))
      if (!this.isFactSafe(content)) continue
      facts.push({
        type: pattern.type,
        content,
        confidence: pattern.confidence,
      })
    }

    return facts.slice(0, 5)
  }

  private async generateSummary(
    messages: ChatMessage[],
    client?: Anthropic
  ): Promise<{
    summary: string
    keyTopics: string[]
    facts: MemoryFactCandidate[]
  }> {
    if (!client) {
      return this.fallbackSummary(messages)
    }

    const transcript = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')

    try {
      const response = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 500,
        system: MEMORY_SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: transcript,
          },
        ],
      })

      const text =
        response.content[0]?.type === 'text' ? response.content[0].text : ''

      const parsed = this.parseMemorySummary(text)
      if (parsed) {
        return parsed
      }
    } catch (error) {
      console.error('Failed to generate LLM memory summary:', error)
    }

    return this.fallbackSummary(messages)
  }

  private parseMemorySummary(raw: string): {
    summary: string
    keyTopics: string[]
    facts: MemoryFactCandidate[]
  } | null {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      const summary = String(parsed.summary || '').trim()
      const keyTopics = Array.isArray(parsed.keyTopics)
        ? parsed.keyTopics.map((topic: unknown) => String(topic)).slice(0, 8)
        : []
      const facts = Array.isArray(parsed.facts)
        ? parsed.facts
            .map((f: unknown) => {
              const fact = f as {
                type?: string
                content?: string
                confidence?: number
              }
              const content = this.normalizeFact(String(fact.content || ''))
              const type = this.normalizeFactType(String(fact.type || 'context'))
              const confidence = this.normalizeConfidence(fact.confidence)
              if (!content || !this.isFactSafe(content)) return null
              return { type, content, confidence }
            })
            .filter(Boolean) as MemoryFactCandidate[]
        : []

      if (!summary) return null
      return { summary, keyTopics, facts }
    } catch {
      return null
    }
  }

  private fallbackSummary(messages: ChatMessage[]): {
    summary: string
    keyTopics: string[]
    facts: MemoryFactCandidate[]
  } {
    const tail = messages.slice(-8)
    const summary = tail
      .map((m) => `${m.role}: ${m.content}`)
      .join(' ')
      .slice(0, 700)

    return {
      summary: summary || 'Conversation is in progress.',
      keyTopics: [],
      facts: [],
    }
  }

  private async persistFacts(
    userId: string,
    conversationId: string,
    facts: MemoryFactCandidate[],
    settings: MemorySettings
  ): Promise<void> {
    const expiresAt = this.computeExpiry(settings.retentionDays)

    for (const fact of facts) {
      if (!fact.content || !this.isFactSafe(fact.content, settings.allowSensitiveMemory)) {
        continue
      }

      const normalizedContent = this.normalizeFact(fact.content)
      if (!normalizedContent) continue

      const { data: existing, error: lookupError } = await this.supabase
        .from('memory_facts')
        .select('id, confidence')
        .eq('user_id', userId)
        .eq('content', normalizedContent)
        .eq('is_deleted', false)
        .maybeSingle()

      if (lookupError) {
        console.error('Failed to lookup existing memory fact:', lookupError)
        continue
      }

      if (existing) {
        await this.supabase
          .from('memory_facts')
          .update({
            conversation_id: conversationId,
            confidence: Math.min(0.95, Number(existing.confidence || 0.5) + 0.05),
            updated_at: new Date().toISOString(),
            last_observed_at: new Date().toISOString(),
            expires_at: expiresAt,
          })
          .eq('id', existing.id)
      } else {
        await this.supabase.from('memory_facts').insert({
          user_id: userId,
          conversation_id: conversationId,
          fact_type: fact.type,
          content: normalizedContent,
          confidence: this.normalizeConfidence(fact.confidence),
          expires_at: expiresAt,
        })
      }
    }
  }

  private normalizeFactType(
    type: string
  ): 'preference' | 'profile' | 'goal' | 'constraint' | 'context' {
    if (
      type === 'preference' ||
      type === 'profile' ||
      type === 'goal' ||
      type === 'constraint'
    ) {
      return type
    }
    return 'context'
  }

  private normalizeConfidence(confidence: unknown): number {
    const value = typeof confidence === 'number' ? confidence : Number(confidence)
    if (Number.isNaN(value)) return 0.6
    return Math.max(0.1, Math.min(0.99, value))
  }

  private normalizeFact(content: string): string {
    return content.replace(/\s+/g, ' ').trim().slice(0, 240)
  }

  private normalizeRetentionDays(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_SETTINGS.retentionDays
    return Math.max(7, Math.min(3650, Math.round(value)))
  }

  private computeExpiry(retentionDays: number): string {
    return new Date(
      Date.now() + this.normalizeRetentionDays(retentionDays) * 24 * 60 * 60 * 1000
    ).toISOString()
  }

  private async logMemoryEvent(
    userId: string,
    eventType: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.supabase.from('memory_events').insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    })
    if (error) {
      console.error('Failed to log memory event:', error)
    }
  }

  private isFactSafe(content: string, allowSensitiveMemory: boolean = false): boolean {
    if (allowSensitiveMemory) {
      return true
    }

    const lower = content.toLowerCase()
    if (
      /(api[_-]?key|password|secret|access token|bearer|private key)/i.test(lower)
    ) {
      return false
    }
    if (/(sk-ant-|ghp_|xoxb-|xoxp-)/i.test(content)) {
      return false
    }
    return true
  }
}
