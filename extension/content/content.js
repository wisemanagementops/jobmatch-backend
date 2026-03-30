/**
 * JobMatch AI - Content Script
 * Extracts job descriptions from various job posting sites
 */

// Global variables to store job data
let currentJobData = {};
let currentAnalysisResult = {};

// ============== Message Handler ==============
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractJobDescription') {
    const jobText = extractJobDescription();
    sendResponse(jobText);
  } else if (request.action === 'showQueueButton') {
    // Store data for later use
    currentJobData = request.jobData || {};
    currentAnalysisResult = request.analysisResult || {};
    showQueueButton();
    sendResponse({ success: true });
  }
  return true; // Keep channel open for async response
});

// ============== Queue Button Function ==============
function showQueueButton() {
  // Remove existing button if present
  const existingButton = document.getElementById('jobmatch-queue-button');
  if (existingButton) {
    existingButton.remove();
  }

  // Create the button
  const queueButton = document.createElement('button');
  queueButton.id = 'jobmatch-queue-button';
  queueButton.textContent = '➕ Add to Application Queue';
  queueButton.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    padding: 14px 24px;
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    color: white;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    font-size: 15px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
    z-index: 999999;
    transition: all 0.3s ease;
  `;

  // Hover effect
  queueButton.onmouseenter = () => {
    queueButton.style.transform = 'translateY(-2px)';
    queueButton.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.5)';
  };

  queueButton.onmouseleave = () => {
    queueButton.style.transform = 'translateY(0)';
    queueButton.style.boxShadow = '0 4px 16px rgba(79, 70, 229, 0.4)';
  };

  // Click handler
  queueButton.onclick = async () => {
    try {
      // Get auth token from extension storage
      const storage = await chrome.storage.local.get(['authToken']);
      const token = storage.authToken;
      
      if (!token) {
        alert('⚠️ Please log in to JobMatch AI first!\n\nGo to https://jobmatch-frontend-one.vercel.app and sign in.');
        return;
      }

      // Disable button and show loading
      queueButton.disabled = true;
      queueButton.textContent = '⏳ Adding to queue...';
      queueButton.style.background = '#6B7280';

      // Extract job data from page
      const jobData = extractJobData();
      
      // Add to queue via API
      const response = await fetch('https://jobmatch-backend-production-796d.up.railway.app/api/applications/queue/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jobTitle: jobData.title,
          companyName: jobData.company,
          jobUrl: window.location.href,
          jobLocation: jobData.location,
          jobDescription: extractJobDescription(),
          matchScore: currentAnalysisResult.overall_match_score || null,
          analysisId: currentAnalysisResult.analysisId || null,
          autoGenerate: true // Auto-generate resume and cover letter
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success!
        queueButton.textContent = '✅ Added to Queue!';
        queueButton.style.background = '#10B981';
        
        // Show success notification
        showNotification('✅ Job added to application queue! Documents are being generated...', 'success');
        
        // Reset button after 3 seconds
        setTimeout(() => {
          queueButton.textContent = '➕ Add to Application Queue';
          queueButton.style.background = 'linear-gradient(135deg, #4F46E5, #7C3AED)';
          queueButton.disabled = false;
        }, 3000);
      } else {
        throw new Error(result.error || 'Failed to add to queue');
      }
    } catch (error) {
      console.error('Add to queue error:', error);
      
      // Show error
      queueButton.textContent = '❌ Failed';
      queueButton.style.background = '#EF4444';
      
      // Show error notification
      showNotification('❌ Failed to add to queue: ' + error.message, 'error');
      
      // Reset button after 3 seconds
      setTimeout(() => {
        queueButton.textContent = '➕ Add to Application Queue';
        queueButton.style.background = 'linear-gradient(135deg, #4F46E5, #7C3AED)';
        queueButton.disabled = false;
      }, 3000);
    }
  };

  // Add button to page
  document.body.appendChild(queueButton);
}

// ============== Extract Job Data ==============
function extractJobData() {
  const hostname = window.location.hostname;
  
  let title = '';
  let company = '';
  let location = '';

  if (hostname.includes('linkedin.com')) {
    // LinkedIn selectors
    const titleSelectors = [
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      'h1.t-24',
      'h1'
    ];
    
    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      'a[data-tracking-control-name="public_jobs_topcard-org-name"]'
    ];

    const locationSelectors = [
      '.job-details-jobs-unified-top-card__primary-description',
      '.jobs-unified-top-card__bullet'
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText) {
        title = el.innerText.trim();
        break;
      }
    }

    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText) {
        company = el.innerText.trim();
        break;
      }
    }

    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText) {
        location = el.innerText.trim();
        break;
      }
    }
  } else if (hostname.includes('indeed.com')) {
    title = document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText?.trim() || '';
    company = document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() || '';
    location = document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim() || '';
  } else {
    // Generic extraction
    title = document.querySelector('h1')?.innerText?.trim() || 'Job Position';
    company = 'Company';
    location = '';
  }

  return {
    title: title || 'Job Position',
    company: company || 'Company',
    location: location || ''
  };
}

// ============== Notification Function ==============
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
    color: white;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 9999999;
    animation: slideIn 0.3s ease;
  `;

  notification.textContent = message;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// ============== Main Extraction Function ==============
function extractJobDescription() {
  const hostname = window.location.hostname;
  
  let jobText = '';
  
  // Try site-specific extractors first
  if (hostname.includes('linkedin.com')) {
    jobText = extractLinkedIn();
  } else if (hostname.includes('indeed.com')) {
    jobText = extractIndeed();
  } else if (hostname.includes('glassdoor.com')) {
    jobText = extractGlassdoor();
  } else if (hostname.includes('greenhouse.io')) {
    jobText = extractGreenhouse();
  } else if (hostname.includes('lever.co')) {
    jobText = extractLever();
  } else if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) {
    jobText = extractWorkday();
  }
  
  // Fallback to generic extraction if site-specific failed
  if (!jobText || jobText.length < 200) {
    jobText = extractGeneric();
  }
  
  return cleanJobText(jobText);
}

// ============== Site-Specific Extractors ==============

function extractLinkedIn() {
  // LinkedIn job description selectors - updated for 2024/2025 LinkedIn UI
  const descriptionSelectors = [
    // New LinkedIn UI (2024+)
    '.jobs-description__content',
    '.jobs-description-content__text',
    '.jobs-box__html-content',
    '#job-details',
    '[class*="jobs-description"]',
    // Job details section
    '.job-view-layout',
    '.jobs-unified-top-card__container--two-pane',
    // Fallback to article content
    'article.jobs-description',
    '.jobs-details__main-content',
    // Very broad fallback
    '[class*="description"]'
  ];
  
  let description = '';
  
  // Try each selector
  for (const selector of descriptionSelectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText && element.innerText.length > 200) {
      description = element.innerText;
      break;
    }
  }
  
  // If still no description, try to find any large text block
  if (!description || description.length < 200) {
    // Look for the main content area
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]');
    if (mainContent) {
      description = mainContent.innerText;
    }
  }
  
  // Get job title - multiple selector attempts
  const titleSelectors = [
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.t-24.job-details-jobs-unified-top-card__job-title',
    'h1.t-24',
    'h1[class*="job-title"]',
    '.topcard__title',
    'h1'
  ];
  
  let title = '';
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText && element.innerText.trim().length > 0) {
      title = element.innerText.trim();
      break;
    }
  }
  
  // Get company name
  const companySelectors = [
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    '.topcard__org-name-link',
    'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
    '.jobs-unified-top-card__subtitle-primary-grouping a',
    '[class*="company-name"]'
  ];
  
  let company = '';
  for (const selector of companySelectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText && element.innerText.trim().length > 0) {
      company = element.innerText.trim();
      break;
    }
  }
  
  // Build full job text
  if (description && description.length > 200) {
    return `Job Title: ${title || 'Not found'}\nCompany: ${company || 'Not found'}\n\n${description}`;
  }
  
  // Last resort - grab body text but filter it
  const bodyText = document.body.innerText;
  if (bodyText.length > 1000) {
    return `Job Title: ${title || 'LinkedIn Job'}\nCompany: ${company || 'Unknown'}\n\n${bodyText.substring(0, 15000)}`;
  }
  
  return '';
}

function extractIndeed() {
  const selectors = [
    '#jobDescriptionText',
    '.jobsearch-jobDescriptionText',
    '[id*="jobDescription"]',
    '.jobDescription'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      // Get title and company
      const title = document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText ||
                   document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.innerText || '';
      const company = document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText ||
                     document.querySelector('.jobsearch-InlineCompanyRating-companyHeader')?.innerText || '';
      
      return `${title}\n${company}\n\n${element.innerText}`;
    }
  }
  
  return '';
}

function extractGlassdoor() {
  const selectors = [
    '.jobDescriptionContent',
    '[class*="JobDescription"]',
    '#JobDescriptionContainer',
    '.desc'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      const title = document.querySelector('[data-test="job-title"]')?.innerText || '';
      const company = document.querySelector('[data-test="employerName"]')?.innerText || '';
      
      return `${title}\n${company}\n\n${element.innerText}`;
    }
  }
  
  return '';
}

function extractGreenhouse() {
  const selectors = [
    '#content',
    '.content',
    '[class*="job-description"]',
    'section.body'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      const title = document.querySelector('.app-title')?.innerText || 
                   document.querySelector('h1')?.innerText || '';
      const company = document.querySelector('.company-name')?.innerText || '';
      
      return `${title}\n${company}\n\n${element.innerText}`;
    }
  }
  
  return '';
}

function extractLever() {
  const selectors = [
    '.section-wrapper.page-full-width',
    '.content',
    '[class*="posting-"]',
    '.posting-page'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      const title = document.querySelector('.posting-headline h2')?.innerText || '';
      const company = document.querySelector('.posting-headline .company')?.innerText || '';
      
      return `${title}\n${company}\n\n${element.innerText}`;
    }
  }
  
  return '';
}

function extractWorkday() {
  const selectors = [
    '[data-automation-id="jobPostingDescription"]',
    '.job-description',
    '[class*="jobDescription"]',
    '.wd-RichText'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      const title = document.querySelector('[data-automation-id="jobPostingHeader"]')?.innerText ||
                   document.querySelector('h1')?.innerText || '';
      
      return `${title}\n\n${element.innerText}`;
    }
  }
  
  return '';
}

// ============== Generic Extractor ==============
function extractGeneric() {
  // Try common job description patterns
  const selectors = [
    // Common class names
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[class*="job_description"]',
    '[class*="description"]',
    '[class*="posting"]',
    
    // Common IDs
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '[id*="description"]',
    
    // Semantic elements
    'article',
    'main',
    
    // Role attributes
    '[role="main"]',
    '[role="article"]'
  ];
  
  let bestCandidate = null;
  let bestLength = 0;
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.innerText;
      // Look for elements with substantial text that contains job-related keywords
      if (text.length > bestLength && 
          text.length > 500 && 
          containsJobKeywords(text)) {
        bestCandidate = text;
        bestLength = text.length;
      }
    }
  }
  
  // Last resort: find the largest text block on the page
  if (!bestCandidate) {
    const allText = document.body.innerText;
    if (allText.length > 500 && containsJobKeywords(allText)) {
      bestCandidate = allText;
    }
  }
  
  return bestCandidate || '';
}

// ============== Helper Functions ==============

function containsJobKeywords(text) {
  const keywords = [
    'responsibilities',
    'requirements',
    'qualifications',
    'experience',
    'skills',
    'about the role',
    'what you\'ll do',
    'what we\'re looking for',
    'who you are',
    'benefits',
    'salary',
    'apply'
  ];
  
  const lowerText = text.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      matchCount++;
    }
  }
  
  // Require at least 2 job-related keywords
  return matchCount >= 2;
}

function cleanJobText(text) {
  if (!text) return '';
  
  return text
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    // Remove common UI elements
    .replace(/Apply Now|Save Job|Share|Report|Easy Apply/gi, '')
    // Remove excessive newlines but keep some structure
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim();
}

// ============== Visual Indicator ==============
// Add a subtle indicator that the extension is active on this page

function addPageIndicator() {
  // Only add on job posting pages
  if (!containsJobKeywords(document.body.innerText)) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'jobmatch-ai-indicator';
  indicator.innerHTML = `
    <style>
      #jobmatch-ai-indicator {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4F46E5, #7C3AED);
        color: white;
        padding: 10px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        cursor: pointer;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      #jobmatch-ai-indicator:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
      }
      #jobmatch-ai-indicator .icon {
        font-size: 16px;
      }
    </style>
    <span class="icon">🎯</span>
    <span>Analyze with JobMatch AI</span>
  `;
  
  indicator.addEventListener('click', () => {
    // Open extension popup (this will trigger via background script)
    chrome.runtime.sendMessage({ action: 'openPopup' });
  });
  
  document.body.appendChild(indicator);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    indicator.style.opacity = '0';
    indicator.style.transition = 'opacity 0.3s';
    setTimeout(() => indicator.remove(), 300);
  }, 5000);
}

// Add indicator when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addPageIndicator);
} else {
  addPageIndicator();
}
