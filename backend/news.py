import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Optional
from eventregistry import EventRegistry, QueryArticlesIter


def fetch_articles(topics: list[str], max_per_topic: int = 4) -> list[dict]:
    """Fetch recent English-language articles for each topic from NewsAPI.ai, in parallel."""
    api_key = os.environ.get("NEWS_API_KEY")
    if not api_key:
        raise ValueError("NEWS_API_KEY is not set in environment")

    date_start = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")

    def _run_query(er: EventRegistry, keywords: Optional[str]) -> list[dict]:
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
            body = raw_body[:1500].replace("\\", " ").replace('"', "'").replace("\r", " ").strip()
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
        er = EventRegistry(apiKey=api_key, allowUseOfArchive=False)

        # Try full topic first
        results = _run_query(er, topic)
        if results:
            return results

        # Fallback 1: first two words only
        short = " ".join(topic.split()[:2])
        if short != topic:
            results = _run_query(er, short)
            if results:
                return results

        # Fallback 2: no keyword filter — just latest news
        return _run_query(er, None)

    with ThreadPoolExecutor(max_workers=len(topics)) as executor:
        topic_results = list(executor.map(fetch_topic, topics))

    # Flatten and deduplicate across topics
    seen_urls: set[str] = set()
    articles = []
    for topic_articles in topic_results:
        for a in topic_articles:
            if a["url"] not in seen_urls:
                seen_urls.add(a["url"])
                articles.append(a)

    return articles
