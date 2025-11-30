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

// ----- Gemini setup -----
let geminiModel = null;
let geminiSource = 'local';
let geminiModelName = null;

// manual config (from API)
let manualGeminiConfig = {
  apiKey: null,
  model: null,
};

function initGeminiFromEnv() {
  const key = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

  if (!key) {
    console.log('⚠️  Gemini disabled (no API key in env).');
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    geminiModel = genAI.getGenerativeModel({ model: modelName });
    geminiSource = 'env';
    geminiModelName = modelName;
    console.log(`✅ Gemini ready – model: ${modelName}, source: env`);
  } catch (err) {
    geminiModel = null;
    console.error('Gemini init from env failed:', err.message);
  }
}

// প্রথমে env থেকে চেষ্টা করি
initGeminiFromEnv();

// status check
app.get('/api/gemini-status', auth, (req, res) => {
  if (!geminiModel) {
    return res.json({
      active: false,
      source: geminiSource,
      model: geminiModelName,
    });
  }

  return res.json({
    active: true,
    source: geminiSource,
    model: geminiModelName,
  });
});

// manual config API
app.post('/api/gemini-config', auth, async (req, res) => {
  const { apiKey, model } = req.body || {};

  if (!apiKey) {
    return res.status(400).json({ error: 'apiKey is required' });
  }

  const modelName = model || 'gemini-1.5-pro';

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelInstance = genAI.getGenerativeModel({ model: modelName });

    // simple test-call (optional – চাইলে skip করতে পারো)
    // শুধু নিশ্চিত হওয়ার জন্য ১টা টেস্ট prompt
    await modelInstance.generateContent('test');

    manualGeminiConfig = { apiKey, model: modelName };
    geminiModel = modelInstance;
    geminiSource = 'manual';
    geminiModelName = modelName;

    console.log(
      `✅ Gemini ready – model: ${modelName}, source: manual (user config)`
    );

    return res.json({
      ok: true,
      source: geminiSource,
      model: geminiModelName,
    });
  } catch (err) {
    console.error('Gemini manual config failed:', err.message);
    return res
      .status(400)
      .json({ error: 'Failed to initialise Gemini with this key.' });
  }
});

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
    const profileLabel =
      exportProfile === 'adobe'
        ? 'Adobe Stock'
        : exportProfile === 'shutter'
        ? 'Shutterstock'
        : exportProfile === 'freepik'
        ? 'Freepik'
        : exportProfile === 'pond5'
        ? 'Pond5'
        : exportProfile === 'istock'
        ? 'iStock'
        : 'general stock';

    const title = (
      `${baseName} – AI stock image for ${profileLabel} #${index + 1}`
    ).slice(0, titleLength);

    const description = (
      `High quality stock photo titled "${baseName}". ` +
      `Optimised for ${profileLabel} marketplace with SEO friendly, clean description and commercial safe wording.`
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

  const profileLabel =
    exportProfile === 'adobe'
      ? 'Adobe Stock'
      : exportProfile === 'shutter'
      ? 'Shutterstock'
      : exportProfile === 'freepik'
      ? 'Freepik'
      : exportProfile === 'pond5'
      ? 'Pond5'
      : exportProfile === 'istock'
      ? 'iStock'
      : 'general stock marketplaces';

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
You are a professional stock photo metadata generator for sites like Adobe Stock, Shutterstock, Freepik, Pond5 and iStock.

The user is uploading files with these names and settings (JSON below):

${JSON.stringify(payload, null, 2)}

TASK:
For EACH filename, generate:
- A strong, commercial-safe TITLE (max ${titleLength} characters).
- A clean DESCRIPTION (max ${descLength} characters).
- An array of up to ${keywordCount} KEYWORDS (no more than ${keywordCount} items).

Follow these rules carefully:
1. Use the filename as a hint for subject, but do NOT repeat the raw ID (e.g. "142079516") in title or description.
2. Optimise for ${profileLabel}.
3. Keywords must be relevant, in English, separated as an array of strings.
4. Avoid spam words like "best ever", "amazing", "click here".
5. Respect "includeKeywords" by trying to include them when relevant.
6. Never include any of the "excludeKeywords".
7. Keep titles & descriptions suitable for commercial stock licensing and neutral (no trademark names).

RETURN FORMAT (very important):
Return ONLY strict JSON, no markdown, no explanation:

[
  {
    "filename": "original-filename-1.jpg",
    "title": "Title within ${titleLength} characters",
    "description": "Description within ${descLength} characters",
    "keywords": ["keyword1", "keyword2", "... up to ${keywordCount} items"]
  },
  ...
]
`;

  const result = await geminiModel.generateContent(prompt);
  let text = result.response.text().trim();

  // clean possible ``` fences
  text = text
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();

  const items = JSON.parse(text);

  if (!Array.isArray(items)) {
    throw new Error('Gemini response is not an array');
  }

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

  if (!Array.isArray(filenames) || filenames.length === 0) {
    return res.status(400).json({ error: 'filenames array is required' });
  }

  try {
    let items;
    let engine = 'local';

    if (geminiModel) {
      console.log(
        `[AI] Using Gemini for ${filenames.length} files (model: ${geminiModelName}, source: ${geminiSource})`
      );
      try {
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
        engine = 'gemini';
      } catch (err) {
        console.error('Gemini generation error, falling back:', err.message);
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
        engine = 'fallback-local';
      }
    } else {
      console.log(
        `[AI] Gemini disabled, using local generator for ${filenames.length} files`
      );
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
      engine = 'local';
    }

    return res.json({ items, ai: engine });
  } catch (err) {
    console.error('Metadata generation fatal error:', err);
    return res
      .status(500)
      .json({ error: 'Internal error while generating metadata' });
  }
});

// ----- Static frontend -----
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Express v5 compatible wildcard
app.get('/(.*)', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ----- Start server -----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
