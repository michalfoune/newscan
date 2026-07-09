from dotenv import load_dotenv
load_dotenv()

import openai as openai_lib
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import BriefingRequest, ChatStreamRequest, TTSRequest
from answer import answer_stream
from chat import answer_followup_stream
from agent_answer import agent_answer_stream
from auth import get_current_user, require_admin

app = FastAPI(title="Rizma Brief API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://rizma-gcp.web.app",
        "https://rizma-gcp.firebaseapp.com",
    ],
    allow_origin_regex=r"^https://rizma-brief[^.]*\.vercel\.app$",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...), _: dict = Depends(get_current_user)):
    try:
        content = await audio.read()
        client = openai_lib.OpenAI()
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=(audio.filename or "recording.webm", content, audio.content_type or "audio/webm"),
        )
        return {"text": transcript.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts")
def text_to_speech(req: TTSRequest, _: dict = Depends(get_current_user)):
    try:
        response = openai_lib.OpenAI().audio.speech.create(
            model="tts-1",
            voice=req.voice,
            input=req.text,
        )
        return StreamingResponse(response.iter_bytes(chunk_size=4096), media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/briefing/stream")
def create_briefing_stream(req: BriefingRequest, _: dict = Depends(get_current_user)):
    try:
        return StreamingResponse(
            answer_stream(req),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/briefing/agent-stream")
def create_agent_briefing_stream(req: BriefingRequest, _: dict = Depends(require_admin)):
    try:
        return StreamingResponse(
            agent_answer_stream(req),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/stream")
def chat_stream(req: ChatStreamRequest, _: dict = Depends(get_current_user)):
    try:
        return StreamingResponse(
            answer_followup_stream(req),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
