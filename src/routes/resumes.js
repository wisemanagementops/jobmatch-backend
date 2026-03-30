/**
 * Resume Routes - COMPLETE VERSION WITH ALL ENDPOINTS
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const aiService = require('../services/ai');

const router = express.Router();

// Helper: Extract text from uploaded files
async function extractTextFromFile(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    // Plain text files
    if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf-8');
    }
    
    // PDF files
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fs.readFileSync(filePath));
      return data.text;
    }
    
    // DOCX files
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '[Could not extract text from DOCX]';
    }
    
    // DOC files (older format) - try mammoth, might work
    if (ext === '.doc') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || '[Could not extract text from DOC]';
      } catch (e) {
        return '[DOC format not fully supported - please use DOCX]';
      }
    }
    
    return '[Unsupported file format]';
  } catch (e) {
    console.error('Text extraction error:', e);
    return '[Could not extract text: ' + e.message + ']';
  }
}

// GET /api/resumes
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, is_primary, contact_info, summary, extracted_job_titles, extracted_skills,
              original_file_type, original_file_url, raw_text, created_at, updated_at 
       FROM resumes WHERE user_id = $1 ORDER BY is_primary DESC, updated_at DESC`,
      [req.user.id]
    );
    // Add a boolean flag for uploaded files
    const resumes = result.rows.map(r => ({
      ...r,
      original_file: !!r.original_file_url,
      original_filename: r.original_file_url ? path.basename(r.original_file_url) : null
    }));
    res.json({ success: true, data: resumes });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get resumes.' });
  }
});

// POST /api/resumes/upload
router.post('/upload', authenticate, upload.single('resume'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
    const { originalname, path: filePath, mimetype } = req.file;
    const resumeName = req.body.name || originalname.replace(/\.[^/.]+$/, '');
    const extractedText = await extractTextFromFile(filePath, mimetype);
    const ext = path.extname(originalname).toLowerCase().replace('.', '').toUpperCase();
    const result = await query(
      `INSERT INTO resumes (user_id, name, original_file_url, original_file_type, raw_text, is_primary)
       VALUES ($1, $2, $3, $4, $5, (SELECT NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = $1)))
       RETURNING id, name, is_primary, original_file_type, created_at`,
      [req.user.id, resumeName, filePath, ext, extractedText]
    );
    res.status(201).json({ success: true, message: 'Resume uploaded', data: result.rows[0] });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, error: 'Failed to upload.' });
  }
});

// GET /api/resumes/:id/download - Download original file
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT original_file_url, original_file_type, name FROM resumes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Resume not found.' });
    }
    
    const resume = result.rows[0];
    
    if (!resume.original_file_url || !fs.existsSync(resume.original_file_url)) {
      return res.status(404).json({ success: false, error: 'Original file not found.' });
    }
    
    const filename = `${resume.name}.${(resume.original_file_type || 'pdf').toLowerCase()}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const fileStream = fs.createReadStream(resume.original_file_url);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Failed to download.' });
  }
});

// GET /api/resumes/:id/view - View original file (for PDF preview)
router.get('/:id/view', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT original_file_url, original_file_type, name FROM resumes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Resume not found.' });
    }
    
    const resume = result.rows[0];
    
    if (!resume.original_file_url || !fs.existsSync(resume.original_file_url)) {
      return res.status(404).json({ success: false, error: 'Original file not found.' });
    }
    
    const ext = (resume.original_file_type || 'pdf').toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain'
    };
    
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${resume.name}.${ext}"`);
    
    const fileStream = fs.createReadStream(resume.original_file_url);
    fileStream.pipe(res);
  } catch (error) {
    console.error('View error:', error);
    res.status(500).json({ success: false, error: 'Failed to view file.' });
  }
});

// POST /api/resumes/:id/reextract - Re-extract text from uploaded file
router.post('/:id/reextract', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, original_file_url, original_file_type FROM resumes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Resume not found.' });
    }
    
    const resume = result.rows[0];
    
    if (!resume.original_file_url || !fs.existsSync(resume.original_file_url)) {
      return res.status(400).json({ success: false, error: 'No original file to re-extract from.' });
    }
    
    // Re-extract text
    const extractedText = await extractTextFromFile(resume.original_file_url, resume.original_file_type);
    
    // Update database
    await query(
      'UPDATE resumes SET raw_text = $1, updated_at = NOW() WHERE id = $2',
      [extractedText, req.params.id]
    );
    
    res.json({ 
      success: true, 
      message: 'Text re-extracted successfully',
      data: { 
        textLength: extractedText.length,
        preview: extractedText.substring(0, 200)
      }
    });
  } catch (error) {
    console.error('Re-extract error:', error);
    res.status(500).json({ success: false, error: 'Failed to re-extract text.' });
  }
});

// GET /api/resumes/:id/generate-docx - Generate formatted DOCX from AI-built resume
router.get('/:id/generate-docx', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM resumes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Resume not found.' });
    }

    const resume = result.rows[0];

    // If it's an uploaded file, just return it
    if (resume.original_file_url && fs.existsSync(resume.original_file_url)) {
      const ext = (resume.original_file_type || 'pdf').toLowerCase();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${resume.name}.${ext}"`);
      return fs.createReadStream(resume.original_file_url).pipe(res);
    }

    // Generate DOCX from resume data using docx library
    const docx = require('docx');
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Packer } = docx;

    const parseField = (field) => {
      if (!field) return field;
      return typeof field === 'string' ? JSON.parse(field) : field;
    };

    const contactInfo = parseField(resume.contact_info) || {};
    const workExperience = parseField(resume.work_experience) || [];
    const education = parseField(resume.education) || [];
    const skills = resume.skills || [];
    const projects = parseField(resume.projects) || [];
    const certifications = parseField(resume.certifications) || [];
    const publications = parseField(resume.publications) || [];

    const sectionBorder = {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' }
    };

    const children = [];

    // Name header
    if (contactInfo.name) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: contactInfo.name, bold: true, size: 32, font: 'Calibri' })]
      }));
    }

    // Contact line
    const contactParts = [contactInfo.email, contactInfo.phone, contactInfo.location].filter(Boolean);
    if (contactParts.length > 0) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: contactParts.join('  |  '), size: 20, color: '555555', font: 'Calibri' })]
      }));
    }

    // LinkedIn / Portfolio
    const linkParts = [contactInfo.linkedin, contactInfo.portfolio].filter(Boolean);
    if (linkParts.length > 0) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: linkParts.join('  |  '), size: 18, color: '666666', font: 'Calibri' })]
      }));
    }

    // Summary
    if (resume.summary) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        border: sectionBorder,
        children: [new TextRun({ text: 'PROFESSIONAL SUMMARY', bold: true, size: 24, font: 'Calibri' })]
      }));
      children.push(new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: resume.summary, size: 21, font: 'Calibri' })]
      }));
    }

    // Work Experience
    if (workExperience.length > 0) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        border: sectionBorder,
        children: [new TextRun({ text: 'WORK EXPERIENCE', bold: true, size: 24, font: 'Calibri' })]
      }));
      for (const exp of workExperience) {
        children.push(new Paragraph({
          spacing: { before: 150 },
          children: [
            new TextRun({ text: exp.title || '', bold: true, size: 22, font: 'Calibri' }),
            new TextRun({ text: exp.company ? `  —  ${exp.company}` : '', size: 22, font: 'Calibri' }),
          ]
        }));
        const dates = [exp.startDate, exp.endDate || 'Present'].filter(Boolean).join(' – ');
        if (dates) {
          children.push(new Paragraph({
            spacing: { after: 50 },
            children: [new TextRun({ text: [dates, exp.location].filter(Boolean).join('  |  '), size: 19, italics: true, color: '666666', font: 'Calibri' })]
          }));
        }
        for (const bullet of (exp.bullets || [])) {
          children.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: [new TextRun({ text: bullet, size: 21, font: 'Calibri' })]
          }));
        }
      }
    }

    // Education
    if (education.length > 0) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        border: sectionBorder,
        children: [new TextRun({ text: 'EDUCATION', bold: true, size: 24, font: 'Calibri' })]
      }));
      for (const edu of education) {
        const schoolWithLocation = [edu.school, edu.location].filter(Boolean).join(', ');
        children.push(new Paragraph({
          spacing: { before: 100 },
          children: [
            new TextRun({ text: schoolWithLocation || '', bold: true, size: 22, font: 'Calibri' }),
            new TextRun({ text: edu.graduation ? `  —  ${edu.graduation}` : '', size: 22, italics: true, color: '666666', font: 'Calibri' }),
          ]
        }));
        const degreeParts = [edu.degree, edu.field].filter(Boolean).join(' in ');
        const degreeWithGpa = [degreeParts, edu.gpa ? `GPA: ${edu.gpa}` : ''].filter(Boolean).join('  |  ');
        if (degreeWithGpa) {
          children.push(new Paragraph({
            spacing: { after: 50 },
            children: [new TextRun({ text: degreeWithGpa, size: 21, font: 'Calibri' })]
          }));
        }
      }
    }

    // Projects
    if (projects.length > 0) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        border: sectionBorder,
        children: [new TextRun({ text: 'PROJECTS', bold: true, size: 24, font: 'Calibri' })]
      }));
      for (const proj of projects) {
        children.push(new Paragraph({
          spacing: { before: 100 },
          children: [
            new TextRun({ text: proj.name || '', bold: true, size: 22, font: 'Calibri' }),
            new TextRun({ text: proj.technologies ? `  (${proj.technologies})` : '', size: 20, italics: true, color: '666666', font: 'Calibri' }),
          ]
        }));
        if (proj.description) {
          children.push(new Paragraph({
            spacing: { after: 50 },
            children: [new TextRun({ text: proj.description, size: 21, font: 'Calibri' })]
          }));
        }
      }
    }

    // Certifications
    if (certifications.length > 0) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        border: sectionBorder,
        children: [new TextRun({ text: 'CERTIFICATIONS', bold: true, size: 24, font: 'Calibri' })]
      }));
      for (const cert of certifications) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [
            new TextRun({ text: cert.name || '', bold: true, size: 21, font: 'Calibri' }),
            new TextRun({ text: cert.issuer ? ` — ${cert.issuer}` : '', size: 21, font: 'Calibri' }),
            new TextRun({ text: cert.year ? ` (${cert.year})` : '', size: 20, italics: true, color: '666666', font: 'Calibri' }),
          ]
        }));
      }
    }

    // Skills
    if (skills.length > 0) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        border: sectionBorder,
        children: [new TextRun({ text: 'SKILLS', bold: true, size: 24, font: 'Calibri' })]
      }));
      children.push(new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: skills.join('  •  '), size: 21, font: 'Calibri' })]
      }));
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${resume.name || 'Resume'}.docx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Generate DOCX error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate document.' });
  }
});

// POST /api/resumes
router.post('/', authenticate, async (req, res) => {
  try {
    const { name = 'My Resume', isPrimary, contactInfo, summary, workExperience, education, skills,
            projects, publications, certifications, achievements, industry, targetRole } = req.body;
    if (isPrimary) await query('UPDATE resumes SET is_primary = FALSE WHERE user_id = $1', [req.user.id]);
    const result = await query(
      `INSERT INTO resumes (user_id, name, is_primary, contact_info, summary, work_experience, education, skills,
       projects, publications, certifications, achievements, industry, target_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, name, is_primary, created_at`,
      [req.user.id, name, isPrimary || false, JSON.stringify(contactInfo || {}), summary || '',
       JSON.stringify(workExperience || []), JSON.stringify(education || []), skills || [],
       JSON.stringify(projects || []), JSON.stringify(publications || []), JSON.stringify(certifications || []),
       JSON.stringify(achievements || []), industry || null, targetRole || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create resume error:', error);
    res.status(500).json({ success: false, error: 'Failed to create resume.' });
  }
});

// GET /api/resumes/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM resumes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Resume not found.' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get resume.' });
  }
});

// PUT /api/resumes/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, isPrimary, contactInfo, summary, workExperience, education, skills } = req.body;
    if (isPrimary) await query('UPDATE resumes SET is_primary = FALSE WHERE user_id = $1 AND id != $2', [req.user.id, req.params.id]);
    await query(
      `UPDATE resumes SET name = COALESCE($1, name), is_primary = COALESCE($2, is_primary),
       contact_info = COALESCE($3, contact_info), summary = COALESCE($4, summary),
       work_experience = COALESCE($5, work_experience), education = COALESCE($6, education),
       skills = COALESCE($7, skills), updated_at = NOW() WHERE id = $8 AND user_id = $9`,
      [name, isPrimary, contactInfo ? JSON.stringify(contactInfo) : null, summary,
       workExperience ? JSON.stringify(workExperience) : null, education ? JSON.stringify(education) : null,
       skills, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Resume updated.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update resume.' });
  }
});

// DELETE /api/resumes/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING original_file_url', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Resume not found.' });
    const filePath = result.rows[0]?.original_file_url;
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Resume deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete resume.' });
  }
});

// POST /api/resumes/:id/primary
router.post('/:id/primary', authenticate, async (req, res) => {
  try {
    await query('UPDATE resumes SET is_primary = FALSE WHERE user_id = $1', [req.user.id]);
    const result = await query('UPDATE resumes SET is_primary = TRUE WHERE id = $1 AND user_id = $2 RETURNING id, name', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Resume not found.' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to set primary.' });
  }
});

// ========== RESUME BUILDER ==========

const builderSessions = new Map();

function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] !== null && source[key] !== undefined) {
      if (Array.isArray(source[key])) result[key] = source[key];
      else if (typeof source[key] === 'object') result[key] = deepMerge(result[key] || {}, source[key]);
      else result[key] = source[key];
    }
  }
  return result;
}

// POST /api/resumes/builder/start
router.post('/builder/start', authenticate, async (req, res) => {
  try {
    const sessionId = require('crypto').randomUUID();
    const session = { userId: req.user.id, step: 'name', data: req.body.existingData || {}, createdAt: new Date() };
    builderSessions.set(sessionId, session);
    await query(`INSERT INTO resume_builder_sessions (id, user_id, current_step, collected_data, progress_percent) VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, req.user.id, 'name', JSON.stringify(session.data), 5]);
    res.json({
      success: true,
      data: { sessionId, step: 'name', progress: 5,
        message: `👋 **Welcome to the AI Resume Builder!**\n\nI'll help you create a professional resume step by step.\n\n**What's your full name?**`,
        inputType: 'text', inputPlaceholder: 'Enter your full name' }
    });
  } catch (error) {
    console.error('Start builder error:', error);
    res.status(500).json({ success: false, error: 'Failed to start builder.' });
  }
});

// POST /api/resumes/builder/message
router.post('/builder/message', authenticate, async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) return res.status(400).json({ success: false, error: 'Session ID and message required.' });
    let session = builderSessions.get(sessionId);
    if (!session) {
      const dbSession = await query('SELECT * FROM resume_builder_sessions WHERE id = $1 AND user_id = $2', [sessionId, req.user.id]);
      if (dbSession.rows.length === 0) return res.status(404).json({ success: false, error: 'Session not found.' });
      session = { userId: req.user.id, step: dbSession.rows[0].current_step, data: dbSession.rows[0].collected_data || {} };
      builderSessions.set(sessionId, session);
    }
    const result = await processBuilderStep(session.step, message, session.data);
    session.step = result.nextStep;
    session.data = deepMerge(session.data, result.updatedData);
    builderSessions.set(sessionId, session);
    await query(`UPDATE resume_builder_sessions SET current_step = $1, collected_data = $2, progress_percent = $3, last_activity_at = NOW() WHERE id = $4`,
      [result.nextStep, JSON.stringify(session.data), result.progress, sessionId]);
    res.json({ success: true, data: { step: result.nextStep, progress: result.progress, message: result.response,
      inputType: result.inputType || 'text', inputPlaceholder: result.inputPlaceholder || '', options: result.options || [], collectedData: session.data } });
  } catch (error) {
    console.error('Builder message error:', error);
    res.status(500).json({ success: false, error: 'Failed to process message.' });
  }
});

// POST /api/resumes/builder/complete
router.post('/builder/complete', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.body;
    let session = builderSessions.get(sessionId);
    if (!session) {
      const dbSession = await query('SELECT * FROM resume_builder_sessions WHERE id = $1 AND user_id = $2', [sessionId, req.user.id]);
      if (dbSession.rows.length === 0) return res.status(404).json({ success: false, error: 'Session not found.' });
      session = { userId: req.user.id, data: dbSession.rows[0].collected_data || {} };
    }
    const data = session.data;
    const contactInfo = { name: data.name || '', email: data.email || '', phone: data.phone || '', location: data.location || '' };
    const workExperience = (data.experience || []).map(exp => ({
      title: exp.title || '', company: exp.company || '', dates: exp.dates || '',
      startDate: exp.startDate || '', endDate: exp.endDate || '', bullets: exp.bullets || []
    }));
    const education = (data.education || []).map(edu => ({ school: edu.school || '', degree: edu.degree || '', graduation: edu.graduation || '' }));
    const resumeName = data.name ? `${data.name}'s Resume` : 'My Resume';
    console.log('Saving resume:', { name: resumeName, contactInfo, experience: workExperience.length });
    const result = await query(
      `INSERT INTO resumes (user_id, name, contact_info, summary, work_experience, education, skills, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = $1))) RETURNING id, name, is_primary`,
      [req.user.id, resumeName, JSON.stringify(contactInfo), data.summary || '', JSON.stringify(workExperience), JSON.stringify(education), data.skills || []]
    );
    builderSessions.delete(sessionId);
    res.json({ success: true, message: 'Resume created!', data: { resumeId: result.rows[0].id, name: result.rows[0].name } });
  } catch (error) {
    console.error('Complete builder error:', error);
    res.status(500).json({ success: false, error: 'Failed to create resume.' });
  }
});

// ========== AI SUGGESTION ENDPOINTS ==========

// POST /api/resumes/builder/experience-suggestions - THE ENDPOINT YOUR FRONTEND CALLS
router.post('/builder/experience-suggestions', authenticate, async (req, res) => {
  try {
    const { jobTitle, company, description } = req.body;
    console.log('📝 Experience suggestions request:', { jobTitle, company });
    if (!jobTitle) return res.status(400).json({ success: false, error: 'Job title is required.' });
    const suggestions = await aiService.generateJobSuggestions(jobTitle, company, description);
    console.log('✅ Generated suggestions for:', jobTitle);
    res.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('❌ Experience suggestions error:', error);
    res.status(500).json({ success: false, error: 'Failed to get suggestions. Please try again.' });
  }
});

// POST /api/resumes/builder/suggestions (alias)
router.post('/builder/suggestions', authenticate, async (req, res) => {
  try {
    const { jobTitle, company, briefDescription } = req.body;
    if (!jobTitle) return res.status(400).json({ success: false, error: 'Job title is required.' });
    const suggestions = await aiService.generateJobSuggestions(jobTitle, company, briefDescription);
    res.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ success: false, error: 'Failed to get suggestions.' });
  }
});

// POST /api/resumes/builder/bullet
router.post('/builder/bullet', authenticate, async (req, res) => {
  try {
    const { description, jobTitle, style } = req.body;
    if (!description) return res.status(400).json({ success: false, error: 'Description is required.' });
    const bulletPoint = await aiService.generateBulletPoint(description, jobTitle, style);
    res.json({ success: true, data: { original: description, bulletPoint, style: style || 'professional' } });
  } catch (error) {
    console.error('Generate bullet error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate bullet point.' });
  }
});

// POST /api/resumes/builder/bullet-variations
router.post('/builder/bullet-variations', authenticate, async (req, res) => {
  try {
    const { description, jobTitle } = req.body;
    if (!description) return res.status(400).json({ success: false, error: 'Description is required.' });
    const variations = await aiService.generateBulletVariations(description, jobTitle);
    res.json({ success: true, data: { variations } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate variations.' });
  }
});

// POST /api/resumes/builder/regenerate
router.post('/builder/regenerate', authenticate, async (req, res) => {
  try {
    const { type, content, context, style } = req.body;
    let result;
    if (type === 'bullet') result = await aiService.generateBulletPoint(content, context?.jobTitle, style);
    else if (type === 'summary') result = await aiService.generateProfessionalSummary(context, style);
    else return res.status(400).json({ success: false, error: 'Invalid type.' });
    res.json({ success: true, data: { original: content, regenerated: result, style } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to regenerate.' });
  }
});

// POST /api/resumes/builder/summary
router.post('/builder/summary', authenticate, async (req, res) => {
  try {
    const { resumeData, style } = req.body;
    const summary = await aiService.generateProfessionalSummary(resumeData, style);
    res.json({ success: true, data: { summary, style: style || 'professional' } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate summary.' });
  }
});

// ========== BUILDER STEP PROCESSING ==========

async function processBuilderStep(step, userInput, currentData) {
  switch (step) {
    case 'name':
      return { nextStep: 'email', response: `Nice to meet you, **${userInput}**! 🙌\n\nWhat's your **email address**?`,
        updatedData: { name: userInput }, progress: 10, inputType: 'email', inputPlaceholder: 'your.email@example.com' };
    case 'email':
      return { nextStep: 'phone', response: `Got it! ✓\n\nWhat's your **phone number**? (Type "skip" to skip)`,
        updatedData: { email: userInput }, progress: 15, inputType: 'tel', inputPlaceholder: '(555) 123-4567 or "skip"' };
    case 'phone':
      const phone = userInput.toLowerCase() === 'skip' ? '' : userInput;
      return { nextStep: 'location', response: `${phone ? '✓ Phone added!' : 'No problem!'}\n\nWhat's your **location**? (City, State)`,
        updatedData: { phone }, progress: 20, inputPlaceholder: 'e.g., Portland, OR' };
    case 'location':
      return { nextStep: 'education_school', response: `📍 **${userInput}** - great!\n\n---\n\nNow let's add your **education**. 🎓\n\nWhat school did you attend?`,
        updatedData: { location: userInput }, progress: 25, inputPlaceholder: 'University/College name' };
    case 'education_school':
      return { nextStep: 'education_degree', response: `**${userInput}** - excellent! 🎓\n\nWhat **degree** did you earn?`,
        updatedData: { currentEducation: { school: userInput } }, progress: 30, inputPlaceholder: 'e.g., Bachelor of Science' };
    case 'education_degree':
      return { nextStep: 'education_year', response: `Got it! ✓\n\nWhat **year** did you graduate?`,
        updatedData: { currentEducation: { ...currentData.currentEducation, degree: userInput } }, progress: 35, inputPlaceholder: 'e.g., 2020' };
    case 'education_year':
      const completedEdu = { ...currentData.currentEducation, graduation: userInput };
      return { nextStep: 'job_title', response: `✓ Education added!\n\n---\n\nNow **work experience**. 💼\n\nWhat is/was your **job title**?`,
        updatedData: { education: [...(currentData.education || []), completedEdu], currentEducation: null }, progress: 40, inputPlaceholder: 'e.g., Software Engineer' };
    case 'job_title':
      return { nextStep: 'job_company', response: `**${userInput}** - nice! 💼\n\nWhat **company**?`,
        updatedData: { currentJob: { title: userInput } }, progress: 45, inputPlaceholder: 'Company name' };
    case 'job_company':
      return { nextStep: 'job_dates', response: `**${userInput}** ✓\n\n**When** did you work there?`,
        updatedData: { currentJob: { ...currentData.currentJob, company: userInput } }, progress: 50, inputPlaceholder: 'e.g., Jan 2020 - Present' };
    case 'job_dates':
      return { nextStep: 'job_description', response: `✓ Perfect!\n\n**Briefly describe** what you did (2-3 lines). I'll turn it into bullet points.`,
        updatedData: { currentJob: { ...currentData.currentJob, dates: userInput } }, progress: 55, inputType: 'textarea', inputPlaceholder: 'Describe your role...' };
    case 'job_description':
      let bullet = userInput;
      try { bullet = await aiService.generateBulletPoint(userInput, currentData.currentJob?.title, 'professional'); } catch (e) {}
      return { nextStep: 'bullet_review', response: `Here's a professional bullet:\n\n📝 **"${bullet}"**\n\n**Choose:**`,
        updatedData: { currentJob: { ...currentData.currentJob, description: userInput, currentBullet: bullet } }, progress: 60, inputType: 'choice',
        options: [{ value: 'accept', label: '✓ Use this' }, { value: 'detailed', label: '📝 More detailed' }, { value: 'concise', label: '✂️ Shorter' },
          { value: 'impressive', label: '⭐ More impressive' }, { value: 'manual', label: '✏️ Write my own' }] };
    case 'bullet_review':
      const choice = userInput.toLowerCase();
      if (choice === 'accept' || choice.includes('use')) {
        const job = { ...currentData.currentJob, bullets: [...(currentData.currentJob?.bullets || []), currentData.currentJob?.currentBullet] };
        delete job.currentBullet; delete job.description;
        return { nextStep: 'more_bullets', response: `✓ Added!\n\nAdd **another bullet**?`,
          updatedData: { currentJob: job }, progress: 65, inputType: 'choice',
          options: [{ value: 'yes', label: '➕ Yes' }, { value: 'no', label: '→ Done with this job' }] };
      }
      if (choice === 'manual' || choice.includes('own')) {
        return { nextStep: 'manual_bullet', response: `Write your bullet:`, updatedData: {}, progress: 60, inputType: 'textarea', inputPlaceholder: 'Your bullet point...' };
      }
      let style = choice.includes('detailed') ? 'detailed' : choice.includes('concise') ? 'concise' : choice.includes('impressive') ? 'fancy' : 'professional';
      let newBullet = currentData.currentJob?.currentBullet;
      try { newBullet = await aiService.generateBulletPoint(currentData.currentJob?.description, currentData.currentJob?.title, style); } catch (e) {}
      return { nextStep: 'bullet_review', response: `${style} version:\n\n📝 **"${newBullet}"**\n\n**Choose:**`,
        updatedData: { currentJob: { ...currentData.currentJob, currentBullet: newBullet } }, progress: 60, inputType: 'choice',
        options: [{ value: 'accept', label: '✓ Use this' }, { value: 'detailed', label: '📝 More detailed' }, { value: 'concise', label: '✂️ Shorter' },
          { value: 'impressive', label: '⭐ More impressive' }, { value: 'manual', label: '✏️ Write my own' }] };
    case 'manual_bullet':
      const jobManual = { ...currentData.currentJob, bullets: [...(currentData.currentJob?.bullets || []), userInput] };
      delete jobManual.currentBullet;
      return { nextStep: 'more_bullets', response: `✓ Added!\n\nAdd **another bullet**?`,
        updatedData: { currentJob: jobManual }, progress: 65, inputType: 'choice',
        options: [{ value: 'yes', label: '➕ Yes' }, { value: 'no', label: '→ Done' }] };
    case 'more_bullets':
      if (userInput.toLowerCase() === 'yes' || userInput.includes('add')) {
        return { nextStep: 'job_description', response: `Describe another accomplishment:`, updatedData: {}, progress: 55, inputType: 'textarea', inputPlaceholder: 'Another accomplishment...' };
      }
      const finishedJob = { ...currentData.currentJob }; delete finishedJob.currentBullet; delete finishedJob.description;
      return { nextStep: 'more_experience', response: `✓ **${finishedJob.title}** saved!\n\nAdd **another job**?`,
        updatedData: { experience: [...(currentData.experience || []), finishedJob], currentJob: null }, progress: 70, inputType: 'choice',
        options: [{ value: 'yes', label: '➕ Yes' }, { value: 'no', label: '→ Move to skills' }] };
    case 'more_experience':
      if (userInput.toLowerCase() === 'yes') return { nextStep: 'job_title', response: `What was your **job title**?`, updatedData: {}, progress: 45, inputPlaceholder: 'Job title' };
      return { nextStep: 'skills', response: `Let's add **skills**. 🎯\n\nList skills separated by commas:`, updatedData: {}, progress: 80, inputType: 'textarea', inputPlaceholder: 'Skill 1, Skill 2...' };
    case 'skills':
      const skills = userInput.split(',').map(s => s.trim()).filter(s => s);
      return { nextStep: 'summary_style', response: `🎯 **${skills.length} skills** added!\n\nNow your **Professional Summary**:`,
        updatedData: { skills }, progress: 85, inputType: 'choice',
        options: [{ value: 'professional', label: '👔 Professional' }, { value: 'detailed', label: '📝 Detailed' },
          { value: 'concise', label: '✂️ Concise' }, { value: 'impressive', label: '⭐ Impressive' }, { value: 'manual', label: '✏️ Write my own' }] };
    case 'summary_style':
      if (userInput.toLowerCase() === 'manual' || userInput.includes('own')) {
        return { nextStep: 'manual_summary', response: `Write your summary:`, updatedData: {}, progress: 90, inputType: 'textarea', inputPlaceholder: 'Your professional summary...' };
      }
      const summaryStyle = userInput.includes('detailed') ? 'detailed' : userInput.includes('concise') ? 'concise' : userInput.includes('impressive') ? 'fancy' : 'professional';
      let summary = '';
      try { summary = await aiService.generateProfessionalSummary({ name: currentData.name, experience: currentData.experience, education: currentData.education, skills: currentData.skills }, summaryStyle); }
      catch (e) { summary = `Results-driven professional with experience in ${currentData.skills?.slice(0, 3).join(', ') || 'various areas'}.`; }
      return { nextStep: 'summary_review', response: `Your summary:\n\n📝 **"${summary}"**\n\n**Choose:**`,
        updatedData: { currentSummary: summary }, progress: 92, inputType: 'choice',
        options: [{ value: 'accept', label: '✓ Perfect!' }, { value: 'detailed', label: '📝 More detailed' }, { value: 'concise', label: '✂️ Shorter' },
          { value: 'impressive', label: '⭐ More impressive' }, { value: 'manual', label: '✏️ Write my own' }] };
    case 'summary_review':
      const summaryChoice = userInput.toLowerCase();
      if (summaryChoice === 'accept' || summaryChoice.includes('perfect')) {
        return { nextStep: 'complete', response: `🎉 **Resume complete!**\n\n📋 ${currentData.name}\n📍 ${currentData.location}\n📧 ${currentData.email}\n💼 ${(currentData.experience || []).length} jobs\n🎓 ${(currentData.education || []).length} education\n🎯 ${(currentData.skills || []).length} skills\n\nClick **"Create My Resume"**!`,
          updatedData: { summary: currentData.currentSummary }, progress: 100, inputType: 'complete' };
      }
      if (summaryChoice === 'manual' || summaryChoice.includes('own')) {
        return { nextStep: 'manual_summary', response: `Write your summary:`, updatedData: {}, progress: 90, inputType: 'textarea', inputPlaceholder: 'Your professional summary...' };
      }
      let newStyle = summaryChoice.includes('detailed') ? 'detailed' : summaryChoice.includes('concise') ? 'concise' : summaryChoice.includes('impressive') ? 'fancy' : 'professional';
      let newSummary = currentData.currentSummary;
      try { newSummary = await aiService.generateProfessionalSummary({ name: currentData.name, experience: currentData.experience, education: currentData.education, skills: currentData.skills }, newStyle); } catch (e) {}
      return { nextStep: 'summary_review', response: `${newStyle} version:\n\n📝 **"${newSummary}"**\n\n**Choose:**`,
        updatedData: { currentSummary: newSummary }, progress: 92, inputType: 'choice',
        options: [{ value: 'accept', label: '✓ Perfect!' }, { value: 'detailed', label: '📝 More detailed' }, { value: 'concise', label: '✂️ Shorter' },
          { value: 'impressive', label: '⭐ More impressive' }, { value: 'manual', label: '✏️ Write my own' }] };
    case 'manual_summary':
      return { nextStep: 'complete', response: `🎉 **Resume complete!**\n\n📋 ${currentData.name}\n📍 ${currentData.location}\n📧 ${currentData.email}\n💼 ${(currentData.experience || []).length} jobs\n🎓 ${(currentData.education || []).length} education\n🎯 ${(currentData.skills || []).length} skills\n\nClick **"Create My Resume"**!`,
        updatedData: { summary: userInput }, progress: 100, inputType: 'complete' };
    default:
      return { nextStep: step, response: "Let's continue.", updatedData: {}, progress: 50 };
  }
}

module.exports = router;
