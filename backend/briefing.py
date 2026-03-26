import json
import anthropic
from datetime import datetime, timezone
from models import BriefingRequest, BriefingResponse, BriefingItem

SYSTEM_PROMPT = """You are Newscan, an AI that generates personalized, emotionally sustainable news briefings.

Your role is to help users stay informed without emotional overload, clickbait, or doomscrolling.

Core principles:
- Do NOT hide important reality — present it calmly and factually
- Use measured, clear language. No sensational framing, no clickbait headlines
- Avoid graphic detail and emotionally manipulative framing
- Keep summaries concise: 2–3 sentences, high-signal, no filler
- Respect any balance rules the user sets (e.g. max concerning stories)
- Use your knowledge of recent world events to construct the briefing

Output: Return ONLY a valid JSON object. No markdown, no code fences, no text outside the JSON.

Schema:
{
  "items": [
    {
      "headline": "Calm, factual headline",
      "summary": "2–3 sentence factual summary.",
      "category": "Category label",
      "why_it_matters": "One sentence. Omit if not helpful.",
      "tone": "positive" | "neutral" | "concerning"
    }
  ]
}"""


def generate_briefing(req: BriefingRequest) -> BriefingResponse:
    system = SYSTEM_PROMPT
    if req.system_preferences and req.system_preferences.strip():
        system += f"\n\nUser's persistent preferences (apply to every briefing):\n{req.system_preferences.strip()}"

    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": req.request}],
    )

    raw = message.content[0].text.strip()

    # Strip accidental markdown code fences
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    data = json.loads(raw)
    items = [BriefingItem(**item) for item in data["items"]]

    return BriefingResponse(
        items=items,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
