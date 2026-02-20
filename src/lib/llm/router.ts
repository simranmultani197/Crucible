import Anthropic from '@anthropic-ai/sdk'
import { ROUTER_SYSTEM_PROMPT } from './prompts'

export type IntentType = 'chat' | 'code_exec' | 'file_analysis'

export interface RouterResult {
  intent: IntentType
  reasoning: string
  suggestedPackages: string[]
  language: string
}

export async function classifyIntent(
  query: string,
  hasAttachment: boolean,
  client: Anthropic
): Promise<RouterResult> {
  const userMessage = hasAttachment
    ? `[User has attached a file] ${query}`
    : query

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: ROUTER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    // Extract JSON from response robustly
    let jsonStr = text
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')

    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
    }

    return JSON.parse(jsonStr)
  } catch (error) {
    // Default to chat if parsing fails
    console.error('Failed to parse router response', error, text)
    return {
      intent: hasAttachment ? 'file_analysis' : 'chat',
      reasoning: 'Failed to parse router response, defaulting',
      suggestedPackages: [],
      language: 'none',
    }
  }
}
