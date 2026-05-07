from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class Tone(str, Enum):
    positive = "positive"
    neutral = "neutral"
    concerning = "concerning"


class BriefingItem(BaseModel):
    headline: str
    summary: str
    category: str
    why_it_matters: Optional[str] = None
    tone: Tone
    published_at: str
    url: Optional[str] = None
    source: Optional[str] = None
    source_title: Optional[str] = None
    source_body: Optional[str] = None


class BriefingRequest(BaseModel):
    request: str
    system_preferences: Optional[str] = None
    language: str = "en"
    mode: str = "calm"  # "calm" | "balanced" | "brave"
    model_quality: str = "fast"  # "fast" | "standard" | "best"
    article_counts: Optional[dict] = None  # {"calm": 2, "balanced": 3, "brave": 4}
    news_source: str = "gnews"  # "eventregistry" | "gnews"
    location: str = "us"  # "us" | "california" | "europe" | "global"


class BriefingResponse(BaseModel):
    items: List[BriefingItem]
    overall_summary: Optional[str] = None
    generated_at: str
    missing_topics: List[str] = []


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: str  # briefing content as plain text
    language: str = "en"
    mode: str = "calm"  # "calm" | "balanced" | "brave"


class ChatResponse(BaseModel):
    reply: str


class ChatStreamRequest(BaseModel):
    messages: List[ChatMessage]
    new_message: str
    context: str
    language: str = "en"
    mode: str = "calm"
    system_preferences: Optional[str] = None
    model_quality: str = "fast"  # "fast" | "standard" | "best"
    article_counts: Optional[dict] = None
    news_source: str = "gnews"  # "eventregistry" | "gnews"
    location: str = "us"  # "us" | "california" | "europe" | "global"
