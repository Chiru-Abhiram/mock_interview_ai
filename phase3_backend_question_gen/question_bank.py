from typing import List, Dict, Any

# A static collection of high-quality interview questions for common stacks
# This serves as the Level 3 (Final) fallback when all AI models hit quota limits.

QUESTION_BANK: Dict[str, List[Dict[str, Any]]] = {
    "python": [
        {
            "id": 1001,
            "text": "For a start, I see you've worked with Python. If you were explaining the practical difference between a list and a tuple to a junior developer, how would you describe when it's absolutely critical to use one over the other?",
            "type": "technical",
            "difficulty": "easy",
            "context": "Core Python proficiency with a conversational lens.",
            "initial_code": ""
        },
        {
            "id": 1002,
            "text": "I'm curious about your experience with advanced Python features. How have you used decorators in your previous projects to clean up or extend your code's functionality?",
            "type": "technical",
            "difficulty": "medium",
            "context": "Advanced Python concepts in a practical context.",
            "initial_code": ""
        },
        {
            "id": 1003,
            "text": "Let's look at a quick coding scenario. Could you write a short function for me that takes a string and returns it reversed? For example, 'hello' becoming 'olleh'.",
            "type": "coding",
            "difficulty": "easy",
            "context": "Basic algorithmic thinking.",
            "initial_code": "def reverse_string(s):\n    # Your code here\n    pass"
        }
    ],
    "javascript": [
        {
            "id": 2001,
            "text": "What is the difference between '==' and '===' in JavaScript?",
            "type": "technical",
            "difficulty": "easy",
            "context": "JS fundamentals.",
            "initial_code": ""
        },
        {
            "id": 2002,
            "text": "Explain the concept of 'closures' in JavaScript with an example.",
            "type": "technical",
            "difficulty": "medium",
            "context": "Scope and memory management in JS.",
            "initial_code": ""
        },
        {
            "id": 2003,
            "text": "Write a function that filters an array of numbers to return only the even ones.",
            "type": "coding",
            "difficulty": "easy",
            "context": "Array manipulation in JS.",
            "initial_code": "function filterEvens(arr) {\n    // Your code here\n}"
        }
    ],
    "react": [
        {
            "id": 3001,
            "text": "What are React Hooks? Explain useState and useEffect.",
            "type": "technical",
            "difficulty": "easy",
            "context": "Modern React development.",
            "initial_code": ""
        },
        {
            "id": 3002,
            "text": "What is the Virtual DOM, and how does React use it to improve performance?",
            "type": "technical",
            "difficulty": "medium",
            "context": "React architecture.",
            "initial_code": ""
        }
    ],
    "general_technical": [
        {
            "id": 5001,
            "text": "Could you walk me through your debugging process? For example, when you hit a complex bug that isn't immediately obvious, what steps do you take to isolate the root cause?",
            "type": "technical",
            "difficulty": "medium",
            "context": "Debugging and problem-solving methodology.",
            "initial_code": ""
        },
        {
            "id": 5002,
            "text": "How do you approach testing your code? Do you lean more towards unit testing, integration testing, or a mix, and why?",
            "type": "technical",
            "difficulty": "easy",
            "context": "Quality assurance mindset.",
            "initial_code": ""
        },
        {
            "id": 5003,
            "text": "When picking a new tool or library for a project, what criteria do you look for to decide if it's the right choice?",
            "type": "technical",
            "difficulty": "medium",
            "context": "Tech stack decision making.",
            "initial_code": ""
        }
    ],
    "general_behavioral": [
        {
            "id": 4001,
            "text": "I'd love to hear about a project that really challenged you. What was the biggest hurdle you hit, and how did you navigate through it to get the results you wanted?",
            "type": "behavioral",
            "difficulty": "medium",
            "context": "Problem-solving and resilience.",
            "initial_code": ""
        },
        {
            "id": 4002,
            "text": "Thinking about your future, where do you see your career heading in the next couple of years, particularly in terms of the technical skills you want to master?",
            "type": "behavioral",
            "difficulty": "easy",
            "context": "Ambition and career alignment.",
            "initial_code": ""
        },
        {
            "id": 4003,
            "text": "We all hit points of friction in a team. Could you share a time when you disagreed with a teammate? How did you approach that conversation to find a path forward?",
            "type": "behavioral",
            "difficulty": "easy",
            "context": "Conflict resolution and teamwork.",
            "initial_code": ""
        },
        {
            "id": 4004,
            "text": "Can you describe a specific time you had to learn a new technology quickly to get a job done? How did you go about it?",
            "type": "behavioral",
            "difficulty": "medium",
            "context": "Adaptability and learning agility.",
            "initial_code": ""
        }
    ]
}

def get_fallback_questions(resume_text: str, role: str = "Software Engineer", num_questions: int = 5) -> List[Dict[str, Any]]:
    """
    Detects skills from resume text and pulls matching questions from the bank.
    Ensures realistic interview flow and EXACT question count using cyclic filling.
    """
    resume_lower = resume_text.lower()
    
    # 1. Start with Introduction
    intro_question = {
        "id": 1,
        "text": f"To get us started, could you walk me through your background and what specifically interested you about this {role} position?",
        "type": "behavioral",
        "difficulty": "easy",
        "context": "Opening question to establish rapport",
        "initial_code": ""
    }
    
    # 2. Gather Candidates
    candidate_questions = []
    
    # Add matched technical questions
    for skill, questions in QUESTION_BANK.items():
        if skill not in ["general_behavioral", "general_technical"] and skill in resume_lower:
            candidate_questions.extend(questions)
            
    # Fallback to general technical if no specific skills found
    if not candidate_questions:
        candidate_questions.extend(QUESTION_BANK.get("python", [])) # Default stack
    
    # Always add general technicals to the mix
    candidate_questions.extend(QUESTION_BANK.get("general_technical", []))
    
    # Add behavioral questions
    behavioral_questions = QUESTION_BANK.get("general_behavioral", [])
    
    # 3. Build Sequence
    final_questions = [intro_question]
    
    # Calculate needed slots (Total - Intro - Closing)
    needed_middle = max(0, num_questions - 2)
    
    # Create the middle pool
    middle_pool = candidate_questions + behavioral_questions
    
    # CYCLIC FILLING: Ensure we have enough questions by repeating if necessary
    import copy
    current_idx = 0
    while len(final_questions) < (num_questions - 1): # Reserve last slot for closing
        if not middle_pool: break # Should never happen with our initialization
        
        # Get question, clone it to avoid reference issues
        base_q = middle_pool[current_idx % len(middle_pool)]
        new_q = copy.deepcopy(base_q)
        
        # If we're cycling (reusing), imply it's a follow-up or variation in context
        if current_idx >= len(middle_pool):
             new_q["context"] += " (Follow-up / Alternate angle)"
             
        final_questions.append(new_q)
        current_idx += 1

    # 4. Closing Question
    if num_questions > 1:
        closing_question = {
            "id": 9999,
            "text": "Before we wrap up, why do you think you'd be a great fit for this role, and what unique value would you bring to our team?",
            "type": "behavioral",
            "difficulty": "medium",
            "context": "Closing question to assess self-awareness and fit",
            "initial_code": ""
        }
        final_questions.append(closing_question)
    
    # 5. Reassign IDs sequentially
    for idx, q in enumerate(final_questions, start=1):
        q["id"] = idx
    
    return final_questions[:num_questions]
