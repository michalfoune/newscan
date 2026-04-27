from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import BriefingRequest, BriefingResponse, ChatRequest, ChatResponse, ChatStreamRequest
from briefing import generate_briefing, generate_briefing_stream
from chat import answer_followup, answer_followup_stream

app = FastAPI(title="Rizma Brief API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_origin_regex=r"https://rizma-brief[^.]*\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/briefing", response_model=BriefingResponse)
def create_briefing(req: BriefingRequest):
    try:
        return generate_briefing(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/briefing/stream")
def create_briefing_stream(req: BriefingRequest):
    try:
        return StreamingResponse(
            generate_briefing_stream(req),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        return answer_followup(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/stream")
def chat_stream(req: ChatStreamRequest):
    try:
        return StreamingResponse(
            answer_followup_stream(req),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
