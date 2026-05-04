---
name: NewsAPI.ai keyword limit
description: EventRegistry (NewsAPI.ai) current plan caps at 15 keywords per query — remove limit when switching to paid plan or different source
type: project
---

The current NewsAPI.ai (EventRegistry) plan caps keyword queries at 15 words. A safety trim is in place in `backend/news.py` (`_run_query`) that truncates any keyword string to 15 words before passing to EventRegistry.

**Why:** Free/basic plan restriction. Longer topic strings (e.g. when the LLM returns the full user question as a topic) would otherwise cause the API to reject the request silently and return no articles.

**How to apply:** When the user connects a different news source or upgrades to a full paid EventRegistry plan, remind them to remove the 15-word truncation in `_run_query` and revisit the keyword limit (paid plan allows up to 60 keywords).
