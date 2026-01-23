/**
 * AI Service - Anthropic API Integration
 * YOUR API key stays here - users never see it
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Make a request to Anthropic API
 */
async function callAnthropic(systemPrompt, userMessage, maxTokens = 4096) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', response.status, errorText);
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Analyze job-resume match
 */
async function analyzeMatch(jobDescription, resumeText) {
  const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyzer and career coach. Analyze how well a resume matches a job description.

Return a JSON object with this exact structure:
{
  "overall_match_score": <number 0-100>,
  "jobTitle": "<extracted job title>",
  "companyName": "<extracted company name if found>",
  "executive_summary": "<2-3 sentence summary of match quality>",
  "skills_analysis": {
    "matching_skills": ["<skill1>", "<skill2>", ...],
    "missing_skills": ["<skill1>", "<skill2>", ...],
    "transferable_skills": ["<skill that could apply>", ...]
  },
  "experience_analysis": {
    "score": <number 0-100>,
    "matching_experience": ["<relevant experience point>", ...],
    "gaps": ["<experience gap>", ...]
  },
  "education_analysis": {
    "score": <number 0-100>,
    "meets_requirements": <boolean>,
    "notes": "<any relevant notes>"
  },
  "ats_optimization": {
    "estimated_ats_score": <number 0-100>,
    "keyword_matches": ["<keyword>", ...],
    "missing_keywords": ["<keyword>", ...],
    "formatting_issues": ["<issue>", ...]
  },
  "quick_wins": [
    {
      "action": "<specific action to take>",
      "impact": "high|medium|low",
      "effort": "easy|medium|hard"
    }
  ],
  "detailed_recommendations": [
    "<specific recommendation 1>",
    "<specific recommendation 2>"
  ]
}

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks, no extra text.`;

  const userMessage = `Analyze this job posting and resume match:

=== JOB DESCRIPTION ===
${jobDescription}

=== RESUME ===
${resumeText}

Provide a comprehensive analysis as JSON.`;

  const response = await callAnthropic(systemPrompt, userMessage);
  
  try {
    // Try to parse JSON, handling potential markdown code blocks
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    // Return a basic structure if parsing fails
    return {
      overall_match_score: 50,
      executive_summary: response.substring(0, 500),
      skills_analysis: { matching_skills: [], missing_skills: [] },
      ats_optimization: { estimated_ats_score: 50 },
      quick_wins: [],
      detailed_recommendations: []
    };
  }
}

/**
 * Generate tailored resume
 */
async function generateTailoredResume(jobDescription, resumeText, selectedSkills = [], quickWins = []) {
  const systemPrompt = `You are an expert resume writer and ATS optimization specialist. 
Your task is to improve a resume to better match a specific job description.

Guidelines:
1. Maintain the original structure and format of the resume
2. Incorporate relevant keywords from the job description naturally
3. Emphasize matching skills and experiences
4. Quantify achievements where possible
5. Keep the same voice and tone as the original
6. Do NOT fabricate experiences or skills the candidate doesn't have
7. Focus on reframing existing experience to be more relevant

Return a JSON object with:
{
  "resumeText": "<the improved resume text>",
  "changes": [
    "<description of change 1>",
    "<description of change 2>"
  ]
}

IMPORTANT: Return ONLY valid JSON, no markdown formatting.`;

  const userMessage = `Improve this resume to better match the job:

=== JOB DESCRIPTION ===
${jobDescription}

=== ORIGINAL RESUME ===
${resumeText}

${selectedSkills.length > 0 ? `=== SKILLS TO EMPHASIZE ===\n${selectedSkills.join(', ')}` : ''}

${quickWins.length > 0 ? `=== QUICK WINS TO APPLY ===\n${quickWins.join('\n')}` : ''}

Generate an improved version that will score higher with ATS systems.`;

  const response = await callAnthropic(systemPrompt, userMessage);
  
  try {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse tailored resume:', e);
    return {
      resumeText: response,
      changes: ['Unable to parse specific changes']
    };
  }
}

/**
 * Generate cover letter
 */
async function generateCoverLetter(jobDescription, resumeText, companyName = '', tone = 'professional') {
  const toneInstructions = {
    professional: 'Write in a professional, polished tone suitable for corporate environments.',
    friendly: 'Write in a warm, approachable tone while maintaining professionalism.',
    confident: 'Write with confidence and assertiveness, highlighting achievements boldly.',
    enthusiastic: 'Write with genuine enthusiasm and energy about the opportunity.'
  };

  const systemPrompt = `You are an expert cover letter writer. Create a compelling, personalized cover letter that:
1. Opens with a strong hook
2. Connects the candidate's experience to the job requirements
3. Shows genuine interest in the company/role
4. Includes specific achievements that are relevant
5. Ends with a clear call to action
6. Is 3-4 paragraphs, approximately 300-400 words

${toneInstructions[tone] || toneInstructions.professional}

Return ONLY the cover letter text, no JSON, no formatting markers.`;

  const userMessage = `Write a cover letter for this job application:

=== JOB DESCRIPTION ===
${jobDescription}

=== CANDIDATE'S RESUME ===
${resumeText}

${companyName ? `=== COMPANY NAME ===\n${companyName}` : ''}

Create a compelling cover letter that will grab the hiring manager's attention.`;

  return await callAnthropic(systemPrompt, userMessage, 2048);
}

/**
 * Build resume from conversation (for guided builder)
 */
async function buildResumeFromData(collectedData) {
  const systemPrompt = `You are an expert resume writer. Create a professional resume from the provided data.

Guidelines:
1. Use strong action verbs to start bullet points
2. Quantify achievements where possible
3. Keep it concise and ATS-friendly
4. Use a clean, professional format
5. Order sections by relevance to typical job applications

Return the resume as plain text with clear section headers.`;

  const userMessage = `Create a professional resume from this data:

${JSON.stringify(collectedData, null, 2)}

Generate a polished, professional resume in plain text format.`;

  return await callAnthropic(systemPrompt, userMessage, 3000);
}

/**
 * Generate bullet point from description (for resume builder)
 */
async function generateBulletPoint(rawDescription, jobTitle) {
  const systemPrompt = `You are an expert resume writer. Transform a casual description of work into a professional resume bullet point.

Guidelines:
1. Start with a strong action verb
2. Include quantified results if mentioned
3. Be concise (1-2 lines max)
4. Make it ATS-friendly with relevant keywords
5. Focus on impact and results

Return ONLY the bullet point, nothing else.`;

  const userMessage = `Transform this into a professional resume bullet point:

Job Title: ${jobTitle}
Description: "${rawDescription}"

Create a polished bullet point.`;

  const response = await callAnthropic(systemPrompt, userMessage, 256);
  return response.trim();
}

/**
 * Match job to resume (for job alerts)
 */
async function calculateJobMatch(jobData, resumeData) {
  const systemPrompt = `You are a job matching algorithm. Quickly assess how well a job matches a candidate's profile.

Return ONLY a JSON object:
{
  "matchScore": <number 0-100>,
  "matchedSkills": ["<skill>", ...],
  "matchReason": "<one sentence explaining the match>"
}`;

  const userMessage = `Rate this job match:

JOB:
Title: ${jobData.title}
Company: ${jobData.company}
Skills needed: ${jobData.required_skills?.join(', ') || 'Not specified'}

CANDIDATE:
Skills: ${resumeData.skills?.join(', ') || 'Not specified'}
Experience: ${resumeData.years_of_experience || 'Unknown'} years
Target titles: ${resumeData.target_job_titles?.join(', ') || 'Not specified'}`;

  const response = await callAnthropic(systemPrompt, userMessage, 512);
  
  try {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    return { matchScore: 50, matchedSkills: [], matchReason: 'Unable to calculate match' };
  }
}

/**
 * Generate job experience suggestions
 */
async function generateJobSuggestions(jobTitle, company, description) {
  const systemPrompt = `You are an expert resume writer. Generate impactful bullet points for work experience.

Return a JSON object with:
{
  "responsibilities": [
    "Achievement-focused bullet point with metrics...",
    "Another strong bullet point...",
    "..."
  ],
  "skills": ["skill1", "skill2", "skill3"]
}

Guidelines:
- Start each bullet with a strong action verb
- Include quantified results where possible (%, $, numbers)
- Focus on achievements, not just duties
- Keep bullets concise (1-2 lines)
- Generate 5-7 bullet points in "responsibilities"
- Extract 3-5 relevant technical skills for "skills"

IMPORTANT: Return ONLY valid JSON, no markdown.`;

  const userMessage = `Generate resume bullet points for:
Job Title: ${jobTitle}
Company: ${company || 'Not specified'}
${description ? `Context: ${description}` : ''}

Create impactful, achievement-focused bullet points.`;

  const response = await callAnthropic(systemPrompt, userMessage, 1024);
  
  try {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse suggestions:', e);
    return { responsibilities: ['Unable to generate suggestions. Please try again.'], skills: [] };
  }
}

/**
 * Generate bullet point variations
 */
async function generateBulletVariations(description, jobTitle) {
  const systemPrompt = `You are an expert resume writer. Generate 3 different versions of a resume bullet point.

Return a JSON object:
{
  "variations": [
    "Version 1 - metrics focused...",
    "Version 2 - impact focused...",
    "Version 3 - skills focused..."
  ]
}

Each variation should:
- Start with a different action verb
- Highlight different aspects
- Be concise and impactful

IMPORTANT: Return ONLY valid JSON.`;

  const userMessage = `Create 3 variations of this experience:
${description}
${jobTitle ? `Role: ${jobTitle}` : ''}`;

  const response = await callAnthropic(systemPrompt, userMessage, 512);
  
  try {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    const result = JSON.parse(jsonStr);
    return result.variations || [];
  } catch (e) {
    return ['Unable to generate variations'];
  }
}

/**
 * Generate professional summary
 */
async function generateProfessionalSummary(resumeData, style = 'professional') {
  const styleInstructions = {
    professional: 'Write in a polished, corporate tone.',
    confident: 'Write with confidence and strong assertions.',
    friendly: 'Write in a warm, approachable tone.',
    technical: 'Emphasize technical skills and expertise.'
  };

  const systemPrompt = `You are an expert resume writer. Create a compelling professional summary.

${styleInstructions[style] || styleInstructions.professional}

Guidelines:
- 2-3 sentences maximum
- Highlight years of experience and key expertise
- Include 2-3 core skills or achievements
- Tailor to the target role if provided

Return ONLY the summary text, no JSON or formatting.`;

  const userMessage = `Create a professional summary for:
${JSON.stringify(resumeData, null, 2)}`;

  return await callAnthropic(systemPrompt, userMessage, 256);
}

module.exports = {
  callAnthropic,
  analyzeMatch,
  generateTailoredResume,
  generateCoverLetter,
  buildResumeFromData,
  generateBulletPoint,
  calculateJobMatch,
  generateJobSuggestions,
  generateBulletVariations,
  generateProfessionalSummary
};
