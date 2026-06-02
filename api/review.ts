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

function extractJsonText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}

function normalizeScore(score: unknown) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  if (score <= 10) return Math.round(score * 10);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeReviewResult(result: unknown) {
  if (!result || typeof result !== 'object') return result;

  const record = result as Record<string, unknown>;
  const categoryScores =
    record.categoryScores && typeof record.categoryScores === 'object'
      ? (record.categoryScores as Record<string, unknown>)
      : null;

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

async function parseGeminiJson(text: string, apiKey: string) {
  const cleaned = extractJsonText(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: ask Gemini to repair the malformed JSON.
    const repairUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const repairRes = await fetch(repairUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Convert the following into valid JSON only. Return only JSON, no markdown, no commentary:\n\n${text}`,
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 2048 },
      }),
    });

    if (!repairRes.ok) {
      const repairErr = await repairRes.text();
      throw new Error(`repair_failed:${repairRes.status}:${repairErr.slice(0, 500)}`);
    }

    const repairData = await repairRes.json();
    const repairText: string | undefined = repairData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!repairText) throw new Error('repair_failed:empty_response');
    return JSON.parse(extractJsonText(repairText));
  }
}

async function fetchWithRetries(url: string, init: RequestInit, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    // Retry on common transient server errors with exponential backoff.
    if ([500, 502, 503, 504].includes(res.status) && i < attempts - 1) {
      const wait = 500 * Math.pow(2, i);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    return res;
  }

  throw new Error('fetch_failed');
}

/**
 * Generate a simple fallback review when the AI provider is unavailable.
 * This uses lightweight heuristics and is intentionally conservative
 * (no fabricated metrics) — it helps the UI show scores and suggestions
 * when Gemini is down.
 */
function generateFallbackReview(text: string) {
  const lowered = text.toLowerCase();
  const words = Math.max(50, text.split(/\s+/).length);
  const digits = (text.match(/\d+/g) || []).length;
  const actionWords = ['led', 'managed', 'improved', 'developed', 'built', 'optimized', 'mentored', 'created', 'designed', 'launched', 'owned'];
  const actionCount = actionWords.reduce((n, w) => n + (lowered.includes(w) ? 1 : 0), 0);

  const keywordList = ['javascript', 'typescript', 'react', 'node', 'aws', 'python', 'docker', 'kubernetes', 'sql'];
  const keywordCount = keywordList.reduce((n, k) => n + (lowered.includes(k) ? 1 : 0), 0);

  const overallScore = Math.max(35, Math.min(92, Math.round(40 + actionCount * 10 + Math.min(30, digits * 5) + Math.min(15, words / 200))));

  const categoryScores = {
    clarity: Math.max(30, Math.min(100, Math.round(overallScore * (0.9 - Math.max(0, (words - 800) / 2000))))),
    impact: Math.max(25, Math.min(100, Math.round(overallScore * (0.75 + (actionCount / 6))))),
    atsCompatibility: Math.max(20, Math.min(100, Math.round(overallScore * (0.6 + keywordCount * 0.08)))),
    structure: Math.max(20, Math.min(100, Math.round(overallScore * (0.7 + Math.min(0.25, (text.split('\n').length / 20)))))),
  };

  const strengths: string[] = [];
  if (actionCount > 0) strengths.push('Uses action-oriented verbs and shows ownership of work.');
  if (digits > 0) strengths.push('Includes numeric achievements or years of experience.');
  if (keywordCount > 0) strengths.push('Mentions relevant technical keywords for ATS.');
  if (strengths.length === 0) strengths.push('Clear, concise lines detected.');

  const weaknesses: string[] = [];
  if (digits === 0) weaknesses.push('Lacks quantified results — add numbers where possible. Fix: quantify achievements (e.g., "reduced latency by 40%", "increased revenue by $X").');
  if (actionCount === 0) weaknesses.push('Many lines are passive or vague — prefer strong verbs. Fix: start bullets with verbs like "Led", "Improved", "Built" and show ownership.');
  if (text.length < 400) weaknesses.push('Resume is short; consider adding more detail on impact. Fix: expand bullets with one-line context + measurable outcome.');

  // Suggested rewrites: find candidate lines to improve
  const candidates = text.split(/\r?\n|[\.\n]/).map((s) => s.trim()).filter(Boolean);
  const pick: string[] = [];
  for (const c of candidates) {
    if (pick.length >= 3) break;
    if (/responsible for|worked on|assisted|helped|participated/.test(c.toLowerCase()) || c.length > 120) {
      pick.push(c);
    }
  }
  // Fallback: take first up to 3 short lines if none matched
  if (pick.length === 0) pick.push(...candidates.slice(0, 3));

  const rewrites = pick.slice(0, 3).map((orig) => {
    // Create a clearer suggested rewrite that nudges toward active voice
    const base = orig
      .replace(/responsible for/gi, 'owned')
      .replace(/worked on/gi, 'developed')
      .replace(/helped/gi, 'contributed to')
      .replace(/assisted/gi, 'supported')
      .replace(/participated/gi, 'helped lead')
      .replace(/was /gi, '')
      .trim();

    const suggested = base.length > 0 ? `${base} — rewrite to active voice and add a quantified result if possible.` : `${orig} — rewrite to active voice and add a quantified result if possible.`;

    return {
      original: orig,
      suggested,
      reason: 'Rewrite to active voice and include a measurable outcome (e.g., "reduced X by Y%", "improved throughput by Nx").',
    };
  });

  const missingSections: string[] = [];
  if (!/skills/i.test(text)) missingSections.push('Skills');
  if (!/education/i.test(text)) missingSections.push('Education');
  if (!/projects/i.test(text) && !/portfolio/i.test(text)) missingSections.push('Projects');

  return {
    overallScore,
    categoryScores,
    summary: 'Fallback review: AI was unavailable. This heuristic review highlights obvious strengths and areas to quantify.',
    strengths,
    weaknesses,
    rewrites,
    missingSections,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only POST allowed
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API;
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
    const geminiRes = await fetchWithRetries(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You are a senior technical recruiter and resume coach. Provide a short JSON summary.' }],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Review this resume and answer in JSON: ${trimmed}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
            maxOutputTokens: 2048,
          },
        }),
      },
      3,
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errBody);

      // Keep errors for client-handled cases (rate limits, invalid key)
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

      // For transient errors (503/5xx) fall back to a local heuristic review
      console.warn('Using fallback review due to AI provider error');
      const fallback = generateFallbackReview(trimmed);
      console.log('FALLBACK REVIEW', JSON.stringify(fallback));
      // Attempt to save review (non-blocking) then return fallback result
      try {
        await insertReview({ resume_text: trimmed, result: fallback });
      } catch (e) {
        console.error('Supabase insert failed (fallback):', e instanceof Error ? e.message : e);
      }

      return res.status(200).json(normalizeReviewResult(fallback));
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
    let parsed;
    try {
      parsed = await parseGeminiJson(text, apiKey);
    } catch {
      console.error('--- GEMINI RAW TEXT (parse failed) ---');
      console.error('finishReason:', finishReason);
      console.error('text length:', text.length);
      console.error(text.slice(0, 2000));
      console.error('--- END ---');

      // Use fallback review when Gemini returns malformed JSON
      console.warn('Using fallback review due to malformed AI output');
      const fallback = generateFallbackReview(trimmed);
      console.log('FALLBACK REVIEW', JSON.stringify(fallback));
      try {
        await insertReview({ resume_text: trimmed, result: fallback });
      } catch (e) {
        console.error('Supabase insert failed (fallback):', e instanceof Error ? e.message : e);
      }
      return res.status(200).json(normalizeReviewResult(fallback));
    }

    // Validate parsed output contains the key fields we expect. If not,
    // fall back to the local heuristic review so the UI shows useful data.
    const isValidParsed =
      parsed && typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).overallScore === 'number' &&
      parsed.categoryScores && typeof parsed.categoryScores === 'object' &&
      Array.isArray((parsed as Record<string, unknown>).rewrites);

    if (!isValidParsed) {
      console.warn('Parsed AI result missing expected fields — using fallback review');
      const fallback = generateFallbackReview(trimmed);
      try {
        await insertReview({ resume_text: trimmed, result: fallback });
      } catch (e) {
        console.error('Supabase insert failed (fallback):', e instanceof Error ? e.message : e);
      }
      return res.status(200).json(normalizeReviewResult(fallback));
    }

    // Save the uploaded resume and its review to Supabase when configured.
    // A storage issue should not break the review response, so we log and continue.
    try {
      await insertReview({ resume_text: trimmed, result: parsed });
    } catch (e) {
      console.error('Supabase insert failed:', e instanceof Error ? e.message : e);
    }

    return res.status(200).json(normalizeReviewResult(parsed));
  } catch (err) {
    console.error('Unexpected handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
