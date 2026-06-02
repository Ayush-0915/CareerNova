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

async function main(){
  const env = loadEnv('.env');
  const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_API;
  if (!key) { console.error('no key'); process.exit(2);} 
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    systemInstruction: { parts: [{ text: 'You are a helpful assistant.' }] },
    contents: [ { role: 'user', parts: [{ text: 'Return a JSON object {"ok":true}'}] } ],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.0, maxOutputTokens: 128 }
  };
  try{
    const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
    console.log('status', res.status);
    const txt = await res.text();
    console.log(txt.slice(0,2000));
  }catch(e){console.error(e)}
}

main();
