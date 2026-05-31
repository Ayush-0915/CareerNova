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

async function main() {
  const env = loadEnv('.env');
  const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('No key');
    process.exit(2);
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const trimmed = 'Experienced software engineer with 8 years building web apps. Led API design, performance optimizations, CI/CD, mentoring, and cross-functional deliveries. Improved deploy time by 40%, increased test coverage, and shipped multiple high-impact features.';

  const payload = {
    systemInstruction: { parts: [{ text: 'You are a senior technical recruiter and resume coach. Provide a short JSON summary.' }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `Review this resume and answer in JSON: ${trimmed}` }],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 1024 },
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
