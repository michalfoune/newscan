# Rizma Brief

Rizma Brief is an AI-powered news app designed to help users stay informed without feeling overwhelmed — no doomscrolling, no unnecessarily distressing coverage.

## What it does

- **News briefings** — fetches fresh articles and generates a personalized, emotionally calibrated briefing on any topic
- **Knowledge answers** — for stable or biographical questions, answers directly from AI knowledge with real-time web search for time-sensitive facts
- **Follow-up chat** — continue a conversation after any briefing or answer; the AI fetches fresh articles or searches the web when needed
- **Three tone modes** — Calm (gentle framing for sensitive readers), Balanced (complete but measured), Brave (direct and unfiltered)
- **Text-to-speech** — listen to any briefing or chat response, streamed in sentence chunks
- **Voice input** — speak your query instead of typing
- **Conversation history** — all sessions saved locally with auto-generated titles; resume any previous conversation
- **Language support** — English and Czech

## Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Python + FastAPI
- **AI:** Anthropic Claude API — briefing generation, tone control, chat, classification, web search (native tool)
- **TTS:** OpenAI TTS API (`tts-1`, `nova` voice)
- **News sources:** GNews API (primary), NewsAPI.ai (secondary)

## Running locally

### Prerequisites

- Python 3.9+
- Node.js 18+
- API keys (see below)

### Environment variables

Create `backend/.env` with the following keys:

```
ANTHROPIC_API_KEY=      # required — briefing, chat, web search
OPENAI_API_KEY=         # required — text-to-speech
GNEWS_API_KEY=          # required — primary news source
NEWS_API_KEY=           # optional — secondary news source (NewsAPI.ai)
```

### Backend

```bash
cd backend
cp .env.example .env
# Fill in your API keys

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn main:app --reload
# Runs at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```
