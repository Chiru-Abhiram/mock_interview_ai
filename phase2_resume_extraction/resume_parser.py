import os
from pypdf import PdfReader
from docx import Document
from pydantic import BaseModel
from typing import Optional, List

class ResumeData(BaseModel):
    text: str
    filename: str
    file_type: str
    skills: List[str] = []
    experience: List[str] = []
    projects: List[str] = []

def extract_text_from_pdf(filepath: str) -> str:
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
    doc = Document(filepath)
    text = []
    for para in doc.paragraphs:
        text.append(para.text)
    return "\n".join(text)

def extract_text_via_ai(filepath: str) -> str:
    """
    Uses Gemini's multimodal capabilities to extract text from scanned or non-searchable PDFs.
    """
    import google.generativeai as genai
    from dotenv import load_dotenv
    load_dotenv()
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("CRITICAL: GEMINI_API_KEY not found for AI Deep Scan.")
        return ""
        
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-flash-latest')
        
        print(f"AI Deep Scan: Uploading {filepath} to Google AI SDK...")
        sample_file = genai.upload_file(path=filepath, display_name="Resume OCR Fallback")
        
        prompt = "Extract all text from this resume perfectly. Focus on skills, projects, and experience. Return ONLY the raw extracted text."
        response = model.generate_content([sample_file, prompt])
        
        if not response or not response.text:
             print("AI Deep Scan: Received empty response from Gemini.")
             return ""

        try:
            genai.delete_file(sample_file.name)
        except Exception as cleanup_err:
            print(f"AI Deep Scan cleanup warning: {cleanup_err}")
            
        return response.text
    except Exception as e:
        import traceback
        print("--- AI DEEP SCAN EXCEPTION ---")
        traceback.print_exc()
        print(f"AI Deep Scan failed: {str(e)}")
        return f"AI_ERROR: {str(e)}"

def structure_resume_data(raw_text: str) -> dict:
    """
    Uses Gemini to organize raw resume text into structured fields: skills, experience, projects.
    """
    import google.generativeai as genai
    import json
    from dotenv import load_dotenv
    load_dotenv()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"skills": [], "experience": [], "projects": []}

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-flash-latest',
                                      generation_config={"response_mime_type": "application/json"})
        
        prompt = f"""
        Analyze the following resume text and extract the specific sections.
        Organize them into a JSON object with these keys:
        - "skills": A list of technical and soft skills.
        - "experience": A list of key roles, responsibilities, and achievements from work history.
        - "projects": A list of specific projects done, including tools and outcomes.

        RESUME TEXT:
        ---
        {raw_text}
        ---

        Return ONLY a JSON object.
        """
        response = model.generate_content(prompt)
        return json.loads(response.text)
    except Exception as e:
        print(f"Error structuring resume data: {e}")
        return {"skills": [], "experience": [], "projects": []}

def parse_resume(filepath: str) -> ResumeData:
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
    
    # AI Deep Scan Fallback: If 0 chars or very short, it's likely a scan
    if len(extracted_text) < 50:
        print(f"Traditional extraction returned {len(extracted_text)} chars. Triggering AI Deep Scan...")
        ai_text = extract_text_via_ai(filepath)
        
        if ai_text.startswith("AI_ERROR:"):
             error_msg = ai_text.replace("AI_ERROR:", "").strip()
             raise ValueError(f"AI Deep Scan failed: {error_msg}. Traditional extraction also failed (0 chars). Please check your internet connection or use a text-based PDF.")

        if len(ai_text.strip()) > 50:
            print("AI Deep Scan successful.")
            extracted_text = ai_text.strip()
        else:
            print("AI Deep Scan also failed to extract significant text.")
            if len(extracted_text) < 30:
                 if len(extracted_text) == 0:
                     raise ValueError(f"Extracted zero text from {ext}. AI Deep Scan also returned no results. The file may be empty or corrupted.")
                 raise ValueError(f"Extracted text is too short ({len(extracted_text)} chars). Please ensure your resume is not a scanned image and contains selectable text.")

    structured_data = structure_resume_data(extracted_text)

    return ResumeData(
        text=extracted_text,
        filename=os.path.basename(filepath),
        file_type=ext,
        skills=structured_data.get("skills", []),
        experience=structured_data.get("experience", []),
        projects=structured_data.get("projects", [])
    )

if __name__ == "__main__":
    # Test block
    print("Resume Parser Module Loaded.")
