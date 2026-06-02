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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
    out[m[1]] = v;
  }
  return out;
}

async function main(){
  const env = loadEnv('.env');
  const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_API;
  if (!key) { console.error('no key'); process.exit(2);} 
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const longResume = 'Experienced software engineer with 8 years building web apps. Led API design, performance optimizations, CI/CD, mentoring, and cross-functional deliveries. Improved deploy time by 40%, increased test coverage, and shipped multiple high-impact features.';
  const body = {
    systemInstruction: { parts: [{ text: 'You are a senior technical recruiter and resume coach. Give a short JSON summary.' }] },
    contents: [ { role: 'user', parts: [{ text: `Review this resume and return JSON: ${longResume}` }] } ],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 1024 }
  };
  try{
    const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
    console.log('status', res.status);
    const txt = await res.text();
    console.log(txt.slice(0,4000));
  }catch(e){console.error(e)}
}

main();
