// routes/imageMetadataRoute.js
const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { generateMetadataFromImage } = require('../ai/geminiVision');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'local_demo_secret';

// ---- auth middleware ----
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- multer (memory storage) ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB per file
    files: 10,
  },
});

// POST /api/generate-from-images
router.post(
  '/generate-from-images',
  auth,
  upload.array('files'),
  async (req, res) => {
    try {
      const files = req.files || [];

      if (!files.length) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const {
        titleLength = 150,
        descLength = 150,
        keywordCount = 45,
        exportProfile = 'general',
      } = req.body || {};

      const items = [];

      for (const file of files) {
        const meta = await generateMetadataFromImage(file.buffer, file.mimetype, {
          titleLength: Number(titleLength) || 150,
          descLength: Number(descLength) || 150,
          keywordCount: Number(keywordCount) || 45,
          exportProfile,
        });

        items.push({
          filename: file.originalname,
          title: meta.title,
          description: meta.description,
          keywords: meta.keywords,
        });
      }

      console.log(
        `[VISION] Generated metadata for ${items.length} files using Gemini Vision`
      );

      return res.json({
        items,
        ai: 'gemini-vision',
      });
    } catch (err) {
      console.error('Vision metadata error:', err);
      return res.status(500).json({
        error: 'Failed to generate metadata from images',
        detail: err.message,
      });
    }
  }
);

module.exports = router;
