/**
 * JobMatch AI - Dashboard
 * Displays job queue, processing status, and analysis results
 */

const API_BASE_URL = 'https://jobmatch-backend-production-796d.up.railway.app/api';

// State
let selectedJobId = null;
let resumeData = null;
let isShowingGeneratedContent = false;

// Generated content state (persists between tab switches)
let generatedContents = {
  resume: { text: '', html: '' },
  cover_letter: { text: '', html: '' }
};
let activeTab = 'resume';

// Selection state for skills and quick wins
let selectedSkills = new Set();
let selectedQuickWins = new Set();
let allMissingSkills = [];
let allQuickWins = [];

// DOM Elements
const elements = {
  // Stats
  queuedCount: document.getElementById('queuedCount'),
  processingCount: document.getElementById('processingCount'),
  completedCount: document.getElementById('completedCount'),
  todayCount: document.getElementById('todayCount'),
  
  // Lists
  processingList: document.getElementById('processingList'),
  queuedList: document.getElementById('queuedList'),
  completedList: document.getElementById('completedList'),
  emptyState: document.getElementById('emptyState'),
  
  // Sections
  processingSection: document.getElementById('processingSection'),
  queuedSection: document.getElementById('queuedSection'),
  completedSection: document.getElementById('completedSection'),
  
  // Details Panel
  detailsPanel: document.getElementById('detailsPanel'),
  noSelectionState: document.getElementById('noSelectionState'),
  jobDetailsContent: document.getElementById('jobDetailsContent'),
  detailJobTitle: document.getElementById('detailJobTitle'),
  detailCompany: document.getElementById('detailCompany'),
  detailJobLink: document.getElementById('detailJobLink'),
  detailScore: document.getElementById('detailScore'),
  detailScoreRing: document.getElementById('detailScoreRing'),
  detailScoreLabel: document.getElementById('detailScoreLabel'),
  detailAtsScore: document.getElementById('detailAtsScore'),
  detailQuickWins: document.getElementById('detailQuickWins'),
  detailQuickWinsList: document.getElementById('detailQuickWinsList'),
  detailSummary: document.getElementById('detailSummary'),
  detailMatchingSkills: document.getElementById('detailMatchingSkills'),
  detailMissingSkills: document.getElementById('detailMissingSkills'),
  
  // Selection tracking
  selectionSummary: document.getElementById('selectionSummary'),
  selectedSkillsCount: document.getElementById('selectedSkillsCount'),
  selectedWinsCount: document.getElementById('selectedWinsCount'),
  
  // Actions
  generateResumeBtn: document.getElementById('generateResumeBtn'),
  generateCoverLetterBtn: document.getElementById('generateCoverLetterBtn'),
  generatedContent: document.getElementById('generatedContent'),
  generatedPreview: document.getElementById('generatedPreview'),
  copyGeneratedBtn: document.getElementById('copyGeneratedBtn'),
  downloadTxtBtn: document.getElementById('downloadTxtBtn'),
  downloadDocxBtn: document.getElementById('downloadDocxBtn'),
  downloadPdfBtn: document.getElementById('downloadPdfBtn'),
  
  // Generated content tabs
  tabResume: document.getElementById('tabResume'),
  tabCoverLetter: document.getElementById('tabCoverLetter'),
  resumeStatus: document.getElementById('resumeStatus'),
  coverLetterStatus: document.getElementById('coverLetterStatus'),
  
  // Score Improvement
  scoreImprovement: document.getElementById('scoreImprovement'),
  originalScore: document.getElementById('originalScore'),
  improvedScore: document.getElementById('improvedScore'),
  scoreChange: document.getElementById('scoreChange'),
  improvementAnalyzing: document.getElementById('improvementAnalyzing'),
  
  // Header
  resumeName: document.getElementById('resumeName'),
  changeResumeBtn: document.getElementById('changeResumeBtn'),
  resumeInput: document.getElementById('resumeInput'),
  
  // Other
  clearCompletedBtn: document.getElementById('clearCompletedBtn'),
  closeDetailsBtn: document.getElementById('closeDetailsBtn'),
  usageInfo: document.getElementById('usageInfo'),
  
  // Upgrade/Payment
  upgradeLink: document.getElementById('upgradeLink'),
  upgradeModal: document.getElementById('upgradeModal'),
  closeUpgradeBtn: document.getElementById('closeUpgradeBtn'),
  selectProMonthly: document.getElementById('selectProMonthly'),
  selectProAnnual: document.getElementById('selectProAnnual'),
  
  // Checkout
  checkoutModal: document.getElementById('checkoutModal'),
  closeCheckoutBtn: document.getElementById('closeCheckoutBtn'),
  checkoutForm: document.getElementById('checkoutForm'),
  checkoutPlanName: document.getElementById('checkoutPlanName'),
  backToPlans: document.getElementById('backToPlans'),
  proceedToPayment: document.getElementById('proceedToPayment'),
  summaryPlan: document.getElementById('summaryPlan'),
  summaryPrice: document.getElementById('summaryPrice'),
  summaryTotal: document.getElementById('summaryTotal'),
  
  // Success
  successModal: document.getElementById('successModal'),
  closeSuccessBtn: document.getElementById('closeSuccessBtn'),
  receiptEmail: document.getElementById('receiptEmail')
};

// ============== Initialization ==============
document.addEventListener('DOMContentLoaded', async () => {
  await loadResumeData();
  await refreshQueue();
  setupEventListeners();
  
  // Listen for storage changes (real-time updates)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.jobQueue || changes.analysisHistory)) {
      refreshQueue();
    }
  });
  
  // Poll for updates every 2 seconds (backup for storage events)
  setInterval(refreshQueue, 2000);
});

// ============== Event Listeners ==============
function setupEventListeners() {
  // Resume upload
  elements.changeResumeBtn.addEventListener('click', () => {
    elements.resumeInput.click();
  });
  
  elements.resumeInput.addEventListener('change', handleResumeUpload);
  
  // Clear completed
  elements.clearCompletedBtn.addEventListener('click', clearCompleted);
  
  // Close details
  elements.closeDetailsBtn.addEventListener('click', () => {
    selectedJobId = null;
    isShowingGeneratedContent = false;
    generatedContents = { resume: { text: '', html: '' }, cover_letter: { text: '', html: '' } };
    activeTab = 'resume';
    elements.noSelectionState.classList.remove('hidden');
    elements.jobDetailsContent.classList.add('hidden');
    elements.generatedContent.classList.add('hidden');
    document.querySelectorAll('.job-item.selected').forEach(el => el.classList.remove('selected'));
  });
  
  // Generate buttons
  elements.generateResumeBtn.addEventListener('click', () => generateContent('resume'));
  elements.generateCoverLetterBtn.addEventListener('click', () => generateContent('cover_letter'));
  
  // Tab switching
  elements.tabResume?.addEventListener('click', () => switchTab('resume'));
  elements.tabCoverLetter?.addEventListener('click', () => switchTab('cover_letter'));
  
  // Copy/Download
  elements.copyGeneratedBtn.addEventListener('click', copyGenerated);
  elements.downloadTxtBtn.addEventListener('click', () => downloadGenerated('txt'));
  elements.downloadDocxBtn.addEventListener('click', () => downloadGenerated('docx'));
  elements.downloadPdfBtn.addEventListener('click', () => downloadGenerated('pdf'));
  
  // Upgrade/Payment
  elements.upgradeLink?.addEventListener('click', (e) => {
    e.preventDefault();
    openUpgradeModal();
  });
  elements.closeUpgradeBtn?.addEventListener('click', closeUpgradeModal);
  elements.selectProMonthly?.addEventListener('click', () => selectPlan('monthly'));
  elements.selectProAnnual?.addEventListener('click', () => selectPlan('annual'));
  
  // Checkout
  elements.closeCheckoutBtn?.addEventListener('click', closeCheckoutModal);
  elements.backToPlans?.addEventListener('click', backToPlans);
  elements.checkoutForm?.addEventListener('submit', handleCheckoutSubmit);
  
  // Success
  elements.closeSuccessBtn?.addEventListener('click', closeSuccessModal);
  
  // Click outside modals to close
  elements.upgradeModal?.addEventListener('click', (e) => {
    if (e.target === elements.upgradeModal) closeUpgradeModal();
  });
  elements.checkoutModal?.addEventListener('click', (e) => {
    if (e.target === elements.checkoutModal) closeCheckoutModal();
  });
}

// ============== Resume Handling ==============
async function loadResumeData() {
  try {
    // Get resumes from backend via background script
    const response = await chrome.runtime.sendMessage({ action: 'getResumes' });
    
    if (response.success && response.resumes && response.resumes.length > 0) {
      const primaryResume = response.resumes.find(r => r.is_primary) || response.resumes[0];
      
      // Get full resume text
      const textResponse = await chrome.runtime.sendMessage({ 
        action: 'getResumeText', 
        resumeId: primaryResume.id 
      });
      
      if (textResponse.success) {
        resumeData = {
          id: primaryResume.id,
          text: textResponse.resumeText,
          filename: primaryResume.name
        };
        elements.resumeName.textContent = primaryResume.name || 'Resume loaded';
      } else {
        elements.resumeName.textContent = 'Failed to load resume';
      }
    } else {
      elements.resumeName.textContent = 'No resume - create one on website';
    }
  } catch (error) {
    console.error('Load resume error:', error);
    elements.resumeName.textContent = 'Error loading resume';
  }
}

async function handleResumeUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  elements.resumeName.textContent = 'Processing...';
  
  const ext = file.name.split('.').pop().toLowerCase();
  
  try {
    let resumeText = '';
    
    // For .txt files, read directly
    if (ext === 'txt') {
      resumeText = await file.text();
    }
    // For DOCX files, try client-side parsing first
    else if (ext === 'docx') {
      try {
        if (typeof extractTextFromDocx === 'function') {
          resumeText = await extractTextFromDocx(file);
          console.log('Client-side DOCX parsing successful');
        } else {
          throw new Error('DOCX parser not loaded');
        }
      } catch (clientError) {
        console.log('Client-side parsing failed, trying backend:', clientError);
        
        // Fall back to backend
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/api/v1/upload-resume`, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Backend upload failed');
        
        const data = await response.json();
        resumeText = data.text;
        
        if (data.parsed) {
          await chrome.storage.local.set({ resumeParsed: data.parsed });
        }
      }
    }
    // For PDF files, need backend
    else if (ext === 'pdf') {
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/api/v1/upload-resume`, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const data = await response.json();
        resumeText = data.text;
        
        if (data.parsed) {
          await chrome.storage.local.set({ resumeParsed: data.parsed });
        }
      } catch (backendError) {
        alert('PDF parsing requires the backend server.\n\nPlease use a DOCX or TXT file instead, or start the backend.');
        elements.resumeName.textContent = 'Upload failed - use DOCX or TXT';
        return;
      }
    }
    else {
      alert('Unsupported file type. Please use PDF, DOCX, or TXT.');
      elements.resumeName.textContent = 'No resume loaded';
      return;
    }
    
    // Validate we got some text
    if (!resumeText || resumeText.trim().length < 50) {
      alert('Could not extract enough text from the file.');
      elements.resumeName.textContent = 'Extraction failed';
      return;
    }
    
    // Store resume data
    await chrome.storage.local.set({
      resume: resumeText,
      resumeFilename: file.name
    });
    
    resumeData = {
      text: resumeText,
      filename: file.name,
      parsed: null
    };
    
    elements.resumeName.textContent = file.name;
  } catch (error) {
    console.error('Resume upload error:', error);
    elements.resumeName.textContent = 'Upload failed';
    alert('Failed to process resume: ' + error.message);
  }
}

// ============== Queue Management ==============
async function refreshQueue() {
  const result = await chrome.storage.local.get(['jobQueue', 'analysisHistory']);
  const queue = result.jobQueue || [];
  const history = result.analysisHistory || [];
  
  // Categorize jobs
  const processing = queue.filter(j => j.status === 'processing');
  const queued = queue.filter(j => j.status === 'queued');
  const completed = [...queue.filter(j => j.status === 'completed' || j.status === 'error')];
  
  // Also include items from history that aren't in the queue
  const queueIds = new Set(queue.map(j => j.id));
  history.forEach(h => {
    if (!queueIds.has(h.id)) {
      completed.push({
        id: h.id,
        title: h.jobTitle || h.title,
        company: h.company,
        url: h.url,
        status: 'completed',
        result: h,
        timestamp: h.timestamp
      });
    }
  });
  
  // Sort completed by timestamp (newest first)
  completed.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  
  // Update stats
  elements.queuedCount.textContent = queued.length;
  elements.processingCount.textContent = processing.length;
  elements.completedCount.textContent = completed.length;
  
  // Count today's jobs
  const today = new Date().toDateString();
  const todayJobs = completed.filter(j => {
    const jobDate = new Date(j.timestamp || 0).toDateString();
    return jobDate === today;
  });
  elements.todayCount.textContent = todayJobs.length;
  
  // Update lists
  renderJobList(elements.processingList, processing, 'processing');
  renderJobList(elements.queuedList, queued, 'queued');
  renderJobList(elements.completedList, completed.slice(0, 50), 'completed');
  
  // Show/hide sections
  elements.processingSection.classList.toggle('hidden', processing.length === 0);
  elements.queuedSection.classList.toggle('hidden', queued.length === 0);
  elements.completedSection.classList.toggle('hidden', completed.length === 0);
  
  // Show empty state if no jobs at all
  const totalJobs = processing.length + queued.length + completed.length;
  elements.emptyState.classList.toggle('hidden', totalJobs > 0);
  
  // Update selected job if it exists
  if (selectedJobId) {
    const selectedJob = [...queue, ...completed].find(j => j.id === selectedJobId);
    if (selectedJob && selectedJob.status === 'completed' && selectedJob.result) {
      showJobDetails(selectedJob);
    }
  }
  
  // Update usage
  const usageResult = await chrome.storage.local.get(['usageCount', 'isPro']);
  const usageCount = usageResult.usageCount || 0;
  const isPro = usageResult.isPro || false;
  if (isPro) {
    elements.usageInfo.textContent = 'Pro: Unlimited analyses';
  } else {
    elements.usageInfo.textContent = `Free: ${Math.max(0, 5 - usageCount)} analyses left`;
  }
}

function renderJobList(container, jobs, type) {
  if (jobs.length === 0) {
    container.innerHTML = '<p class="empty-list">No jobs</p>';
    return;
  }
  
  container.innerHTML = jobs.map(job => {
    const isSelected = job.id === selectedJobId;
    const score = job.result?.match?.overall_match_score || job.score;
    const scoreClass = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
    
    let statusBadge = '';
    let icon = '📋';
    let actionButtons = '';
    
    if (type === 'processing') {
      statusBadge = '<span class="job-item-status processing">Analyzing...</span>';
      icon = '⏳';
    } else if (type === 'queued') {
      statusBadge = '<span class="job-item-status queued">Queued</span>';
      icon = '📋';
      actionButtons = `<button class="remove" data-action="remove" data-job-id="${job.id}" title="Remove from queue">✕</button>`;
    } else if (job.status === 'error') {
      statusBadge = '<span class="job-item-status error">Error</span>';
      icon = '❌';
      actionButtons = `
        <button class="retry" data-action="retry" data-job-id="${job.id}">🔄 Retry</button>
        <button class="delete" data-action="delete" data-job-id="${job.id}" title="Delete">🗑️</button>
      `;
    } else {
      // Completed jobs
      statusBadge = `<span class="job-item-score ${scoreClass}">${score || '-'}%</span>`;
      icon = score >= 70 ? '✅' : score >= 50 ? '🟡' : '🔴';
      actionButtons = `<button class="delete" data-action="delete" data-job-id="${job.id}" title="Delete">🗑️</button>`;
    }
    
    return `
      <div class="job-item ${type} ${job.status === 'error' ? 'error' : ''} ${isSelected ? 'selected' : ''}" data-job-id="${job.id}" data-error="${escapeHtml(job.error || '')}">
        <span class="job-item-icon">${icon}</span>
        <div class="job-item-content">
          <div class="job-item-title">${escapeHtml(job.title || 'Untitled Job')}</div>
          <div class="job-item-company">${escapeHtml(job.company || 'Unknown Company')}</div>
          ${job.status === 'error' ? `<div class="job-item-error">⚠️ ${escapeHtml(job.error || 'Analysis failed - check if backend is running')}</div>` : ''}
        </div>
        ${statusBadge}
        <div class="job-item-actions">
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.job-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const jobId = item.dataset.jobId;
      const job = jobs.find(j => j.id === jobId);
      
      if (e.target.dataset.action === 'remove') {
        removeFromQueue(jobId);
        return;
      }
      
      if (e.target.dataset.action === 'retry') {
        retryJob(jobId);
        return;
      }
      
      if (e.target.dataset.action === 'delete') {
        deleteJob(jobId);
        return;
      }
      
      if (job) {
        if (job.status === 'error') {
          showErrorDetails(job);
        } else if (job.status === 'completed' || job.result) {
          selectJob(job);
        }
      }
    });
  });
}

function selectJob(job) {
  // If selecting a different job, reset the generated content state
  if (selectedJobId !== job.id) {
    isShowingGeneratedContent = false;
    generatedContents = { resume: { text: '', html: '' }, cover_letter: { text: '', html: '' } };
    activeTab = 'resume';
    // Reset selections for new job
    selectedSkills = new Set();
    selectedQuickWins = new Set();
    allMissingSkills = [];
    allQuickWins = [];
    updateTabStates();
    // Hide score improvement from previous job
    elements.scoreImprovement?.classList.add('hidden');
    elements.generatedContent?.classList.add('hidden');
  }
  
  selectedJobId = job.id;
  
  // Update selection UI
  document.querySelectorAll('.job-item').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.job-item[data-job-id="${job.id}"]`)?.classList.add('selected');
  
  showJobDetails(job);
}

async function removeFromQueue(jobId) {
  const result = await chrome.storage.local.get(['jobQueue']);
  const queue = result.jobQueue || [];
  const updatedQueue = queue.filter(j => j.id !== jobId);
  await chrome.storage.local.set({ jobQueue: updatedQueue });
  refreshQueue();
}

async function deleteJob(jobId) {
  if (!confirm('Delete this job analysis?')) return;
  
  const result = await chrome.storage.local.get(['jobQueue']);
  const queue = result.jobQueue || [];
  const updatedQueue = queue.filter(j => j.id !== jobId);
  await chrome.storage.local.set({ jobQueue: updatedQueue });
  
  // If this was the selected job, clear selection
  if (selectedJobId === jobId) {
    selectedJobId = null;
    isShowingGeneratedContent = false;
    generatedContents = { resume: { text: '', html: '' }, cover_letter: { text: '', html: '' } };
    elements.noSelectionState.classList.remove('hidden');
    elements.jobDetailsContent.classList.add('hidden');
    elements.generatedContent.classList.add('hidden');
  }
  
  refreshQueue();
}

async function retryJob(jobId) {
  const result = await chrome.storage.local.get(['jobQueue']);
  const queue = result.jobQueue || [];
  
  const jobIndex = queue.findIndex(j => j.id === jobId);
  if (jobIndex >= 0) {
    queue[jobIndex].status = 'queued';
    queue[jobIndex].error = null;
    await chrome.storage.local.set({ jobQueue: queue });
    
    // Trigger background processing
    chrome.runtime.sendMessage({ action: 'startProcessing' });
    
    refreshQueue();
  }
}

function showErrorDetails(job) {
  // Reset generated content state when viewing error details
  isShowingGeneratedContent = false;
  generatedContents = { resume: { text: '', html: '' }, cover_letter: { text: '', html: '' } };
  activeTab = 'resume';
  
  elements.noSelectionState.classList.add('hidden');
  elements.jobDetailsContent.classList.remove('hidden');
  elements.generatedContent.classList.add('hidden');
  
  // Basic info
  elements.detailJobTitle.textContent = job.title || 'Job Analysis';
  elements.detailCompany.textContent = job.company || '';
  elements.detailJobLink.href = job.url || '#';
  
  // Show error state
  elements.detailScore.textContent = '!';
  elements.detailScoreRing.style.strokeDashoffset = 283; // Empty ring
  elements.detailScoreLabel.textContent = 'Analysis Failed';
  elements.detailAtsScore.textContent = '-';
  
  // Error message
  const errorMsg = job.error || 'Unknown error';
  let helpText = '';
  
  if (errorMsg.includes('API key')) {
    helpText = `
      <br><br><strong>How to fix:</strong>
      <ol style="margin: 10px 0; padding-left: 20px;">
        <li>Click the extension icon in Chrome</li>
        <li>Click the ⚙️ Settings button</li>
        <li>Add your Anthropic API key</li>
        <li>Click the 🔄 Retry button on this job</li>
      </ol>
      <strong>Get an API key:</strong> <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a>
    `;
  } else if (errorMsg.includes('Invalid') || errorMsg.includes('401')) {
    helpText = `
      <br><br><strong>How to fix:</strong>
      <ol style="margin: 10px 0; padding-left: 20px;">
        <li>Your API key appears to be invalid</li>
        <li>Go to Settings and enter a valid Anthropic API key</li>
        <li>Click the 🔄 Retry button on this job</li>
      </ol>
    `;
  } else {
    helpText = `
      <br><br><strong>Troubleshooting:</strong>
      <ul style="margin: 10px 0; padding-left: 20px;">
        <li>Check your internet connection</li>
        <li>Verify your API key is valid in Settings</li>
        <li>Click 🔄 Retry to try again</li>
      </ul>
    `;
  }
  
  elements.detailSummary.innerHTML = `
    <div style="color: #DC2626; background: #FEE2E2; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
      <strong>Error:</strong> ${escapeHtml(errorMsg)}
    </div>
    ${helpText}
  `;
  
  // Hide skill sections for errors
  elements.detailQuickWins.classList.add('hidden');
  elements.detailMatchingSkills.innerHTML = '';
  elements.detailMissingSkills.innerHTML = '';
  
  // Hide generate buttons for errors
  elements.generateResumeBtn.style.display = 'none';
  elements.generateCoverLetterBtn.style.display = 'none';
}

async function clearCompleted() {
  const result = await chrome.storage.local.get(['jobQueue']);
  const queue = result.jobQueue || [];
  const updatedQueue = queue.filter(j => j.status !== 'completed' && j.status !== 'error');
  await chrome.storage.local.set({ jobQueue: updatedQueue });
  
  // Also clear from analysisHistory if desired
  // await chrome.storage.local.set({ analysisHistory: [] });
  
  if (selectedJobId) {
    const stillExists = updatedQueue.find(j => j.id === selectedJobId);
    if (!stillExists) {
      selectedJobId = null;
      elements.noSelectionState.classList.remove('hidden');
      elements.jobDetailsContent.classList.add('hidden');
    }
  }
  
  refreshQueue();
}

// ============== Job Details ==============
function showJobDetails(job) {
  elements.noSelectionState.classList.add('hidden');
  elements.jobDetailsContent.classList.remove('hidden');
  
  // Only hide generated content if we're not actively showing it
  if (!isShowingGeneratedContent) {
    elements.generatedContent.classList.add('hidden');
  }
  
  // Show generate buttons (may have been hidden for error jobs)
  elements.generateResumeBtn.style.display = '';
  elements.generateCoverLetterBtn.style.display = '';
  
  const result = job.result || {};
  const match = result.match || result;
  
  // Basic info
  elements.detailJobTitle.textContent = job.title || result.jobTitle || 'Job Analysis';
  elements.detailCompany.textContent = job.company || result.company || '';
  elements.detailJobLink.href = job.url || result.url || '#';
  
  // Score
  const score = match.overall_match_score || 0;
  elements.detailScore.textContent = score;
  
  // Animate score ring
  const circumference = 283;
  const offset = circumference - (score / 100) * circumference;
  elements.detailScoreRing.style.strokeDashoffset = offset;
  
  // Score label
  const recommendation = match.recommendation || 'needs_work';
  const labels = {
    'strong_match': 'Strong Match!',
    'good_match': 'Good Match',
    'needs_work': 'Needs Work',
    'not_recommended': 'Not Recommended'
  };
  elements.detailScoreLabel.textContent = labels[recommendation] || 'Analysis Complete';
  
  // ATS Score
  const atsScore = match.ats_optimization?.estimated_ats_score || Math.round(score * 0.8);
  elements.detailAtsScore.textContent = atsScore;
  
  // Summary
  elements.detailSummary.textContent = match.summary || 'Analysis complete.';
  
  // Quick Wins - make them selectable
  const quickWins = match.quick_wins || [];
  const criticalKeywords = match.ats_optimization?.critical_missing_keywords || [];
  
  // Store all quick wins for later use
  allQuickWins = [];
  
  if (quickWins.length > 0 || criticalKeywords.length > 0) {
    elements.detailQuickWins.classList.remove('hidden');
    
    // Build quick wins array
    quickWins.slice(0, 4).forEach((qw, idx) => {
      allQuickWins.push({
        id: `qw-${idx}`,
        text: qw.action || qw,
        type: 'quick_win'
      });
    });
    
    if (criticalKeywords.length > 0 && quickWins.length < 3) {
      allQuickWins.push({
        id: 'qw-keywords',
        text: `Add keywords: ${criticalKeywords.slice(0, 3).join(', ')}`,
        type: 'keywords'
      });
    }
    
    // Render selectable quick wins
    elements.detailQuickWinsList.innerHTML = allQuickWins.map(qw => {
      const isSelected = selectedQuickWins.has(qw.id);
      return `<li class="${isSelected ? 'selected' : ''}" data-qw-id="${qw.id}">⚡ ${escapeHtml(qw.text)}</li>`;
    }).join('');
    
    // Add click handlers for quick wins
    elements.detailQuickWinsList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => toggleQuickWin(li.dataset.qwId));
    });
  } else {
    elements.detailQuickWins.classList.add('hidden');
  }
  
  // Skills
  const matchingSkills = match.matching_skills || [];
  const missingSkills = match.missing_skills || [];
  
  // Store missing skills
  allMissingSkills = missingSkills.slice(0, 15).map((s, idx) => {
    const skillName = typeof s === 'object' ? (s.skill || s.name || String(s)) : String(s);
    return { id: `skill-${idx}`, name: skillName };
  });
  
  // Render matching skills (not selectable)
  elements.detailMatchingSkills.innerHTML = matchingSkills.slice(0, 10).map(s => {
    const skillName = typeof s === 'object' ? (s.skill || s.name || String(s)) : String(s);
    return `<span class="skill-tag">${escapeHtml(skillName)}</span>`;
  }).join('') || '<span class="no-skills">None identified</span>';
  
  // Render selectable missing skills
  elements.detailMissingSkills.innerHTML = allMissingSkills.map(skill => {
    const isSelected = selectedSkills.has(skill.id);
    return `<span class="skill-tag ${isSelected ? 'selected' : ''}" data-skill-id="${skill.id}">${escapeHtml(skill.name)}</span>`;
  }).join('') || '<span class="no-skills">None - great match!</span>';
  
  // Add click handlers for skills
  elements.detailMissingSkills.querySelectorAll('.skill-tag').forEach(tag => {
    if (tag.dataset.skillId) {
      tag.addEventListener('click', () => toggleSkill(tag.dataset.skillId));
    }
  });
  
  // Update selection counts
  updateSelectionCounts();
}

// ============== Selection Handling ==============
function toggleSkill(skillId) {
  if (selectedSkills.has(skillId)) {
    selectedSkills.delete(skillId);
  } else {
    selectedSkills.add(skillId);
  }
  
  // Update UI
  const tag = elements.detailMissingSkills.querySelector(`[data-skill-id="${skillId}"]`);
  if (tag) {
    tag.classList.toggle('selected', selectedSkills.has(skillId));
  }
  
  updateSelectionCounts();
  
  // Clear generated content since selections changed
  clearGeneratedContent();
}

function toggleQuickWin(qwId) {
  if (selectedQuickWins.has(qwId)) {
    selectedQuickWins.delete(qwId);
  } else {
    selectedQuickWins.add(qwId);
  }
  
  // Update UI
  const li = elements.detailQuickWinsList.querySelector(`[data-qw-id="${qwId}"]`);
  if (li) {
    li.classList.toggle('selected', selectedQuickWins.has(qwId));
  }
  
  updateSelectionCounts();
  
  // Clear generated content since selections changed
  clearGeneratedContent();
}

function updateSelectionCounts() {
  if (elements.selectedSkillsCount) {
    elements.selectedSkillsCount.textContent = selectedSkills.size;
  }
  if (elements.selectedWinsCount) {
    elements.selectedWinsCount.textContent = selectedQuickWins.size;
  }
}

function clearGeneratedContent() {
  generatedContents = { resume: { text: '', html: '' }, cover_letter: { text: '', html: '' } };
  isShowingGeneratedContent = false;
  elements.generatedContent?.classList.add('hidden');
  elements.scoreImprovement?.classList.add('hidden');
  updateTabStates();
}

// ============== Score Improvement Analysis ==============
async function analyzeImprovedResume(improvedResumeText, job, apiKey) {
  // Show the score improvement section with analyzing state
  elements.scoreImprovement?.classList.remove('hidden');
  elements.improvementAnalyzing?.classList.remove('hidden');
  
  // Reset the change box style
  const changeBox = elements.scoreChange?.closest('.improvement-box');
  if (changeBox) changeBox.style.background = '';
  
  // Get the original score - matching the structure used in showJobDetails
  const match = job.result?.match || job.result || {};
  const overallScore = match.overall_match_score || 0;
  const originalAtsScore = match.ats_optimization?.estimated_ats_score || Math.round(overallScore * 0.8);
  
  elements.originalScore.textContent = originalAtsScore + '%';
  elements.improvedScore.textContent = '--';
  elements.scoreChange.textContent = '--';
  
  try {
    const jobText = job.jobText || job.result?.job?.description || JSON.stringify(job.result?.job || {});
    
    const systemPrompt = `You are an ATS (Applicant Tracking System) analyzer. Analyze how well a resume matches a job posting.

Return ONLY a JSON object with this exact structure:
{
  "matchScore": <number 0-100>,
  "keywordMatches": ["keyword1", "keyword2"],
  "improvements": ["still missing X", "could strengthen Y"]
}

SCORING CRITERIA:
- Keyword match: 40 points (required skills, tools, technologies mentioned)
- Experience alignment: 30 points (relevant roles, responsibilities)
- Qualifications match: 20 points (education, certifications)
- Overall fit: 10 points (industry knowledge, company fit)

Be objective and consistent in scoring.`;

    const userPrompt = `Analyze this IMPROVED/TAILORED resume against the job posting:

JOB POSTING:
${jobText}

TAILORED RESUME:
${improvedResumeText}

Return the JSON analysis with the match score.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      throw new Error('Analysis failed');
    }

    const data = await response.json();
    const responseText = data.content[0].text;
    
    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      const improvedScore = analysis.matchScore || 0;
      const change = improvedScore - originalAtsScore;
      
      // Update the display
      elements.improvedScore.textContent = improvedScore + '%';
      elements.scoreChange.textContent = (change >= 0 ? '+' : '') + change + '%';
      
      // Color the change based on positive/negative
      const changeBox = elements.scoreChange.closest('.improvement-box');
      if (changeBox) {
        if (change > 0) {
          changeBox.style.background = '#10B981'; // Green
        } else if (change < 0) {
          changeBox.style.background = '#EF4444'; // Red
        } else {
          changeBox.style.background = '#6B7280'; // Gray
        }
      }
    }
    
  } catch (error) {
    console.error('Score analysis error:', error);
    elements.improvedScore.textContent = 'N/A';
    elements.scoreChange.textContent = 'N/A';
  } finally {
    elements.improvementAnalyzing?.classList.add('hidden');
  }
}

// ============== Content Generation ==============
async function generateContent(type) {
  if (!selectedJobId) return;
  
  // Find the selected job
  const result = await chrome.storage.local.get(['jobQueue', 'analysisHistory']);
  const queue = result.jobQueue || [];
  const history = result.analysisHistory || [];
  
  // Look in both queue and history
  let job = queue.find(j => j.id === selectedJobId);
  let historyItem = history.find(h => h.id === selectedJobId);
  
  if (!job && historyItem) {
    job = { id: historyItem.id, result: historyItem, ...historyItem };
  }
  
  if (!job || !job.result) {
    alert('Job data not found. Please re-analyze this job.');
    return;
  }
  
  // Get resume text from the job (stored when analysis was done)
  // Priority: 1) job.result.resumeText, 2) job.resumeText, 3) historyItem.resumeText, 4) fetch from backend, 5) fallback to resumeData
  let resumeText = job.result?.resumeText || job.resumeText || historyItem?.resumeText;
  
  // If no stored resume text, try to fetch from backend using resumeId
  if (!resumeText && (job.resumeId || historyItem?.resumeId)) {
    const resumeId = job.resumeId || historyItem?.resumeId;
    console.log('Fetching resume from backend, resumeId:', resumeId);
    try {
      const fetchResponse = await chrome.runtime.sendMessage({
        action: 'getResumeText',
        resumeId: resumeId
      });
      if (fetchResponse && fetchResponse.success && fetchResponse.resumeText) {
        resumeText = fetchResponse.resumeText;
        console.log('Fetched resume from backend, length:', resumeText.length);
      }
    } catch (e) {
      console.error('Failed to fetch resume from backend:', e);
    }
  }
  
  if (!resumeText && resumeData && resumeData.text) {
    // Fallback to separately uploaded resume
    resumeText = resumeData.text;
    console.log('Using fallback resumeData');
  }
  
  if (!resumeText) {
    alert('Resume text not found. Please re-analyze this job with a resume selected, or upload a resume in the Resume section above.');
    return;
  }
  
  console.log('Using resume text, length:', resumeText.length);
  
  // Get selected skills and quick wins
  const selectedSkillNames = allMissingSkills
    .filter(s => selectedSkills.has(s.id))
    .map(s => s.name);
  
  const selectedQuickWinTexts = allQuickWins
    .filter(qw => selectedQuickWins.has(qw.id))
    .map(qw => qw.text);
  
  const btn = type === 'resume' ? elements.generateResumeBtn : elements.generateCoverLetterBtn;
  const originalText = btn.textContent;
  btn.textContent = 'Generating...';
  btn.disabled = true;
  
  try {
    const jobText = job.jobText || historyItem?.jobText || job.result?.job?.description || JSON.stringify(job.result?.job || {});
    
    if (type === 'resume') {
      // Call backend for tailored resume
      const response = await chrome.runtime.sendMessage({
        action: 'generateTailoredResume',
        data: {
          analysisId: job.result?.analysisId,
          jobDescription: jobText,
          resumeText: resumeText,
          selectedSkills: selectedSkillNames,
          quickWins: selectedQuickWinTexts
        }
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to generate tailored resume');
      }
      
      const rawText = response.tailoredResume;
      generatedContents.resume.text = rawText;
      generatedContents.resume.html = formatResumeAsHtml(rawText);
      
      // Show the generated content
      activeTab = type;
      isShowingGeneratedContent = true;
      updateTabStates();
      showActiveTabContent();
      elements.generatedContent.classList.remove('hidden');
      
      // Show score improvement if available
      if (response.improvedScore) {
        showScoreImprovement(job, response.improvedScore);
      }
      
    } else {
      // Call backend for cover letter
      const response = await chrome.runtime.sendMessage({
        action: 'generateCoverLetter',
        data: {
          analysisId: job.result?.analysisId,
          jobDescription: jobText,
          resumeText: resumeText,
          companyName: job.company || historyItem?.company || job.result?.job?.company,
          tone: 'professional'
        }
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to generate cover letter');
      }
      
      const rawText = response.coverLetter;
      generatedContents.cover_letter.text = rawText;
      generatedContents.cover_letter.html = formatCoverLetterAsHtml(rawText);
      
      // Show the generated content
      activeTab = type;
      isShowingGeneratedContent = true;
      updateTabStates();
      showActiveTabContent();
      elements.generatedContent.classList.remove('hidden');
    }
    
  } catch (error) {
    console.error('Generation error:', error);
    alert('Failed to generate content: ' + error.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function showScoreImprovement(job, improvedScore) {
  const match = job.result?.match || job.result || {};
  const originalScore = match.ats_optimization?.estimated_ats_score || Math.round((match.overall_match_score || 0) * 0.8);
  const change = improvedScore - originalScore;
  
  if (elements.scoreImprovement) {
    elements.scoreImprovement.classList.remove('hidden');
    elements.originalScore.textContent = originalScore + '%';
    elements.improvedScore.textContent = improvedScore + '%';
    elements.scoreChange.textContent = (change >= 0 ? '+' : '') + change + '%';
    
    const changeBox = elements.scoreChange?.closest('.improvement-box');
    if (changeBox) {
      if (change > 0) {
        changeBox.style.background = '#10B981';
      } else if (change < 0) {
        changeBox.style.background = '#EF4444';
      } else {
        changeBox.style.background = '#6B7280';
      }
    }
  }
  
  if (elements.improvementAnalyzing) {
    elements.improvementAnalyzing.classList.add('hidden');
  }
}

// ============== Tab Management ==============
function switchTab(type) {
  if (!generatedContents[type].text && !generatedContents[type].html) {
    // No content for this tab yet, generate it
    generateContent(type);
    return;
  }
  
  activeTab = type;
  updateTabStates();
  showActiveTabContent();
}

function updateTabStates() {
  // Update tab active states
  elements.tabResume?.classList.toggle('active', activeTab === 'resume');
  elements.tabCoverLetter?.classList.toggle('active', activeTab === 'cover_letter');
  
  // Update tab content indicators
  elements.tabResume?.classList.toggle('has-content', !!generatedContents.resume.text);
  elements.tabCoverLetter?.classList.toggle('has-content', !!generatedContents.cover_letter.text);
}

function showActiveTabContent() {
  const content = generatedContents[activeTab];
  if (content.html) {
    elements.generatedPreview.innerHTML = content.html;
    elements.generatedPreview.classList.toggle('formatted-resume', activeTab === 'resume');
    elements.generatedPreview.classList.toggle('formatted-cover-letter', activeTab === 'cover_letter');
  } else {
    elements.generatedPreview.textContent = content.text || 'No content generated yet.';
  }
}

// ============== Resume Formatting ==============
function formatResumeAsHtml(text) {
  // Parse the structured resume format
  let html = '<div class="resume-document">';
  
  // Check if it uses our structured format
  if (text.includes('===HEADER===') || text.includes('===SECTION:')) {
    const sections = text.split(/===([^=]+)===/g).filter(s => s.trim());
    
    for (let i = 0; i < sections.length; i += 2) {
      const sectionName = sections[i]?.trim();
      const sectionContent = sections[i + 1]?.trim() || '';
      
      if (sectionName === 'HEADER') {
        html += formatHeaderSection(sectionContent);
      } else if (sectionName.startsWith('SECTION:')) {
        const title = sectionName.replace('SECTION:', '').trim();
        html += formatSection(title, sectionContent);
      }
    }
  } else {
    // Fallback: Try to parse unstructured text intelligently
    html += parseUnstructuredResume(text);
  }
  
  html += '</div>';
  return html;
}

function formatHeaderSection(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return '';
  
  const name = lines[0].trim();
  const contact = lines.slice(1).join(' | ').trim();
  
  return `
    <div class="resume-header">
      <div class="resume-name">${escapeHtml(name)}</div>
      <div class="resume-contact">${escapeHtml(contact)}</div>
    </div>
  `;
}

function formatSection(title, content) {
  let html = `<div class="resume-section">`;
  html += `<div class="section-title">${escapeHtml(title)}</div>`;
  
  if (title === 'SKILLS') {
    html += formatSkillsSection(content);
  } else if (title === 'SUMMARY') {
    html += `<p>${escapeHtml(content)}</p>`;
  } else {
    html += formatExperienceSection(content);
  }
  
  html += '</div>';
  return html;
}

function formatSkillsSection(content) {
  const lines = content.split('\n').filter(l => l.trim());
  let html = '<div class="skills-grid">';
  
  for (const line of lines) {
    if (line.includes(':')) {
      const [category, skills] = line.split(':').map(s => s.trim());
      html += `<span class="skill-category">${escapeHtml(category)}:</span>`;
      html += `<span class="skill-list">${escapeHtml(skills)}</span>`;
    } else {
      html += `<span class="skill-list" style="grid-column: span 2;">${escapeHtml(line)}</span>`;
    }
  }
  
  html += '</div>';
  return html;
}

function formatExperienceSection(content) {
  let html = '';
  const blocks = content.split(/\n(?=[A-Z])/);
  
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length === 0) continue;
    
    // First line is usually company/title
    const firstLine = lines[0].trim();
    let secondLine = '';
    let bulletStart = 1;
    
    // Check if second line is also a header (date/title line)
    if (lines.length > 1 && !lines[1].trim().startsWith('•') && !lines[1].trim().startsWith('-')) {
      secondLine = lines[1].trim();
      bulletStart = 2;
    }
    
    html += '<div class="experience-item">';
    html += '<div class="item-header">';
    
    // Parse company | location and title | date
    if (firstLine.includes('|')) {
      const parts = firstLine.split('|').map(p => p.trim());
      html += `<span class="item-title">${escapeHtml(parts[0])}</span>`;
      if (parts[1]) {
        html += `<span class="item-date">${escapeHtml(parts[1])}</span>`;
      }
    } else {
      html += `<span class="item-title">${escapeHtml(firstLine)}</span>`;
    }
    
    html += '</div>';
    
    if (secondLine) {
      html += '<div class="item-header">';
      if (secondLine.includes('|')) {
        const parts = secondLine.split('|').map(p => p.trim());
        html += `<span class="item-subtitle">${escapeHtml(parts[0])}</span>`;
        if (parts[1]) {
          html += `<span class="item-date">${escapeHtml(parts[1])}</span>`;
        }
      } else {
        html += `<span class="item-subtitle">${escapeHtml(secondLine)}</span>`;
      }
      html += '</div>';
    }
    
    // Bullets
    const bullets = lines.slice(bulletStart).filter(l => l.trim().startsWith('•') || l.trim().startsWith('-'));
    if (bullets.length > 0) {
      html += '<ul class="item-bullets">';
      for (const bullet of bullets) {
        const bulletText = bullet.replace(/^[•\-]\s*/, '').trim();
        html += `<li>${escapeHtml(bulletText)}</li>`;
      }
      html += '</ul>';
    }
    
    html += '</div>';
  }
  
  return html;
}

function parseUnstructuredResume(text) {
  // Fallback parser for resumes without our structured markers
  let html = '';
  const lines = text.split('\n');
  let currentSection = '';
  let inBulletList = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inBulletList) {
        html += '</ul>';
        inBulletList = false;
      }
      continue;
    }
    
    // Detect section headers (all caps or common headers)
    if (/^(EDUCATION|EXPERIENCE|SKILLS|PROJECTS|SUMMARY|OBJECTIVE|CERTIFICATIONS|AWARDS)/i.test(trimmed) ||
        (trimmed === trimmed.toUpperCase() && trimmed.length < 30 && !trimmed.includes('•'))) {
      if (inBulletList) {
        html += '</ul>';
        inBulletList = false;
      }
      html += `<div class="resume-section"><div class="section-title">${escapeHtml(trimmed)}</div>`;
      currentSection = trimmed.toLowerCase();
    } else if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      if (!inBulletList) {
        html += '<ul class="item-bullets">';
        inBulletList = true;
      }
      const bulletText = trimmed.replace(/^[•\-\*]\s*/, '');
      html += `<li>${escapeHtml(bulletText)}</li>`;
    } else {
      if (inBulletList) {
        html += '</ul>';
        inBulletList = false;
      }
      // Check if it looks like a header (company name, title, etc)
      if (line.match(/\|/) || line.match(/\d{4}/) || line.match(/present/i)) {
        html += `<div class="item-header"><span class="item-title">${escapeHtml(trimmed)}</span></div>`;
      } else {
        html += `<p>${escapeHtml(trimmed)}</p>`;
      }
    }
  }
  
  if (inBulletList) {
    html += '</ul>';
  }
  
  return html;
}

function formatCoverLetterAsHtml(text) {
  // Simple formatting for cover letter - preserve paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  return paragraphs.map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

function copyGenerated() {
  const content = generatedContents[activeTab]?.text || '';
  if (!content) {
    alert('No content to copy');
    return;
  }
  
  // Clean up the text for copying (remove section markers)
  const cleanText = content
    .replace(/===HEADER===/g, '')
    .replace(/===SECTION:[^=]+===/g, '\n')
    .trim();
  
  navigator.clipboard.writeText(cleanText);
  const btn = elements.copyGeneratedBtn;
  btn.textContent = '✓ Copied!';
  setTimeout(() => btn.textContent = '📋 Copy', 2000);
}

async function downloadGenerated(format) {
  const content = generatedContents[activeTab]?.text || '';
  if (!content) {
    alert('No content to download');
    return;
  }
  
  const btn = format === 'txt' ? elements.downloadTxtBtn : 
              format === 'docx' ? elements.downloadDocxBtn : elements.downloadPdfBtn;
  const originalText = btn.textContent;
  btn.textContent = '...';
  
  try {
    const filename = activeTab === 'resume' ? 'tailored-resume' : 'cover-letter';
    
    // Clean up the text (remove section markers)
    const cleanText = content
      .replace(/===HEADER===/g, '')
      .replace(/===SECTION:[^=]+===/g, '\n')
      .trim();
    
    if (format === 'txt') {
      const blob = new Blob([cleanText], { type: 'text/plain' });
      downloadBlob(blob, `${filename}.txt`);
    } 
    else if (format === 'docx') {
      const docxBlob = createFormattedDocx(content, activeTab);
      downloadBlob(docxBlob, `${filename}.rtf`); // RTF opens in Word
    }
    else if (format === 'pdf') {
      // Open print dialog with formatted content
      const htmlContent = activeTab === 'resume' ? 
        generatedContents.resume.html : 
        generatedContents.cover_letter.html;
      
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>${filename}</title>
            <style>
              body { 
                font-family: 'Segoe UI', Arial, sans-serif; 
                font-size: 11pt; 
                line-height: 1.4; 
                max-width: 7.5in; 
                margin: 0.75in auto; 
                color: #333;
              }
              .resume-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #333; }
              .resume-name { font-size: 20pt; font-weight: bold; margin-bottom: 4px; }
              .resume-contact { font-size: 10pt; color: #555; }
              .resume-section { margin-bottom: 14px; }
              .section-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #999; padding-bottom: 2px; margin-bottom: 8px; color: #222; }
              .experience-item, .education-item, .project-item { margin-bottom: 10px; }
              .item-header { display: flex; justify-content: space-between; flex-wrap: wrap; }
              .item-title { font-weight: 600; }
              .item-subtitle { font-style: italic; color: #555; }
              .item-date { color: #666; font-size: 10pt; }
              .item-bullets { margin: 4px 0 0 18px; padding: 0; }
              .item-bullets li { margin-bottom: 3px; }
              .skills-grid { display: grid; grid-template-columns: 120px 1fr; gap: 4px 10px; }
              .skill-category { font-weight: 600; }
              p { margin: 0 0 12px 0; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            ${htmlContent || `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(cleanText)}</pre>`}
            <script>setTimeout(() => { window.print(); window.close(); }, 250);</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
    
  } catch (error) {
    console.error('Download error:', error);
    alert('Download failed: ' + error.message);
  } finally {
    btn.textContent = originalText;
  }
}

function createFormattedDocx(content, type) {
  // Create RTF with proper formatting (RTF is universally supported)
  let rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fswiss Arial;}{\\f1\\fmodern Courier New;}}
{\\colortbl;\\red0\\green0\\blue0;\\red51\\green51\\blue51;\\red100\\green100\\blue100;}
\\f0\\fs22\\cf1`;

  if (type === 'resume') {
    // Parse and format resume sections
    const sections = content.split(/===([^=]+)===/g).filter(s => s.trim());
    
    for (let i = 0; i < sections.length; i += 2) {
      const sectionName = sections[i]?.trim();
      const sectionContent = sections[i + 1]?.trim() || '';
      
      if (sectionName === 'HEADER') {
        const lines = sectionContent.split('\n').filter(l => l.trim());
        if (lines[0]) {
          rtf += `\\qc\\b\\fs32 ${escapeRtf(lines[0])}\\b0\\fs22\\par`;
        }
        if (lines[1]) {
          rtf += `\\cf2\\fs20 ${escapeRtf(lines.slice(1).join(' | '))}\\cf1\\fs22\\par`;
        }
        rtf += `\\ql\\par`;
      } else if (sectionName.startsWith('SECTION:')) {
        const title = sectionName.replace('SECTION:', '').trim();
        rtf += `\\b\\fs24 ${escapeRtf(title)}\\b0\\fs22\\par`;
        rtf += `\\brdrb\\brdrs\\brdrw10\\brsp20\\par`;
        
        const lines = sectionContent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            rtf += `\\par`;
          } else if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
            rtf += `\\li360\\fi-180 \\bullet  ${escapeRtf(trimmed.replace(/^[•\-]\s*/, ''))}\\li0\\fi0\\par`;
          } else if (trimmed.includes('|')) {
            rtf += `\\b ${escapeRtf(trimmed)}\\b0\\par`;
          } else {
            rtf += `${escapeRtf(trimmed)}\\par`;
          }
        }
        rtf += `\\par`;
      }
    }
  } else {
    // Cover letter - simple paragraphs
    const paragraphs = content.split(/\n\n+/);
    for (const p of paragraphs) {
      if (p.trim()) {
        rtf += `${escapeRtf(p.trim())}\\par\\par`;
      }
    }
  }
  
  rtf += '}';
  return new Blob([rtf], { type: 'application/rtf' });
}

function escapeRtf(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par ');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



// ============== Utilities ==============
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============== Payment/Upgrade System ==============
// Configuration - User should replace with their Stripe details
const STRIPE_CONFIG = {
  // Replace with your Stripe publishable key
  publishableKey: 'pk_test_REPLACE_WITH_YOUR_KEY',
  
  // Replace with your Stripe Payment Links or Price IDs
  prices: {
    monthly: {
      name: 'Pro Monthly',
      price: 9.99,
      priceId: 'price_REPLACE_WITH_MONTHLY_PRICE_ID',
      // Or use a Payment Link URL
      paymentLink: 'https://buy.stripe.com/REPLACE_WITH_MONTHLY_LINK'
    },
    annual: {
      name: 'Pro Annual',
      price: 71.88,
      monthlyPrice: 5.99,
      priceId: 'price_REPLACE_WITH_ANNUAL_PRICE_ID',
      paymentLink: 'https://buy.stripe.com/REPLACE_WITH_ANNUAL_LINK'
    }
  }
};

let selectedPlan = null;
let customerInfo = null;

function openUpgradeModal() {
  elements.upgradeModal?.classList.remove('hidden');
}

function closeUpgradeModal() {
  elements.upgradeModal?.classList.add('hidden');
}

function selectPlan(planType) {
  selectedPlan = planType;
  const plan = STRIPE_CONFIG.prices[planType];
  
  // Update checkout modal with plan details
  if (planType === 'monthly') {
    elements.checkoutPlanName.textContent = `${plan.name} - $${plan.price}/month`;
    elements.summaryPlan.textContent = plan.name;
    elements.summaryPrice.textContent = `$${plan.price}/mo`;
    elements.summaryTotal.textContent = `$${plan.price}`;
  } else {
    elements.checkoutPlanName.textContent = `${plan.name} - $${plan.monthlyPrice}/month (billed annually)`;
    elements.summaryPlan.textContent = plan.name;
    elements.summaryPrice.textContent = `$${plan.price}/year`;
    elements.summaryTotal.textContent = `$${plan.price}`;
  }
  
  // Show checkout modal
  closeUpgradeModal();
  elements.checkoutModal?.classList.remove('hidden');
}

function closeCheckoutModal() {
  elements.checkoutModal?.classList.add('hidden');
}

function backToPlans() {
  closeCheckoutModal();
  openUpgradeModal();
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  
  // Gather form data
  customerInfo = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    address: document.getElementById('address').value.trim(),
    city: document.getElementById('city').value.trim(),
    state: document.getElementById('state').value.trim(),
    zip: document.getElementById('zip').value.trim(),
    country: document.getElementById('country').value
  };
  
  // Validate required fields
  if (!customerInfo.firstName || !customerInfo.lastName || !customerInfo.email) {
    alert('Please fill in all required fields.');
    return;
  }
  
  // Validate email
  if (!isValidEmail(customerInfo.email)) {
    alert('Please enter a valid email address.');
    return;
  }
  
  // Save customer info for later
  await chrome.storage.local.set({ 
    pendingCustomerInfo: customerInfo,
    pendingPlan: selectedPlan 
  });
  
  // Disable button and show loading
  elements.proceedToPayment.disabled = true;
  elements.proceedToPayment.textContent = '⏳ Redirecting to payment...';
  
  try {
    // Option 1: Use Stripe Payment Links (simplest, no backend needed)
    // This redirects to Stripe's hosted payment page
    const plan = STRIPE_CONFIG.prices[selectedPlan];
    
    // Build the payment URL with prefilled customer info
    let paymentUrl = plan.paymentLink;
    
    // If using Stripe Payment Links, append customer email
    if (paymentUrl && paymentUrl.includes('buy.stripe.com')) {
      paymentUrl += `?prefilled_email=${encodeURIComponent(customerInfo.email)}`;
    }
    
    // For demo/development, show success directly
    // In production, this would redirect to Stripe
    if (paymentUrl.includes('REPLACE')) {
      // Demo mode - simulate successful payment
      console.log('Demo mode: Simulating successful payment');
      console.log('Customer Info:', customerInfo);
      console.log('Plan:', selectedPlan);
      
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mark as pro
      await activateProSubscription(customerInfo.email);
      
      // Show success
      closeCheckoutModal();
      showSuccessModal(customerInfo.email);
    } else {
      // Production mode - redirect to Stripe
      window.open(paymentUrl, '_blank');
      
      // Show instructions
      alert('Complete your payment in the new tab. Once done, your Pro features will be activated automatically.');
      
      elements.proceedToPayment.disabled = false;
      elements.proceedToPayment.textContent = '🔒 Proceed to Payment';
    }
    
  } catch (error) {
    console.error('Payment error:', error);
    alert('An error occurred. Please try again.');
    elements.proceedToPayment.disabled = false;
    elements.proceedToPayment.textContent = '🔒 Proceed to Payment';
  }
}

async function activateProSubscription(email) {
  const now = new Date();
  const expiryDate = new Date();
  
  if (selectedPlan === 'annual') {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  }
  
  await chrome.storage.local.set({
    isPro: true,
    proEmail: email,
    proPlan: selectedPlan,
    proStartDate: now.toISOString(),
    proExpiryDate: expiryDate.toISOString(),
    customerInfo: customerInfo
  });
  
  // Send confirmation email (in production, this would be handled by your backend/webhook)
  await sendConfirmationEmail(email);
  
  // Update UI
  refreshQueue();
}

async function sendConfirmationEmail(email) {
  // In production, this would call your backend API or use a service like SendGrid, EmailJS, etc.
  // For now, we'll log the email that would be sent
  
  const plan = STRIPE_CONFIG.prices[selectedPlan];
  const receipt = {
    to: email,
    subject: 'Welcome to JobMatch AI Pro! 🎉',
    body: `
Hi ${customerInfo.firstName},

Thank you for upgrading to JobMatch AI Pro!

Order Details:
- Plan: ${plan.name}
- Amount: $${selectedPlan === 'annual' ? plan.price : plan.price}/
${selectedPlan === 'annual' ? 'year' : 'month'}
- Email: ${email}

Your Pro features are now active:
✓ Unlimited job analyses
✓ Unlimited tailored resumes
✓ Unlimited cover letters
✓ Priority support

If you have any questions, reply to this email.

Best regards,
The JobMatch AI Team
    `.trim()
  };
  
  console.log('Confirmation email would be sent:', receipt);
  
  // In production, integrate with email service:
  // - EmailJS (free tier available): https://www.emailjs.com/
  // - SendGrid: https://sendgrid.com/
  // - Mailgun: https://www.mailgun.com/
  // 
  // Example EmailJS integration:
  // await emailjs.send('service_id', 'template_id', {
  //   to_email: email,
  //   to_name: customerInfo.firstName,
  //   plan_name: plan.name,
  //   amount: plan.price
  // });
}

function showSuccessModal(email) {
  elements.receiptEmail.textContent = email;
  elements.successModal?.classList.remove('hidden');
}

function closeSuccessModal() {
  elements.successModal?.classList.add('hidden');
  
  // Reset form
  elements.checkoutForm?.reset();
  selectedPlan = null;
  customerInfo = null;
  
  elements.proceedToPayment.disabled = false;
  elements.proceedToPayment.textContent = '🔒 Proceed to Payment';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Check for payment success on page load (for redirect flow)
async function checkPaymentStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Stripe redirects with session_id on success
  if (urlParams.get('success') === 'true' || urlParams.get('session_id')) {
    const result = await chrome.storage.local.get(['pendingCustomerInfo', 'pendingPlan']);
    
    if (result.pendingCustomerInfo && result.pendingPlan) {
      customerInfo = result.pendingCustomerInfo;
      selectedPlan = result.pendingPlan;
      
      await activateProSubscription(customerInfo.email);
      showSuccessModal(customerInfo.email);
      
      // Clean up pending data
      await chrome.storage.local.remove(['pendingCustomerInfo', 'pendingPlan']);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

// Update the initialization to check payment status
const originalDOMContentLoaded = async () => {
  await checkPaymentStatus();
};

// Run payment check after normal initialization
setTimeout(checkPaymentStatus, 500);
