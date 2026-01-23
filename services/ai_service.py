"""
AI Service - Interfaces with Claude API for all AI operations
"""

import os
import json
from typing import Optional, List
import httpx

# Will use environment variable in production
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

class AIService:
    """Service for all AI-powered operations using Claude API"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or ANTHROPIC_API_KEY
        # Using Claude Sonnet 4 - current model as of 2025
        self.model = "claude-sonnet-4-20250514"
        
    async def _call_claude(self, system_prompt: str, user_message: str, max_tokens: int = 2000) -> str:
        """Make a call to Claude API"""
        
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01"
        }
        
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_message}
            ]
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    ANTHROPIC_API_URL,
                    headers=headers,
                    json=payload,
                    timeout=60.0
                )
                
                if response.status_code != 200:
                    error_detail = response.text
                    print(f"API Error {response.status_code}: {error_detail}")
                    raise Exception(f"API Error {response.status_code}: {error_detail}")
                
                result = response.json()
                return result["content"][0]["text"]
            except httpx.HTTPStatusError as e:
                print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
                raise
            except Exception as e:
                print(f"Error calling Claude API: {e}")
                raise
    
    async def parse_job_description(self, job_text: str) -> dict:
        """
        Parse a job description and extract structured requirements
        """
        
        system_prompt = """You are an expert job description analyzer. Your task is to extract structured information from job postings.

Always respond with valid JSON only, no other text. Use this exact structure:
{
    "job_title": "string",
    "company": "string or null if not mentioned",
    "location": "string or null",
    "remote_policy": "remote | hybrid | onsite | not_specified",
    "experience_years": {
        "min": number or null,
        "max": number or null
    },
    "salary_range": {
        "min": number or null,
        "max": number or null,
        "currency": "string or null"
    },
    "required_skills": [
        {
            "skill": "string",
            "importance": "must_have | preferred",
            "category": "technical | soft | domain"
        }
    ],
    "education": {
        "degree_level": "high_school | bachelors | masters | phd | not_specified",
        "fields": ["string"],
        "required": boolean
    },
    "responsibilities": ["string"],
    "benefits": ["string"],
    "keywords": ["string - important terms that should appear in a resume"],
    "red_flags": ["string - any concerning aspects of the job"],
    "summary": "2-3 sentence summary of ideal candidate"
}"""

        user_message = f"""Analyze this job description and extract all relevant information:

---
{job_text}
---

Return only valid JSON."""

        result = await self._call_claude(system_prompt, user_message, max_tokens=2500)
        
        # Parse the JSON response
        try:
            # Clean up response if needed (sometimes Claude adds markdown code blocks)
            cleaned = result.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            
            return json.loads(cleaned.strip())
        except json.JSONDecodeError:
            # Return raw text if parsing fails
            return {"error": "Failed to parse response", "raw": result}
    
    async def parse_resume(self, resume_text: str) -> dict:
        """
        Parse a resume and extract structured information
        """
        
        system_prompt = """You are an expert resume analyzer. Your task is to extract structured information from resumes.

Always respond with valid JSON only, no other text. Use this exact structure:
{
    "name": "string",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedin": "string or null",
    "summary": "string - professional summary if present",
    "total_experience_years": number,
    "skills": [
        {
            "skill": "string",
            "proficiency": "beginner | intermediate | advanced | expert",
            "category": "technical | soft | domain"
        }
    ],
    "experience": [
        {
            "company": "string",
            "title": "string",
            "start_date": "string",
            "end_date": "string or 'Present'",
            "duration_months": number,
            "responsibilities": ["string"],
            "achievements": ["string - quantified achievements with numbers"],
            "skills_used": ["string"]
        }
    ],
    "education": [
        {
            "institution": "string",
            "degree": "string",
            "field": "string",
            "graduation_year": number or null,
            "gpa": number or null
        }
    ],
    "certifications": ["string"],
    "keywords": ["string - important terms present in resume"]
}"""

        user_message = f"""Analyze this resume and extract all relevant information:

---
{resume_text}
---

Return only valid JSON."""

        result = await self._call_claude(system_prompt, user_message, max_tokens=3000)
        
        try:
            cleaned = result.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            
            return json.loads(cleaned.strip())
        except json.JSONDecodeError:
            return {"error": "Failed to parse response", "raw": result}
    
    async def match_resume_to_job(self, job_data: dict, resume_data: dict) -> dict:
        """
        Compare a parsed resume against a parsed job description with ATS optimization insights.
        
        Based on hiring insights:
        - 70-75% of resumes filtered by ATS before human review
        - Recruiters spend 6-10 seconds on initial scan
        - Keyword matching and language mirroring are critical
        """
        
        system_prompt = """You are an expert ATS (Applicant Tracking System) analyst and career coach. Your job is to help candidates pass automated screening AND impress human recruiters in their 6-10 second initial scan.

CRITICAL CONTEXT:
- 70-75% of resumes are filtered out by ATS before a human sees them
- ATS systems score resumes based on keyword matches to job descriptions
- Recruiters spend only 6-10 seconds on initial review
- Mirroring the EXACT language from job postings dramatically improves match rates

Always respond with valid JSON only, no other text. Use this exact structure:
{
    "overall_match_score": number (0-100),
    "ats_optimization": {
        "estimated_ats_score": number (0-100, how likely to pass ATS screening),
        "keyword_match_rate": number (percentage of job keywords found in resume),
        "critical_missing_keywords": ["string - MUST-HAVE keywords from job that are missing"],
        "keyword_variations_needed": [
            {
                "job_uses": "string - exact phrase from job posting",
                "resume_has": "string - what resume says instead (or 'missing')",
                "recommendation": "string - use exact job phrase"
            }
        ],
        "ats_warnings": ["string - format issues that may cause ATS problems"]
    },
    "recruiter_scan": {
        "first_impression": "string - what stands out in 6 seconds",
        "immediate_strengths": ["string - things that immediately signal 'strong fit'"],
        "immediate_concerns": ["string - red flags visible in quick scan"],
        "headline_suggestion": "string - a powerful 1-line summary for top of resume"
    },
    "recommendation": "strong_match | good_match | needs_work | not_recommended",
    "matching_skills": [
        {
            "skill": "string",
            "job_requirement": "must_have | preferred",
            "resume_evidence": "string - where this appears in resume",
            "keyword_match": "exact | partial | implied"
        }
    ],
    "missing_skills": [
        {
            "skill": "string",
            "importance": "must_have | preferred",
            "suggestion": "string - specific way to add this to resume",
            "where_to_add": "string - which section/bullet to modify"
        }
    ],
    "experience_match": {
        "meets_requirements": boolean,
        "years_required": number or null,
        "years_candidate_has": number,
        "relevant_roles": ["string - job titles that are relevant"],
        "experience_gap_strategy": "string - how to address any gaps"
    },
    "education_match": {
        "meets_requirements": boolean,
        "notes": "string"
    },
    "keyword_analysis": {
        "total_job_keywords": number,
        "keywords_found": number,
        "match_percentage": number,
        "present_keywords": ["string - job keywords found in resume (exact matches)"],
        "partial_matches": ["string - similar terms that should be made exact"],
        "missing_keywords": ["string - important keywords to add"],
        "keyword_density_issues": ["string - keywords that should appear more often"]
    },
    "bullet_point_rewrites": [
        {
            "original": "string - current bullet point from resume",
            "rewritten": "string - improved version with job keywords and metrics",
            "keywords_added": ["string - which job keywords this adds"],
            "priority": "high | medium | low"
        }
    ],
    "resume_improvements": [
        {
            "section": "string",
            "current": "string - what's there now (brief)",
            "suggestion": "string - specific improvement with exact wording",
            "impact": "string - why this matters for ATS/recruiter",
            "priority": "high | medium | low"
        }
    ],
    "talking_points": ["string - strengths to emphasize in cover letter/interview"],
    "concerns": ["string - potential objections employer might have"],
    "quick_wins": [
        {
            "action": "string - specific 1-minute fix",
            "impact": "high | medium",
            "example": "string - exact before/after text"
        }
    ],
    "ats_pass_likelihood": {
        "score": "number 0-100",
        "verdict": "likely_pass | borderline | likely_fail",
        "reasoning": "string - why this score"
    },
    "application_strategy": {
        "match_level": "string - honest assessment of fit",
        "should_apply": boolean,
        "application_tips": ["string - specific advice for this application"],
        "networking_angle": "string - how to find a referral or connection"
    },
    "summary": "3-4 sentence overall assessment focusing on ATS likelihood and key actions"
}

IMPORTANT GUIDELINES:
1. For keyword_variations_needed, find cases where the resume uses different terminology than the job posting
2. For bullet_point_rewrites, provide 2-4 specific rewrites with EXACT before/after text
3. For quick_wins, identify 3-5 changes that take <1 minute but significantly improve ATS match
4. For ats_pass_likelihood, be realistic: most unoptimized resumes score 30-50%
5. Be brutally specific - vague advice like "add more keywords" doesn't help
6. Include EXACT phrases from the job posting that should appear in the resume

QUICK WIN EXAMPLES:
- "Add 'cross-functional collaboration' to skills section" (if job requires it)
- "Change 'worked with teams' to 'led cross-functional teams' in bullet 3"
- "Add 'Python' and 'SQL' to technical skills (mentioned 4x in job posting)"
- "Include both 'ML' and 'Machine Learning' in resume (ATS may search either)"

The estimated_ats_score should reflect realistic keyword matching:
- 0-30%: Missing most critical keywords, likely auto-rejected
- 31-50%: Some matches but key terms missing, borderline
- 51-70%: Good keyword coverage, likely passes ATS
- 71-85%: Strong match, high chance of human review
- 86-100%: Excellent match, optimized for this specific role"""

        user_message = f"""Analyze this resume against this job posting for ATS optimization and recruiter appeal:

JOB POSTING:
{json.dumps(job_data, indent=2)}

CANDIDATE RESUME:
{json.dumps(resume_data, indent=2)}

Provide comprehensive analysis focusing on:
1. Will this pass ATS screening? Calculate exact keyword match percentage
2. What will a recruiter notice in their 6-second scan?
3. Specific bullet point rewrites with EXACT before/after text
4. 3-5 QUICK WINS: specific 1-minute changes that boost ATS score
5. Honest assessment: is this a strong, weak, or borderline match?

Return only valid JSON."""

        result = await self._call_claude(system_prompt, user_message, max_tokens=5000)
        
        try:
            cleaned = result.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            
            return json.loads(cleaned.strip())
        except json.JSONDecodeError:
            return {"error": "Failed to parse response", "raw": result}
    
    async def generate_cover_letter(self, job_data: dict, resume_data: dict, match_data: dict, tone: str = "professional") -> str:
        """
        Generate a tailored cover letter using the Problem-Solution format.
        
        RESEARCH-BACKED APPROACH (based on analysis of 80+ cover letter studies):
        - 94% of hiring managers say cover letters influence interview decisions
        - 66% of recruiters prefer half-page or less (150-250 words)
        - Problem-Solution format consistently outperforms other formats
        - 83% read cover letters - make every word count
        """
        
        # Helper function to safely extract skill names
        def get_skill_names(skills_list, max_count=10):
            if not skills_list:
                return []
            result = []
            for s in skills_list[:max_count]:
                if isinstance(s, dict):
                    result.append(s.get('skill', s.get('name', str(s))))
                else:
                    result.append(str(s))
            return result
        
        def safe_get(obj, *keys, default=''):
            """Safely traverse nested dictionaries"""
            for key in keys:
                if isinstance(obj, dict):
                    obj = obj.get(key, {})
                else:
                    return default
            return obj if obj else default
        
        tone_instructions = {
            "professional": "Confident and direct. Shows authority without arrogance.",
            "enthusiastic": "Energetic but focused. Passionate yet professional.",
            "conversational": "Warm and personable. Professional with personality."
        }
        
        # Extract ATS-critical keywords from match analysis
        critical_keywords = safe_get(match_data, 'ats_optimization', 'critical_missing_keywords', default=[])
        if not critical_keywords:
            critical_keywords = safe_get(match_data, 'keyword_analysis', 'missing_keywords', default=[])
        
        system_prompt = f"""You are an expert cover letter writer using the PROBLEM-SOLUTION format - 
the highest-performing cover letter approach based on analysis of 80+ hiring studies.

=== THE PROBLEM-SOLUTION FORMAT (3 paragraphs, 150-250 words TOTAL) ===

**PARAGRAPH 1 - HOOK + THEIR PROBLEM (2-3 sentences)**
- Open with company-specific detail (product, challenge, growth, news)
- Identify a problem or need implicit in the job posting
- Position yourself as the solution in ONE sentence
- NEVER: "I am writing to apply..." or "I am excited about..."

Example: "As [Company] scales its [product/market], the need for [role requirement] becomes critical. 
My background in [relevant skill] positions me to deliver immediate impact."

**PARAGRAPH 2 - YOUR SOLUTION + PROOF (3-4 sentences)**
- State how you solve their problem
- ONE achievement using STAR method with NUMBERS
- Use EXACT terminology from job posting
- Make the connection explicit ("Your need for X aligns directly with my experience...")

**PARAGRAPH 3 - CLOSE (2-3 sentences)**
- Brief reference to company mission/values (specific, not generic)
- Confident request for conversation
- End with "Sincerely," and name

=== CRITICAL RULES ===
1. 150-250 WORDS MAXIMUM - shorter is better, every word must earn its place
2. PROBLEM-SOLUTION: What do they need? → How do you solve it? → Proof you've done it
3. MIRROR EXACT PHRASES from job posting (ATS scans cover letters too)
4. ONE achievement with NUMBERS - quality over quantity
5. NO CLICHÉS: team player, passionate, excited, hard worker, dynamic, go-getter
6. NO BEGGING: confident, not desperate
7. COMPANY-SPECIFIC: If you could send this to any company, it's too generic

=== TONE ===
{tone_instructions.get(tone, tone_instructions['professional'])}

=== OUTPUT ===
Write ONLY the cover letter. Start directly with paragraph 1. No headers or explanations.
End with:
Sincerely,
[Full Name]"""

        # Extract candidate information
        recent_experience = resume_data.get('experience', [{}])[0] if resume_data.get('experience') else {}
        education = resume_data.get('education', [{}])[0] if resume_data.get('education') else {}
        
        # Safely extract skills
        required_skills = get_skill_names(job_data.get('required_skills', []), 5)
        candidate_skills = get_skill_names(resume_data.get('skills', []), 8)
        matching_skills = match_data.get('matching_skills', [])
        if matching_skills and isinstance(matching_skills[0], dict):
            matching_skills = [s.get('skill', str(s)) for s in matching_skills[:4]]
        else:
            matching_skills = [str(s) for s in matching_skills[:4]] if matching_skills else []
        
        # Safely get responsibilities
        responsibilities = job_data.get('responsibilities', [])
        if responsibilities and isinstance(responsibilities[0], dict):
            responsibilities = [r.get('description', str(r)) for r in responsibilities[:3]]
        else:
            responsibilities = [str(r) for r in responsibilities[:3]] if responsibilities else []
        
        # Safely get achievements - find the most quantified one
        achievements = recent_experience.get('achievements', [])
        if not achievements:
            achievements = recent_experience.get('responsibilities', [])
        if achievements and isinstance(achievements[0], dict):
            achievements = [a.get('description', str(a)) for a in achievements[:3]]
        else:
            achievements = [str(a).strip() for a in achievements[:3] if str(a).strip()]
        
        # Get candidate name
        candidate_name = resume_data.get('name', resume_data.get('contact', {}).get('name', 'Candidate'))
        
        # Extract ATS keywords to incorporate
        ats_keywords = []
        if isinstance(critical_keywords, list):
            ats_keywords = critical_keywords[:4]
        
        user_message = f"""Write a PROBLEM-SOLUTION cover letter (150-250 words) for this application:

=== TARGET JOB ===
Position: {job_data.get('job_title', 'Position')}
Company: {job_data.get('company', 'the company')}

Key Requirements (USE THESE EXACT PHRASES):
{chr(10).join(['• ' + skill for skill in required_skills]) if required_skills else '• See job description'}

Main Responsibilities:
{chr(10).join(['• ' + resp for resp in responsibilities]) if responsibilities else '• See job description'}

=== CANDIDATE ===
Name: {candidate_name}
Current Role: {recent_experience.get('title', 'Professional')} at {recent_experience.get('company', 'Previous Company')}
Experience: {resume_data.get('total_experience_years', 'Several')} years

Key Achievement (use STAR format with numbers):
{achievements[0] if achievements else 'Strong track record of delivery'}

Relevant Skills: {', '.join(matching_skills) if matching_skills else ', '.join(candidate_skills[:5])}

MISSING KEYWORDS TO INCORPORATE:
{', '.join(ats_keywords) if ats_keywords else 'Use job posting terminology'}

=== TASK ===
Write a 150-250 word cover letter using the Problem-Solution format:
1. What problem does {job_data.get('company', 'the company')} face? (hint: look at responsibilities)
2. How do you solve it? (connect your experience directly)
3. Prove it with ONE numbered achievement

End with:
Sincerely,
{candidate_name}

Write the cover letter now (150-250 words):"""

        result = await self._call_claude(system_prompt, user_message, max_tokens=1200)
        return result.strip()
    
    async def generate_interview_questions(self, job_data: dict, resume_data: dict) -> list:
        """
        Predict likely interview questions based on job and resume
        """
        
        system_prompt = """You are an experienced hiring manager and interview coach. Generate likely interview questions for a candidate.

Return valid JSON only - a list of question objects:
[
    {
        "question": "string",
        "type": "behavioral | technical | situational | background",
        "why_asked": "string - why interviewer asks this",
        "answer_tips": "string - how candidate should approach this",
        "relevant_experience": "string or null - specific resume item to reference"
    }
]

Generate 10 questions covering different types."""

        user_message = f"""Generate interview questions for:

JOB: {job_data.get('job_title', 'Position')} at {job_data.get('company', 'Company')}
Key Skills Required: {', '.join([s['skill'] for s in job_data.get('required_skills', [])[:6]])}

CANDIDATE:
Current Role: {resume_data.get('experience', [{}])[0].get('title', 'N/A') if resume_data.get('experience') else 'N/A'}
Years Experience: {resume_data.get('total_experience_years', 0)}
Key Skills: {', '.join([s['skill'] for s in resume_data.get('skills', [])[:6]])}

Return only the JSON array."""

        result = await self._call_claude(system_prompt, user_message, max_tokens=2500)
        
        try:
            cleaned = result.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            
            return json.loads(cleaned.strip())
        except json.JSONDecodeError:
            return [{"error": "Failed to parse response", "raw": result}]

    async def intelligently_enhance_resume(self, resume_text: str, job_text: str, keywords: List[str]) -> str:
        """
        Use AI to strategically enhance a resume for ATS and recruiter scanning.
        
        RESEARCH-BACKED APPROACH:
        - 70-75% of resumes filtered by ATS before human review
        - 99.7% of recruiters use keyword filters in ATS
        - Exact keyword matching is critical (not synonyms)
        - Recruiters spend 6 seconds - quantified achievements catch attention
        - Both acronym AND spelled-out versions should appear
        
        Returns structured JSON for document creation.
        """
        
        keywords_str = ', '.join(keywords) if keywords else 'None specified'
        
        system_prompt = """You are an expert ATS-optimized resume writer. Your goal is to help this resume 
PASS automated screening (ATS) AND impress humans in their 6-second scan.

=== ATS OPTIMIZATION RULES ===
1. USE EXACT PHRASES from job posting - ATS does literal matching
   - If job says "stakeholder management", use "stakeholder management" (not "working with people")
   - If job says "cross-functional collaboration", use that exact phrase
   
2. INCLUDE BOTH acronym AND spelled-out versions:
   - "Application-Specific Integrated Circuit (ASIC)" not just "ASIC"
   - "Applicant Tracking System (ATS)" not just "ATS"
   
3. USE STANDARD SECTION HEADERS that ATS recognizes:
   - "Professional Experience" or "Work Experience"
   - "Education"  
   - "Technical Skills" or "Skills"
   - "Projects" (not "Personal Projects" or "Side Projects")

4. ADD QUANTIFIED ACHIEVEMENTS with numbers:
   - Numbers catch eye in 6-second scan
   - "Reduced development time by 30%" not "Improved efficiency"
   - "Managed team of 5 engineers" not "Led team"

=== OUTPUT FORMAT ===
Return ONLY valid JSON with this structure (no markdown, no explanation):

{
  "name": "Full Name",
  "contact": "email@example.com | (123) 456-7890 | City, State | linkedin.com/in/profile",
  "professional_summary": "2-3 sentence summary using job's exact terminology and key achievements with numbers",
  "skills": [
    {"category": "Technical Skills", "items": "Skill1, Skill2 (ACRONYM), Skill3"},
    {"category": "Tools & Technologies", "items": "Tool1, Tool2, Tool3"},
    {"category": "Domain Expertise", "items": "Area1, Area2"}
  ],
  "experience": [
    {
      "company": "Company Name",
      "location": "City, State",
      "title": "Job Title (align to job posting terminology)",
      "dates": "Month Year - Present",
      "bullets": [
        "Action verb + specific achievement with NUMBER + skill from job posting",
        "Another quantified achievement using exact job terminology"
      ]
    }
  ],
  "education": [
    {
      "school": "University Name",
      "location": "City, State", 
      "degree": "Degree Name, Major",
      "dates": "Graduation Year",
      "details": "GPA if 3.5+, relevant coursework, honors"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "date": "Year",
      "description": "One line with relevant technology/skill from job",
      "bullets": ["Achievement with number", "Another achievement"]
    }
  ],
  "certifications": ["Certification Name (Acronym) - Year"]
}

=== CRITICAL RULES ===
1. PRESERVE: All original jobs, companies, dates, education - copy exactly
2. ENHANCE: Rewrite bullet points to include job posting keywords NATURALLY
3. QUANTIFY: Add numbers to every bullet point possible (%, $, time, scale)
4. MIRROR: Use exact terminology from job posting, not synonyms
5. TRUTH: Only add skills/experience the candidate actually has
6. Return ONLY the JSON, no other text"""

        user_prompt = f"""Optimize this resume for ATS screening and recruiter appeal.

TARGET KEYWORDS TO INCORPORATE (use exact phrases):
{keywords_str}

===== ORIGINAL RESUME =====
{resume_text}

===== TARGET JOB POSTING =====
{job_text[:4000]}

TASK: Rewrite the resume to:
1. Mirror exact terminology from the job posting
2. Add quantified achievements (numbers) to every bullet
3. Include both acronym and spelled-out versions of technical terms
4. Keep all facts truthful - only enhance presentation

Return ONLY the JSON structure:"""

        result = await self._call_claude(system_prompt, user_prompt, max_tokens=5000)
        
        # Clean up the response - remove any markdown if present
        result = result.strip()
        if result.startswith("```json"):
            result = result[7:]
        if result.startswith("```"):
            result = result[3:]
        if result.endswith("```"):
            result = result[:-3]
        
        return result.strip()


# Synchronous wrapper for testing
def _sync_call(coro):
    """Helper to run async code synchronously for testing"""
    import asyncio
    return asyncio.run(coro)


if __name__ == "__main__":
    # Quick test
    service = AIService()
    
    test_job = """
    Senior Software Engineer - Backend
    
    Acme Corp is looking for a Senior Backend Engineer to join our growing team.
    
    Requirements:
    - 5+ years of experience in backend development
    - Strong proficiency in Python and FastAPI or Django
    - Experience with PostgreSQL and Redis
    - Familiarity with AWS services (EC2, S3, Lambda)
    - Experience with microservices architecture
    - Excellent communication skills
    
    Nice to have:
    - Experience with Kubernetes
    - GraphQL knowledge
    - Previous startup experience
    
    We offer:
    - Competitive salary ($150k - $200k)
    - Remote-first culture
    - Unlimited PTO
    - Health, dental, vision insurance
    """
    
    print("Testing job parser...")
    result = _sync_call(service.parse_job_description(test_job))
    print(json.dumps(result, indent=2))
