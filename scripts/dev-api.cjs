const express = require('express');
const fs = require('fs');

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  const src = fs.readFileSync(path, 'utf8');
  const lines = src.split(/\r?\n/);
  const out = {};
  for (const l of lines) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function start() {
  const env = loadEnv('.env');
  const GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.warn('Warning: GEMINI_API_KEY not set in .env; endpoint will return 500.');
  } else {
    const len = GEMINI_API_KEY.length;
    const prefix = GEMINI_API_KEY.slice(0, 4);
    const suffix = GEMINI_API_KEY.slice(-4);
    console.log(`GEMINI_API_KEY present (length=${len}, prefix=${prefix}..., suffix=...${suffix})`);
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/review', async (req, res) => {
    try {
      const { resumeText } = req.body || {};
      if (typeof resumeText !== 'string') return res.status(400).json({ error: 'Field `resumeText` (string) is required.' });
      const trimmed = resumeText.trim();
      if (trimmed.length < 100) return res.status(400).json({ error: 'Resume text is too short — please paste at least 100 characters.' });

      const model = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'You are a senior technical recruiter and resume coach. Provide a short JSON summary.' }] },
          contents: [ { role: 'user', parts: [{ text: `Review this resume and answer in JSON: ${trimmed}` }] } ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 1024 }
        })
      });

      if (!geminiRes.ok) {
        const txt = await geminiRes.text();
        console.error('Gemini responded with non-OK status:', geminiRes.status, txt.slice(0,2000));
        return res.status(geminiRes.status).send(txt);
      }

      const data = await geminiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return res.status(502).json({ error: 'AI returned empty response.' });

      // Try to parse cleaned JSON string
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        return res.status(200).json(parsed);
      } catch (e) {
        return res.status(502).json({ error: 'AI returned malformed JSON.' });
      }
    } catch (err) {
      console.error('dev-api error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  const port = 3001;
  app.listen(port, () => console.log(`Dev API listening on http://localhost:${port}`));
}

start();
