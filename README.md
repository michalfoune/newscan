# Newscan

Newscan is an AI news catch-up app designed to help users stay informed without getting dragged into doomscrolling, emotional overload, or unnecessarily distressing coverage.

## Core idea

The app gives users more control over both:

1. **What this specific newsfeed should contain**
2. **How the newsfeed should generally be constructed**

This allows a user to shape the feed at two levels:
- a **session prompt** for what they want right now
- a **persistent system preference** for the tone and balance of the feed overall

## Example user request

> Give me one short update about the Russia-Ukraine war, and then some good news from photography or wildlife conservation.

## Feed design principles

- Let users include and exclude topics explicitly
- Keep news concise, factual, and high-level
- Avoid sensationalism, clickbait, and emotionally manipulative framing
- Do not over-focus on disasters, war, tragedy, or outrage
- Maintain a healthier emotional balance in the overall feed

---

## Running locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- An Anthropic API key

### Backend

```bash
cd backend
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn main:app --reload
# Runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

---

## Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Python + FastAPI
- **AI layer:** Anthropic Claude API (briefing generation, tone control, summarization)

## Status

Early MVP. News is generated from the model's knowledge — real-time news source integration is the next step.
