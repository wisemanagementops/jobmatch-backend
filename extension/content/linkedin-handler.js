/**
 * JobMatch AI - LinkedIn Easy Apply Handler
 * Specialized autofill for LinkedIn's multi-step Easy Apply modal
 */

class LinkedInEasyApplyHandler {
  constructor(userProfile) {
    this.profile = userProfile;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.observer = null;
  }

  // Initialize LinkedIn Easy Apply handling
  init() {
    // Watch for Easy Apply modal
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (this.isEasyApplyModal(node)) {
              this.handleModalOpen(node);
            }
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Check if modal is already open
    const existingModal = document.querySelector('.jobs-easy-apply-modal');
    if (existingModal) {
      this.handleModalOpen(existingModal);
    }
  }

  // Check if element is Easy Apply modal
  isEasyApplyModal(element) {
    return element.classList?.contains('jobs-easy-apply-modal') ||
           element.querySelector?.('.jobs-easy-apply-modal');
  }

  // Handle modal opening
  handleModalOpen(modal) {
    console.log('JobMatch AI: Easy Apply modal detected');
    
    // Add our helper UI
    this.addHelperUI(modal);
    
    // Auto-fill current step
    setTimeout(() => this.fillCurrentStep(), 500);
    
    // Watch for step changes
    this.watchStepChanges(modal);
  }

  // Add helper UI to modal
  addHelperUI(modal) {
    // Remove existing helper
    const existing = modal.querySelector('#jobmatch-linkedin-helper');
    if (existing) existing.remove();

    const helper = document.createElement('div');
    helper.id = 'jobmatch-linkedin-helper';
    helper.innerHTML = `
      <style>
        #jobmatch-linkedin-helper {
          position: absolute;
          top: 10px;
          right: 60px;
          z-index: 100;
          display: flex;
          gap: 8px;
        }
        #jobmatch-linkedin-helper button {
          padding: 8px 16px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        #jobmatch-linkedin-helper button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
        #jobmatch-linkedin-helper button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
      </style>
      <button id="jobmatch-fill-step" title="Fill this step">
        ⚡ Auto-Fill
      </button>
      <button id="jobmatch-fill-all" title="Fill all steps automatically">
        🚀 Fill All
      </button>
    `;

    const header = modal.querySelector('.jobs-easy-apply-modal__header') ||
                   modal.querySelector('.artdeco-modal__header');
    
    if (header) {
      header.style.position = 'relative';
      header.appendChild(helper);
    }

    // Event listeners
    document.getElementById('jobmatch-fill-step')?.addEventListener('click', () => {
      this.fillCurrentStep();
    });

    document.getElementById('jobmatch-fill-all')?.addEventListener('click', () => {
      this.fillAllSteps();
    });
  }

  // Fill current step
  async fillCurrentStep() {
    const modal = document.querySelector('.jobs-easy-apply-modal');
    if (!modal) return;

    const form = modal.querySelector('form') || modal;
    let filledCount = 0;

    // Find all input fields
    const inputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const selects = form.querySelectorAll('select');
    const textareas = form.querySelectorAll('textarea');

    // Fill text inputs
    for (const input of inputs) {
      const filled = await this.fillLinkedInField(input);
      if (filled) filledCount++;
    }

    // Fill selects
    for (const select of selects) {
      const filled = await this.fillLinkedInSelect(select);
      if (filled) filledCount++;
    }

    // Fill textareas
    for (const textarea of textareas) {
      const filled = await this.fillLinkedInTextarea(textarea);
      if (filled) filledCount++;
    }

    // Handle radio buttons and checkboxes
    const radioGroups = form.querySelectorAll('[data-test-form-builder-radio-button-form-component]');
    for (const group of radioGroups) {
      const filled = await this.fillLinkedInRadioGroup(group);
      if (filled) filledCount++;
    }

    this.showNotification(`Filled ${filledCount} fields`, 'success');
    return filledCount;
  }

  // Fill a LinkedIn input field
  async fillLinkedInField(input) {
    // Get label text
    const labelEl = input.closest('.fb-form-element')?.querySelector('label') ||
                    input.closest('.artdeco-text-input--container')?.querySelector('label') ||
                    document.querySelector(`label[for="${input.id}"]`);
    
    const label = labelEl?.textContent?.toLowerCase().trim() || '';
    const name = input.name?.toLowerCase() || '';
    const placeholder = input.placeholder?.toLowerCase() || '';
    const hints = `${label} ${name} ${placeholder}`;

    // Match to profile field
    let value = null;

    if (/first.*name|given/i.test(hints)) {
      value = this.profile.firstName;
    } else if (/last.*name|family|surname/i.test(hints)) {
      value = this.profile.lastName;
    } else if (/email/i.test(hints)) {
      value = this.profile.email;
    } else if (/phone|mobile|cell/i.test(hints)) {
      value = this.profile.phone;
    } else if (/linkedin/i.test(hints)) {
      value = this.profile.linkedin;
    } else if (/city/i.test(hints)) {
      value = this.profile.city;
    } else if (/zip|postal/i.test(hints)) {
      value = this.profile.zip;
    } else if (/address|street/i.test(hints)) {
      value = this.profile.address;
    } else if (/company|employer/i.test(hints)) {
      value = this.profile.currentCompany;
    } else if (/title|position/i.test(hints)) {
      value = this.profile.currentTitle;
    } else if (/salary|compensation/i.test(hints)) {
      value = this.profile.salary?.replace(/[^0-9]/g, '');
    } else if (/website|portfolio/i.test(hints)) {
      value = this.profile.website;
    } else if (/github/i.test(hints)) {
      value = this.profile.github;
    }

    if (value && !input.value) {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      
      // LinkedIn-specific: trigger React state update
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      this.highlightField(input);
      return true;
    }

    return false;
  }

  // Fill a LinkedIn select field
  async fillLinkedInSelect(select) {
    const labelEl = select.closest('.fb-form-element')?.querySelector('label') ||
                    document.querySelector(`label[for="${select.id}"]`);
    const label = labelEl?.textContent?.toLowerCase().trim() || '';
    const name = select.name?.toLowerCase() || '';
    const hints = `${label} ${name}`;

    let value = null;

    if (/country/i.test(hints)) {
      value = this.profile.country || 'United States';
    } else if (/state|province/i.test(hints)) {
      value = this.profile.state;
    } else if (/experience|years/i.test(hints)) {
      value = this.profile.yearsExperience;
    } else if (/education|degree/i.test(hints)) {
      value = this.profile.education;
    } else if (/gender/i.test(hints)) {
      value = this.profile.gender;
    } else if (/ethnicity|race/i.test(hints)) {
      value = this.profile.ethnicity;
    } else if (/veteran/i.test(hints)) {
      value = this.profile.veteranStatus;
    } else if (/disability/i.test(hints)) {
      value = this.profile.disabilityStatus;
    }

    if (value) {
      const options = Array.from(select.options);
      const matchedOption = options.find(opt => 
        opt.text.toLowerCase().includes(value.toLowerCase()) ||
        opt.value.toLowerCase().includes(value.toLowerCase())
      );

      if (matchedOption && select.value !== matchedOption.value) {
        select.value = matchedOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        this.highlightField(select);
        return true;
      }
    }

    return false;
  }

  // Fill a LinkedIn textarea
  async fillLinkedInTextarea(textarea) {
    const labelEl = textarea.closest('.fb-form-element')?.querySelector('label');
    const label = labelEl?.textContent?.toLowerCase().trim() || '';
    const hints = `${label} ${textarea.name || ''} ${textarea.placeholder || ''}`.toLowerCase();

    // Additional info/cover letter field - could auto-generate
    if (/additional|cover|summary|about/i.test(hints) && !textarea.value) {
      // Don't auto-fill cover letters - too context-specific
      // But highlight for user attention
      textarea.style.border = '2px dashed #f59e0b';
      return false;
    }

    return false;
  }

  // Fill LinkedIn radio group
  async fillLinkedInRadioGroup(group) {
    const labelEl = group.querySelector('legend') || 
                    group.closest('.fb-form-element')?.querySelector('label');
    const label = labelEl?.textContent?.toLowerCase().trim() || '';

    let selectYes = false;

    if (/authorized|legally.*work/i.test(label)) {
      selectYes = this.profile.workAuthorization !== false;
    } else if (/sponsor/i.test(label)) {
      selectYes = this.profile.needsSponsorship === true;
    } else if (/commute|relocate/i.test(label)) {
      selectYes = true; // Default to yes for relocation
    } else if (/us citizen|citizen/i.test(label)) {
      selectYes = this.profile.workAuthorization !== false;
    }

    const radios = group.querySelectorAll('input[type="radio"]');
    for (const radio of radios) {
      const radioLabel = radio.closest('label')?.textContent?.toLowerCase() || '';
      
      if ((selectYes && /yes/i.test(radioLabel)) || 
          (!selectYes && /no/i.test(radioLabel))) {
        if (!radio.checked) {
          radio.click();
          return true;
        }
      }
    }

    return false;
  }

  // Fill all steps automatically
  async fillAllSteps() {
    const fillAllBtn = document.getElementById('jobmatch-fill-all');
    if (fillAllBtn) {
      fillAllBtn.disabled = true;
      fillAllBtn.textContent = '⏳ Filling...';
    }

    let stepsProcessed = 0;
    const maxSteps = 10; // Safety limit

    while (stepsProcessed < maxSteps) {
      // Fill current step
      await this.fillCurrentStep();
      
      // Wait for form validation
      await this.sleep(300);

      // Try to advance to next step
      const nextBtn = this.findNextButton();
      
      if (!nextBtn) {
        // No next button - might be on final step
        break;
      }

      // Check if it's submit button
      if (this.isSubmitButton(nextBtn)) {
        this.highlightField(nextBtn);
        this.showNotification('Ready to submit! Review and click the button.', 'success');
        break;
      }

      // Click next
      nextBtn.click();
      stepsProcessed++;

      // Wait for next step to load
      await this.sleep(800);
    }

    if (fillAllBtn) {
      fillAllBtn.disabled = false;
      fillAllBtn.textContent = '🚀 Fill All';
    }
  }

  // Find the Next/Continue button
  findNextButton() {
    const modal = document.querySelector('.jobs-easy-apply-modal');
    if (!modal) return null;

    // LinkedIn's button patterns
    const selectors = [
      'button[aria-label*="Continue"]',
      'button[aria-label*="Next"]',
      'button[aria-label*="Review"]',
      'button[aria-label*="Submit"]',
      'button[data-easy-apply-next-button]',
      '.jobs-easy-apply-modal footer button.artdeco-button--primary'
    ];

    for (const selector of selectors) {
      const btn = modal.querySelector(selector);
      if (btn && this.isVisible(btn) && !btn.disabled) {
        return btn;
      }
    }

    // Fallback: find primary button in footer
    const footerBtns = modal.querySelectorAll('footer button');
    for (const btn of footerBtns) {
      if (btn.classList.contains('artdeco-button--primary') && 
          this.isVisible(btn) && 
          !btn.disabled) {
        return btn;
      }
    }

    return null;
  }

  // Check if button is the final submit
  isSubmitButton(button) {
    const text = button.textContent?.toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.toLowerCase() || '';
    return /submit|send|apply/i.test(text) || /submit|send|apply/i.test(label);
  }

  // Watch for step changes
  watchStepChanges(modal) {
    const stepObserver = new MutationObserver(() => {
      // Auto-fill new step after a delay
      setTimeout(() => this.fillCurrentStep(), 500);
    });

    const content = modal.querySelector('.jobs-easy-apply-content') || 
                    modal.querySelector('.artdeco-modal__content');
    
    if (content) {
      stepObserver.observe(content, {
        childList: true,
        subtree: true
      });
    }
  }

  // Highlight filled field
  highlightField(element) {
    const originalBg = element.style.backgroundColor;
    element.style.transition = 'background-color 0.3s';
    element.style.backgroundColor = 'rgba(99, 102, 241, 0.2)';
    
    setTimeout(() => {
      element.style.backgroundColor = originalBg;
    }, 1500);
  }

  // Show notification
  showNotification(message, type = 'info') {
    const existing = document.getElementById('jobmatch-linkedin-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'jobmatch-linkedin-notification';
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#10b981' : '#6366f1'};
      color: white;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  // Utility: check if element is visible
  isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0';
  }

  // Utility: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

// Export for use in autofill.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LinkedInEasyApplyHandler;
}

// Initialize if on LinkedIn
if (window.location.hostname.includes('linkedin.com')) {
  // Wait for profile to load
  chrome.storage.local.get(['userProfile'], (result) => {
    if (result.userProfile) {
      const handler = new LinkedInEasyApplyHandler(result.userProfile);
      handler.init();
      
      // Store reference for cleanup
      window.jobmatchLinkedInHandler = handler;
    }
  });
}
