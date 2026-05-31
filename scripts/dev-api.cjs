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
  const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
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

  async function insertReview(record) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const payload = {
      resume_text: record.resume_text ?? null,
      result: record.result,
    };

    const { error } = await supabase.from('reviews').insert([payload]).select();
    if (error) throw error;
  }

  function normalizeScore(score) {
    if (typeof score !== 'number' || Number.isNaN(score)) return 0;
    if (score <= 10) return Math.round(score * 10);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function normalizeReviewResult(result) {
    if (!result || typeof result !== 'object') return result;
    const record = result;
    const categoryScores = record.categoryScores && typeof record.categoryScores === 'object' ? record.categoryScores : null;
    return {
      ...record,
      overallScore: normalizeScore(record.overallScore),
      categoryScores: categoryScores
        ? {
            clarity: normalizeScore(categoryScores.clarity),
            impact: normalizeScore(categoryScores.impact),
            atsCompatibility: normalizeScore(categoryScores.atsCompatibility),
            structure: normalizeScore(categoryScores.structure),
          }
        : record.categoryScores,
    };
  }

  const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      overallScore: { type: 'integer' },
      categoryScores: {
        type: 'object',
        properties: {
          clarity: { type: 'integer' },
          impact: { type: 'integer' },
          atsCompatibility: { type: 'integer' },
          structure: { type: 'integer' },
        },
        required: ['clarity', 'impact', 'atsCompatibility', 'structure'],
      },
      summary: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' } },
      weaknesses: { type: 'array', items: { type: 'string' } },
      rewrites: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            original: { type: 'string' },
            suggested: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['original', 'suggested', 'reason'],
        },
      },
      missingSections: { type: 'array', items: { type: 'string' } },
    },
    required: ['overallScore', 'categoryScores', 'summary', 'strengths', 'weaknesses', 'rewrites'],
  };

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
          systemInstruction: { parts: [{ text: 'You are a senior technical recruiter and resume coach. Review resumes critically but constructively.' }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Review this resume and respond ONLY with JSON matching the provided schema.\n\n--- RESUME START ---\n${trimmed}\n--- RESUME END ---` }],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0, maxOutputTokens: 4096 }
        })
      });

      if (!geminiRes.ok) {
        const txt = await geminiRes.text();
        console.error('Gemini responded with non-OK status:', geminiRes.status, txt.slice(0,2000));
        if (geminiRes.status === 429) {
          return res.status(429).json({
            error: "You've hit the Gemini free-tier limit. Try again later.",
          });
        }
        if (geminiRes.status === 400 || geminiRes.status === 403) {
          return res.status(geminiRes.status).json({
            error: 'Gemini rejected the request — check your API key.',
          });
        }
        return res.status(geminiRes.status).send(txt);
      }

      const data = await geminiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return res.status(502).json({ error: 'AI returned empty response.' });

      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        const parsed = normalizeReviewResult(JSON.parse(cleaned));
        try {
          await insertReview({ resume_text: trimmed, result: parsed });
        } catch (e) {
          console.error('dev-api supabase insert error:', e);
        }
        return res.status(200).json(parsed);
      } catch (e) {
        console.error('dev-api parse error:', e);
        return res.status(502).json({ error: 'AI returned malformed JSON.' });
      }
    } catch (err) {
      console.error('dev-api error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  app.post('/api/review/save', async (req, res) => {
    return res.status(404).json({ error: 'Not found.' });
  });

  const port = 3001;
  app.listen(port, () => console.log(`Dev API listening on http://localhost:${port}`));
}

start();
