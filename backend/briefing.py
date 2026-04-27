import json
import anthropic
from datetime import datetime, timezone
from models import BriefingRequest, BriefingResponse, BriefingItem
from news import fetch_articles

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

TOPIC_EXTRACTION_PROMPT = (
    "Extract the single strongest news topic from the user's request as a JSON array with one element. "
    "Use 2–3 nouns or proper nouns only — no verbs, adjectives, or question words. "
    "The term must be something that would literally appear in a news headline. "
    'Example: ["Ukraine ceasefire"] or ["Fed interest rates"] or ["Gaza conflict"]. '
    "For broad requests (e.g. 'top news today'), return [\"world news\"]. "
    "Return ONLY valid JSON. Exactly 1 topic."
)

BRIEFING_SYSTEM_PROMPT = """You are Rizma Brief, an AI that generates personalized, emotionally sustainable news briefings.

Your role is to help users stay informed without emotional overload, clickbait, or doomscrolling.

Core principles:
- Base your briefing ONLY on the provided article excerpts — do not invent facts
- Use measured, clear language. No sensational framing, no clickbait headlines
- Avoid graphic detail and emotionally manipulative framing
- Keep summaries concise: 2–3 sentences, high-signal, no filler
- Respect any balance rules the user sets (e.g. max concerning stories)
- If no articles are provided for a requested topic, omit it gracefully

Output: Return ONLY a valid JSON object. No markdown, no code fences, no text outside the JSON.

Schema:
{
  "overall_summary": "2–3 sentence synthesis of the full briefing. What is the big picture?",
  "items": [
    {
      "headline": "Calm, factual headline",
      "summary": "2–3 sentence factual summary.",
      "category": "Category label",
      "why_it_matters": "One sentence. Omit if not helpful.",
      "tone": "positive" | "neutral" | "concerning",
      "no_articles": false
    }
  ]
}

IMPORTANT: If you have no source articles for a topic, set "no_articles": true on that item. Do NOT set it to true for items that have real source articles."""

MODE_ARTICLE_COUNTS: dict = {
    "calm": 2,
    "balanced": 3,
    "brave": 4,
}

MODE_INSTRUCTIONS: dict = {
    "calm": f"""
Content mode: CALM
- Return at most {MODE_ARTICLE_COUNTS['calm']} news items total
- No graphic, violent, or viscerally distressing details — describe outcomes without vivid imagery
- Frame all concerning news with context and, where genuine, stabilizing perspective
- Include at least 1 positive or neutral story even if the user's query is heavy
- Use gentle, grounded language — avoid alarming words like "devastating", "catastrophic", "crisis"
- Overall tone should feel like a calm, trusted friend summarizing the day, not a news anchor
- Order items from least to most concerning: positive stories first, neutral next, concerning last
""",
    "balanced": f"""
Content mode: BALANCED
- Return up to {MODE_ARTICLE_COUNTS['balanced']} news items
- Cover news honestly but avoid sensationalism and graphic detail
- Use measured, factual language; maintain a natural mix of tones
- Apply any user preferences where set
- Order items by tone first: positive stories first, neutral next, concerning last
- Exception: if one story is clearly far more significant or directly relevant than the others, place it first regardless of tone — but only when the importance gap is substantial, not as a general rule
""",
    "brave": f"""
Content mode: BRAVE
- Return up to {MODE_ARTICLE_COUNTS['brave']} news items
- Standard journalistic directness — report facts and outcomes as found in the source material
- Do not soften language or filter for emotional impact
- Suitable for users who want complete, unfiltered news awareness
- Order items by news significance and direct relevance to the user's request, most important first
""",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_fences(raw: str) -> str:
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return raw.strip()


def _extract_topics(request: str, client: anthropic.Anthropic) -> list[str]:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=TOPIC_EXTRACTION_PROMPT,
        messages=[{"role": "user", "content": request}],
    )
    return json.loads(_strip_fences(msg.content[0].text.strip()))




def _parse_streaming_items(accumulated: str, emitted_count: int) -> tuple[list[dict], int]:
    """Extract newly completed item objects from partial streaming JSON, skipping already-emitted ones."""
    marker_pos = accumulated.find('"items"')
    if marker_pos == -1:
        return [], emitted_count

    bracket = accumulated.find('[', marker_pos)
    if bracket == -1:
        return [], emitted_count

    new_items = []
    pos = bracket + 1
    found_count = 0

    while True:
        while pos < len(accumulated) and accumulated[pos] in ' \n\r\t,':
            pos += 1
        if pos >= len(accumulated) or accumulated[pos] != '{':
            break

        depth = 0
        in_string = False
        escape_next = False

        for i in range(pos, len(accumulated)):
            ch = accumulated[i]
            if escape_next:
                escape_next = False
                continue
            if in_string:
                if ch == '\\':
                    escape_next = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    found_count += 1
                    if found_count > emitted_count:
                        try:
                            new_items.append(json.loads(accumulated[pos:i + 1]))
                        except json.JSONDecodeError:
                            pass
                    pos = i + 1
                    break
        else:
            break

    return new_items, emitted_count + len(new_items)


def _build_article_context(articles: list[dict]) -> str:
    if not articles:
        return "No articles were retrieved."
    lines = []
    current_topic = None
    for a in articles:
        if a["topic"] != current_topic:
            current_topic = a["topic"]
            lines.append(f"\n[Topic: {current_topic}]")
        lines.append(f"- {a['title']} ({a['source']}, {a['datetime'][:10]})")
        if a["body"]:
            lines.append(f"  {a['body']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

def _build_prompt(req: BriefingRequest, articles: list[dict], missing_topics: list[str]) -> tuple[str, str]:
    """Return (system_prompt, user_message) for the Sonnet briefing call."""
    lang_instruction = {
        "en": "Respond entirely in English (US).",
        "cs": "Respond entirely in Czech (Česky). Headlines, summaries, categories, and why_it_matters must all be in fluent Czech.",
    }
    mode_instruction = MODE_INSTRUCTIONS.get(req.mode, MODE_INSTRUCTIONS["balanced"])
    system = (
        BRIEFING_SYSTEM_PROMPT
        + f"\n\n{mode_instruction.strip()}"
        + f"\n\nLanguage: {lang_instruction.get(req.language, lang_instruction['en'])}"
    )
    if req.system_preferences and req.system_preferences.strip():
        system += f"\n\nUser's persistent preferences:\n{req.system_preferences.strip()}"

    article_context = _build_article_context(articles)
    missing_note = (
        f"\nNote: No articles were found for these topics, do NOT generate items for them: {', '.join(missing_topics)}"
        if missing_topics else ""
    )
    user_message = (
        f"User request: {req.request}\n\n"
        f"Article excerpts to draw from:\n{article_context}"
        f"{missing_note}"
    )
    return system, user_message


def _build_article_meta(articles: list[dict], now_iso: str) -> list[tuple[str, str, str]]:
    seen: set[str] = set()
    meta: list[tuple[str, str, str]] = []
    for a in sorted(articles, key=lambda a: a["datetime"], reverse=True):
        url = a.get("url", "")
        if url and url not in seen:
            seen.add(url)
            meta.append((a["datetime"] or now_iso, url, a.get("source", "")))
    return meta


def generate_briefing_stream(req: BriefingRequest):
    """Generator that yields SSE-formatted strings as items arrive from Sonnet."""
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    topics = _extract_topics(req.request, client)
    yield f"event: status\ndata: {json.dumps({'stage': 'fetching'})}\n\n"

    max_per_topic = MODE_ARTICLE_COUNTS.get(req.mode, 4)
    articles = fetch_articles(topics, max_per_topic=max_per_topic)

    if not articles:
        yield f"event: done\ndata: {json.dumps({'overall_summary': None, 'generated_at': now_iso, 'missing_topics': topics})}\n\n"
        return

    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in topics if t not in topics_with_articles]

    system, user_message = _build_prompt(req, articles, missing_topics)
    article_meta = _build_article_meta(articles, now_iso)

    accumulated = ""
    emitted_count = 0
    item_index = 0

    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=1300,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        for chunk in stream.text_stream:
            accumulated += chunk
            new_items, emitted_count = _parse_streaming_items(accumulated, emitted_count)
            for raw_item in new_items:
                current_index = item_index
                item_index += 1
                if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
                    continue
                published_at, url, source = (
                    article_meta[current_index % len(article_meta)]
                    if article_meta else (now_iso, "", "")
                )
                try:
                    item = BriefingItem(
                        **raw_item,
                        published_at=published_at,
                        url=url or None,
                        source=source or None,
                    )
                    yield f"event: item\ndata: {item.model_dump_json()}\n\n"
                except Exception:
                    pass

    overall_summary = None
    try:
        data = json.loads(_strip_fences(accumulated.strip()))
        overall_summary = data.get("overall_summary")
    except json.JSONDecodeError:
        pass

    if overall_summary and req.language == "cs":
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system="Translate the following text to Czech. Return only the translated text, nothing else.",
                messages=[{"role": "user", "content": overall_summary}],
            )
            overall_summary = msg.content[0].text.strip()
        except Exception:
            pass

    yield f"event: done\ndata: {json.dumps({'overall_summary': overall_summary, 'generated_at': now_iso, 'missing_topics': missing_topics})}\n\n"


def generate_briefing(req: BriefingRequest) -> BriefingResponse:
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    topics = _extract_topics(req.request, client)

    max_per_topic = MODE_ARTICLE_COUNTS.get(req.mode, 4)
    articles = fetch_articles(topics, max_per_topic=max_per_topic)

    if not articles:
        return BriefingResponse(items=[], generated_at=now_iso, missing_topics=topics)

    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in topics if t not in topics_with_articles]

    system, user_message = _build_prompt(req, articles, missing_topics)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1300,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )

    try:
        data = json.loads(_strip_fences(message.content[0].text.strip()))
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse briefing response as JSON: {e}") from e

    article_meta = _build_article_meta(articles, now_iso)

    items = []
    for i, raw_item in enumerate(data["items"]):
        if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
            continue
        published_at, url, source = article_meta[i % len(article_meta)] if article_meta else (now_iso, "", "")
        items.append(BriefingItem(
            **raw_item,
            published_at=published_at,
            url=url or None,
            source=source or None,
        ))

    overall_summary = data.get("overall_summary")
    if overall_summary and req.language == "cs":
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system="Translate the following text to Czech. Return only the translated text, nothing else.",
            messages=[{"role": "user", "content": overall_summary}],
        )
        overall_summary = msg.content[0].text.strip()

    return BriefingResponse(
        items=items,
        overall_summary=overall_summary,
        generated_at=now_iso,
        missing_topics=missing_topics,
    )
