import type { ModelOption } from '../types/chat';

export const GEMINI_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Taya',
    summary: 'Fast, intelligent responses for chat, live web search, coding, and photo editing',
    contextWindow: '1M context',
  },
];

export const THINKING_LEVEL_OPTIONS = [
  {
    value: 'LOW' as const,
    label: 'Low',
    description: 'Fastest replies',
  },
  {
    value: 'MEDIUM' as const,
    label: 'Medium',
    description: 'Balanced speed',
  },
  {
    value: 'HIGH' as const,
    label: 'High',
    description: 'Default reasoning',
  },
  {
    value: 'XHIGH' as const,
    label: 'Max',
    description: 'Deepest analysis',
  },
];

export const SYSTEM_PROMPT_PRESETS = [
  {
    label: 'Default Assistant',
    prompt:
      'You are Taya, a thoughtful, accurate, and conversational AI assistant. Answer clearly like ChatGPT with helpful structure, headings or lists when useful, and fenced code blocks with language identifiers.',
  },
  {
    label: 'Concise Technical',
    prompt:
      'Be direct and concise. Prioritize working code examples, precise technical terminology, and clear step-by-step explanations without filler.',
  },
  {
    label: 'Code Reviewer',
    prompt:
      'Act as a senior software engineer reviewing code. Identify correctness bugs, edge cases, performance bottlenecks, and maintainability improvements with concrete diffs.',
  },
  {
    label: 'Writing Editor',
    prompt:
      'Act as an editorial writing partner. Improve clarity, rhythm, and precision while preserving the author’s voice. Explain key structural edits briefly.',
  },
];

export const STARTER_PROMPTS = [
  {
    title: 'Latest global tech & AI updates',
    description: 'Search live web sources for current news and key developments today.',
    prompt:
      'What are the most notable technology and AI developments happening right now? Summarize with key details and sources.',
  },
  {
    title: 'Compare SQL indexing strategies',
    description: 'Break down B-tree vs GIN indexes in PostgreSQL with concrete query examples.',
    prompt:
      'Compare B-tree and GIN indexes in PostgreSQL. When should I choose each, what are the write-amplification trade-offs, and how do query plans differ?',
  },
  {
    title: 'Draft a product launch brief',
    description: 'Outline goals, target audience, key messaging, and rollout milestones.',
    prompt:
      'Help me structure a concise 1-page product launch brief for a developer CLI tool. Include sections for positioning, core workflow, launch checklist, and success criteria.',
  },
  {
    title: 'Design a rate limiter algorithm',
    description: 'Walk through token bucket vs sliding window log with pros, cons, and code.',
    prompt:
      'Compare the Token Bucket and Sliding Window Log rate limiting algorithms, then implement a clean TypeScript token bucket limiter with unit-testable time injection.',
  },
];
