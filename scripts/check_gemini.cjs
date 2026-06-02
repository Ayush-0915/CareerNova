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

async function main() {
  const env = loadEnv('.env');
  const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_API;
  if (!key) {
    console.error('No GEMINI_API_KEY found in .env or environment.');
    process.exitCode = 2;
    return;
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'You are a helpful assistant.' }] },
        contents: [ { role: 'user', parts: [{ text: 'Say "hello" in one word.' }] } ],
        generationConfig: { temperature: 0.0, maxOutputTokens: 32, responseMimeType: 'text/plain' }
      })
    });

    console.log('Gemini API status:', resp.status, resp.statusText);
    const text = await resp.text();
    console.log('--- Response body ---');
    console.log(text.slice(0, 2000));
    console.log('--- End ---');
    if (!resp.ok) process.exitCode = 3;
  } catch (err) {
    console.error('Request failed:', err && err.message ? err.message : err);
    process.exitCode = 4;
  }
}

main();
