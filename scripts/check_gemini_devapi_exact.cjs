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
  for (const key in env) {
    process.env[key] = env[key];
  }
  const { llmService } = await import('../api/llmService.js');

  const trimmed = 'Experienced software engineer with 8 years building web apps. Led API design, performance optimizations, CI/CD, mentoring, and cross-functional deliveries. Improved deploy time by 40%, increased test coverage, and shipped multiple high-impact features.';

  try {
    const text = await llmService.generate([
      {
        role: 'system',
        content: 'You are a senior technical recruiter and resume coach. Provide a short JSON summary.',
      },
      {
        role: 'user',
        content: `Review this resume and answer in JSON: ${trimmed}`,
      },
    ], {
      temperature: 0.2,
      maxTokens: 1024,
      responseFormat: 'json',
    });

    console.log('Response body:');
    console.log(text);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
