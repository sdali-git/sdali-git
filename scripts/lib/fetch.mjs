import { createRequire } from 'node:module';

const UA = 'Mozilla/5.0 (compatible; ExamNestUpdater/1.0; exam-notification aggregator)';
const robotsCache = new Map();

async function fetchText(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: await res.text(), finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

// Minimal robots.txt check: honours Disallow rules for "User-agent: *".
export async function allowedByRobots(url) {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    let rules = [];
    try {
      const { text } = await fetchText(`${key}/robots.txt`, 10000);
      let applies = false;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim();
        const [k, ...rest] = line.split(':');
        const v = rest.join(':').trim();
        if (/^user-agent$/i.test(k)) applies = v === '*';
        else if (applies && /^disallow$/i.test(k) && v) rules.push(v);
      }
    } catch {
      rules = [];
    }
    robotsCache.set(key, rules);
  }
  const path = u.pathname + u.search;
  return !robotsCache.get(key).some((r) => path.startsWith(r.replace(/\*.*$/, '')));
}

export async function getHtml(url, { retries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchText(url);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

let browserPromise = null;
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    return null;
  }
}

export async function getRenderedHtml(url) {
  const pw = loadPlaywright();
  if (!pw) throw new Error('Playwright is not installed; cannot render JavaScript-only source');
  if (!browserPromise) browserPromise = pw.chromium.launch();
  const browser = await browserPromise;
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    return { text: await page.content(), finalUrl: page.url() };
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) (await browserPromise).close().catch(() => {});
}
