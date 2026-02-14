import { create } from 'zustand'
import type { Message, Conversation } from '@/types/chat'

interface ChatStore {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  sandboxStatus: string | null

  // Actions
  setConversations: (convs: Conversation[]) => void
  setCurrentConversation: (id: string | null) => void
  setMessages: (msgs: Message[]) => void
  addMessage: (msg: Message) => void
  updateLastMessage: (content: string) => void
  updateLastMessageMetadata: (metadata: Partial<Message['metadata']>) => void
  setStreaming: (streaming: boolean) => void
  setLoading: (loading: boolean) => void
  setSandboxStatus: (status: string | null) => void
  addConversation: (conv: Conversation) => void
  removeConversation: (id: string) => void
  updateConversationTitle: (id: string, title: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  sandboxStatus: null,

  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (id) => set({ currentConversationId: id, messages: [] }),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastMessage: (content) => set((s) => {
    const msgs = [...s.messages]
    if (msgs.length > 0) {
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
    }
    return { messages: msgs }
  }),
  updateLastMessageMetadata: (metadata) => set((s) => {
    const msgs = [...s.messages]
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1]
      msgs[msgs.length - 1] = {
        ...last,
        metadata: { ...last.metadata, ...metadata },
      }
    }
    return { messages: msgs }
  }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setLoading: (isLoading) => set({ isLoading }),
  setSandboxStatus: (sandboxStatus) => set({ sandboxStatus }),
  addConversation: (conv) => set((s) => ({
    conversations: [conv, ...s.conversations],
  })),
  removeConversation: (id) => set((s) => ({
    conversations: s.conversations.filter((c) => c.id !== id),
    currentConversationId: s.currentConversationId === id ? null : s.currentConversationId,
  })),
  updateConversationTitle: (id, title) => set((s) => ({
    conversations: s.conversations.map((c) =>
      c.id === id ? { ...c, title } : c
    ),
  })),
}))
