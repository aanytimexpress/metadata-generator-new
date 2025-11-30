// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// ----- Basic middleware -----
app.use(cors());
app.use(bodyParser.json());

// ----- Auth / JWT setup -----
const JWT_SECRET = process.env.JWT_SECRET || 'local_demo_secret';

// ----- Gemini setup -----
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
    geminiModel = genAI.getGenerativeModel({ model: modelName });
    console.log('✅ Gemini model ready:', modelName);
  } catch (err) {
    console.error('Gemini init error:', err.message);
  }
} else {
  console.log('⚠️ GEMINI_API_KEY not set, using local demo generator.');
}

// demo login: user@example.com / 123456
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};

  if (email === 'user@example.com' && password === '123456') {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ token });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

// simple auth middleware
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

// ---------- Local (non-AI) metadata generator ----------
function generateLocalMetadata({
  filenames,
  titleLength,
  descLength,
  keywordCount,
  keywordFormat,
  includeKeywords,
  excludeKeywords,
  exportProfile,
}) {
  const includeList = includeKeywords
    ? includeKeywords.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const excludeList = excludeKeywords
    ? excludeKeywords.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const baseKeywords = [
    'stock photo',
    'high quality',
    'digital download',
    'royalty free',
    'creative',
    'background',
    'texture',
    'minimal',
    'design',
    'concept',
    'modern',
    'graphic',
    'art',
  ];

  return filenames.map((name, index) => {
    const baseName = name.replace(/\.[^.]+$/, '');
    const title = `${baseName} – AI stock image #${index + 1}`.slice(
      0,
      titleLength
    );

    const description = (
      `High quality stock photo titled "${baseName}". ` +
      `Optimised for ${exportProfile} with AI style metadata.`
    ).slice(0, descLength);

    let keywords = [...includeList, ...baseKeywords];

    if (keywordFormat === 'double') {
      keywords = keywords.map(k => k + ' background');
    } else if (keywordFormat === 'auto') {
      keywords = keywords.map((k, i) => (i % 2 === 0 ? k : k + ' background'));
    }

    if (excludeList.length) {
      const excludeSet = new Set(excludeList.map(s => s.toLowerCase()));
      keywords = keywords.filter(k => !excludeSet.has(k.toLowerCase()));
    }

    keywords = Array.from(new Set(keywords)).slice(0, keywordCount);

    return {
      filename: name,
      title,
      description,
      keywords,
    };
  });
}

// ---------- Gemini metadata generator ----------
async function generateGeminiMetadata({
  filenames,
  titleLength,
  descLength,
  keywordCount,
  keywordFormat,
  includeKeywords,
  excludeKeywords,
  exportProfile,
}) {
  if (!geminiModel) {
    throw new Error('Gemini model not initialised');
  }

  const payload = {
    filenames,
    settings: {
      titleLength,
      descLength,
      keywordCount,
      keywordFormat,
      includeKeywords,
      excludeKeywords,
      exportProfile,
    },
  };

  const prompt = `
You are a professional stock photo metadata generator for sites like Adobe Stock, Shutterstock and Freepik.

Given this JSON input:
${JSON.stringify(payload, null, 2)}

Generate SEO-optimised metadata ONLY as strict JSON in this format:

[
  {
    "filename": "file-name-1.jpg",
    "title": "Title within ${titleLength} characters",
    "description": "Description within ${descLength} characters",
    "keywords": ["keyword1", "keyword2", "... up to ${keywordCount} items"]
  }
]

Rules:
- Return only valid JSON. No markdown, no explanation, no extra text.
- Keywords must be an array of strings.
- Respect includeKeywords (try to include).
- Never include excludeKeywords.
- Text must be suitable for commercial stock marketplaces.
`;

  const result = await geminiModel.generateContent(prompt);
  let text = result.response.text().trim();

  // clean possible ```json fences
  text = text.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

  const items = JSON.parse(text);
  return items;
}

// ----- Metadata generate API -----
app.post('/api/generate-metadata', auth, async (req, res) => {
  const {
    filenames = [],
    titleLength = 150,
    descLength = 150,
    keywordCount = 45,
    keywordFormat = 'single',
    includeKeywords = '',
    excludeKeywords = '',
    exportProfile = 'general',
  } = req.body || {};

  try {
    let items;

    if (geminiModel) {
      // Try Gemini
      items = await generateGeminiMetadata({
        filenames,
        titleLength,
        descLength,
        keywordCount,
        keywordFormat,
        includeKeywords,
        excludeKeywords,
        exportProfile,
      });
      return res.json({ items, ai: 'gemini' });
    } else {
      // Fallback: local
      items = generateLocalMetadata({
        filenames,
        titleLength,
        descLength,
        keywordCount,
        keywordFormat,
        includeKeywords,
        excludeKeywords,
        exportProfile,
      });
      return res.json({ items, ai: 'local' });
    }
  } catch (err) {
    console.error('Metadata generation error:', err.message);
    // Fallback to local if AI fails
    const items = generateLocalMetadata({
      filenames,
      titleLength,
      descLength,
      keywordCount,
      keywordFormat,
      includeKeywords,
      excludeKeywords,
      exportProfile,
    });
    return res.json({
      items,
      ai: 'fallback-local',
      warning: 'AI failed, fallback to local generator',
    });
  }
});

// ----- Static frontend -----
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Express v5 এর জন্য wildcard এভাবেই ব্যবহার করো
app.get('/*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ----- Start server -----
const PORT = process.env.PORT || 8080; // Railway সাধারণত 8080 দেয়
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
