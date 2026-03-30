/**
 * Extension Download Routes
 * Serves the Chrome extension as a downloadable zip
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

// GET /api/extension/download - Download extension as zip
router.get('/download', (req, res) => {
  const extensionPath = path.join(__dirname, '..', '..', 'extension');
  
  // Check if extension folder exists
  if (!fs.existsSync(extensionPath)) {
    return res.status(404).json({
      success: false,
      error: 'Extension not found on server'
    });
  }
  
  // Set headers for zip download
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=jobmatch-ai-extension.zip');
  
  // Create zip archive
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    res.status(500).json({ success: false, error: 'Failed to create zip' });
  });
  
  // Pipe archive to response
  archive.pipe(res);
  
  // Add extension folder contents to zip
  archive.directory(extensionPath, 'jobmatch-ai-extension');
  
  // Finalize
  archive.finalize();
});

// GET /api/extension/info - Get extension info
router.get('/info', (req, res) => {
  const manifestPath = path.join(__dirname, '..', '..', 'extension', 'manifest.json');
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    res.json({
      success: true,
      data: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Could not read extension info'
    });
  }
});

module.exports = router;
