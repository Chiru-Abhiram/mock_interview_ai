import os
import json
import typing_extensions
import google.generativeai as genai
from dotenv import load_dotenv

# Use TypedDict for schema definition as it's often more reliable for simple JSON constraints with Gemini
class Question(typing_extensions.TypedDict):
    id: int
    text: str
    type: str  # "technical" | "behavioral" | "coding"
    difficulty: str # "easy" | "medium" | "hard"
    context: str
    initial_code: typing_extensions.NotRequired[str] # Recommended boiler-plate code for coding questions

class InterviewScript(typing_extensions.TypedDict):
    questions: list[Question]

class QuestionGenerator:
    def __init__(self):
        # Configuration is now handled by ai_utils dynamically
        pass

    def generate_questions(self, resume_text: str, role: str = "Software Engineer", num_questions: int = 5, difficulty: str = "mixed", job_description: str = "", auto_select_count: bool = False) -> list[Question]:
        """
        Generates interview questions based on the provided resume text and target role.
        """
        
        # Build difficulty instruction
        difficulty_instruction = f"Target difficulty: {difficulty}."
        
        # Build quantity instruction
        if auto_select_count:
            quantity_instruction = "Select an optimal number of questions (5-12) based on the resume depth."
        else:
            quantity_instruction = f"Generate exactly {num_questions} questions."

        # Build job description section
        job_desc_section = "None provided."
        if job_description.strip():
            job_desc_section = f"--- JOB DESCRIPTION ---\n{job_description[:2000]}\n---"
        
        prompt = f"""
        You are a highly professional, senior technical recruiter and hiring manager. 
        Your objective is to conduct a NATURAL, FACE-TO-FACE, and ENGAGING mock interview.

        {quantity_instruction}
        {difficulty_instruction}

        CANDIDATE DATA:
        Resume Content:
        ---
        {resume_text}
        ---

        {job_desc_section}

        INTERVIEWER PERSONA (CRITICAL):
        - **Sound Human**: Speak directly to the candidate as if you are in a room together.
        - **No Meta-Commentary**: NEVER start a question with phrases like "The job description mentions", "Based on your resume", "Since you used Python", or "According to the documentation". Avoid referencing the JD or Resume explicitly in the question text.
        - **Conversational Tone**: Use natural transitions. Don't be robotic.
        - **Professional Curiosity**: Ask follow-up style questions that test depth.

        FEW-SHOT EXAMPLES (HOW TO PHRASE QUESTIONS):
        - ❌ BAD (Robotic): "Based on your resume, you used React. What are hooks?"
        - ✅ GOOD (Human): "I noticed you worked on a few React projects. When you were building out the user interface, how did you decide when to use a custom hook versus a standard lifecycle method?"
        - ❌ BAD (Robotic): "The job description emphasizes basic Python. Do you know list comprehensions?"
        - ✅ GOOD (Human): "For this role, we do a lot of data processing in Python. Could you talk me through a time you had to optimize a piece of logic—maybe using something like list comprehensions—to handle a larger dataset?"

        STRICT SEQUENCE OF QUESTIONS (IMMUTABLE):
        Your output JSON MUST contain questions in exactly this logical order:
        1. **MANDATORY FIRST QUESTION (ID: 1)**: You MUST start with a warm, professional introduction and then ask: "To get us started, could you walk me through your background and what specifically interested you about this {role} position?" or a variation of "Tell me about yourself." This is NOT optional.
        2. **Role Fit (ID: 2)**: A natural follow-up on their motivation for the industry or current career direction.
        3. **Experience Deep-Dive (30% of total)**: Conversational deep-dives into their resume projects.
        4. **Skill Alignment (30% of total)**: Natural questions about role requirements (JD-based).
        5. **Behavioral (20% of total)**: Teamwork/Conflict scenarios.
        6. **The Signature Closing (Last ID)**: Professional wrap-up (e.g., "Why hire you?").

        REINFORCED PHRASING RULES:
        - NEVER use the words "resume", "job description", "JD", "listing", or "document" in your questions.
        - Act as if you are speaking to the candidate in a real-time Zoom or in-person interview.
        - Use phrases like "I noticed...", "You mentioned...", "I'm curious about...", "Walk me through...".

        STRICT RULES:
        - **No Labels**: Do not include category names (like "Behavioral:") inside the question text.
        - **Context Field**: Short internal reason (e.g., "[Resume] Deep-dive on React architecture").

        RESPONSE FORMAT:
        Return a JSON object with a single key "questions" containing:
        - id: Unique int (MUST correspond to the sequence order)
        - text: The natural, human-sounding question text.
        - type: "technical", "behavioral", or "coding"
        - difficulty: "easy", "medium", or "hard"
        - context: Concise internal reasoning.
        - initial_code: (Optional) For coding questions.
        Return ONLY raw JSON.
        """

        from ai_utils import run_genai_with_rotation
        from question_bank import get_fallback_questions
        
        try:
            response_text = run_genai_with_rotation(prompt, is_json=True)
            data = json.loads(response_text)
            
            questions = []
            if "questions" in data:
                questions = data["questions"]
            elif isinstance(data, list):
                questions = data
            
            # Sort by ID first
            questions.sort(key=lambda x: x.get("id", 0))
            
            # Enforce realistic interview structure
            questions = self._enforce_interview_structure(questions, role, num_questions)
            
            print(f"✅ Generated {len(questions)} questions with realistic interview ordering")
            return questions
        except Exception as e:
            print(f"Question Generation AI failed: {e}. Using high-quality fallback questions.")
            return get_fallback_questions(resume_text, role, num_questions)
    
    def _enforce_interview_structure(self, questions: list[Question], role: str, num_questions: int) -> list[Question]:
        """
        Validates and enforces realistic interview structure:
        1. First question MUST be an intro/background question
        2. Last question MUST be a closing question
        3. Middle questions should have proper distribution
        """
        if not questions or len(questions) == 0:
            return questions
        
        # Define intro question patterns
        intro_keywords = ["tell me about yourself", "walk me through your background", 
                         "introduce yourself", "background", "what interested you"]
        
        # Define closing question patterns
        closing_keywords = ["why hire you", "why should we hire", "what unique value", 
                           "great fit for this role", "wrap up", "any questions for"]
        
        def is_intro_question(q: Question) -> bool:
            text_lower = q.get("text", "").lower()
            return any(keyword in text_lower for keyword in intro_keywords)
        
        def is_closing_question(q: Question) -> bool:
            text_lower = q.get("text", "").lower()
            return any(keyword in text_lower for keyword in closing_keywords)
        
        # Check if first question is intro
        first_is_intro = is_intro_question(questions[0])
        
        # Check if last question is closing (only if we have more than 2 questions)
        last_is_closing = False
        if len(questions) > 2:
            last_is_closing = is_closing_question(questions[-1])
        
        # If structure is already correct, just reassign IDs and return
        if first_is_intro and (len(questions) <= 2 or last_is_closing):
            for idx, q in enumerate(questions, start=1):
                q["id"] = idx
            print(f"✓ Interview structure validated: Intro → {len(questions)-2} middle → Closing")
            return questions
        
        # Structure needs fixing - rebuild it
        print(f"⚠ Fixing interview structure (intro: {first_is_intro}, closing: {last_is_closing})")
        
        intro_q = None
        closing_q = None
        middle_questions = []
        
        # Extract intro, closing, and middle questions
        for q in questions:
            if is_intro_question(q) and not intro_q:
                intro_q = q
            elif is_closing_question(q) and not closing_q:
                closing_q = q
            else:
                middle_questions.append(q)
        
        # Create default intro if missing
        if not intro_q:
            intro_q = {
                "id": 1,
                "text": f"To get us started, could you walk me through your background and what specifically interested you about this {role} position?",
                "type": "behavioral",
                "difficulty": "easy",
                "context": "Opening question to establish rapport",
                "initial_code": ""
            }
            print("  → Added missing intro question")
        
        # Create default closing if missing and we have enough questions
        if not closing_q and num_questions > 2:
            closing_q = {
                "id": 999,
                "text": "Before we wrap up, why do you think you'd be a great fit for this role, and what unique value would you bring to our team?",
                "type": "behavioral",
                "difficulty": "medium",
                "context": "Closing question to assess self-awareness and fit",
                "initial_code": ""
            }
            print("  → Added missing closing question")
        
        # Rebuild the question list
        final_questions = [intro_q]
        
        # Calculate target middle count
        target_middle_count = num_questions - (2 if closing_q else 1)
        
        # GAP FILLING: If AI returned too few questions, cycle existing ones to fill
        import copy
        current_fill_idx = 0
        while len(middle_questions) < target_middle_count:
            if not middle_questions: 
                # Emergency fallback if no middle questions at all
                middle_questions.append({
                    "id": 0, "text": "Could you walk me through a technical challenge you've faced?", 
                    "type": "technical", "difficulty": "medium", "context": "Emergency fallback"
                })
                continue
                
            # Clone from existing middle questions
            base_q = middle_questions[current_fill_idx % len(middle_questions)]
            new_q = copy.deepcopy(base_q)
            new_q["context"] += " (Extended discussion)"
            middle_questions.append(new_q)
            current_fill_idx += 1
            print("  → Added gap-filler question to meet requested count")

        # Add middle questions (trim if we have too many)
        if closing_q:
            final_questions.extend(middle_questions[:target_middle_count])
            final_questions.append(closing_q)
        else:
            final_questions.extend(middle_questions[:target_middle_count])
        
        # Reassign IDs sequentially
        for idx, q in enumerate(final_questions, start=1):
            q["id"] = idx
        
        print(f"✓ Restructured to: Intro → {len(final_questions)-2 if closing_q else len(final_questions)-1} middle → {'Closing' if closing_q else 'No closing'}")
        return final_questions[:num_questions]


if __name__ == "__main__":
    # Quick sanity check
    gen = QuestionGenerator()
    params = {"resume_text": "Experience with Python, Django, and React.", "role": "Full Stack Dev"}
    # We won't actually call the API here to save quota during import/tests unless explicitly run
    print("QuestionGenerator initialized.")
