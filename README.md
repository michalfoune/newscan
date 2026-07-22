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

The frontend reads `frontend/.env.local` for local config. Set `VITE_API_URL=http://localhost:8000` and the Firebase project keys there.

### Auth bypass (local only)

The backend requires a valid Firebase token on all routes. To skip this during local development, add to `backend/.env`:

```
SKIP_AUTH=1
```

Do not set this in production.

### Developer switches (localStorage)

Open the browser console on any environment and set these to change runtime behaviour without a redeploy:

| Key | Values | Effect |
|-----|--------|--------|
| `rizma-use-agent` | `"true"` / `"false"` (default) | Routes briefing requests to the experimental ADK endpoint (`/api/briefing/agent-stream`) instead of the standard pipeline. Requires the logged-in user's email to be in `ADMIN_EMAILS` on the backend; others get 403. |

Example:
```js
localStorage.setItem('rizma-use-agent', 'true')   // enable
localStorage.removeItem('rizma-use-agent')          // disable (preferred over setting to 'false')
```

## Deployment

### Frontend — Firebase Hosting

```bash
cd frontend
npm run build
firebase deploy --only hosting
```

### Backend — Google Cloud Run

```bash
cd backend
gcloud run deploy rizma-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GNEWS_API_KEY=GNEWS_API_KEY:latest,NEWS_API_KEY=NEWS_API_KEY:latest \
  --set-env-vars GOOGLE_GENAI_USE_ENTERPRISE=True,GOOGLE_CLOUD_PROJECT=rizma-gcp,GOOGLE_CLOUD_LOCATION=us-central1,ADMIN_EMAILS=michal.foune@gmail.com \
  --max-instances 2 \
  --memory 1Gi \
  --timeout 300
```

`--allow-unauthenticated` lets Cloud Run accept public traffic; Firebase token verification is enforced by the app itself. `ADMIN_EMAILS` gates the experimental `/api/briefing/agent-stream` endpoint.
