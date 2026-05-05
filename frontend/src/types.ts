export type Tone = 'positive' | 'neutral' | 'concerning';

export interface BriefingItem {
  headline: string;
  summary: string;
  category: string;
  why_it_matters?: string;
  tone: Tone;
  published_at: string;
  url?: string;
  source?: string;
}

export interface BriefingResponse {
  items: BriefingItem[];
  overall_summary?: string;
  generated_at: string;
  missing_topics: string[];
  keyword_trimmed?: boolean;
  topics?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ThreadItem =
  | { type: 'message'; role: 'user' | 'assistant'; content: string }
  | { type: 'briefing'; response: BriefingResponse; mode: Mode; query: string; generationSeconds?: number };

export interface Conversation {
  id: string;
  query: string;
  response: BriefingResponse;
  thread: ThreadItem[];
  mode: Mode;
  language: string;
  timestamp: number;
}

export type Mode = 'calm' | 'balanced' | 'brave';

export type ModelQuality = 'fast' | 'standard' | 'best';

export interface ArticleCounts {
  calm: number;
  balanced: number;
  brave: number;
}

export interface BriefingRequest {
  request: string;
  system_preferences?: string;
  language: string;
  mode: Mode;
  model_quality?: ModelQuality;
  article_counts?: ArticleCounts;
}
