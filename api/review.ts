import type { VercelRequest, VercelResponse } from '@vercel/node';
import { insertReview } from './supabaseClient';

/**
 * Gemini structured-output schema. Gemini will return JSON that conforms
 * to this shape — no fragile string parsing required.
 */
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
    summary: {
      type: 'string',
      description: 'One-sentence holistic verdict on the resume (max 30 words).',
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Two to four concrete things the candidate did well. Reference specifics.',
    },
    weaknesses: {
      type: 'array',
      items: { type: 'string' },
      description: 'Two to four concrete weaknesses with one-line rationale each.',
    },
    rewrites: {
      type: 'array',
      description: 'Exactly three weakest bullet points and rewrite each.',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string', description: 'Bullet copied verbatim.' },
          suggested: { type: 'string', description: 'Stronger rewrite — quantified, active voice.' },
          reason: { type: 'string', description: 'One short sentence on why the rewrite is better.' },
        },
        required: ['original', 'suggested', 'reason'],
      },
    },
    missingSections: {
      type: 'array',
      items: { type: 'string' },
      description: 'Standard sections (e.g. Skills, Projects, Education) that appear to be missing.',
    },
  },
  required: ['overallScore', 'categoryScores', 'summary', 'strengths', 'weaknesses', 'rewrites'],
};

const SYSTEM_INSTRUCTIONS = `You are a senior technical recruiter and resume coach. You review resumes critically but constructively, prioritising:
- IMPACT: Are achievements quantified (numbers, %, $, time saved)?
- CLARITY: Is each line concise, jargon-free, and action-oriented?
- ATS COMPATIBILITY: Are job-relevant keywords present? Is formatting machine-readable?
- STRUCTURE: Are sections logical, prioritised, well-spaced?

Score harshly. A 70 is "decent, would shortlist with reservations". A 90+ is rare. Be honest, not sycophantic.
For rewrites, pick the THREE WEAKEST bullets and rewrite each in a single, punchy line with a quantified result.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only POST allowed
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        'Server misconfigured: GEMINI_API_KEY environment variable not set. ' +
        'Set it in Vercel project settings, or in a local .env file when using `vercel dev`.',
    });
  }

  // Vercel auto-parses JSON bodies into req.body
  const { resumeText } = (req.body ?? {}) as { resumeText?: unknown };

  if (typeof resumeText !== 'string') {
    return res.status(400).json({ error: 'Field `resumeText` (string) is required.' });
  }

  const trimmed = resumeText.trim();
  if (trimmed.length < 100) {
    return res.status(400).json({
      error: 'Resume text is too short — please paste at least 100 characters.',
    });
  }
  if (trimmed.length > 30_000) {
    return res.status(400).json({
      error: 'Resume text is too long (max 30,000 characters). Trim and try again.',
    });
  }

  // Model: gemini-2.5-flash — on the free tier (no credit card), 250 RPD as of 2026.
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Review this resume and respond ONLY with JSON matching the provided schema.\n\n--- RESUME START ---\n${trimmed}\n--- RESUME END ---`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errBody);

      // Map common upstream errors to friendlier messages
      if (geminiRes.status === 429) {
        return res.status(429).json({
          error: "Hit Gemini's free-tier rate limit. Wait a minute and try again.",
        });
      }
      if (geminiRes.status === 400 || geminiRes.status === 403) {
        return res.status(geminiRes.status).json({
          error: 'Gemini rejected the request — likely an invalid API key. Check GEMINI_API_KEY.',
        });
      }
      return res.status(502).json({ error: 'AI provider failed. Try again in a moment.' });
    }

    const data = await geminiRes.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason: string | undefined = data?.candidates?.[0]?.finishReason;

    if (!text) {
      return res.status(502).json({
        error: `AI returned an empty response${finishReason ? ` (${finishReason})` : ''}. Try again.`,
      });
    }

    // Some Gemini responses wrap JSON in ```json ... ``` even with responseMimeType set.
    // Strip these defensively before parsing.
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('--- GEMINI RAW TEXT (parse failed) ---');
      console.error('finishReason:', finishReason);
      console.error('text length:', text.length);
      console.error(text.slice(0, 2000));
      console.error('--- END ---');
      return res.status(502).json({
        error: `AI returned malformed JSON${finishReason === 'MAX_TOKENS' ? ' (response was truncated — too long).' : '.'} Try again.`,
      });
    }

    // Attempt to save the review to Supabase if configured (non-blocking for the client).
    (async () => {
      try {
        await insertReview({ resume_text: trimmed, result: parsed });
      } catch (e) {
        // Log but do not fail the request if Supabase isn't configured or insert fails.
        console.error('Supabase insert failed:', e instanceof Error ? e.message : e);
      }
    })();

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Unexpected handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
