const express = require('express');
const cors = require('cors');
const rateLimit = require('rate-limiter-flexible');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Allow configuring the daily limit via env, default to 1000
const RATE_LIMIT_POINTS = parseInt(process.env.RATE_LIMIT_POINTS, 10) || 1000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiting setup (in-memory). For production across multiple instances, use Redis.
const rateLimiter = new rateLimit.RateLimiterMemory({
  points: RATE_LIMIT_POINTS, // requests per key (IP)
  duration: 24 * 60 * 60,    // seconds (24 hours)
});

// Middleware
app.use(cors());
app.use(express.json());

// Friendly root route so GET / doesn't return "Cannot GET /"
app.get('/', (req, res) => {
  res.send('✅ Humanivio API is live and ready to humanize your text!');
});

// Rate limiting middleware
app.use(async (req, res, next) => {
  try {
    // Use the client's IP as the key
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({
      error: 'Free daily limit reached. Please try again tomorrow or consider upgrading for higher limits.'
    });
  }
});

// Humanize API endpoint (POST)
app.post('/api/humanize', async (req, res) => {
  try {
    const { text } = req.body;

    // Validate input
    if (!text || text.trim() === '') {
      return res.status(400).json({
        error: 'Please provide text to humanize'
      });
    }

    // Check word count
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 1000) {
      return res.status(400).json({
        error: 'Text exceeds 1000 words limit'
      });
    }

    console.log('Processing request with word count:', wordCount);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are Humanivio — an advanced AI Humanizer built to convert AI-generated or robotic text into natural, human-sounding, and plagiarism-free writing. Your goal is to rewrite the given input text in a way that:
          - Sounds 100% written by a real human.
          - Retains the original meaning and tone.
          - Uses natural vocabulary and sentence structure.
          - Avoids repetitive patterns common in AI writing.
          - Makes the text flow naturally like human conversation.
          Output ONLY the rewritten text without any additional explanations or notes.`
        },
        {
          role: "user",
          content: text
        }
      ],
      max_tokens: 2000,
      temperature: 0.8,
      presence_penalty: 0.2,
      frequency_penalty: 0.3,
    });

    const humanizedText = completion?.choices?.[0]?.message?.content || '';

    console.log('Successfully humanized text');
    res.json({
      humanizedText: humanizedText.trim(),
      originalWordCount: wordCount,
      humanizedWordCount: humanizedText ? humanizedText.trim().split(/\s+/).length : 0
    });

  } catch (error) {
    console.error('Error:', error);

    // Handle specific OpenAI errors (best-effort)
    if (error.code === 'insufficient_quota') {
      return res.status(500).json({
        error: 'API quota exceeded. Please check your OpenAI account.'
      });
    }

    if (error.code === 'invalid_api_key') {
      return res.status(500).json({
        error: 'Invalid API key. Please check your configuration.'
      });
    }

    res.status(500).json({
      error: 'Failed to humanize text. Please try again.'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Humanivio API',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Humanivio API server running on port ${PORT}`);
  console.log(`📝 API endpoint: http://localhost:${PORT}/api/humanize`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
});


module.exports = app;
