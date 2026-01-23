"""
JobMatch AI - Backend API
FastAPI application serving the AI-powered job matching service
"""

from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import io

from .services.ai_service import AIService
from .services.file_parser import parse_pdf, parse_docx, extract_text_from_file
from .services.docx_editor import create_tailored_resume_from_template

# Initialize FastAPI app
app = FastAPI(
    title="JobMatch AI",
    description="AI-powered job application assistant API",
    version="0.1.0"
)

# CORS configuration - allow Chrome extension and web app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=False,  # Must be False when using allow_origins=["*"]
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize AI service
ai_service = AIService()

# ============== Request/Response Models ==============

class JobParseRequest(BaseModel):
    job_text: str
    url: Optional[str] = None  # Source URL for tracking

class ResumeParseRequest(BaseModel):
    resume_text: str

class MatchRequest(BaseModel):
    job_text: str
    resume_text: str

class CoverLetterRequest(BaseModel):
    job_text: str
    resume_text: str
    tone: Optional[str] = "professional"  # professional, casual, enthusiastic

class AnalysisResponse(BaseModel):
    success: bool
    data: dict
    error: Optional[str] = None

class CoverLetterResponse(BaseModel):
    success: bool
    cover_letter: str
    error: Optional[str] = None

# ============== API Endpoints ==============

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "JobMatch AI",
        "version": "0.1.0"
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "api_key_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
    }

@app.post("/api/v1/parse-job", response_model=AnalysisResponse)
async def parse_job_description(request: JobParseRequest):
    """
    Parse a job description and extract structured requirements
    
    Returns:
        - Job title, company, location
        - Required vs preferred skills
        - Experience and education requirements
        - Key responsibilities
        - Keywords for resume optimization
    """
    try:
        if not request.job_text or len(request.job_text.strip()) < 50:
            raise HTTPException(
                status_code=400, 
                detail="Job description too short. Please provide the full job posting."
            )
        
        result = await ai_service.parse_job_description(request.job_text)
        
        if "error" in result:
            return AnalysisResponse(success=False, data={}, error=result.get("error"))
        
        return AnalysisResponse(success=True, data=result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/parse-resume", response_model=AnalysisResponse)
async def parse_resume(request: ResumeParseRequest):
    """
    Parse a resume and extract structured information
    
    Returns:
        - Contact information
        - Skills with proficiency levels
        - Work experience with achievements
        - Education and certifications
    """
    try:
        if not request.resume_text or len(request.resume_text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail="Resume text too short. Please provide your full resume."
            )
        
        result = await ai_service.parse_resume(request.resume_text)
        
        if "error" in result:
            return AnalysisResponse(success=False, data={}, error=result.get("error"))
        
        return AnalysisResponse(success=True, data=result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/match", response_model=AnalysisResponse)
async def match_resume_to_job(request: MatchRequest):
    """
    Compare a resume against a job description
    
    Returns:
        - Overall match score (0-100)
        - Matching vs missing skills
        - Resume improvement suggestions
        - Keywords to add
        - Interview talking points
    """
    try:
        if not request.job_text or len(request.job_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Job description too short.")
        
        if not request.resume_text or len(request.resume_text.strip()) < 100:
            raise HTTPException(status_code=400, detail="Resume text too short.")
        
        # Parse both documents
        job_data = await ai_service.parse_job_description(request.job_text)
        resume_data = await ai_service.parse_resume(request.resume_text)
        
        if "error" in job_data:
            return AnalysisResponse(success=False, data={}, error="Failed to parse job description")
        
        if "error" in resume_data:
            return AnalysisResponse(success=False, data={}, error="Failed to parse resume")
        
        # Perform matching
        match_result = await ai_service.match_resume_to_job(job_data, resume_data)
        
        if "error" in match_result:
            return AnalysisResponse(success=False, data={}, error=match_result.get("error"))
        
        # Include parsed data in response for reference
        return AnalysisResponse(
            success=True, 
            data={
                "match": match_result,
                "job": job_data,
                "resume": resume_data
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/cover-letter", response_model=CoverLetterResponse)
async def generate_cover_letter(request: CoverLetterRequest):
    """
    Generate a tailored cover letter
    
    Parameters:
        - job_text: The job description
        - resume_text: The candidate's resume
        - tone: professional (default), casual, or enthusiastic
    
    Returns:
        - A customized cover letter
    """
    try:
        if not request.job_text or len(request.job_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Job description too short.")
        
        if not request.resume_text or len(request.resume_text.strip()) < 100:
            raise HTTPException(status_code=400, detail="Resume text too short.")
        
        # Parse documents and match
        job_data = await ai_service.parse_job_description(request.job_text)
        resume_data = await ai_service.parse_resume(request.resume_text)
        
        if "error" in job_data or "error" in resume_data:
            return CoverLetterResponse(
                success=False, 
                cover_letter="",
                error="Failed to parse documents"
            )
        
        match_data = await ai_service.match_resume_to_job(job_data, resume_data)
        
        # Generate cover letter
        cover_letter = await ai_service.generate_cover_letter(
            job_data, 
            resume_data, 
            match_data,
            tone=request.tone or "professional"
        )
        
        return CoverLetterResponse(success=True, cover_letter=cover_letter)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/interview-questions", response_model=AnalysisResponse)
async def get_interview_questions(request: MatchRequest):
    """
    Generate likely interview questions based on job and resume
    
    Returns:
        - List of predicted questions
        - Question type (behavioral, technical, etc.)
        - Answer tips and relevant experience to mention
    """
    try:
        job_data = await ai_service.parse_job_description(request.job_text)
        resume_data = await ai_service.parse_resume(request.resume_text)
        
        if "error" in job_data or "error" in resume_data:
            return AnalysisResponse(success=False, data={}, error="Failed to parse documents")
        
        questions = await ai_service.generate_interview_questions(job_data, resume_data)
        
        return AnalysisResponse(success=True, data={"questions": questions})
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============== Quick Analysis Endpoint ==============
# This is the main endpoint the Chrome extension will use

class QuickAnalysisRequest(BaseModel):
    job_text: str
    resume_text: str
    include_cover_letter: Optional[bool] = False
    include_interview_questions: Optional[bool] = False


# ============== File Upload Endpoints ==============

@app.post("/api/v1/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """
    Upload a resume file (PDF, DOCX, or TXT) and extract text
    
    Returns:
        - Extracted text from the file
        - Parsed resume data
    """
    try:
        # Validate file type
        allowed_types = ['.pdf', '.docx', '.txt']
        file_ext = '.' + file.filename.split('.')[-1].lower() if '.' in file.filename else ''
        
        if file_ext not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Please upload PDF, DOCX, or TXT. Got: {file.filename}"
            )
        
        # Read file content
        content = await file.read()
        
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
        
        if len(content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
        
        # Extract text
        resume_text = extract_text_from_file(content, file.filename)
        
        if len(resume_text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail="Could not extract enough text from file. Please ensure the file contains your resume."
            )
        
        # Parse the resume
        parsed = await ai_service.parse_resume(resume_text)
        
        return {
            "success": True,
            "filename": file.filename,
            "text": resume_text,
            "parsed": parsed if "error" not in parsed else None,
            "text_length": len(resume_text)
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")


@app.post("/api/v1/analyze-with-file")
async def analyze_with_file(
    job_text: str,
    file: UploadFile = File(...),
    include_cover_letter: bool = False
):
    """
    Upload resume file and analyze against a job description in one request
    """
    try:
        # Read and parse the file
        content = await file.read()
        resume_text = extract_text_from_file(content, file.filename)
        
        if len(resume_text.strip()) < 100:
            raise HTTPException(status_code=400, detail="Could not extract text from resume file")
        
        if len(job_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Job description too short")
        
        # Parse both documents
        job_data = await ai_service.parse_job_description(job_text)
        resume_data = await ai_service.parse_resume(resume_text)
        
        if "error" in job_data:
            raise HTTPException(status_code=400, detail="Could not parse job description")
        
        if "error" in resume_data:
            raise HTTPException(status_code=400, detail="Could not parse resume")
        
        # Perform matching
        match_data = await ai_service.match_resume_to_job(job_data, resume_data)
        
        response = {
            "success": True,
            "job": job_data,
            "resume_summary": {
                "name": resume_data.get("name"),
                "total_experience_years": resume_data.get("total_experience_years"),
                "top_skills": [s["skill"] for s in resume_data.get("skills", [])[:10]],
                "current_role": resume_data.get("experience", [{}])[0].get("title") if resume_data.get("experience") else None
            },
            "match": match_data,
            "resume_text": resume_text  # Include for future edits
        }
        
        # Add cover letter if requested
        if include_cover_letter:
            cover_letter = await ai_service.generate_cover_letter(
                job_data, resume_data, match_data
            )
            response["cover_letter"] = cover_letter
        
        return response
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/v1/analyze")
async def quick_analysis(request: QuickAnalysisRequest):
    """
    One-stop analysis endpoint for Chrome extension
    
    Performs:
        1. Job parsing
        2. Resume parsing  
        3. Match analysis
        4. Optionally: cover letter and interview questions
    
    This is the primary endpoint used by the Chrome extension
    """
    try:
        # Parse both documents
        job_data = await ai_service.parse_job_description(request.job_text)
        resume_data = await ai_service.parse_resume(request.resume_text)
        
        if "error" in job_data:
            raise HTTPException(status_code=400, detail="Could not parse job description")
        
        if "error" in resume_data:
            raise HTTPException(status_code=400, detail="Could not parse resume")
        
        # Perform matching
        match_data = await ai_service.match_resume_to_job(job_data, resume_data)
        
        response = {
            "success": True,
            "job": job_data,
            "resume_summary": {
                "name": resume_data.get("name"),
                "total_experience_years": resume_data.get("total_experience_years"),
                "top_skills": [s["skill"] for s in resume_data.get("skills", [])[:10]],
                "current_role": resume_data.get("experience", [{}])[0].get("title") if resume_data.get("experience") else None
            },
            "match": match_data
        }
        
        # Add cover letter if requested
        if request.include_cover_letter:
            cover_letter = await ai_service.generate_cover_letter(
                job_data, resume_data, match_data
            )
            response["cover_letter"] = cover_letter
        
        # Add interview questions if requested
        if request.include_interview_questions:
            questions = await ai_service.generate_interview_questions(job_data, resume_data)
            response["interview_questions"] = questions
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Run Server ==============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# ============== Generate Tailored Resume Endpoint ==============

class GenerateResumeRequest(BaseModel):
    resume_text: str
    job_text: Optional[str] = None
    job_data: Optional[dict] = None
    match_data: Optional[dict] = None
    resume_data: Optional[dict] = None
    improvements: List[str] = []
    keywords: List[str] = []
    include_skills: bool = True
    include_keywords: bool = True


class GenerateCoverLetterRequest(BaseModel):
    resume_text: str
    job_data: Optional[dict] = None
    job_text: Optional[str] = None
    match_data: Optional[dict] = None
    resume_data: Optional[dict] = None
    tone: str = "professional"
    keywords: List[str] = []


@app.post("/api/v1/generate-resume")
async def generate_tailored_resume(request: GenerateResumeRequest):
    """
    Generate a tailored resume based on selected improvements and keywords
    """
    try:
        # Get job text from job_data or direct job_text
        job_text = request.job_text or ""
        if request.job_data:
            job_text = request.job_data.get('raw_text', '') or request.job_data.get('description', '') or str(request.job_data)
        
        if not job_text or len(job_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Job description too short.")
        
        # Build the generation prompt
        improvements_text = "\n".join(f"- {imp}" for imp in request.improvements) if request.improvements else "None selected"
        keywords_text = ", ".join(request.keywords) if request.keywords else "None selected"
        
        system_prompt = """You are an expert resume writer. Your task is to rewrite a resume to better match a specific job posting.

Rules:
- Keep the same person's real experience and education - DO NOT invent new jobs or degrees
- Reword bullet points to better highlight relevant skills
- Add keywords naturally where they fit the person's actual experience  
- Improve the summary/objective to target this specific role
- Reorganize sections to put most relevant experience first
- Use strong action verbs and quantify achievements where possible
- Keep the format clean and professional
- Output ONLY the resume text, no commentary

The goal is to present the same person's real background in the best possible light for THIS specific job."""

        user_prompt = f"""Rewrite this resume to better match the job posting.

ORIGINAL RESUME:
{request.resume_text}

JOB POSTING:
{job_text}

IMPROVEMENTS TO INCORPORATE:
{improvements_text}

KEYWORDS TO INCLUDE (where they naturally fit):
{keywords_text}

Generate the improved resume now. Output only the resume text."""

        tailored_resume = await ai_service._call_claude(system_prompt, user_prompt, max_tokens=4000)
        
        return {
            "success": True,
            "content": tailored_resume.strip(),
            "resume": tailored_resume.strip()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/generate-cover-letter")
async def generate_cover_letter_v2(request: GenerateCoverLetterRequest):
    """
    Generate a tailored cover letter (v2 endpoint for dashboard)
    Accepts pre-parsed job_data and match_data
    """
    try:
        # Get job text from job_data or direct job_text
        job_text = request.job_text or ""
        if request.job_data:
            job_text = request.job_data.get('raw_text', '') or request.job_data.get('description', '') or str(request.job_data)
        
        if not job_text or len(job_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Job description too short.")
        
        if not request.resume_text or len(request.resume_text.strip()) < 100:
            raise HTTPException(status_code=400, detail="Resume text too short.")
        
        # Use provided data or parse fresh
        job_data = request.job_data or await ai_service.parse_job_description(job_text)
        resume_data = request.resume_data or await ai_service.parse_resume(request.resume_text)
        match_data = request.match_data or await ai_service.match_resume_to_job(job_data, resume_data)
        
        # Generate cover letter
        cover_letter = await ai_service.generate_cover_letter(
            job_data, 
            resume_data, 
            match_data,
            tone=request.tone
        )
        
        return {
            "success": True,
            "content": cover_letter,
            "cover_letter": cover_letter
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Format-Preserving Resume Edit ==============

@app.post("/api/v1/edit-resume-docx")
async def edit_resume_docx_endpoint(
    file: UploadFile = File(...),
    job_text: str = Form(""),
    keywords: str = Form(""),
    improvements: str = Form("")
):
    """
    Safe Resume Enhancement
    
    This endpoint:
    1. Keeps the original resume exactly as-is
    2. Only ADDS keywords where appropriate (skills section, relevant bullets)
    3. Preserves all original formatting, spacing, and styling
    """
    from fastapi.responses import Response
    
    try:
        print(f"=== SAFE RESUME ENHANCEMENT ===")
        print(f"File: {file.filename}")
        print(f"Keywords: {keywords}")
        
        # Validate file type
        if not file.filename.lower().endswith('.docx'):
            raise HTTPException(
                status_code=400,
                detail="Only .docx files are supported."
            )
        
        # Read file content
        content = await file.read()
        print(f"File size: {len(content)} bytes")
        
        # Parse keywords
        keywords_list = [k.strip() for k in keywords.split(',') if k.strip()]
        print(f"Keywords to add: {keywords_list}")
        
        if not keywords_list:
            # No keywords selected, return original
            return Response(
                content=content,
                media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                headers={
                    'Content-Disposition': f'attachment; filename="tailored-{file.filename}"'
                }
            )
        
        # Safely add keywords to the original document
        modified_docx = create_tailored_resume_from_template(
            content,
            {'keywords': keywords_list}
        )
        
        print(f"Modified DOCX: {len(modified_docx)} bytes")
        
        return Response(
            content=modified_docx,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'Content-Disposition': f'attachment; filename="tailored-{file.filename}"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to enhance resume: {str(e)}")


# ============== Download Endpoint ==============

class DownloadRequest(BaseModel):
    content: str
    filename: str
    format: str  # 'docx', 'pdf', or 'txt'


@app.post("/api/v1/download")
async def download_file(request: DownloadRequest):
    """
    Convert content to DOCX or PDF for download
    """
    from fastapi.responses import Response
    
    try:
        if request.format == 'txt':
            return Response(
                content=request.content.encode('utf-8'),
                media_type='text/plain',
                headers={'Content-Disposition': f'attachment; filename="{request.filename}.txt"'}
            )
        
        elif request.format == 'docx':
            from docx import Document
            from docx.shared import Pt, Inches
            
            doc = Document()
            
            # Set margins
            for section in doc.sections:
                section.left_margin = Inches(1)
                section.right_margin = Inches(1)
            
            # Split content into paragraphs and add to document
            paragraphs = request.content.split('\n')
            for para_text in paragraphs:
                if para_text.strip():
                    p = doc.add_paragraph(para_text.strip())
                    p.style.font.size = Pt(11)
            
            # Save to bytes
            file_stream = io.BytesIO()
            doc.save(file_stream)
            file_stream.seek(0)
            
            return Response(
                content=file_stream.read(),
                media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                headers={'Content-Disposition': f'attachment; filename="{request.filename}.docx"'}
            )
        
        elif request.format == 'pdf':
            # Text-to-PDF using reportlab with proper text wrapping
            try:
                from reportlab.lib.pagesizes import letter
                from reportlab.pdfgen import canvas
                from reportlab.lib.units import inch
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
                from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY
                
                file_stream = io.BytesIO()
                doc = SimpleDocTemplate(
                    file_stream, 
                    pagesize=letter,
                    leftMargin=inch,
                    rightMargin=inch,
                    topMargin=inch,
                    bottomMargin=inch
                )
                
                # Create styles
                styles = getSampleStyleSheet()
                body_style = ParagraphStyle(
                    'Body',
                    parent=styles['Normal'],
                    fontSize=11,
                    leading=16,  # Line height
                    alignment=TA_LEFT,
                    spaceAfter=12
                )
                
                # Build content
                story = []
                
                # Split by paragraphs (double newline or single newline)
                paragraphs = request.content.split('\n\n')
                for para in paragraphs:
                    # Clean up the paragraph
                    clean_para = para.strip().replace('\n', ' ')
                    if clean_para:
                        # Escape special characters for reportlab
                        clean_para = clean_para.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                        story.append(Paragraph(clean_para, body_style))
                        story.append(Spacer(1, 6))
                
                doc.build(story)
                file_stream.seek(0)
                
                return Response(
                    content=file_stream.read(),
                    media_type='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename="{request.filename}.pdf"'}
                )
            except ImportError:
                # Fallback to text if reportlab not available
                return Response(
                    content=request.content.encode('utf-8'),
                    media_type='text/plain',
                    headers={'Content-Disposition': f'attachment; filename="{request.filename}.txt"'}
                )
        
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {request.format}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
