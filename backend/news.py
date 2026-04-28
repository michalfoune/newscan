import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Optional
from eventregistry import EventRegistry, QueryArticlesIter

_cache: dict = {}
_CACHE_TTL = 300  # 5 minutes


def fetch_articles(topics: list[str], max_per_topic: int = 4) -> list[dict]:
    """Fetch recent English-language articles for each topic from NewsAPI.ai, in parallel."""
    api_key = os.environ.get("NEWS_API_KEY")
    if not api_key:
        raise ValueError("NEWS_API_KEY is not set in environment")

    date_start_2d = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    date_start_7d = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    def _run_query(er: EventRegistry, keywords: Optional[str], date_start: str = date_start_2d) -> list[dict]:
        kwargs = dict(lang="eng", dateStart=date_start, dataType=["news"])
        if keywords:
            kwargs["keywords"] = keywords
        q = QueryArticlesIter(**kwargs)
        results = []
        seen: set[str] = set()
        for article in q.execQuery(er, sortBy="date", maxItems=max_per_topic * 2):
            url = article.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)
            raw_body = article.get("body") or ""
            body = raw_body[:800].replace("\\", " ").replace('"', "'").replace("\r", " ").strip()
            results.append({
                "topic": keywords or "news",
                "title": article.get("title", "").strip().replace("\\", " ").replace('"', "'"),
                "body": body,
                "source": article.get("source", {}).get("title", "Unknown"),
                "datetime": article.get("dateTime", ""),
                "url": url,
            })
            if len(results) >= max_per_topic:
                break
        return results

    def fetch_topic(topic: str) -> list[dict]:
        cache_key = f"{topic}:{max_per_topic}"
        cached = _cache.get(cache_key)
        if cached and time.time() - cached[0] < _CACHE_TTL:
            return cached[1]

        er = EventRegistry(apiKey=api_key, allowUseOfArchive=False)

        results = _run_query(er, topic)
        if not results:
            short = " ".join(topic.split()[:2])
            if short != topic:
                results = _run_query(er, short)
        if not results:
            # Widen to 7 days before giving up — never fall back to unrelated content
            results = _run_query(er, topic, date_start=date_start_7d)

        _cache[cache_key] = (time.time(), results)
        return results

    with ThreadPoolExecutor(max_workers=len(topics)) as executor:
        topic_results = list(executor.map(fetch_topic, topics))

    seen_urls: set[str] = set()
    articles = []
    for topic_articles in topic_results:
        for a in topic_articles:
            if a["url"] not in seen_urls:
                seen_urls.add(a["url"])
                articles.append(a)

    return articles
