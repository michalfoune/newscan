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


class BriefingRequest(BaseModel):
    request: str
    system_preferences: Optional[str] = None


class BriefingResponse(BaseModel):
    items: List[BriefingItem]
    generated_at: str
