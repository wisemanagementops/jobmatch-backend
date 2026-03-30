/**
 * JobMatch AI - 1-Click Apply Autofill Engine
 * Automatically fills job application forms across major platforms
 */

const AUTOFILL_CONFIG = {
  platforms: {
    linkedin: { patterns: ['linkedin.com/jobs', 'linkedin.com/job'], easyApply: true },
    indeed: { patterns: ['indeed.com/viewjob', 'indeed.com/jobs'], easyApply: true },
    glassdoor: { patterns: ['glassdoor.com/job'], easyApply: false },
    greenhouse: { patterns: ['boards.greenhouse.io', 'greenhouse.io/job'], easyApply: false },
    lever: { patterns: ['jobs.lever.co', 'lever.co/'], easyApply: false },
    workday: { patterns: ['myworkdayjobs.com', 'workday.com/'], easyApply: false }
  },
  fieldMappings: {
    name: ['name', 'full_name', 'fullname', 'applicant_name'],
    firstName: ['first_name', 'firstname', 'fname', 'given_name'],
    lastName: ['last_name', 'lastname', 'lname', 'family_name', 'surname'],
    email: ['email', 'email_address', 'e-mail'],
    phone: ['phone', 'phone_number', 'telephone', 'mobile', 'cell'],
    address: ['address', 'street_address', 'address_line_1'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region'],
    zip: ['zip', 'zipcode', 'zip_code', 'postal_code'],
    country: ['country', 'nation'],
    linkedin: ['linkedin', 'linkedin_url', 'linkedin_profile'],
    github: ['github', 'github_url', 'github_profile'],
    website: ['website', 'portfolio', 'personal_website'],
    currentCompany: ['current_company', 'employer', 'current_employer'],
    currentTitle: ['current_title', 'job_title', 'current_position'],
    yearsExperience: ['years_experience', 'experience_years', 'total_experience'],
    salary: ['salary', 'desired_salary', 'compensation', 'expected_salary'],
    startDate: ['start_date', 'availability', 'available_date'],
    workAuthorization: ['work_authorization', 'authorized', 'legally_authorized'],
    sponsorship: ['sponsorship', 'visa_sponsorship', 'require_sponsorship'],
    veteran: ['veteran', 'veteran_status', 'military'],
    disability: ['disability', 'disability_status'],
    gender: ['gender', 'sex'],
    ethnicity: ['ethnicity', 'race', 'ethnic_background'],
    education: ['education', 'degree', 'highest_degree']
  }
};

let userProfile = null;
let currentPlatform = null;
let autofillPanel = null;

async function initAutofill() {
  currentPlatform = detectPlatform();
  if (!currentPlatform) return;
  userProfile = await loadUserProfile();
  if (isApplicationPage()) {
    createAutofillPanel();
    observeFormChanges();
  }
  console.log('JobMatch AI: Autofill initialized for', currentPlatform);
}

function detectPlatform() {
  const fullUrl = window.location.hostname + window.location.pathname;
  for (const [platform, config] of Object.entries(AUTOFILL_CONFIG.platforms)) {
    if (config.patterns.some(p => fullUrl.includes(p))) return platform;
  }
  return isApplicationPage() ? 'generic' : null;
}

function isApplicationPage() {
  return [
    /apply|application|career|job|submit|candidate/i.test(window.location.href),
    document.querySelector('form[action*="apply"]'),
    document.querySelector('input[type="file"][accept*="pdf"]'),
    document.querySelector('input[name*="resume"]'),
    document.body.innerText.toLowerCase().includes('upload your resume')
  ].some(Boolean);
}

async function loadUserProfile() {
  const result = await chrome.storage.local.get(['userProfile', 'authToken']);
  if (result.userProfile) return result.userProfile;
  if (result.authToken) {
    try {
      const response = await fetch('https://jobmatch-backend-production-796d.up.railway.app/api/user/profile', {
        headers: { 'Authorization': `Bearer ${result.authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data?.applicationProfile) {
          await chrome.storage.local.set({ userProfile: data.data.applicationProfile });
          return data.data.applicationProfile;
        }
      }
    } catch (e) { console.log('Could not fetch profile'); }
  }
  return null;
}

function createAutofillPanel() {
  if (autofillPanel) autofillPanel.remove();
  autofillPanel = document.createElement('div');
  autofillPanel.id = 'jobmatch-autofill-panel';
  autofillPanel.innerHTML = `
    <style>
      #jobmatch-autofill-panel {
        position: fixed; bottom: 20px; right: 20px; width: 320px;
        background: linear-gradient(135deg, #1e1b4b, #312e81);
        border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        z-index: 2147483647; overflow: hidden;
        animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      #jobmatch-autofill-panel .panel-header {
        padding: 16px 20px; background: rgba(255,255,255,0.05);
        display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      #jobmatch-autofill-panel .panel-title { display: flex; align-items: center; gap: 10px; color: white; font-weight: 600; }
      #jobmatch-autofill-panel .panel-logo { width: 28px; height: 28px; background: linear-gradient(135deg, #818cf8, #6366f1); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
      #jobmatch-autofill-panel .panel-close { background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 20px; }
      #jobmatch-autofill-panel .panel-content { padding: 20px; }
      #jobmatch-autofill-panel .status-indicator { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(255,255,255,0.05); border-radius: 10px; margin-bottom: 16px; }
      #jobmatch-autofill-panel .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981; }
      #jobmatch-autofill-panel .status-dot.warning { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
      #jobmatch-autofill-panel .status-text { color: rgba(255,255,255,0.9); font-size: 13px; }
      #jobmatch-autofill-panel .action-btn { width: 100%; padding: 14px 20px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px; }
      #jobmatch-autofill-panel .action-btn.primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; }
      #jobmatch-autofill-panel .action-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4); }
      #jobmatch-autofill-panel .action-btn.secondary { background: rgba(255,255,255,0.1); color: white; }
      #jobmatch-autofill-panel .action-btn.success { background: linear-gradient(135deg, #10b981, #059669); color: white; }
      #jobmatch-autofill-panel .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      #jobmatch-autofill-panel .fields-preview { max-height: 150px; overflow-y: auto; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; }
      #jobmatch-autofill-panel .field-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
      #jobmatch-autofill-panel .field-name { color: rgba(255,255,255,0.6); }
      #jobmatch-autofill-panel .field-status.ready { color: #10b981; }
      #jobmatch-autofill-panel .field-status.missing { color: #f59e0b; }
      #jobmatch-autofill-panel .progress-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 12px; }
      #jobmatch-autofill-panel .progress-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 2px; transition: width 0.3s; }
      #jobmatch-autofill-panel.minimized { width: 60px; height: 60px; border-radius: 50%; cursor: pointer; }
      #jobmatch-autofill-panel.minimized .panel-content, #jobmatch-autofill-panel.minimized .panel-header { display: none; }
      #jobmatch-autofill-panel .mini-icon { display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 24px; }
      #jobmatch-autofill-panel.minimized .mini-icon { display: flex; }
    </style>
    <div class="mini-icon">🎯</div>
    <div class="panel-header">
      <div class="panel-title"><div class="panel-logo">🚀</div><span>1-Click Apply</span></div>
      <button class="panel-close" id="jobmatch-panel-close">×</button>
    </div>
    <div class="panel-content" id="jobmatch-panel-content"></div>
  `;
  document.body.appendChild(autofillPanel);
  document.getElementById('jobmatch-panel-close').addEventListener('click', () => autofillPanel.classList.add('minimized'));
  autofillPanel.addEventListener('click', (e) => { if (autofillPanel.classList.contains('minimized') && e.target.closest('.mini-icon')) autofillPanel.classList.remove('minimized'); });
  updatePanelContent();
}

async function updatePanelContent() {
  const contentEl = document.getElementById('jobmatch-panel-content');
  if (!contentEl) return;
  if (!userProfile) {
    contentEl.innerHTML = '<div class="status-indicator"><div class="status-dot warning"></div><span class="status-text">Profile not set up</span></div><div style="text-align:center;padding:10px 0;"><p style="color:rgba(255,255,255,0.7);font-size:13px;margin-bottom:12px;">Set up your profile to enable 1-click apply</p><button class="action-btn primary" id="jobmatch-setup-profile">⚡ Set Up Profile</button></div>';
    document.getElementById('jobmatch-setup-profile')?.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openProfileSetup' }));
    return;
  }
  const fields = detectFormFields();
  const fillable = fields.filter(f => f.canFill).length;
  const total = fields.length;
  contentEl.innerHTML = `
    <div class="status-indicator"><div class="status-dot ${fillable > 0 ? '' : 'warning'}"></div><span class="status-text">${fillable} of ${total} fields ready</span></div>
    <button class="action-btn primary" id="jobmatch-autofill-btn" ${fillable === 0 ? 'disabled' : ''}>⚡ Fill Application Form</button>
    <button class="action-btn success" id="jobmatch-apply-all" ${fillable === 0 ? 'disabled' : ''}>🚀 1-Click Apply</button>
    <div class="fields-preview">${fields.slice(0, 8).map(f => `<div class="field-item"><span class="field-name">${f.label || f.name}</span><span class="field-status ${f.canFill ? 'ready' : 'missing'}">${f.canFill ? '✓' : '○'}</span></div>`).join('')}</div>
    <div class="progress-bar"><div class="progress-fill" style="width: ${(fillable / Math.max(total, 1)) * 100}%"></div></div>
  `;
  document.getElementById('jobmatch-autofill-btn')?.addEventListener('click', () => fillForm(false));
  document.getElementById('jobmatch-apply-all')?.addEventListener('click', oneClickApply);
}

function detectFormFields() {
  const fields = [];
  const containers = document.querySelectorAll('form').length > 0 ? document.querySelectorAll('form') : [document.body];
  containers.forEach(container => {
    container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').forEach(el => {
      const info = analyzeField(el);
      if (info) fields.push(info);
    });
  });
  return fields;
}

function analyzeField(element) {
  const name = element.name || element.id || '';
  const placeholder = element.placeholder || '';
  const labelText = findLabelText(element);
  const hints = `${name} ${placeholder} ${labelText}`.toLowerCase();
  if (element.type === 'hidden' || !isVisible(element)) return null;
  const profileField = matchToProfileField(hints, element.type);
  return { element, name: name || placeholder || labelText, label: labelText || placeholder || name, profileField, canFill: profileField && userProfile && userProfile[profileField], hints };
}

function findLabelText(element) {
  if (element.id) { const label = document.querySelector(`label[for="${element.id}"]`); if (label) return label.innerText.trim(); }
  const parentLabel = element.closest('label'); if (parentLabel) return parentLabel.innerText.replace(element.value || '', '').trim();
  return '';
}

function matchToProfileField(hints, inputType) {
  if (inputType === 'file') return /resume|cv/i.test(hints) ? 'resume' : /cover/i.test(hints) ? 'coverLetter' : null;
  for (const [field, patterns] of Object.entries(AUTOFILL_CONFIG.fieldMappings)) {
    if (patterns.some(p => hints.includes(p.toLowerCase()))) return field;
  }
  if (/first.*name|given.*name/i.test(hints)) return 'firstName';
  if (/last.*name|family.*name|surname/i.test(hints)) return 'lastName';
  if (/full.*name|your.*name/i.test(hints)) return 'name';
  if (/email|e-mail/i.test(hints)) return 'email';
  if (/phone|mobile|cell/i.test(hints)) return 'phone';
  if (/linkedin/i.test(hints)) return 'linkedin';
  if (/github/i.test(hints)) return 'github';
  if (/salary|compensation/i.test(hints)) return 'salary';
  if (/authorized|authorization/i.test(hints)) return 'workAuthorization';
  if (/sponsor/i.test(hints)) return 'sponsorship';
  return null;
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
}

async function fillForm(submitAfter = false) {
  if (!userProfile) { showNotification('Please set up your profile first', 'error'); return; }
  const fields = detectFormFields();
  let filled = 0;
  for (const field of fields) {
    if (field.canFill && field.profileField) {
      const value = getProfileValue(field.profileField);
      if (value != null && await fillField(field.element, value)) filled++;
    }
  }
  showNotification(`Filled ${filled} fields`, 'success');
  updatePanelContent();
}

function getProfileValue(field) {
  if (!userProfile) return null;
  switch (field) {
    case 'name': return userProfile.name || `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
    case 'workAuthorization': return userProfile.workAuthorization ? 'Yes' : 'No';
    case 'sponsorship': return userProfile.needsSponsorship ? 'Yes' : 'No';
    default: return userProfile[field];
  }
}

async function fillField(element, value) {
  try {
    if (element.tagName === 'SELECT') return fillSelect(element, value);
    if (element.type === 'checkbox') { if (element.checked !== (value === true || value === 'yes')) element.click(); return true; }
    if (element.type === 'radio') return fillRadio(element, value);
    element.focus(); element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    try { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    element.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
    setTimeout(() => element.style.backgroundColor = '', 1000);
    return true;
  } catch (e) { console.error('Fill error:', e); return false; }
}

function fillSelect(element, value) {
  const options = Array.from(element.options);
  const valueLower = value.toString().toLowerCase();
  let match = options.find(o => o.value.toLowerCase() === valueLower || o.text.toLowerCase() === valueLower);
  if (!match) match = options.find(o => o.value.toLowerCase().includes(valueLower) || o.text.toLowerCase().includes(valueLower));
  if (match) { element.value = match.value; element.dispatchEvent(new Event('change', { bubbles: true })); return true; }
  return false;
}

function fillRadio(element, value) {
  const radios = document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
  const valueLower = value.toString().toLowerCase();
  for (const radio of radios) {
    const label = findLabelText(radio).toLowerCase();
    if (radio.value.toLowerCase() === valueLower || label.includes(valueLower)) { radio.click(); return true; }
  }
  return false;
}

async function oneClickApply() {
  const btn = document.getElementById('jobmatch-apply-all');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Filling...'; }
  try {
    await fillForm(false);
    await trackApplication();
    const submitBtn = findSubmitButton();
    if (submitBtn) { submitBtn.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.5)'; showNotification('✅ Form filled! Review and click Submit.', 'success'); }
    else showNotification('✅ Form filled! Find the Submit button.', 'success');
  } catch (e) { console.error('1-Click error:', e); showNotification('Error: ' + e.message, 'error'); }
  if (btn) { btn.disabled = false; btn.innerHTML = '🚀 1-Click Apply'; }
}

function findSubmitButton() {
  for (const sel of ['button[type="submit"]', 'input[type="submit"]']) {
    const btn = document.querySelector(sel); if (btn && isVisible(btn)) return btn;
  }
  for (const btn of document.querySelectorAll('button')) {
    if ((btn.innerText || '').toLowerCase().match(/submit|apply|send/) && isVisible(btn)) return btn;
  }
  return null;
}

async function trackApplication() {
  const storage = await chrome.storage.local.get(['authToken']);
  if (!storage.authToken) return;
  const jobData = extractJobData();
  try {
    await fetch('https://jobmatch-backend-production-796d.up.railway.app/api/applications/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${storage.authToken}` },
      body: JSON.stringify({ jobTitle: jobData.title, companyName: jobData.company, jobUrl: window.location.href, status: 'applied', appliedAt: new Date().toISOString() })
    });
  } catch (e) { console.log('Track error:', e); }
}

function extractJobData() {
  const hostname = window.location.hostname;
  let title = document.querySelector('h1')?.innerText?.trim() || 'Job Position';
  let company = 'Company';
  if (hostname.includes('linkedin.com')) {
    title = document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText?.trim() || title;
    company = document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim() || company;
  } else if (hostname.includes('indeed.com')) {
    title = document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText?.trim() || title;
    company = document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() || company;
  }
  return { title, company };
}

function showNotification(message, type = 'info') {
  const existing = document.getElementById('jobmatch-notification'); if (existing) existing.remove();
  const notification = document.createElement('div');
  notification.id = 'jobmatch-notification';
  notification.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:14px 24px;background:${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#6366F1'};color:white;border-radius:10px;font-family:-apple-system,sans-serif;font-size:14px;font-weight:500;box-shadow:0 10px 40px rgba(0,0,0,0.3);z-index:2147483647;`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 4000);
}

function observeFormChanges() {
  new MutationObserver(() => { clearTimeout(window.jobmatchTimeout); window.jobmatchTimeout = setTimeout(updatePanelContent, 500); }).observe(document.body, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'triggerAutofill') { fillForm(false); sendResponse({ success: true }); }
  else if (request.action === 'triggerOneClickApply') { oneClickApply(); sendResponse({ success: true }); }
  else if (request.action === 'updateProfile') { userProfile = request.profile; chrome.storage.local.set({ userProfile: request.profile }); updatePanelContent(); sendResponse({ success: true }); }
  return true;
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAutofill);
else initAutofill();
