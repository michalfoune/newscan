import json
import logging
from typing import Optional, Tuple
import anthropic
from models import ChatRequest, ChatResponse, ChatStreamRequest
from news import fetch_articles

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are Rizma Brief, an AI news assistant. Answer the user's follow-up questions based on the provided briefing context and any supplemental articles included in the context.

Guidelines:
- Answer directly and concisely from the provided context
- Do NOT mention fetching, searching, or any internal mechanics — just answer
- Do NOT offer to look things up, fetch more articles, or suggest the user ask again — simply answer what you know from the context
- If specific details are not in the context, say so in one sentence and move on
- Use measured, factual language; no emojis"""

CHAT_MODE_INSTRUCTIONS: dict = {
    "calm": "Tone: Use gentle, reassuring language. Avoid alarming words. Frame difficult facts with context. Keep answers brief.",
    "balanced": "Tone: Be honest and clear without sensationalism. Balanced, measured responses.",
    "brave": "Tone: Direct, journalistic. Report facts plainly without softening. Full detail where relevant.",
}

CLASSIFIER_PROMPT = """You are a routing assistant. Given a briefing context and a user question, decide whether the question can be answered SPECIFICALLY AND DIRECTLY from the context alone.

Return ONLY valid JSON with this shape:
{"answerable": true/false, "search_query": "concise search terms if not answerable, else null"}

Rules:
- answerable: true  → the context EXPLICITLY contains the specific information needed
- answerable: false → the specific detail is absent from the context, OR the user is explicitly asking to look up / find / search for more articles or information
- When in doubt, prefer answerable: false so fresh articles can be fetched
- search_query → a short keyword query derived from the conversation topic (e.g. "Lebanon ceasefire Iran war 2026")

Examples:
- Context covers Iran war broadly, user asks about Lebanon ceasefire → answerable: false, search_query: "Lebanon ceasefire Iran war 2026"
- User says "can you look up more articles" or "find more info" → answerable: false, search_query: infer from the conversation topic
- User asks about something explicitly stated in the context → answerable: true"""

CLASSIFIER_PROMPT_V2 = """You are a routing assistant for a news briefing app. Given a summary of covered topics, conversation history, and the latest user message, decide what action to take:

- "answer": Answer a question directly from the existing briefing (user is asking about something already covered)
- "fetch": Fetch supplemental articles on a topic already covered and answer as text (user wants more detail on an existing topic)
- "brief": Generate a new briefing on a different or more specific topic

Return ONLY valid JSON:
{"action": "answer" | "fetch" | "brief", "query": "derive from USER'S MESSAGE or recent conversation — never from the briefing context"}

CRITICAL RULES:
- "Give me a brief on X", "Give me news on X", "Give me an update on X", "New brief on X" → ALWAYS "brief", query = X
- "No, new brief" / "New brief" with no topic → "brief", query = the topic being discussed in recent conversation
- When action is "brief", the query MUST come from the LATEST MESSAGE ONLY — do not add terms from conversation history or briefing context
- Only use "answer" when the user's question is directly and fully answered by the existing briefing
- Prefer "brief" over "fetch" whenever the user explicitly uses the word "brief", "update", or "news on"

Examples:
- "Give me a brief on Tesla" → {"action": "brief", "query": "Tesla news"}
- "Give me an update on Deloitte layoffs" → {"action": "brief", "query": "Deloitte layoffs"}
- "No, new brief" after discussing Meta layoffs → {"action": "brief", "query": "Meta layoffs"}
- "No: new brief on Deloitte and Meta cutting staff" → {"action": "brief", "query": "Deloitte Meta staff cuts"}
- "What caused this?" about events in the briefing → {"action": "answer", "query": null}
- "Tell me more about the ceasefire" when context covers it → {"action": "fetch", "query": "ceasefire latest"}
- "What else is happening in Ukraine?" → {"action": "fetch", "query": "Ukraine war news"}"""


def _classify(context: str, question: str) -> Tuple[bool, Optional[str]]:
    client = anthropic.Anthropic()
    prompt = (
        f"Briefing context:\n{context}\n\n"
        f"User question: {question}\n\n"
        "Is this answerable from the context?"
    )
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=128,
            system=CLASSIFIER_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        answerable = bool(data.get("answerable", True))
        search_query = data.get("search_query")
        logger.info(f"[classify] answerable={answerable} search_query={search_query!r}")
        return answerable, search_query
    except Exception as e:
        logger.warning(f"[classify] failed ({e}), defaulting to answerable=True")
        return True, None


def _classify_v2(context: str, question: str) -> Tuple[str, Optional[str]]:
    client = anthropic.Anthropic()
    prompt = f"Briefing context:\n{context}\n\nConversation:\n{question}"
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=128,
            system=CLASSIFIER_PROMPT_V2,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        action = data.get("action", "answer")
        if action not in ("answer", "fetch", "brief"):
            action = "answer"
        query = data.get("query")
        logger.info(f"[classify_v2] action={action} query={query!r}")
        return action, query
    except Exception as e:
        logger.warning(f"[classify_v2] failed ({e}), defaulting to answer")
        return "answer", None


def _build_supplemental_context(search_query: str) -> str:
    try:
        articles = fetch_articles([search_query], max_per_topic=4)
        logger.info(f"[supplemental] fetched {len(articles)} articles for query={search_query!r}")
        if not articles:
            return ""
        lines = ["Supplemental articles fetched for this question:"]
        for a in articles:
            lines.append(f"\nTitle: {a['title']}")
            lines.append(f"Source: {a['source']}")
            if a.get("body"):
                lines.append(f"Body: {a['body']}")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"[supplemental] fetch failed: {e}")
        return ""


def answer_followup(req: ChatRequest) -> ChatResponse:
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky).",
    }

    last_user_msg = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), ""
    )
    recent_history = "\n".join(
        f"{m.role.upper()}: {m.content}" for m in req.messages[-6:]
    )

    answerable, search_query = _classify(
        req.context,
        f"Recent conversation:\n{recent_history}\n\nLatest question: {last_user_msg}",
    )

    supplemental = ""
    if not answerable and search_query:
        supplemental = _build_supplemental_context(search_query)

    context_block = req.context
    if supplemental:
        context_block += f"\n\n---\n{supplemental}"

    mode_instruction = CHAT_MODE_INSTRUCTIONS.get(req.mode, CHAT_MODE_INSTRUCTIONS["balanced"])
    system = (
        CHAT_SYSTEM
        + f"\n\n{mode_instruction}"
        + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
        + f"\n\nBriefing context:\n{context_block}"
    )

    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system,
        messages=[{"role": m.role, "content": m.content} for m in req.messages],
    )
    return ChatResponse(reply=message.content[0].text.strip())


def answer_followup_stream(req: ChatStreamRequest):
    """SSE generator for streaming chat responses.

    Events emitted:
      status      {"stage": "thinking"|"fetching"}
      reply_chunk {"chunk": "..."}          — text answer (streamed)
      reply_done  {}                         — text answer complete
      brief_item  {BriefingItem}             — new-topic briefing item
      brief_done  {"overall_summary":..., "generated_at":..., "missing_topics":..., "query":"..."}
      done        {}                         — entire response complete
    """
    from briefing import generate_briefing_stream
    from models import BriefingRequest

    client = anthropic.Anthropic()
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky).",
    }

    yield f"event: status\ndata: {json.dumps({'stage': 'thinking'})}\n\n"

    # Truncate context to headlines only — full article text confuses the classifier
    short_context = req.context[:700] + ("…" if len(req.context) > 700 else "")
    # Truncate long assistant messages in history so they don't drown the user's intent
    recent_msgs = req.messages[-6:]
    recent_history = "\n".join(
        f"{m.role.upper()}: {m.content[:250]}{'…' if len(m.content) > 250 else ''}"
        for m in recent_msgs
    )
    classify_input = f"Latest message: {req.new_message}\n\nRecent conversation:\n{recent_history}"

    action, query = _classify_v2(short_context, classify_input)

    if action == "brief":
        yield f"event: status\ndata: {json.dumps({'stage': 'fetching_brief'})}\n\n"

        brief_req = BriefingRequest(
            request=query or req.new_message,
            language=req.language,
            mode=req.mode,
            system_preferences=req.system_preferences,
        )

        for event in generate_briefing_stream(brief_req):
            if event.startswith("event: status\n"):
                continue
            elif event.startswith("event: item\n"):
                yield event.replace("event: item\n", "event: brief_item\n", 1)
            elif event.startswith("event: done\n"):
                data_part = event[len("event: done\ndata: "):].rstrip("\n")
                done_data = json.loads(data_part)
                done_data["query"] = query or req.new_message
                yield f"event: brief_done\ndata: {json.dumps(done_data)}\n\n"
            else:
                yield event

    else:
        supplemental = ""
        if action == "fetch" and query:
            yield f"event: status\ndata: {json.dumps({'stage': 'fetching_articles'})}\n\n"
            supplemental = _build_supplemental_context(query)

        context_block = req.context
        if supplemental:
            context_block += f"\n\n---\n{supplemental}"

        mode_instruction = CHAT_MODE_INSTRUCTIONS.get(req.mode, CHAT_MODE_INSTRUCTIONS["balanced"])
        system = (
            CHAT_SYSTEM
            + f"\n\n{mode_instruction}"
            + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
            + f"\n\nBriefing context:\n{context_block}"
        )

        messages_for_api = [{"role": m.role, "content": m.content} for m in req.messages]
        messages_for_api.append({"role": "user", "content": req.new_message})

        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            messages=messages_for_api,
        ) as stream:
            for chunk in stream.text_stream:
                yield f"event: reply_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"

        yield f"event: reply_done\ndata: {{}}\n\n"

    yield f"event: done\ndata: {{}}\n\n"
