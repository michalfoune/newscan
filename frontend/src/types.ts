export type Tone = 'positive' | 'neutral' | 'concerning';

export interface BriefingItem {
  headline: string;
  summary: string;
  category: string;
  why_it_matters?: string;
  tone: Tone;
}

export interface BriefingResponse {
  items: BriefingItem[];
  generated_at: string;
}

export interface BriefingRequest {
  request: string;
  system_preferences?: string;
}
