// server.js (fixed version)
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Demo user
const USER = {
  email: 'user@example.com',
  password: '123456',
};

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------- Auth middleware --------
function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// -------- Routes --------

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === USER.email && password === USER.password) {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

// Metadata generator (demo)
app.post('/api/generate-metadata', authRequired, (req, res) => {
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
    return res.status(400).json({ error: 'No files supplied' });
  }

  const items = filenames.map((name) => {
    const baseName = name.replace(/\.[^.]+$/, '');
    const title = `${baseName} – high quality stock image, ${exportProfile}`;
    const description = `High quality stock image titled "${baseName}". Optimized for ${exportProfile} marketplaces. Includes ${includeKeywords || 'relevant'} concepts.`;
    const keywords = [];

    const baseWords = (includeKeywords || 'photo, image, stock, creative')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    while (keywords.length < keywordCount && keywords.length < 60) {
      baseWords.forEach(w => {
        if (keywords.length < keywordCount) keywords.push(w);
      });
      if (baseWords.length === 0) break;
    }

    const excluded = (excludeKeywords || '').split(',').map(k => k.trim());
    const filteredKeywords = keywords.filter(k => !excluded.includes(k));

    return {
      filename: name,
      title: title.slice(0, titleLength),
      description: description.slice(0, descLength),
      keywords: filteredKeywords,
    };
  });

  return res.json({ items });
});

// ---------- Serve frontend ----------
// শুধু "/" path এ index.html সার্ভ করব (এতেই problem মিটে যাবে)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Optional: unknown path হলে simple text
app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
