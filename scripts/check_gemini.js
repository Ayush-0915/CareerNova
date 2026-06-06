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
    // strip surrounding quotes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function main() {
  const env = loadEnv('.env');
  for (const key in env) {
    process.env[key] = env[key];
  }
  const { llmService } = await import('../api/llmService.js');

  try {
    const text = await llmService.generate([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say "hello" in one word.' }
    ], {
      temperature: 0.0,
      maxTokens: 32
    });

    console.log('--- Response body ---');
    console.log(text);
    console.log('--- End ---');
  } catch (err) {
    console.error('Request failed:', err && err.message ? err.message : err);
    process.exitCode = 4;
  }
}

main();
