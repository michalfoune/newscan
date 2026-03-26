from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import BriefingRequest, BriefingResponse
from briefing import generate_briefing

app = FastAPI(title="Newscan API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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
