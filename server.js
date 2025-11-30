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

// manual config API (UI থেকে key save করার জন্য)
app.post('/api/gemini-config', auth, async (req, res) => {
  const { apiKey, model } = req.body || {};

  if (!apiKey) {
    return res.status(400).json({ error: 'apiKey is required' });
  }

  const modelName = model || 'gemini-1.5-pro';

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelInstance = genAI.getGenerativeModel({ model: modelName });

    // simple টেস্ট, key ঠিক আছে কিনা দেখার জন্য
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
    'royalty free',
    'commercial use',
    'digital download',
    'high resolution',
    'professional',
    'creative',
  ];

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
      : 'general stock sites';

  return filenames.map((name) => {
    const baseName = name.replace(/\.[^.]+$/, '');

    // includeKeywords কে scene / subject হিসেবে ধরলাম
    const subject =
      includeList.length > 0
        ? includeList.join(', ')
        : baseName.replace(/[_-]+/g, ' ');

    const title = (
      `${subject} ${profileLabel} royalty free stock image`
    ).slice(0, titleLength);

    const description = (
      `Professional stock photo about ${subject}. ` +
      `Optimised for ${profileLabel} with clean, commercial-safe wording and SEO friendly description.`
    ).slice(0, descLength);

    let keywords = [];

    // includeKeywords আগে
    keywords.push(...includeList);

    // তারপর কিছু generic keyword add
    keywords.push(...baseKeywords);

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

The user is uploading files with these names and settings (JSON):

${JSON.stringify(payload, null, 2)}

Very important:
- "includeKeywords" is NOT only for keywords. It also describes the SCENE / SUBJECT / STYLE of the images.
- Use "includeKeywords" as the main description of what is in the images.
- "excludeKeywords" are words you MUST NOT use anywhere.

TASK:
For EACH filename, generate:
- A strong, commercial-safe TITLE (max ${titleLength} characters).
- A clean DESCRIPTION (max ${descLength} characters).
- An array of up to ${keywordCount} KEYWORDS (no more than ${keywordCount} items).

Rules:
1. Base the title and description primarily on the scene described by "includeKeywords".
2. Use natural, human-friendly phrasing that would perform well on ${profileLabel}.
3. Do NOT repeat raw IDs from filenames (like "142079516") in the text.
4. Keywords must be relevant, in English, and suitable for commercial stock marketplaces.
5. Respect "includeKeywords" by including them (or close variants) when relevant.
6. NEVER include any of the "excludeKeywords" in title, description or keyword list.
7. Avoid hype / spam words like "best ever", "super amazing", "click here".
8. Output must be neutral and safe for commercial licensing.

RETURN FORMAT (strict):
Return ONLY valid JSON, no markdown, no explanation:

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

// শুধু root path সার্ভ হচ্ছে (Express v5-safe)
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ----- Start server -----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
