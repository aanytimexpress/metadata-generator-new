// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

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

// ----- Metadata generate API (demo) -----
app.post('/api/generate-metadata', auth, (req, res) => {
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

  const includeList = includeKeywords
    ? includeKeywords.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const excludeList = excludeKeywords
    ? excludeKeywords.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const items = filenames.map((name, index) => {
    const baseName = name.replace(/\.[^.]+$/, '');
    const title = `${baseName} – AI stock image #${index + 1}`.slice(0, titleLength);

    const description = (
      `High quality stock photo titled "${baseName}". ` +
      `Optimised for ${exportProfile} with AI generated SEO description.`
    ).slice(0, descLength);

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

    let keywords = [...includeList, ...baseKeywords];

    if (keywordFormat === 'double') {
      keywords = keywords.map(k => k + ' background');
    } else if (keywordFormat === 'auto') {
      keywords = keywords.map((k, i) =>
        i % 2 === 0 ? k : k + ' background'
      );
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

  return res.json({ items });
});

// ----- Static frontend -----
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ----- Start server -----
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
