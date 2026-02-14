import { SupabaseClient } from '@supabase/supabase-js'

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

export class MemoryManager {
    constructor(private supabase: SupabaseClient) { }

    /**
     * Retrieves the recent conversation history for a given conversation ID.
     * Filters out system messages and ensures the correct format for Anthropic API.
     *
     * @param conversationId The ID of the conversation to fetch history for.
     * @param limit The maximum number of messages to retrieve (default: 10).
     * @returns An array of formatted messages.
     */
    async getContext(conversationId: string, limit: number = 10): Promise<ChatMessage[]> {
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

        if (!messages) {
            return []
        }

        // Reverse to get chronological order (oldest first)
        // Map to Anthropic format
        const formattedMessages = messages
            .reverse()
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
            }))

        return formattedMessages
    }
}
