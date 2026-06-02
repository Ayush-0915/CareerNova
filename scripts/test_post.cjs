async function test() {
  const body = { resumeText: 'Experienced software engineer with 5+ years building web applications. Led API design, performance optimizations.' };
  try {
    const endpoint = process.env.ENDPOINT || 'http://localhost:3000/api/review';
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log('status', res.status);
    const text = await res.text();
    console.log(text.slice(0, 2000));
  } catch (e) {
    console.error('request failed', e);
  }
}
test();
