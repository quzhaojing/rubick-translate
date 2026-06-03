/**
 * 本地引擎连通性测试（不依赖 Rubick UI）
 */
const TIMEOUT = 15000;

function isChinese(text) {
  return /[\u3400-\u9FBF]/.test(text);
}

async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

async function testGoogle(text) {
  const sl = 'auto';
  const tl = isChinese(text) ? 'en' : 'zh-CN';
  const params = new URLSearchParams({ client: 'gtx', sl, tl, dt: 't', q: text });
  const url = `https://translate.googleapis.com/translate_a/single?${params}`;
  const res = await withTimeout(fetch(url), TIMEOUT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const translated = (data?.[0] || []).map((s) => s?.[0] || '').join('');
  if (!translated) throw new Error('empty result');
  return translated;
}

async function testBing(text) {
  const authRes = await withTimeout(
    fetch('https://edge.microsoft.com/translate/auth', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      }
    }),
    TIMEOUT
  );
  if (!authRes.ok) throw new Error(`auth HTTP ${authRes.status}`);
  const token = await authRes.text();
  const to = isChinese(text) ? 'en' : 'zh-Hans';
  const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${to}`;
  const res = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ Text: text }])
    }),
    TIMEOUT
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const translated = data?.[0]?.translations?.[0]?.text;
  if (!translated) throw new Error('empty result');
  return translated;
}

const text = 'Hello, Rubick translate plugin!';
const engines = [
  ['Google', testGoogle],
  ['Bing/微软', testBing]
];

console.log(`测试文本: ${text}\n`);

for (const [name, fn] of engines) {
  const start = Date.now();
  try {
    const result = await fn(text);
    console.log(`✓ ${name} (${Date.now() - start}ms)`);
    console.log(`  → ${result}\n`);
  } catch (e) {
    console.log(`✗ ${name} (${Date.now() - start}ms)`);
    console.log(`  → ${e.message}\n`);
  }
}
