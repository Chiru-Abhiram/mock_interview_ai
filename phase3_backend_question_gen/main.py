from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import sys
import os
import shutil
import hashlib
import json
from typing import List
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from question_bank import get_fallback_questions

load_dotenv()

CACHE_FILE = "question_cache.json"

def get_cache_key(resume_text: str, role: str, num_questions: int, difficulty: str, job_description: str, auto_select_count: bool) -> str:
    """Creates a unique hash for the request parameters."""
    content = f"{resume_text[:5000]}{role}{num_questions}{difficulty}{job_description}{auto_select_count}"
    return hashlib.md5(content.encode()).hexdigest()

def read_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def write_cache(cache: dict):
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

# Add Phase 2 to path to import parser
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'phase2_resume_extraction')))
try:
    from resume_parser import parse_resume
except ImportError as e:
    print(f"CRITICAL WARNING: Could not import resume_parser: {e}")
    # Define a dummy function to prevent NameError, but raise HTTP 500 when called
    def parse_resume(f):
        raise ImportError(f"Resume parser not loaded properly. Check server logs. Error: {e}")

app = FastAPI(title="AI Mock Interview API")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QuestionRequest(BaseModel):
    resume_text: str
    job_description: str = ""
    difficulty: str = "mixed"  # "easy", "medium", "hard", or "mixed"
    num_questions: int = 5  # 1-20
    auto_select_count: bool = False

from question_generator import QuestionGenerator

class QuestionModel(BaseModel):
    id: int
    text: str
    type: str  # technical, behavioral, or coding
    difficulty: str
    context: str
    initial_code: str = ""

class QuestionResponse(BaseModel):
    questions: List[QuestionModel]

# Initialize generator globally
try:
    question_generator = QuestionGenerator()
except Exception as e:
    print(f"Warning: Failed to initialize QuestionGenerator: {e}")
    question_generator = None

@app.get("/")
def read_root():
    return {"message": "AI Mock Interview Backend is Running"}

@app.post("/upload_resume")
async def upload_resume(file: UploadFile = File(...)):
    temp_file = f"temp_{file.filename}"
    try:
        with open(temp_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse the resume
        data = parse_resume(temp_file)
        
        # Logging for accuracy audit
        print(f"\n--- EXTRACTED RESUME TEXT (FIRST 300 CHARS) ---\n{data.text[:300]}\n---------------------------------------------\n")
        
        return {
            "filename": file.filename,
            "extracted_text": data.text,
            "message": "Resume processed successfully"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error during file processing: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

@app.post("/generate_questions", response_model=QuestionResponse)
def generate_questions(request: QuestionRequest):
    if not question_generator:
         raise HTTPException(status_code=500, detail="QuestionGenerator not initialized")

    # Validate num_questions
    if request.num_questions < 1 or request.num_questions > 20:
        raise HTTPException(status_code=400, detail="num_questions must be between 1 and 20")
    
    # Validate difficulty
    valid_difficulties = ["easy", "medium", "hard", "mixed"]
    if request.difficulty not in valid_difficulties:
        raise HTTPException(status_code=400, detail=f"difficulty must be one of: {valid_difficulties}")

    # Level 1: Cache Check
    cache = read_cache()
    # Use role from request if we eventually add it to QuestionRequest, 
    # for now we'll use a better default or try to extract it.
    target_role = "Software Engineer" 
    
    key = get_cache_key(
        request.resume_text, 
        target_role, 
        request.num_questions, 
        request.difficulty, 
        request.job_description,
        request.auto_select_count
    )
    
    if key in cache:
        print(f"Level 1: Serving questions from cache ({key}) - NOTE: Clear question_cache.json to refresh realism logic.")
        return QuestionResponse(questions=cache[key])

    try:
        # Level 2: AI Generation
        print(f"Level 2: Generating NEW questions for {target_role} (Realism logic active)")
        questions_data = question_generator.generate_questions(
            resume_text=request.resume_text, 
            role=target_role,
            num_questions=request.num_questions,
            difficulty=request.difficulty,
            job_description=request.job_description,
            auto_select_count=request.auto_select_count
        )
        
        # Save to cache on success
        cache[key] = questions_data
        write_cache(cache)
        
        return QuestionResponse(questions=questions_data)
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error in API generation: {error_msg}")
        
        # Level 3: Static Fallback for Quota or other AI errors
        print("Level 3: Falling back to Static Question Bank")
        questions_data = get_fallback_questions(request.resume_text, request.num_questions)
        
        # Return static questions if AI failed
        return QuestionResponse(questions=questions_data)

@app.post("/evaluate_answer")
def evaluate_answer(data: dict):
    question = data.get("question")
    answer = data.get("answer")
    
    if not question or not answer:
        raise HTTPException(status_code=400, detail="Missing question or answer")
        
    try:
        # Import dynamically to ensure path is ready or use the sys.path hack
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'phase4_answer_evaluation')))
        from evaluator import AnswerEvaluator
        
        evaluator = AnswerEvaluator()
        result = evaluator.evaluate(question, answer)
        
        return {
            "score": result.score,
            "feedback": result.feedback,
            "missing_keywords": result.missing_keywords,
            "improvements": result.improvements,
            "ideal_answer": result.ideal_answer
        }
    except Exception as e:
        print(f"Evaluation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
