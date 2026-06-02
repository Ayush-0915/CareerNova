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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
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

const SYSTEM_INSTRUCTIONS = `You are a senior technical recruiter and resume coach. You review resumes critically but constructively, prioritising:
- IMPACT: Are achievements quantified (numbers, %, $, time saved)?
- CLARITY: Is each line concise, jargon-free, and action-oriented?
- ATS COMPATIBILITY: Are job-relevant keywords present? Is formatting machine-readable?
- STRUCTURE: Are sections logical, prioritised, well-spaced?

Score harshly. A 70 is "decent, would shortlist with reservations". A 90+ is rare. Be honest, not sycophantic.
For rewrites, pick the THREE WEAKEST bullets and rewrite each in a single, punchy line with a quantified result.`;

async function main() {
  const env = loadEnv('.env');
  const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_API;
  if (!key) {
    console.error('No key');
    process.exit(2);
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const trimmed = 'Experienced software engineer with 8 years building web apps. Led API design, performance optimizations, CI/CD, mentoring, and cross-functional deliveries. Improved deploy time by 40%, increased test coverage, and shipped multiple high-impact features.';

  const payload = {
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
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  console.log('status', res.status);
  const text = await res.text();
  console.log(text.slice(0, 4000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
