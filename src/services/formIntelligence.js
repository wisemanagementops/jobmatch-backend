/**
 * JobMatch AI - Form Intelligence Service
 * Detects and maps application form fields
 */

const { query } = require('../db');

class FormIntelligenceService {
  
  /**
   * Detect form type and fields from URL and HTML
   */
  async detectForm(url, htmlContent) {
    // Identify platform
    const platform = this.identifyPlatform(url);
    
    // Get or create form pattern
    let pattern = await this.getFormPattern(platform, url);
    
    if (!pattern) {
      // Create default pattern for this platform
      pattern = await this.createDefaultPattern(platform, url);
    }
    
    return {
      platform,
      pattern,
      formType: this.getFormType(platform)
    };
  }
  
  /**
   * Identify ATS platform from URL
   */
  identifyPlatform(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('greenhouse.io')) return 'greenhouse';
    if (urlLower.includes('lever.co')) return 'lever';
    if (urlLower.includes('myworkdayjobs.com') || urlLower.includes('workday.com')) return 'workday';
    if (urlLower.includes('linkedin.com/jobs/apply')) return 'linkedin_easy';
    if (urlLower.includes('indeed.com')) return 'indeed';
    if (urlLower.includes('glassdoor.com')) return 'glassdoor';
    if (urlLower.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (urlLower.includes('icims.com')) return 'icims';
    if (urlLower.includes('bamboohr.com')) return 'bamboohr';
    if (urlLower.includes('jobvite.com')) return 'jobvite';
    if (urlLower.includes('taleo.net')) return 'taleo';
    
    return 'custom';
  }
  
  /**
   * Get form type (easy, standard, complex)
   */
  getFormType(platform) {
    const easyApply = ['linkedin_easy', 'indeed'];
    const standard = ['greenhouse', 'lever', 'smartrecruiters', 'bamboohr'];
    const complex = ['workday', 'taleo', 'icims', 'jobvite'];
    
    if (easyApply.includes(platform)) return 'easy';
    if (standard.includes(platform)) return 'standard';
    if (complex.includes(platform)) return 'complex';
    
    return 'custom';
  }
  
  /**
   * Get form pattern from database
   */
  async getFormPattern(platform, url) {
    const domain = new URL(url).hostname;
    
    const result = await query(
      `SELECT * FROM form_patterns 
       WHERE domain = $1 OR form_type = $2 
       ORDER BY success_count DESC 
       LIMIT 1`,
      [domain, platform]
    );
    
    return result.rows[0] || null;
  }
  
  /**
   * Create default form pattern
   */
  async createDefaultPattern(platform, url) {
    const domain = new URL(url).hostname;
    const patterns = this.getDefaultPatterns(platform);
    
    const result = await query(
      `INSERT INTO form_patterns (domain, form_type, field_patterns)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [domain, platform, JSON.stringify(patterns)]
    );
    
    return result.rows[0];
  }
  
  /**
   * Get default field patterns for platform
   */
  getDefaultPatterns(platform) {
    const patterns = {
      greenhouse: {
        firstName: {
          selectors: ['#first_name', 'input[name="first_name"]', 'input[id*="first"]'],
          type: 'text',
          required: true
        },
        lastName: {
          selectors: ['#last_name', 'input[name="last_name"]', 'input[id*="last"]'],
          type: 'text',
          required: true
        },
        email: {
          selectors: ['#email', 'input[name="email"]', 'input[type="email"]'],
          type: 'email',
          required: true
        },
        phone: {
          selectors: ['#phone', 'input[name="phone"]', 'input[type="tel"]'],
          type: 'tel',
          required: false
        },
        resume: {
          selectors: ['#resume', 'input[name="resume"]', 'input[type="file"]'],
          type: 'file',
          required: true
        },
        coverLetter: {
          selectors: ['#cover_letter', 'input[name="cover_letter"]'],
          type: 'file',
          required: false
        },
        linkedIn: {
          selectors: ['input[name*="linkedin"]', 'input[placeholder*="LinkedIn"]'],
          type: 'url',
          required: false
        }
      },
      
      lever: {
        name: {
          selectors: ['input[name="name"]', '#name'],
          type: 'text',
          required: true
        },
        email: {
          selectors: ['input[name="email"]', 'input[type="email"]'],
          type: 'email',
          required: true
        },
        phone: {
          selectors: ['input[name="phone"]', 'input[type="tel"]'],
          type: 'tel',
          required: false
        },
        resume: {
          selectors: ['input[name="resume"]', 'input[type="file"]'],
          type: 'file',
          required: true
        }
      },
      
      workday: {
        firstName: {
          selectors: ['input[data-automation-id*="firstName"]'],
          type: 'text',
          required: true
        },
        lastName: {
          selectors: ['input[data-automation-id*="lastName"]'],
          type: 'text',
          required: true
        },
        email: {
          selectors: ['input[data-automation-id*="email"]'],
          type: 'email',
          required: true
        },
        phone: {
          selectors: ['input[data-automation-id*="phone"]'],
          type: 'tel',
          required: false
        }
      },
      
      linkedin_easy: {
        phone: {
          selectors: ['#single-line-text-form-component-phoneNumber'],
          type: 'tel',
          required: true
        }
      },
      
      indeed: {
        name: {
          selectors: ['#applicant.name', 'input[name="applicant.name"]'],
          type: 'text',
          required: true
        },
        phone: {
          selectors: ['#applicant.phoneNumber', 'input[name="applicant.phoneNumber"]'],
          type: 'tel',
          required: true
        },
        email: {
          selectors: ['#applicant.email', 'input[name="applicant.email"]'],
          type: 'email',
          required: true
        }
      },
      
      custom: {
        // Generic patterns that work for most forms
        firstName: {
          selectors: [
            'input[name*="first"]',
            'input[id*="first"]',
            'input[placeholder*="First"]'
          ],
          type: 'text',
          required: true
        },
        lastName: {
          selectors: [
            'input[name*="last"]',
            'input[id*="last"]',
            'input[placeholder*="Last"]'
          ],
          type: 'text',
          required: true
        },
        email: {
          selectors: [
            'input[type="email"]',
            'input[name*="email"]',
            'input[id*="email"]'
          ],
          type: 'email',
          required: true
        },
        phone: {
          selectors: [
            'input[type="tel"]',
            'input[name*="phone"]',
            'input[id*="phone"]'
          ],
          type: 'tel',
          required: false
        },
        resume: {
          selectors: [
            'input[type="file"][name*="resume"]',
            'input[type="file"][name*="cv"]',
            'input[type="file"]'
          ],
          type: 'file',
          required: true
        }
      }
    };
    
    return patterns[platform] || patterns.custom;
  }
  
  /**
   * Map user data to form fields
   */
  mapUserDataToFields(patterns, userData) {
    const mapping = {};
    
    for (const [fieldName, pattern] of Object.entries(patterns)) {
      mapping[fieldName] = {
        ...pattern,
        value: this.getUserDataValue(fieldName, userData)
      };
    }
    
    return mapping;
  }
  
  /**
   * Get user data value for field
   */
  getUserDataValue(fieldName, userData) {
    const mappings = {
      firstName: userData.personal?.firstName || userData.firstName,
      lastName: userData.personal?.lastName || userData.lastName,
      name: userData.personal?.fullName || userData.fullName,
      email: userData.personal?.email || userData.email,
      phone: userData.personal?.phone || userData.phone,
      linkedIn: userData.personal?.linkedIn || userData.linkedIn,
      portfolio: userData.personal?.portfolio || userData.portfolio,
      website: userData.personal?.website || userData.website,
      github: userData.personal?.github || userData.github,
      
      // Work authorization
      workAuthorized: userData.workAuth?.authorized,
      requiresSponsorship: userData.workAuth?.requiresSponsorship,
      
      // Preferences
      salary: userData.preferences?.salaryExpectation,
      startDate: userData.preferences?.startDate,
      willingToRelocate: userData.preferences?.willingToRelocate,
      
      // Files
      resume: userData.documents?.resumeBlob,
      coverLetter: userData.documents?.coverLetterBlob
    };
    
    return mappings[fieldName] || null;
  }
  
  /**
   * Update form pattern success/failure count
   */
  async updatePatternStats(patternId, success) {
    const field = success ? 'success_count' : 'failure_count';
    
    await query(
      `UPDATE form_patterns 
       SET ${field} = ${field} + 1,
           last_used_at = NOW()
       WHERE id = $1`,
      [patternId]
    );
  }
  
  /**
   * Validate form data completeness
   */
  validateFormData(patterns, userData) {
    const missing = [];
    const warnings = [];
    
    for (const [fieldName, pattern] of Object.entries(patterns)) {
      const value = this.getUserDataValue(fieldName, userData);
      
      if (pattern.required && !value) {
        missing.push(fieldName);
      } else if (!pattern.required && !value) {
        warnings.push(fieldName);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing,
      warnings
    };
  }
}

module.exports = new FormIntelligenceService();
