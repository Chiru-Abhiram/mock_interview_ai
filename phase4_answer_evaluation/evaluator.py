from pydantic import BaseModel
from typing import List, Dict
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

class EvaluationResult(BaseModel):
    score: float  # 0-10
    feedback: str
    missing_keywords: List[str]
    improvements: str = ""
    ideal_answer: str = ""  # The "sample/ideal" answer
    ml_relevance_score: float = None
    ml_relevance_grade: str = None
    hybrid_score: float = None

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

def calculate_tfidf_score(user_answer: str, ideal_answer: str) -> dict:
    try:
        if not ML_AVAILABLE:
            raise ImportError("scikit-learn not installed")
        if not user_answer or not ideal_answer:
            return {"relevance_score": 0.5, "grade": "N/A"}
        
        vectorizer = TfidfVectorizer(stop_words='english')
        vectors = vectorizer.fit_transform([user_answer, ideal_answer])
        similarity = cosine_similarity(vectors[0], vectors[1])[0][0]
        
        # Convert to percentage
        relevance = round(float(similarity) * 100, 1)
        
        # Grade based on similarity
        if relevance >= 75: grade = "Excellent"
        elif relevance >= 55: grade = "Good"
        elif relevance >= 35: grade = "Fair"
        else: grade = "Needs Improvement"
        
        return {
            "relevance_score": relevance,
            "grade": grade
        }
    except Exception as e:
        print(f"TF-IDF scoring failed: {e}")
        return {"relevance_score": 0.5, "grade": "N/A"}

class AnswerEvaluator:
    def __init__(self):
        # In a real app, this would load models or connect to LLM
        pass
    
    def evaluate(self, question: str, answer: str, context_keywords: List[str] = []) -> EvaluationResult:
        # Determine if answer is missing
        is_skipped = not answer or answer.strip() == "" or "no answer provided" in answer.lower()
        
        api_key = os.getenv("GEMINI_API_KEY") # Check mostly for environment presence logic if needed
        # We generally rely on run_genai_with_rotation to handle keys now
        
        prompt = f"""
        You are an expert technical interviewer evaluating a candidate's response.
        
        QUESTION: "{question}"
        CANDIDATE ANSWER: "{'NO ANSWER PROVIDED. CANDIDATE SKIPPED.' if is_skipped else answer}"
        
        OBJECTIVES:
        1. Score the answer from 0-10. {'(MUST BE 0 since candidate skipped)' if is_skipped else '(Be fair and critical)'}
        2. Provide helpful feedback.
        3. **CRITICAL**: Provide the PERECT 'Ideal Answer'. {'Since the candidate skipped, create a 10/10 answer.' if is_skipped else 'Show what a 10/10 answer looks like.'}
        
        **CONSTRAINT: KEEP THE IDEAL ANSWER VERY SHORT AND CONCISE (Max 2-3 sentences). Be direct.**
        
        RETURN JSON ONLY:
        {{
            "score": int,
            "feedback": "string",
            "missing_keywords": ["list", "of", "key", "terms", "missed"],
            "improvements": "string (what to do better)",
            "ideal_answer": "string (Max 2-3 sentences, direct and simple)"
        }}
        """

        from ai_utils import run_genai_with_rotation
        try:
            print(f"Evaluating answer... (Skipped={is_skipped})")
            # We use is_json=True to enforce JSON mode
            response_text = run_genai_with_rotation(prompt, is_json=True)
            
            # Robust JSON cleanup logic
            text = response_text.strip()
            if text.startswith("```json"): text = text[7:]
            if text.startswith("```"): text = text[3:]
            if text.endswith("```"): text = text[:-3]
            text = text.strip()
            
            import json
            data = json.loads(text)
            
            # ML: TF-IDF relevance scoring
            tfidf_result = calculate_tfidf_score(
                answer, 
                data.get("ideal_answer", "")
            )
            
            # Hybrid score: 70% Gemini + 30% TF-IDF
            gemini_score = float(data.get("score", 5))
            tfidf_normalized = (tfidf_result["relevance_score"] / 100) * 10
            hybrid_score = round(
                (gemini_score * 0.7) + (tfidf_normalized * 0.3), 1
            )
            
            # Add ML fields to response
            data["ml_relevance_score"] = tfidf_result["relevance_score"]
            data["ml_relevance_grade"] = tfidf_result["grade"]
            data["hybrid_score"] = hybrid_score
            data["score"] = hybrid_score  # replace raw score
            
            return EvaluationResult(
                score=data.get("score", 0),
                feedback=data.get("feedback", "No feedback provided."),
                missing_keywords=data.get("missing_keywords", []),
                improvements=data.get("improvements", "No specific improvements suggested."),
                ideal_answer=data.get("ideal_answer", "No ideal answer provided."),
                ml_relevance_score=data.get("ml_relevance_score"),
                ml_relevance_grade=data.get("ml_relevance_grade"),
                hybrid_score=data.get("hybrid_score")
            )
        except Exception as e:
            print(f"Evaluation AI failed: {e}")
            return self._fallback_evaluate(question, answer, context_keywords, str(e))

    def _fallback_evaluate(self, question: str, answer: str, context_keywords: List[str], error_msg: str = "") -> EvaluationResult:
        # User-friendly fallback logic
        score = 0
        
        if "429" in error_msg:
             feedback = "⚠️ API Quota Limit Reached. AI evaluation is temporarily paused."
             improvements = "Please wait a few minutes or add more API keys to the .env file."
             ideal_answer = "Generative AI is currently taking a short break to recharge usage limits. Please check back in a bit!"
        else:
             feedback = f"Evaluation service unavailable. Error: {error_msg[:100]}..."
             improvements = "Check API Connection."
             ideal_answer = "No ideal answer provided."
             
        return EvaluationResult(
            score=score, 
            feedback=feedback, 
            missing_keywords=[], 
            improvements=improvements,
            ideal_answer=ideal_answer
        )

if __name__ == "__main__":
    # Test logic
    evaluator = AnswerEvaluator()
    res = evaluator.evaluate(
        "What is React?", 
        "React is a JavaScript library for building user interfaces.", 
        ["library", "javascript", "interface"]
    )
    print(f"Score: {res.score}")
    print(f"Feedback: {res.feedback}")
