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
  excerpt?: string;
}

export interface BriefingResponse {
  items: BriefingItem[];
  overall_summary?: string;
  generated_at: string;
  missing_topics: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type Mode = 'calm' | 'balanced' | 'brave';

export interface BriefingRequest {
  request: string;
  system_preferences?: string;
  language: string;
  mode: Mode;
}
