import Anthropic from '@anthropic-ai/sdk'
import { CODE_GEN_SYSTEM_PROMPT, SUMMARIZE_SYSTEM_PROMPT } from './prompts'

export async function generateCode(
  query: string,
  packages: string[],
  conversationHistory: Array<{ role: string; content: string }>,
  client: Anthropic,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<string> {
  const messages = [
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: `Available packages: ${packages.join(', ')}\n\nUser request: ${query}\n\nWrite Python code to accomplish this task.`,
    },
  ]

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: CODE_GEN_SYSTEM_PROMPT,
    messages,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Extract code from markdown code block
  const codeMatch = text.match(/```python\n([\s\S]*?)```/)
  if (codeMatch) return codeMatch[1].trim()

  // If no code block, try to use the whole response
  const cleanCode = text.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()
  return cleanCode
}

export async function summarizeResults(
  query: string,
  executionOutput: string,
  error: string | undefined,
  filesCreated: string[],
  client: Anthropic,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<string> {
  const resultContext = error
    ? `The code execution failed with error:\n${error}\n\nStdout before error:\n${executionOutput}`
    : `The code executed successfully.\n\nOutput:\n${executionOutput}${filesCreated.length > 0 ? `\n\nFiles created: ${filesCreated.join(', ')}` : ''}`

  const response = await client.messages.create({
    model,
    max_tokens: 500,
    system: SUMMARIZE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `User's request: "${query}"\n\n${resultContext}\n\nSummarize the results for the user.`,
      },
    ],
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Execution completed.'
}
