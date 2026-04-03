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
    excerpt: Optional[str] = None


class BriefingRequest(BaseModel):
    request: str
    system_preferences: Optional[str] = None
    language: str = "en"


class BriefingResponse(BaseModel):
    items: List[BriefingItem]
    generated_at: str
