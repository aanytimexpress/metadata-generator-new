// ai/geminiVision.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

let geminiModel = null;

if (GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    console.log('✅ Vision model ready:', GEMINI_MODEL);
  } catch (err) {
    console.error('Gemini vision init error:', err.message);
  }
} else {
  console.log('⚠️ GEMINI_API_KEY missing – vision metadata disabled');
}

/**
 * imageBuffer: Buffer
 * mimeType: e.g. 'image/jpeg'
 * settings: { titleLength, descLength, keywordCount, exportProfile }
 */
async function generateMetadataFromImage(imageBuffer, mimeType, settings = {}) {
  if (!geminiModel) {
    throw new Error('Gemini vision model not initialised');
  }

  const {
    titleLength = 150,
    descLength = 150,
    keywordCount = 45,
    exportProfile = 'general',
  } = settings;

  const base64 = imageBuffer.toString('base64');

  const prompt = `
You are a professional stock photo metadata generator for sites like Adobe Stock, Shutterstock and Freepik.

Look carefully at the IMAGE and generate:
- A commercial-safe TITLE (max ${titleLength} characters).
- A DESCRIPTION (max ${descLength} characters).
- Up to ${keywordCount} KEYWORDS as an array of short phrases.

Focus on:
- What objects, people, places, colours, emotions are visible.
- Use neutral, royalty-free wording suitable for "${exportProfile}" stock marketplace.

Return ONLY valid JSON in this format:

{
  "title": "Title text here",
  "description": "Description text here",
  "keywords": ["keyword 1", "keyword 2", "..."]
}
`;

  const result = await geminiModel.generateContent({
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
  });

  let text = result.response.text().trim();

  // fences clean
  text = text
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();

  const parsed = JSON.parse(text);

  if (
    !parsed ||
    typeof parsed.title !== 'string' ||
    typeof parsed.description !== 'string' ||
    !Array.isArray(parsed.keywords)
  ) {
    throw new Error('Gemini returned invalid JSON structure');
  }

  parsed.title = parsed.title.slice(0, titleLength);
  parsed.description = parsed.description.slice(0, descLength);
  parsed.keywords = [...new Set(parsed.keywords.map(k => String(k).trim()))].filter(
    Boolean
  );

  return parsed;
}

module.exports = {
  generateMetadataFromImage,
};
