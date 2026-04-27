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


class BriefingRequest(BaseModel):
    request: str
    system_preferences: Optional[str] = None
    language: str = "en"
    mode: str = "balanced"  # "calm" | "balanced" | "brave"


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
    mode: str = "balanced"  # "calm" | "balanced" | "brave"


class ChatResponse(BaseModel):
    reply: str


class ChatStreamRequest(BaseModel):
    messages: List[ChatMessage]
    new_message: str
    context: str
    language: str = "en"
    mode: str = "balanced"
    system_preferences: Optional[str] = None
