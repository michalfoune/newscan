import os
from datetime import datetime, timedelta
from eventregistry import EventRegistry, QueryArticlesIter


def fetch_articles(topics: list[str], max_per_topic: int = 5) -> list[dict]:
    """Fetch recent English-language articles for each topic from NewsAPI.ai."""
    api_key = os.environ.get("NEWS_API_KEY")
    if not api_key:
        raise ValueError("NEWS_API_KEY is not set in environment")

    er = EventRegistry(apiKey=api_key, allowUseOfArchive=False)
    date_start = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")

    articles = []
    seen_urls: set[str] = set()

    for topic in topics:
        q = QueryArticlesIter(
            keywords=topic,
            lang="eng",
            dateStart=date_start,
            dataType=["news"],
        )
        count = 0
        for article in q.execQuery(er, sortBy="date", maxItems=max_per_topic):
            url = article.get("url", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            body = article.get("body") or ""
            articles.append({
                "topic": topic,
                "title": article.get("title", "").strip(),
                "body": body[:1500].strip(),
                "source": article.get("source", {}).get("title", "Unknown"),
                "datetime": article.get("dateTime", ""),
                "url": url,
            })
            count += 1
            if count >= max_per_topic:
                break

    return articles
