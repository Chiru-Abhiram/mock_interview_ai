import os
import json
import re
import sys
import shutil
from pypdf import PdfReader
from docx import Document
from pydantic import BaseModel
from typing import Optional, List, Any

# Ensure ai_utils is importable
AI_UTILS_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'phase3_backend_question_gen'))
if AI_UTILS_PATH not in sys.path:
    sys.path.append(AI_UTILS_PATH)

class ResumeData(BaseModel):
    text: str
    filename: str
    file_type: str
    skills: List[str] = []
    experience: List[str] = []
    projects: List[str] = []

def extract_text_from_pdf(filepath: str) -> str:
    print(f"DEBUG: extract_text_from_pdf called for {filepath}")
    try:
        reader = PdfReader(filepath)
        text = ""
        for page in reader.pages:
            try:
                text += page.extract_text() + "\n"
            except Exception as e:
                print(f"Error reading PDF page: {e}")
                continue
        return text
    except Exception as e:
        print(f"Error opening PDF: {e}")
        return ""

def extract_text_from_docx(filepath: str) -> str:
    print(f"DEBUG: extract_text_from_docx called for {filepath}")
    doc = Document(filepath)
    text = []
    for para in doc.paragraphs:
        text.append(para.text)
    return "\n".join(text)

def _fallback_keyword_extraction(text: str) -> dict:
    print("DEBUG: _fallback_keyword_extraction called")
    tech_keywords = [
        "python", "javascript", "react", "next.js", "node.js", "typescript", "java", "c++", 
        "aws", "azure", "docker", "kubernetes", "sql", "mongodb", "postgresql", "git",
        "html", "css", "tailwind", "fastapi", "django", "flask", "spring", "agile", "scrum",
        "machine learning", "data science", "devops", "ci/cd", "rest api", "graphql"
    ]
    found_skills = []
    for kw in tech_keywords:
        if re.search(rf"\b{re.escape(kw)}\b", text, re.IGNORECASE):
            found_skills.append(kw.title())
    lines = text.split('\n')
    found_exp = [line.strip() for line in lines if len(line.strip()) > 50][:10]
    return {
        "raw_text": text,
        "skills": found_skills,
        "experience": found_exp,
        "projects": []
    }

def _get_model_response(prompt: str, multimodal_filepath: Optional[str] = None, is_json: bool = False) -> str:
    print(f"DEBUG: _get_model_response called (json={is_json}, file={multimodal_filepath})")
    try:
        from ai_utils import run_genai_with_rotation
        return run_genai_with_rotation(prompt, is_json=is_json, multimodal_filepath=multimodal_filepath)
    except ImportError:
        print("CRITICAL: ai_utils not found in path!")
        raise

def parse_scanned_resume_multimodal(filepath: str) -> dict:
    """Combines OCR and Structuring into ONE AI call for quota efficiency."""
    print(f"DEBUG: Entering parse_scanned_resume_multimodal for {filepath}")
    try:
        prompt = """
        Extract all text from this resume AND organize it into a structured JSON object.
        JSON fields:
        - "raw_text": Every word found on the document.
        - "skills": A list of technical and soft skills.
        - "experience": A list of professional roles and achievements.
        - "projects": A list of project names and descriptions.

        Return ONLY a JSON object.
        """
        response_text = _get_model_response(prompt, multimodal_filepath=filepath, is_json=True)
        return json.loads(response_text)
    except Exception as e:
        err_msg = str(e)
        print(f"Multimodal scan failed error: {err_msg}")
        if "429" in err_msg:
             text = extract_text_from_pdf(filepath)
             if len(text) > 10:
                  return _fallback_keyword_extraction(text)
        return {"raw_text": f"AI_ERROR: {err_msg}", "skills": [], "experience": [], "projects": []}

def structure_resume_data(raw_text: str) -> dict:
    print("DEBUG: structure_resume_data called")
    prompt = f"""
    Analyze the following resume text and extract the specific sections.
    Organize them into a JSON object with these keys:
    - "skills": A list of strings.
    - "experience": A list of strings.
    - "projects": A list of strings.

    RESUME TEXT:
    ---
    {raw_text}
    ---

    Return ONLY a JSON object.
    """
    try:
        response_text = _get_model_response(prompt, is_json=True)
        data = json.loads(response_text)
        # Cleanup logic
        for key in ["skills", "experience", "projects"]:
            raw_items = data.get(key, [])
            if not isinstance(raw_items, list): raw_items = [raw_items] if raw_items else []
            cleaned = []
            for item in raw_items:
                if isinstance(item, str): cleaned.append(item)
                elif isinstance(item, dict):
                    name = item.get("name") or item.get("title") or item.get("role") or item.get("skill")
                    cleaned.append(str(name) if name else json.dumps(item))
                else: cleaned.append(str(item))
            data[key] = cleaned
        return data
    except Exception as e:
        print(f"Error structuring resume data: {e}")
        return {"skills": [], "experience": [], "projects": []}

def parse_resume(filepath: str) -> ResumeData:
    print(f"DEBUG: parse_resume entry point for {filepath}")
    ext = os.path.splitext(filepath)[1].lower()
    text = ""
    
    if ext == ".pdf":
        text = extract_text_from_pdf(filepath)
    elif ext == ".docx":
        text = extract_text_from_docx(filepath)
    elif ext == ".txt":
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        raise ValueError(f"Unsupported file format: {ext}")
        
    extracted_text = text.strip()
    
    if len(extracted_text) < 50:
        print(f"Traditional extraction too short ({len(extracted_text)} chars). Logic: call OCR.")
        data = parse_scanned_resume_multimodal(filepath)
        extracted_text = data.get("raw_text", "").strip()
        
        if extracted_text.startswith("AI_ERROR:"):
             error_msg = extracted_text.replace("AI_ERROR:", "").strip()
             if "429" in error_msg:
                  print("Quota exhausted during OCR. Attempting basic text extraction...")
                  text = extract_text_from_pdf(filepath)
                  print(f"DEBUG: Fallback extraction got {len(text)} chars")
                  if len(text) > 0:  # Accept any text at all
                      print("Using keyword-based fallback for quota-limited resume.")
                      fallback_data = _fallback_keyword_extraction(text)
                      return ResumeData(
                          text=fallback_data["raw_text"], filename=os.path.basename(filepath), file_type=ext,
                          skills=fallback_data["skills"], experience=fallback_data["experience"], projects=fallback_data["projects"]
                      )
                  # If truly no text, create a minimal resume to allow interview to proceed
                  print("No text extracted. Creating minimal resume data.")
                  return ResumeData(
                      text="Resume uploaded (image-based, quota exhausted)", 
                      filename=os.path.basename(filepath), 
                      file_type=ext,
                      skills=["General Software Development"],
                      experience=["Professional Experience"],
                      projects=[]
                  )
             raise ValueError(f"AI Scan failed: {error_msg}")

        return ResumeData(
            text=extracted_text, filename=os.path.basename(filepath), file_type=ext,
            skills=data.get("skills", []), experience=data.get("experience", []), projects=data.get("projects", [])
        )

    try:
        structured_data = structure_resume_data(extracted_text)
    except Exception as e:
        if "429" in str(e):
            structured_data = _fallback_keyword_extraction(extracted_text)
        else: raise e

    return ResumeData(
        text=extracted_text, filename=os.path.basename(filepath), file_type=ext,
        skills=structured_data.get("skills", []), experience=structured_data.get("experience", []), projects=structured_data.get("projects", [])
    )

if __name__ == "__main__":
    print("Resume Parser Module Loaded at module level.")
