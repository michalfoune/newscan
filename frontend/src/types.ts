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
  generated_at: string;
  missing_topics: string[];
}

export interface BriefingRequest {
  request: string;
  system_preferences?: string;
  language: string;
}
