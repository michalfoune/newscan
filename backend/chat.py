import anthropic
from models import ChatRequest, ChatResponse

CHAT_SYSTEM = """You are Rizma Brief, an AI news assistant.

The user has just received a news briefing. Your job is to answer follow-up questions about the news covered in that briefing.

Guidelines:
- Answer only based on the provided briefing context — do not invent facts
- Keep answers concise and calm — this is a news digest, not a debate
- If the user asks about something not covered in the briefing, say so clearly
- Use measured, factual language consistent with the briefing tone"""


def answer_followup(req: ChatRequest) -> ChatResponse:
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky).",
    }

    system = (
        CHAT_SYSTEM
        + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
        + f"\n\nBriefing context:\n{req.context}"
    )

    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system,
        messages=[{"role": m.role, "content": m.content} for m in req.messages],
    )

    return ChatResponse(reply=message.content[0].text.strip())
