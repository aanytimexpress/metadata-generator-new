// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

// --- Routes ---
const imageMetadataRoute = require('./routes/imageMetadataRoute');

const app = express();

// Basic middleware
app.use(cors());
app.use(bodyParser.json());

// ----- Auth / JWT setup -----
const JWT_SECRET = process.env.JWT_SECRET || 'local_demo_secret';

// Demo login: user@example.com / 123456
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};

  if (email === 'user@example.com' && password === '123456') {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ token });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

// ----- Image-based AI metadata route -----
app.use('/api', imageMetadataRoute);

// ----- Static frontend -----
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Root route – Express 5 safe
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ----- Start server -----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
