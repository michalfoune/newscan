import json
import anthropic
from datetime import datetime, timezone
from models import BriefingRequest, BriefingResponse, BriefingItem
from news import fetch_articles

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

TOPIC_EXTRACTION_PROMPT = (
    "Extract the main news topics from the user's request as a JSON array of short "
    "search queries (2–5 words each). Return ONLY valid JSON with no other text. "
    'Example: ["Russia Ukraine war", "wildlife conservation", "space exploration"]. '
    "Maximum 4 topics."
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

MODE_INSTRUCTIONS: dict = {
    "calm": """
Content mode: CALM
- Return at most 3 news items total
- No graphic, violent, or viscerally distressing details — describe outcomes without vivid imagery
- Frame all concerning news with context and, where genuine, stabilizing perspective
- Include at least 1 positive or neutral story even if the user's query is heavy
- Use gentle, grounded language — avoid alarming words like "devastating", "catastrophic", "crisis"
- Overall tone should feel like a calm, trusted friend summarizing the day, not a news anchor
""",
    "balanced": """
Content mode: BALANCED
- Return up to 6 news items
- Cover news honestly but avoid sensationalism and graphic detail
- Use measured, factual language; maintain a natural mix of tones
- Apply any user preferences where set
""",
    "brave": """
Content mode: BRAVE
- Return up to 8 news items
- Standard journalistic directness — report facts and outcomes as found in the source material
- Do not soften language or filter for emotional impact
- Suitable for users who want complete, unfiltered news awareness
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


def _filter_excerpts(items: list[BriefingItem], client: anthropic.Anthropic) -> list[BriefingItem]:
    """For each item, keep only the excerpt sentences relevant to its headline.
    Handles aggregator pages that concatenate unrelated stories into one body."""
    indices = [i for i, item in enumerate(items) if item.excerpt]
    if not indices:
        return items

    payload = [{"i": i, "headline": items[i].headline, "text": items[i].excerpt} for i in indices]
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=(
            "You receive a JSON array of objects with 'i', 'headline', and 'text' fields. "
            "The 'text' may contain content from multiple unrelated news stories concatenated together. "
            "For each object, extract and return only the sentences from 'text' that are directly relevant to 'headline'. "
            "If no relevant sentences exist, return an empty string for 'text'. "
            "Do not add, invent, or paraphrase — only use text that is present in the input. "
            "Return a JSON array with the same 'i' field and the filtered 'text'. No markdown."
        ),
        messages=[{"role": "user", "content": json.dumps(payload)}],
    )
    try:
        filtered = json.loads(_strip_fences(msg.content[0].text.strip()))
        by_index = {obj["i"]: obj["text"] for obj in filtered}
        result = list(items)
        for i, text in by_index.items():
            result[i] = result[i].model_copy(update={"excerpt": text or None})
        return result
    except (json.JSONDecodeError, KeyError):
        # Malformed response — return items with excerpts cleared to avoid showing garbage
        return [item.model_copy(update={"excerpt": None}) for item in items]


def _translate_excerpts(items: list[BriefingItem], client: anthropic.Anthropic) -> list[BriefingItem]:
    """Translate all item excerpts to Czech in one batched Haiku call."""
    indices = [i for i, item in enumerate(items) if item.excerpt]
    if not indices:
        return items

    payload = [{"i": i, "text": items[i].excerpt} for i in indices]
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=(
            "Translate the 'text' field of each object in the JSON array to Czech. "
            "Return a JSON array with the same objects, with 'text' replaced by the Czech translation. "
            "Preserve the 'i' field unchanged. Return ONLY valid JSON, no markdown."
        ),
        messages=[{"role": "user", "content": json.dumps(payload)}],
    )
    try:
        translated = json.loads(_strip_fences(msg.content[0].text.strip()))
        by_index = {obj["i"]: obj["text"] for obj in translated}
        result = list(items)
        for i, text in by_index.items():
            result[i] = result[i].model_copy(update={"excerpt": text})
        return result
    except (json.JSONDecodeError, KeyError):
        # Malformed response — return items with untranslated excerpts rather than crashing
        return items


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
# Main entry point
# ---------------------------------------------------------------------------

def generate_briefing(req: BriefingRequest) -> BriefingResponse:
    client = anthropic.Anthropic()

    # Pass 1: extract topics
    topics = _extract_topics(req.request, client)

    # Pass 2: fetch real articles (fewer for Calm mode)
    max_per_topic = {"calm": 3, "balanced": 5, "brave": 7}.get(req.mode, 5)
    articles = fetch_articles(topics, max_per_topic=max_per_topic)

    now = datetime.now(timezone.utc)

    if not articles:
        return BriefingResponse(items=[], generated_at=now.isoformat(), missing_topics=topics)

    # Identify which topics returned no articles
    topics_with_articles = {a["topic"] for a in articles}
    missing_topics = [t for t in topics if t not in topics_with_articles]

    # Pass 3: generate briefing grounded in real articles
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

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )

    try:
        data = json.loads(_strip_fences(message.content[0].text.strip()))
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse briefing response as JSON: {e}") from e

    # Bundle (datetime, url, source) per article, most recent first, deduplicated by url
    seen: set[str] = set()
    article_meta: list[tuple[str, str, str, str]] = []
    for a in sorted(articles, key=lambda a: a["datetime"], reverse=True):
        url = a.get("url", "")
        if url and url not in seen:
            seen.add(url)
            article_meta.append((
                a["datetime"] or now.isoformat(),
                url,
                a.get("source", ""),
                a.get("body", ""),
            ))

    items = []
    for i, raw_item in enumerate(data["items"]):
        # Drop placeholder items Claude generates for topics with no articles
        if raw_item.pop("no_articles", False) or raw_item.get("category", "").upper() == "UNAVAILABLE":
            continue
        published_at, url, source, excerpt = article_meta[i % len(article_meta)] if article_meta else (now.isoformat(), "", "", "")
        items.append(BriefingItem(
            **raw_item,
            published_at=published_at,
            url=url or None,
            source=source or None,
            excerpt=excerpt or None,
        ))

    items = _filter_excerpts(items, client)

    if req.language == "cs":
        items = _translate_excerpts(items, client)

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
        generated_at=now.isoformat(),
        missing_topics=missing_topics,
    )
