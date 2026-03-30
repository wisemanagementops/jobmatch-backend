/**
 * JobMatch AI - Extension Popup
 * Clean popup with auto-refresh and URL change detection
 */

// State
let currentJobData = null;
let userResumes = [];
let isAuthenticated = false;
let currentTabUrl = null;
let lastJobTitle = null;

// DOM Elements
const elements = {
  // States
  loadingState: document.getElementById('loadingState'),
  notAuthState: document.getElementById('notAuthState'),
  noResumeState: document.getElementById('noResumeState'),
  readyState: document.getElementById('readyState'),
  addingState: document.getElementById('addingState'),
  addedState: document.getElementById('addedState'),
  notJobPageState: document.getElementById('notJobPageState'),
  errorState: document.getElementById('errorState'),
  
  // Elements
  resumeSelect: document.getElementById('resumeSelect'),
  jobCard: document.getElementById('jobCard'),
  previewJobTitle: document.getElementById('previewJobTitle'),
  previewCompany: document.getElementById('previewCompany'),
  
  // Queue
  addToQueueBtn: document.getElementById('addToQueueBtn'),
  queuedCount: document.getElementById('queuedCount'),
  processingCount: document.getElementById('processingCount'),
  completedCount: document.getElementById('completedCount'),
  statusHint: document.getElementById('statusHint'),
  
  // Buttons
  refreshBtn: document.getElementById('refreshBtn'),
  dashboardBtn: document.getElementById('dashboardBtn'),
  openDashboardBtn: document.getElementById('openDashboardBtn'),
  openDashboardBtn2: document.getElementById('openDashboardBtn2'),
  viewDashboardBtn: document.getElementById('viewDashboardBtn'),
  openWebsiteBtn: document.getElementById('openWebsiteBtn'),
  refreshAuthBtn: document.getElementById('refreshAuthBtn'),
  createResumeBtn: document.getElementById('createResumeBtn'),
  addAnotherBtn: document.getElementById('addAnotherBtn'),
  retryBtn: document.getElementById('retryBtn'),
  
  // Footer
  addedMessage: document.getElementById('addedMessage'),
  errorMessage: document.getElementById('errorMessage'),
  usageInfo: document.getElementById('usageInfo'),
  userEmail: document.getElementById('userEmail')
};

// ============== Initialize ==============
document.addEventListener('DOMContentLoaded', async () => {
  try {
    setupEventListeners();
    await initialize();
  } catch (error) {
    console.error('Init error:', error);
    showError(error.message);
  }
});

async function initialize() {
  setState('loading');
  
  // Sync auth from website
  await chrome.runtime.sendMessage({ action: 'syncAuth' });
  
  // Check authentication
  const authResult = await chrome.runtime.sendMessage({ action: 'checkAuth' });
  
  if (!authResult.authenticated) {
    setState('notAuth');
    return;
  }
  
  isAuthenticated = true;
  
  if (authResult.user?.email) {
    elements.userEmail.textContent = authResult.user.email;
  }
  
  // Load resumes
  const resumeResult = await chrome.runtime.sendMessage({ action: 'getResumes' });
  
  if (!resumeResult.success || !resumeResult.resumes?.length) {
    setState('noResume');
    return;
  }
  
  userResumes = resumeResult.resumes;
  populateResumeSelect();
  
  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tab?.url;
  
  // Detect job
  await detectCurrentJob();
  
  // Update queue status
  await updateQueueStatus();
  
  // Start polling
  setInterval(updateQueueStatus, 3000);
  setInterval(checkForJobChange, 1500); // Check for job changes every 1.5s
}

// ============== URL Change Detection ==============
async function checkForJobChange() {
  if (!isAuthenticated || !userResumes.length) return;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    
    // Check if URL changed (LinkedIn SPA navigation)
    if (tab.url !== currentTabUrl) {
      console.log('URL changed:', tab.url);
      currentTabUrl = tab.url;
      await detectCurrentJob();
    }
  } catch (e) {
    // Ignore errors
  }
}

// ============== Event Listeners ==============
function setupEventListeners() {
  // Refresh button
  elements.refreshBtn?.addEventListener('click', async () => {
    elements.refreshBtn.style.animation = 'spin 0.5s linear';
    await detectCurrentJob();
    setTimeout(() => elements.refreshBtn.style.animation = '', 500);
  });
  
  // Dashboard buttons
  elements.dashboardBtn?.addEventListener('click', openDashboard);
  elements.openDashboardBtn?.addEventListener('click', openDashboard);
  elements.openDashboardBtn2?.addEventListener('click', openDashboard);
  elements.viewDashboardBtn?.addEventListener('click', openDashboard);
  
  // Auth buttons
  elements.openWebsiteBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://jobmatch-frontend-one.vercel.app/login' });
    window.close();
  });
  elements.refreshAuthBtn?.addEventListener('click', initialize);
  
  // Resume button
  elements.createResumeBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://jobmatch-frontend-one.vercel.app/resumes' });
    window.close();
  });
  
  // Queue buttons
  elements.addToQueueBtn?.addEventListener('click', addCurrentJobToQueue);
  elements.addAnotherBtn?.addEventListener('click', () => detectCurrentJob());
  elements.retryBtn?.addEventListener('click', addCurrentJobToQueue);
}

// ============== Resume Select ==============
function populateResumeSelect() {
  elements.resumeSelect.innerHTML = '';
  
  userResumes.forEach((resume, i) => {
    const option = document.createElement('option');
    option.value = resume.id;
    option.textContent = resume.name || `Resume ${i + 1}`;
    if (resume.is_primary) {
      option.selected = true;
      option.textContent += ' ★';
    }
    elements.resumeSelect.appendChild(option);
  });
  
  if (!userResumes.some(r => r.is_primary) && userResumes.length) {
    elements.resumeSelect.selectedIndex = 0;
  }
}

// ============== State Management ==============
function setState(state) {
  const states = ['loading', 'notAuth', 'noResume', 'ready', 'adding', 'added', 'notJobPage', 'error'];
  states.forEach(s => {
    const el = elements[s + 'State'];
    if (el) el.classList.add('hidden');
  });
  
  const stateEl = elements[state + 'State'];
  if (stateEl) stateEl.classList.remove('hidden');
}

function showError(message) {
  elements.errorMessage.textContent = message;
  setState('error');
}

// ============== Job Detection ==============
async function detectCurrentJob() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.url) {
      setState('notJobPage');
      return;
    }
    
    // Job site patterns
    const jobSites = [
      'linkedin.com/jobs', 'linkedin.com/job',
      'indeed.com', 'glassdoor.com',
      'greenhouse.io', 'lever.co',
      'workday.com', 'myworkdayjobs.com',
      'icims.com', 'taleo', 'smartrecruiters.com'
    ];
    
    const isJobSite = jobSites.some(site => tab.url.includes(site));
    
    if (!isJobSite) {
      setState('notJobPage');
      return;
    }
    
    // Show ready state with loading indicator
    elements.previewJobTitle.textContent = 'Detecting job...';
    elements.previewCompany.textContent = '';
    elements.jobCard.classList.add('loading');
    elements.addToQueueBtn.disabled = true;
    setState('ready');
    
    // Extract job with retries
    let jobData = null;
    for (let i = 0; i < 3; i++) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractJobFromPage
        });
        
        if (results?.[0]?.result?.jobText?.length > 100) {
          jobData = results[0].result;
          jobData.url = tab.url;
          break;
        }
      } catch (e) {
        console.log('Extraction attempt failed:', e);
      }
      
      if (i < 2) await new Promise(r => setTimeout(r, 800));
    }
    
    elements.jobCard.classList.remove('loading');
    
    if (jobData && jobData.jobText?.length > 100) {
      currentJobData = jobData;
      lastJobTitle = jobData.title;
      
      elements.previewJobTitle.textContent = jobData.title || 'Job Posting';
      elements.previewCompany.textContent = jobData.company || '';
      elements.addToQueueBtn.disabled = false;
    } else {
      elements.previewJobTitle.textContent = 'Could not detect job';
      elements.previewCompany.textContent = 'Try scrolling down or refreshing';
      elements.addToQueueBtn.disabled = true;
    }
    
  } catch (error) {
    console.error('Detection error:', error);
    setState('notJobPage');
  }
}

// Job extraction function (runs in page context)
function extractJobFromPage() {
  let title = '';
  let company = '';
  let jobText = '';
  
  // LinkedIn
  if (window.location.hostname.includes('linkedin.com')) {
    const titleSelectors = [
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.t-24.job-details-jobs-unified-top-card__job-title',
      'h1.t-24', 'h1[class*="job-title"]', '.topcard__title', 'h1'
    ];
    
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim()?.length > 2) {
        title = el.innerText.trim();
        break;
      }
    }
    
    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '.jobs-unified-top-card__subtitle-primary-grouping a'
    ];
    
    for (const sel of companySelectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim()) {
        company = el.innerText.trim();
        break;
      }
    }
    
    const descSelectors = [
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '#job-details',
      '.jobs-description'
    ];
    
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.length > 200) {
        jobText = el.innerText;
        break;
      }
    }
    
    // Fallback to detail panel
    if (!jobText || jobText.length < 200) {
      const panel = document.querySelector('.jobs-search__job-details') ||
                    document.querySelector('.scaffold-layout__detail') ||
                    document.querySelector('.job-view-layout');
      
      if (panel) {
        const text = panel.innerText || '';
        const markers = ['About the job', 'About this role', 'Description', 'About', 'Overview'];
        let start = -1;
        
        for (const m of markers) {
          const idx = text.indexOf(m);
          if (idx !== -1 && (start === -1 || idx < start)) start = idx;
        }
        
        jobText = start !== -1 ? text.substring(start, start + 10000) : text.substring(200, 10000);
      }
    }
  }
  // Indeed
  else if (window.location.hostname.includes('indeed.com')) {
    title = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"], .jobsearch-JobInfoHeader-title')?.innerText?.trim() || '';
    company = document.querySelector('[data-testid="inlineHeader-companyName"], .jobsearch-InlineCompanyRating-companyHeader')?.innerText?.trim() || '';
    jobText = document.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText')?.innerText?.trim() || '';
  }
  // Glassdoor
  else if (window.location.hostname.includes('glassdoor.com')) {
    title = document.querySelector('[data-test="job-title"], .job-title, h1')?.innerText?.trim() || '';
    company = document.querySelector('[data-test="employer-name"], .employer-name')?.innerText?.trim() || '';
    jobText = document.querySelector('.jobDescriptionContent, [data-test="job-description"]')?.innerText?.trim() || '';
  }
  // Greenhouse
  else if (window.location.hostname.includes('greenhouse.io')) {
    title = document.querySelector('.app-title, h1')?.innerText?.trim() || '';
    company = document.querySelector('.company-name')?.innerText?.trim() || '';
    jobText = document.querySelector('#content, .content, .job-description')?.innerText?.trim() || '';
  }
  // Lever
  else if (window.location.hostname.includes('lever.co')) {
    title = document.querySelector('.posting-headline h2, h2')?.innerText?.trim() || '';
    company = document.querySelector('.main-header-logo img')?.alt || '';
    jobText = document.querySelector('.posting-page, .content')?.innerText?.trim() || '';
  }
  // Generic
  else {
    title = document.querySelector('h1')?.innerText?.trim() || document.title;
    jobText = document.querySelector('[class*="description"], main, article')?.innerText?.trim() || document.body.innerText.substring(0, 10000);
  }
  
  // Clean up title
  if (!title || title.length < 3 || /^\(\d+\)/.test(title) || title.toLowerCase().endsWith(' jobs')) {
    title = document.title.split(' - ')[0].split(' | ')[0] || 'Job Posting';
  }
  
  // Clean job text
  if (jobText) {
    jobText = jobText
      .replace(/Show more|Show less/gi, '')
      .replace(/\d+ applicants?/gi, '')
      .replace(/Apply now|Easy Apply|Save|Share/gi, '')
      .trim();
  }
  
  return { title, company, jobText };
}

// ============== Queue Operations ==============
async function addCurrentJobToQueue() {
  if (!currentJobData?.jobText || currentJobData.jobText.length < 100) {
    showError('Could not detect job. Try refreshing the page.');
    return;
  }
  
  const resumeId = elements.resumeSelect.value;
  if (!resumeId) {
    showError('Please select a resume.');
    return;
  }
  
  setState('adding');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'addToQueue',
      jobData: { ...currentJobData, resumeId }
    });
    
    if (response.success) {
      elements.addedMessage.textContent = `Position #${response.queuePosition}. Analyzing...`;
      setState('added');
    } else if (response.error === 'duplicate') {
      elements.addedMessage.textContent = 'Already in queue!';
      setState('added');
    } else if (response.error === 'no_resume') {
      setState('noResume');
    } else if (response.error === 'not_authenticated') {
      setState('notAuth');
    } else {
      showError(response.message || 'Failed to add job.');
    }
  } catch (error) {
    showError('Error: ' + error.message);
  }
}

async function updateQueueStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getQueueStatus' });
    
    if (response) {
      elements.queuedCount.textContent = response.queued || 0;
      elements.processingCount.textContent = response.processing || 0;
      elements.completedCount.textContent = response.completed || 0;
      
      if (response.processing > 0) {
        elements.statusHint.textContent = 'Analyzing...';
        elements.statusHint.classList.add('pulse');
      } else if (response.queued > 0) {
        elements.statusHint.textContent = `${response.queued} in queue`;
        elements.statusHint.classList.remove('pulse');
      } else {
        elements.statusHint.textContent = 'Ready to analyze';
        elements.statusHint.classList.remove('pulse');
      }
      
      elements.usageInfo.textContent = `${response.completed || 0} analyzed today`;
    }
  } catch (e) {
    // Ignore
  }
}

function openDashboard() {
  chrome.tabs.create({ url: 'https://jobmatch-frontend-one.vercel.app/history' });
  window.close();
}
