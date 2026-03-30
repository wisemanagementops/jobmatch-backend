/**
 * JobMatch AI - Background Service Worker
 * Queue-based job analysis with backend API integration
 * NO API key needed - backend handles all AI calls
 */

const API_BASE_URL = 'https://jobmatch-backend-production-796d.up.railway.app/api';

// State
let isProcessing = false;
let processingJobId = null;

// ============== Message Handler ==============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'addToQueue':
      return await addJobToQueue(message.jobData);
    case 'getQueueStatus':
      return await getQueueStatus();
    case 'getFullQueue':
      return await getFullQueue();
    case 'startProcessing':
      startProcessingQueue();
      return { success: true };
    case 'openDashboard':
      openDashboard();
      return { success: true };
    case 'checkAuth':
      return await checkAuth();
    case 'syncAuth':
      return await syncAuthFromWebsite();
    case 'setAuth':
      return await setAuthToken(message.token);
    case 'clearAuth':
      return await clearAuthToken();
    case 'getResumes':
      return await getResumesFromBackend();
    case 'getResumeText':
      return await getResumeTextById(message.resumeId);
    case 'generateTailoredResume':
      return await generateTailoredResume(message.data);
    case 'generateCoverLetter':
      return await generateCoverLetter(message.data);
    default:
      return { error: 'Unknown action' };
  }
}

// ============== Authentication ==============
async function checkAuth() {
  const result = await chrome.storage.local.get(['authToken', 'userData']);
  console.log('JobMatch AI: Checking auth, token exists:', !!result.authToken);
  
  if (result.authToken) {
    // Validate token with backend
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${result.authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('JobMatch AI: Token valid, user:', data.data?.email);
        // Store updated user data
        await chrome.storage.local.set({ userData: data.data });
        return { authenticated: true, user: data.data };
      } else {
        console.log('JobMatch AI: Token invalid, status:', response.status);
        // Token is invalid, clear it
        await chrome.storage.local.remove(['authToken', 'userData']);
      }
    } catch (e) {
      console.log('JobMatch AI: Auth validation failed:', e.message);
    }
  }
  return { authenticated: false };
}

// Set auth token (called from webapp content script)
async function setAuthToken(token) {
  if (!token) {
    return { success: false, error: 'No token provided' };
  }
  
  console.log('JobMatch AI: Setting auth token');
  
  // Validate token first
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      await chrome.storage.local.set({
        authToken: token,
        userData: data.data
      });
      console.log('JobMatch AI: Auth token saved, user:', data.data?.email);
      return { success: true, user: data.data };
    } else {
      console.log('JobMatch AI: Token validation failed:', response.status);
      return { success: false, error: 'Invalid token' };
    }
  } catch (e) {
    console.log('JobMatch AI: Token validation error:', e.message);
    return { success: false, error: e.message };
  }
}

// Clear auth token (called when user logs out)
async function clearAuthToken() {
  console.log('JobMatch AI: Clearing auth token');
  await chrome.storage.local.remove(['authToken', 'userData']);
  return { success: true };
}

async function syncAuthFromWebsite() {
  console.log('JobMatch AI: Attempting to sync auth from website');
  
  try {
    // Find website tab - check multiple possible URLs
    const urlPatterns = [
      'https://jobmatch-frontend-one.vercel.app/*',
      'http://localhost:3000/*',
      'http://127.0.0.1:5173/*',
      'http://127.0.0.1:3000/*'
    ];
    
    let tabs = [];
    for (const pattern of urlPatterns) {
      const found = await chrome.tabs.query({ url: pattern });
      tabs = tabs.concat(found);
    }
    
    console.log('JobMatch AI: Found webapp tabs:', tabs.length);
    
    if (tabs.length === 0) {
      return { success: false, error: 'Website not open. Please open the JobMatch AI website first.' };
    }
    
    // Try each tab until we find a token
    for (const tab of tabs) {
      try {
        console.log('JobMatch AI: Trying to read token from tab:', tab.id, tab.url);
        
        // Execute script in website context to get auth data
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            return {
              token: localStorage.getItem('token'),
              user: localStorage.getItem('user')
            };
          }
        });
        
        console.log('JobMatch AI: Script execution result:', results);
        
        if (results && results[0] && results[0].result && results[0].result.token) {
          const { token, user } = results[0].result;
          
          // Validate and save
          const setResult = await setAuthToken(token);
          if (setResult.success) {
            console.log('JobMatch AI: Auth synced successfully');
            return { success: true, token };
          }
        }
      } catch (tabError) {
        console.log('JobMatch AI: Error reading from tab:', tabError.message);
      }
    }
    
    return { success: false, error: 'Not logged in on website. Please log in first.' };
  } catch (error) {
    console.error('JobMatch AI: Auth sync error:', error);
    return { success: false, error: error.message };
  }
}

// ============== Resume Management ==============
async function getResumesFromBackend() {
  const authResult = await chrome.storage.local.get(['authToken']);
  if (!authResult.authToken) {
    return { success: false, error: 'Not authenticated' };
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/resumes`, {
      headers: { 'Authorization': `Bearer ${authResult.authToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch resumes');
    }
    
    const data = await response.json();
    const resumes = data.data || [];
    
    // Store resumes locally for quick access
    await chrome.storage.local.set({ userResumes: resumes });
    
    return { success: true, resumes };
  } catch (error) {
    console.error('Get resumes error:', error);
    return { success: false, error: error.message };
  }
}

async function getResumeTextById(resumeId) {
  try {
    const text = await getResumeText(resumeId);
    return { success: true, resumeText: text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getResumeText(resumeId) {
  const authResult = await chrome.storage.local.get(['authToken']);
  if (!authResult.authToken) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE_URL}/resumes/${resumeId}`, {
    headers: { 'Authorization': `Bearer ${authResult.authToken}` }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch resume');
  }
  
  const data = await response.json();
  const resume = data.data;
  
  // Build resume text from structured data
  return buildResumeText(resume);
}

function buildResumeText(resume) {
  if (!resume) return '';
  
  // If we have raw_text (from uploaded resumes), use that directly
  // It's the original resume content and most accurate
  if (resume.raw_text && resume.raw_text.length > 100) {
    return resume.raw_text;
  }
  
  // Otherwise build from structured data
  let text = '';
  
  // Contact info
  if (resume.contact_info) {
    const c = resume.contact_info;
    if (c.name) text += `${c.name}\n`;
    if (c.email) text += `${c.email}\n`;
    if (c.phone) text += `${c.phone}\n`;
    if (c.location) text += `${c.location}\n`;
    if (c.linkedin) text += `${c.linkedin}\n`;
    text += '\n';
  }
  
  // Summary
  if (resume.summary) {
    text += `PROFESSIONAL SUMMARY\n${resume.summary}\n\n`;
  }
  
  // Work experience
  if (resume.work_experience && resume.work_experience.length > 0) {
    text += 'WORK EXPERIENCE\n';
    for (const job of resume.work_experience) {
      text += `${job.title || ''} at ${job.company || ''}`;
      if (job.location) text += ` - ${job.location}`;
      text += '\n';
      if (job.start_date) text += `${job.start_date} - ${job.end_date || 'Present'}\n`;
      if (job.bullets && job.bullets.length > 0) {
        for (const bullet of job.bullets) {
          text += `• ${bullet}\n`;
        }
      }
      text += '\n';
    }
  }
  
  // Education
  if (resume.education && resume.education.length > 0) {
    text += 'EDUCATION\n';
    for (const edu of resume.education) {
      text += `${edu.degree || ''} ${edu.field ? `in ${edu.field}` : ''} - ${edu.school || ''}`;
      if (edu.graduation) text += ` (${edu.graduation})`;
      if (edu.gpa) text += ` - GPA: ${edu.gpa}`;
      text += '\n';
    }
    text += '\n';
  }
  
  // Skills
  if (resume.skills && resume.skills.length > 0) {
    text += `SKILLS\n${resume.skills.join(', ')}\n\n`;
  }
  
  // Projects
  if (resume.projects && resume.projects.length > 0) {
    text += 'PROJECTS\n';
    for (const proj of resume.projects) {
      text += `${proj.name || ''}`;
      if (proj.date) text += ` (${proj.date})`;
      text += '\n';
      if (proj.description) text += `${proj.description}\n`;
      text += '\n';
    }
  }
  
  // Certifications
  if (resume.certifications && resume.certifications.length > 0) {
    text += `CERTIFICATIONS\n${resume.certifications.join('\n')}\n\n`;
  }
  
  return text || resume.raw_text || '';
}

// ============== Queue Management ==============
async function addJobToQueue(jobData) {
  // Check authentication
  const authCheck = await checkAuth();
  if (!authCheck.authenticated) {
    // Try to sync auth from website
    const syncResult = await syncAuthFromWebsite();
    if (!syncResult.success) {
      return { success: false, error: 'not_authenticated', message: 'Please sign in on the website first' };
    }
  }
  
  // Get resumes
  const resumeResult = await chrome.storage.local.get(['userResumes']);
  let resumes = resumeResult.userResumes || [];
  
  // If no cached resumes, fetch from backend
  if (resumes.length === 0) {
    const fetchResult = await getResumesFromBackend();
    if (fetchResult.success) {
      resumes = fetchResult.resumes;
    }
  }
  
  if (resumes.length === 0) {
    return { success: false, error: 'no_resume', message: 'Please create a resume first' };
  }
  
  // Get current queue
  const result = await chrome.storage.local.get(['jobQueue']);
  const queue = result.jobQueue || [];
  
  // Check for duplicate (same URL)
  if (jobData.url && queue.some(j => j.url === jobData.url && j.status !== 'completed' && j.status !== 'failed')) {
    return { success: false, error: 'duplicate', message: 'This job is already in your queue' };
  }
  
  // Create job entry
  const job = {
    id: generateId(),
    url: jobData.url,
    title: jobData.title || 'Job Posting',
    company: jobData.company || 'Unknown Company',
    jobText: jobData.jobText,
    resumeId: jobData.resumeId,
    status: 'queued',
    addedAt: Date.now(),
    updatedAt: Date.now()
  };
  
  // Add to queue
  queue.push(job);
  await chrome.storage.local.set({ jobQueue: queue });
  
  // Update badge
  updateBadge(queue);
  
  // Start processing if not already
  startProcessingQueue();
  
  // Find queue position
  const queuedJobs = queue.filter(j => j.status === 'queued');
  const position = queuedJobs.findIndex(j => j.id === job.id) + 1;
  
  return { success: true, jobId: job.id, queuePosition: position };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function getQueueStatus() {
  const result = await chrome.storage.local.get(['jobQueue']);
  const queue = result.jobQueue || [];
  
  return {
    queued: queue.filter(j => j.status === 'queued').length,
    processing: queue.filter(j => j.status === 'processing').length,
    completed: queue.filter(j => j.status === 'completed').length,
    failed: queue.filter(j => j.status === 'failed').length,
    total: queue.length
  };
}

async function getFullQueue() {
  const result = await chrome.storage.local.get(['jobQueue', 'analysisHistory']);
  return {
    queue: result.jobQueue || [],
    history: result.analysisHistory || []
  };
}

async function startProcessingQueue() {
  if (isProcessing) {
    console.log('Already processing queue');
    return;
  }
  
  isProcessing = true;
  console.log('Starting queue processing');
  
  try {
    while (true) {
      const result = await chrome.storage.local.get(['jobQueue']);
      const queue = result.jobQueue || [];
      
      // Find next queued job
      const nextJob = queue.find(j => j.status === 'queued');
      
      if (!nextJob) {
        console.log('No more jobs in queue');
        break;
      }
      
      processingJobId = nextJob.id;
      
      // Update status to processing
      await updateJobStatus(nextJob.id, 'processing');
      updateBadge(queue);
      
      try {
        // Get resume text
        const resumeText = await getResumeText(nextJob.resumeId);
        
        if (!resumeText) {
          throw new Error('Could not load resume');
        }
        
        // Analyze via backend
        console.log('Analyzing job:', nextJob.title);
        const analysisResult = await analyzeJobViaBackend(nextJob, resumeText);
        
        // Update with result
        await updateJobWithResult(nextJob.id, 'completed', analysisResult);
        
        // Add to history
        await addToHistory(nextJob, analysisResult, resumeText);
        
        console.log('Analysis complete:', nextJob.title, 'Score:', analysisResult.match?.overall_match_score);
        
      } catch (error) {
        console.error('Job analysis failed:', error);
        await updateJobStatus(nextJob.id, 'failed', error.message);
      }
      
      processingJobId = null;
      
      // Small delay between jobs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally {
    isProcessing = false;
    processingJobId = null;
    
    // Update badge
    const finalResult = await chrome.storage.local.get(['jobQueue']);
    updateBadge(finalResult.jobQueue || []);
  }
}

async function analyzeJobViaBackend(job, resumeText) {
  const authResult = await chrome.storage.local.get(['authToken']);
  if (!authResult.authToken) {
    throw new Error('Not authenticated. Please sign in on the website.');
  }
  
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authResult.authToken}`
    },
    body: JSON.stringify({
      jobDescription: job.jobText,
      resumeText: resumeText,
      jobTitle: job.title,
      companyName: job.company,
      jobUrl: job.url,
      resumeId: job.resumeId
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('Session expired. Please sign in on the website again.');
    }
    if (response.status === 429) {
      throw new Error('Daily limit reached. Upgrade to Pro for unlimited analyses.');
    }
    throw new Error(error.error || `Analysis failed: ${response.status}`);
  }
  
  const data = await response.json();
  const result = data.data.result;
  
  // Use AI-extracted title/company if available (when DOM extraction failed)
  const extractedTitle = result.extractedJobTitle || result.jobTitle || job.title;
  const extractedCompany = result.extractedCompanyName || result.companyName || job.company;
  
  return {
    analysisId: data.data.analysisId,
    job: { 
      title: extractedTitle, 
      company: extractedCompany, 
      url: job.url 
    },
    // Store extracted values separately for updating the queue
    extractedTitle: extractedTitle,
    extractedCompany: extractedCompany,
    match: {
      overall_match_score: result.overall_match_score,
      recommendation: result.recommendation || getRecommendation(result.overall_match_score),
      summary: result.executive_summary || result.summary,
      ats_optimization: result.ats_optimization,
      quick_wins: result.quick_wins,
      matching_skills: result.skills_analysis?.matching_skills || result.matching_skills || [],
      missing_skills: result.skills_analysis?.missing_skills || result.missing_skills || [],
      improvements: result.detailed_recommendations || result.improvements
    }
  };
}

function getRecommendation(score) {
  if (score >= 85) return 'strong_match';
  if (score >= 70) return 'good_match';
  if (score >= 50) return 'needs_work';
  return 'not_recommended';
}

async function updateJobStatus(jobId, status, errorMessage = null) {
  const result = await chrome.storage.local.get(['jobQueue']);
  const queue = result.jobQueue || [];
  
  const jobIndex = queue.findIndex(j => j.id === jobId);
  if (jobIndex >= 0) {
    queue[jobIndex].status = status;
    queue[jobIndex].updatedAt = Date.now();
    if (errorMessage) {
      queue[jobIndex].error = errorMessage;
    }
    await chrome.storage.local.set({ jobQueue: queue });
  }
}

async function updateJobWithResult(jobId, status, result) {
  const storageResult = await chrome.storage.local.get(['jobQueue']);
  const queue = storageResult.jobQueue || [];
  
  const jobIndex = queue.findIndex(j => j.id === jobId);
  if (jobIndex >= 0) {
    queue[jobIndex].status = status;
    queue[jobIndex].result = result;
    queue[jobIndex].score = result?.match?.overall_match_score || 0;
    queue[jobIndex].updatedAt = Date.now();
    queue[jobIndex].timestamp = Date.now();
    
    // Update title and company with AI-extracted values if available
    if (result?.extractedTitle) {
      queue[jobIndex].title = result.extractedTitle;
    }
    if (result?.extractedCompany) {
      queue[jobIndex].company = result.extractedCompany;
    }
    
    await chrome.storage.local.set({ jobQueue: queue });
  }
}

async function addToHistory(job, result, resumeText = null) {
  const storageResult = await chrome.storage.local.get(['analysisHistory']);
  const history = storageResult.analysisHistory || [];
  
  history.unshift({
    id: job.id,
    analysisId: result.analysisId,
    jobTitle: result.extractedTitle || job.title,
    company: result.extractedCompany || job.company,
    url: job.url,
    jobText: job.jobText,  // Store job description for tailored resume
    resumeText: resumeText || result.resumeText,  // Store resume text for tailored resume
    score: result.match?.overall_match_score || 0,
    timestamp: Date.now(),
    result: result
  });
  
  // Keep only last 100 items
  if (history.length > 100) {
    history.splice(100);
  }
  
  await chrome.storage.local.set({ analysisHistory: history });
}

// ============== Generate Tailored Resume ==============
async function generateTailoredResume(data) {
  const authResult = await chrome.storage.local.get(['authToken']);
  if (!authResult.authToken) {
    return { success: false, error: 'Not authenticated' };
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/analyze/tailor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authResult.authToken}`
      },
      body: JSON.stringify({
        analysisId: data.analysisId,
        jobDescription: data.jobDescription,
        resumeText: data.resumeText,
        selectedSkills: data.selectedSkills || [],
        quickWins: data.quickWins || []
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to generate tailored resume');
    }
    
    const result = await response.json();
    return {
      success: true,
      tailoredResume: result.data.tailoredResume,
      improvedScore: result.data.improvedScore,
      changes: result.data.changes
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============== Generate Cover Letter ==============
async function generateCoverLetter(data) {
  const authResult = await chrome.storage.local.get(['authToken']);
  if (!authResult.authToken) {
    return { success: false, error: 'Not authenticated' };
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/analyze/cover-letter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authResult.authToken}`
      },
      body: JSON.stringify({
        analysisId: data.analysisId,
        jobDescription: data.jobDescription,
        resumeText: data.resumeText,
        companyName: data.companyName,
        tone: data.tone || 'professional'
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to generate cover letter');
    }
    
    const result = await response.json();
    return {
      success: true,
      coverLetter: result.data.coverLetter
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============== Badge Management ==============
function updateBadge(queue) {
  const pending = queue.filter(j => j.status === 'queued' || j.status === 'processing').length;
  
  if (pending > 0) {
    chrome.action.setBadgeText({ text: pending.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#6366F1' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ============== Dashboard ==============
function openDashboard() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard/dashboard.html')
  });
}

// ============== Keep Alive ==============
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepAlive') {
    // Check if we should be processing
    if (!isProcessing) {
      const result = await chrome.storage.local.get(['jobQueue']);
      const queue = result.jobQueue || [];
      const hasQueued = queue.some(j => j.status === 'queued');
      
      if (hasQueued) {
        console.log('Keep-alive: Starting queue processing');
        startProcessingQueue();
      }
    }
  }
});

// ============== Installation ==============
chrome.runtime.onInstalled.addListener(() => {
  console.log('JobMatch AI extension installed');
});
