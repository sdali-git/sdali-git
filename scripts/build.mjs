#!/usr/bin/env node
// Generates the static website into dist/ from site.config.json and data/*.
// Usage: node scripts/build.mjs   (BASE_PATH=/repo-name/ for GitHub Pages project sites)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPE_LABELS } from './lib/classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const read = async (p, fb) => {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8')); } catch { return fb; }
};

const config = await read('site.config.json', {});
const { categories, exams } = await read('data/exams.json', { categories: [], exams: [] });
const { sources } = await read('data/sources.json', { sources: [] });
const updates = await read('data/updates.json', { items: [] });
const status = await read('data/status.json', { sources: {} });
const subjectFiles = (await fs.readdir(path.join(ROOT, 'data/questions'))).filter((f) => f.endsWith('.json'));
const subjects = await Promise.all(subjectFiles.map((f) => read(`data/questions/${f}`)));
const subjectBySlug = Object.fromEntries(subjects.map((s) => [s.subject, s]));
const examBySlug = Object.fromEntries(exams.map((e) => [e.slug, e]));
const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

const BASE = (process.env.BASE_PATH || config.basePath || '/').replace(/\/?$/, '/');
const SITE = (process.env.SITE_URL || config.baseUrl || '').replace(/\/$/, '');
const u = (p = '') => BASE + p.replace(/^\//, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const lastRun = status.lastRun ? new Date(status.lastRun) : null;
const lastRunText = lastRun
  ? lastRun.toLocaleString('en-IN', { timeZone: config.timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'
  : 'not yet run';
const items = updates.items || [];
const pages = [];

const LOGO = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--primary)"/><path d="M7 10.5c3-1.4 6-1.2 9 .8v12c-3-2-6-2.2-9-.8z" fill="#fff"/><path d="M25 10.5c-3-1.4-6-1.2-9 .8v12c3-2 6-2.2 9-.8z" fill="#fff" opacity=".78"/><circle cx="24" cy="7.5" r="2.6" fill="var(--accent)"/></svg>`;

function layout({ title, description, body, path: pagePath, active = '' }) {
  const fullTitle = title ? `${title} | ${config.name}` : `${config.name} | ${config.tagline}`;
  const t = config.theme || {};
  const nav = [
    ['latest', 'Latest Updates'],
    ['exams', 'Exams'],
    ['papers', 'Papers & Keys'],
    ['practice', 'Practice'],
    ['mock', 'Mock Tests']
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || config.description)}">
<meta name="theme-color" content="${esc(t.primary)}">
${SITE ? `<link rel="canonical" href="${esc(SITE + u(pagePath))}">` : ''}
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || config.description)}">
<meta property="og:site_name" content="${esc(config.name)}">
<link rel="icon" href="${u('assets/icon.svg')}" type="image/svg+xml">
<link rel="manifest" href="${u('manifest.webmanifest')}">
<style>:root{--primary:${t.primary};--primary-strong:${t.primaryStrong};--primary-soft:${t.primarySoft};--accent:${t.accent}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--primary:${t.darkPrimary};--primary-strong:${t.darkPrimary};--primary-soft:${t.darkPrimarySoft}}}
:root[data-theme="dark"]{--primary:${t.darkPrimary};--primary-strong:${t.darkPrimary};--primary-soft:${t.darkPrimarySoft}}</style>
<link rel="stylesheet" href="${u('assets/style.css')}">
<script>try{var th=localStorage.getItem('theme');if(th)document.documentElement.dataset.theme=th}catch(e){}window.BASE=${JSON.stringify(BASE)};</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="${u()}">${LOGO}<span>${esc(config.name)}</span></a>
    <button class="icon-btn menu-btn" aria-label="Menu" aria-expanded="false" data-menu>☰</button>
    <nav class="main-nav" data-nav>
      ${nav.map(([p, l]) => `<a href="${u(p + '/')}"${active === p ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
      <a href="${u('progress/')}"${active === 'progress' ? ' aria-current="page"' : ''}>My Progress</a>
    </nav>
    <button class="icon-btn" aria-label="Toggle dark mode" data-theme-toggle>◐</button>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <a class="brand" href="${u()}">${LOGO}<span>${esc(config.name)}</span></a>
      <p class="muted small">${esc(config.tagline)}.</p>
      <p class="muted small">Updates are collected automatically from official websites ${esc(config.updateSchedule)}. Last checked: ${esc(lastRunText)}.</p>
    </div>
    <div><h4>Explore</h4>${categories.map((c) => `<a href="${u(`category/${c.slug}/`)}">${esc(c.name)}</a>`).join('')}</div>
    <div><h4>Prepare</h4><a href="${u('practice/')}">Practice questions</a><a href="${u('mock/')}">Mock tests</a><a href="${u('papers/')}">Previous year papers</a><a href="${u('progress/')}">My progress</a></div>
    <div><h4>About</h4><a href="${u('about/')}">About us</a><a href="${u('sources/')}">Sources & update status</a><a href="${u('disclaimer/')}">Disclaimer</a></div>
  </div>
  <div class="wrap muted small footer-bottom">© ${new Date().getFullYear()} ${esc(config.name)}. Not affiliated with any government body or exam conducting authority. Always confirm details on the official website.</div>
</footer>
<script src="${u('assets/app.js')}" defer></script>
</body>
</html>`;
}

const page = (p, opts) => pages.push({ path: p, html: layout({ ...opts, path: p }) });

const badge = (type) => `<span class="badge badge-${esc(type)}">${esc(TYPE_LABELS[type] || 'Update')}</span>`;
const isNew = (i) => !i.seed && (Date.now() - new Date(i.date || i.firstSeen).getTime()) / 864e5 <= 4;

function updateRow(i, { showExam = true } = {}) {
  const examLinks = showExam && i.exams?.length
    ? i.exams.map((s) => examBySlug[s] && `<a class="chip" href="${u(`exams/${s}/`)}">${esc(examBySlug[s].name)}</a>`).filter(Boolean).join('')
    : '';
  return `<li class="update" data-type="${esc(i.type)}" data-cat="${esc(i.category)}">
  <div class="update-meta">${badge(i.type)}${isNew(i) ? '<span class="badge badge-new">New</span>' : ''}<span class="muted small">${esc(fmtDate(i.date) || (i.seed ? '' : 'Added ' + fmtDate(i.firstSeen)))}</span></div>
  <a class="update-title" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>
  <div class="update-foot"><span class="muted small">Source: ${esc(i.sourceName)}</span>${examLinks}</div>
</li>`;
}

const examCard = (e) => `<a class="card exam-card" href="${u(`exams/${e.slug}/`)}">
  <strong>${esc(e.name)}</strong><span class="muted small">${esc(e.body)}</span>
  <span class="small count">${items.filter((i) => i.exams.includes(e.slug)).length} updates</span></a>`;

const emptyNote = `<p class="empty">No updates collected yet. They appear here after the next automatic check (${esc(config.updateSchedule)}).</p>`;

// ---------- Home ----------
const latestTop = items.slice(0, 12);
const typeCounts = Object.fromEntries(Object.keys(TYPE_LABELS).map((t) => [t, items.filter((i) => i.type === t).length]));
page('', {
  active: '',
  body: `
<section class="hero">
  <div class="wrap">
    <h1>Every exam update in one place</h1>
    <p class="lead">${esc(config.description)}</p>
    <form class="search" action="${u('search/')}" role="search">
      <input name="q" type="search" placeholder="Search an exam, e.g. SSC CGL, IBPS PO, NEET…" aria-label="Search" autocomplete="off">
      <button class="btn">Search</button>
    </form>
    <div class="stats">
      <div><strong>${items.length}</strong><span>official updates</span></div>
      <div><strong>${exams.length}</strong><span>exams tracked</span></div>
      <div><strong>${sources.length}</strong><span>official sources</span></div>
      <div><strong>${subjects.reduce((n, s) => n + s.questions.length, 0)}</strong><span>practice questions</span></div>
    </div>
    <p class="muted small">Auto-updated ${esc(config.updateSchedule)} · Last checked ${esc(lastRunText)}</p>
  </div>
</section>
<section class="wrap section">
  <div class="quick-types">
    ${['notification', 'admit-card', 'result', 'answer-key', 'schedule', 'syllabus'].map((t) => `<a class="type-tile" href="${u(`latest/?type=${t}`)}">${badge(t)}<strong>${typeCounts[t] || 0}</strong></a>`).join('')}
  </div>
</section>
<section class="wrap section two-col">
  <div>
    <div class="section-head"><h2>Latest updates</h2><a href="${u('latest/')}">View all →</a></div>
    ${latestTop.length ? `<ul class="updates">${latestTop.map((i) => updateRow(i)).join('')}</ul>` : emptyNote}
  </div>
  <aside>
    <div class="card">
      <h3>Practice by subject</h3>
      ${subjects.map((s) => `<a class="list-link" href="${u(`practice/${s.subject}/`)}">${esc(s.name)} <span class="muted small">${s.questions.length} Qs</span></a>`).join('')}
    </div>
    <div class="card accent-card">
      <h3>Take a free mock test</h3>
      <p class="small">Timed, with negative marking, scoring and a full solution review.</p>
      <a class="btn" href="${u('mock/')}">Start a mock test</a>
    </div>
  </aside>
</section>
<section class="wrap section">
  <h2>Browse by category</h2>
  <div class="grid cats">
    ${categories.map((c) => `<a class="card cat-card" href="${u(`category/${c.slug}/`)}"><span class="cat-icon">${c.icon}</span><strong>${esc(c.name)}</strong><span class="muted small">${esc(c.blurb)}</span></a>`).join('')}
  </div>
</section>
<section class="wrap section">
  <h2>Popular exams</h2>
  <div class="grid exams-grid">${exams.slice(0, 16).map(examCard).join('')}</div>
</section>`
});

// ---------- Latest ----------
page('latest/', {
  title: 'Latest Exam Notifications, Admit Cards & Results',
  description: 'Latest exam notifications, admit cards, results, answer keys and exam dates collected from official websites.',
  active: 'latest',
  body: `
<section class="wrap section">
  <h1>Latest updates</h1>
  <p class="muted">Collected from ${sources.length} official websites. Last checked ${esc(lastRunText)}. Every link opens the official source.</p>
  <div class="filters" data-filters>
    <input type="search" placeholder="Filter by keyword…" data-filter-q aria-label="Filter by keyword">
    <select data-filter-cat aria-label="Category"><option value="">All categories</option>${categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select>
    <div class="chips" data-filter-type>
      <button class="chip active" data-type="">All</button>
      ${Object.entries(TYPE_LABELS).map(([k, v]) => `<button class="chip" data-type="${k}">${v}</button>`).join('')}
    </div>
  </div>
  ${items.length ? `<ul class="updates" data-filter-list>${items.map((i) => updateRow(i)).join('')}</ul><p class="empty" data-filter-empty hidden>No updates match these filters.</p>` : emptyNote}
</section>`
});

// ---------- Exams index & categories ----------
page('exams/', {
  title: 'All Exams',
  description: 'All banking, SSC, railway, UPSC, teaching and entrance exams tracked on ' + config.name + '.',
  active: 'exams',
  body: `<section class="wrap section"><h1>All exams</h1>
  ${categories.map((c) => `<h2 class="cat-title"><span>${c.icon}</span> ${esc(c.name)}</h2><div class="grid exams-grid">${exams.filter((e) => e.category === c.slug).map(examCard).join('')}</div>`).join('')}
  </section>`
});

for (const c of categories) {
  const catItems = items.filter((i) => i.category === c.slug);
  page(`category/${c.slug}/`, {
    title: `${c.name} Exams: Notifications, Results & Practice`,
    description: c.blurb,
    active: 'exams',
    body: `<section class="wrap section">
  <nav class="crumbs"><a href="${u()}">Home</a> › <a href="${u('exams/')}">Exams</a> › ${esc(c.name)}</nav>
  <h1>${c.icon} ${esc(c.name)}</h1><p class="lead">${esc(c.blurb)}</p>
  <div class="grid exams-grid">${exams.filter((e) => e.category === c.slug).map(examCard).join('')}</div>
  <div class="section-head"><h2>Latest ${esc(c.name)} updates</h2></div>
  ${catItems.length ? `<ul class="updates">${catItems.slice(0, 60).map((i) => updateRow(i)).join('')}</ul>` : emptyNote}
</section>`
  });
}

// ---------- Exam pages ----------
for (const e of exams) {
  const exItems = items.filter((i) => i.exams.includes(e.slug));
  const keys = exItems.filter((i) => ['answer-key', 'paper', 'result'].includes(i.type));
  const cat = catBySlug[e.category];
  const subs = e.subjects.map((s) => subjectBySlug[s]).filter(Boolean);
  page(`exams/${e.slug}/`, {
    title: `${e.name}: Notification, Admit Card, Result, Papers & Mock Test`,
    description: `${e.full}: latest official updates, previous year paper links, answer keys, practice questions and free mock test.`,
    active: 'exams',
    body: `<section class="wrap section">
  <nav class="crumbs"><a href="${u()}">Home</a> › <a href="${u(`category/${cat.slug}/`)}">${esc(cat.name)}</a> › ${esc(e.name)}</nav>
  <div class="exam-head">
    <div><h1>${esc(e.name)}</h1><p class="lead">${esc(e.full)}</p><p>${esc(e.about)}</p></div>
    <div class="exam-actions">
      <a class="btn" href="${u(`mock/?exam=${e.slug}`)}">Take free mock test</a>
      <a class="btn btn-ghost" href="${esc(e.officialUrl)}" target="_blank" rel="noopener">Official website ↗</a>
    </div>
  </div>
  <div class="two-col">
    <div>
      <h2>Latest ${esc(e.name)} updates</h2>
      ${exItems.length ? `<ul class="updates">${exItems.slice(0, 40).map((i) => updateRow(i, { showExam: false })).join('')}</ul>` : `<p class="empty">No ${esc(e.name)} updates found on the official site yet. New notices show up automatically after each check.</p>`}
      <h2>Previous year papers, answer keys & results</h2>
      ${keys.length ? `<ul class="updates">${keys.slice(0, 20).map((i) => updateRow(i, { showExam: false })).join('')}</ul>` : ''}
      <p><a href="${esc(e.papersUrl || e.officialUrl)}" target="_blank" rel="noopener">Open the official ${esc(e.body)} archive for past papers ↗</a></p>
    </div>
    <aside>
      <div class="card"><h3>Exam at a glance</h3>
        <dl class="facts"><dt>Conducted by</dt><dd>${esc(e.body)}</dd><dt>Category</dt><dd>${esc(cat.name)}</dd><dt>Stages</dt><dd><ol>${e.stages.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></dd></dl>
      </div>
      <div class="card"><h3>Practice for ${esc(e.name)}</h3>
        ${subs.map((s) => `<a class="list-link" href="${u(`practice/${s.subject}/`)}">${esc(s.name)} <span class="muted small">${s.questions.length} Qs</span></a>`).join('')}
      </div>
    </aside>
  </div>
</section>`
  });
}

// ---------- Papers ----------
const paperItems = items.filter((i) => ['answer-key', 'paper'].includes(i.type));
page('papers/', {
  title: 'Previous Year Question Papers & Answer Keys',
  description: 'Official previous year question papers and answer keys for banking, SSC, railway, UPSC, teaching and entrance exams.',
  active: 'papers',
  body: `<section class="wrap section">
  <h1>Previous year papers & answer keys</h1>
  <p class="muted">Papers and answer keys link straight to the official copies published by each exam body.</p>
  <div class="section-head"><h2>Recently published answer keys & papers</h2></div>
  ${paperItems.length ? `<ul class="updates">${paperItems.slice(0, 40).map((i) => updateRow(i)).join('')}</ul>` : emptyNote}
  <h2>Official archives by exam</h2>
  <div class="table-wrap"><table class="table"><thead><tr><th>Exam</th><th>Conducted by</th><th>Official archive</th></tr></thead><tbody>
  ${exams.map((e) => `<tr><td><a href="${u(`exams/${e.slug}/`)}">${esc(e.name)}</a></td><td>${esc(e.body)}</td><td><a href="${esc(e.papersUrl || e.officialUrl)}" target="_blank" rel="noopener">Open ↗</a></td></tr>`).join('')}
  </tbody></table></div>
</section>`
});

// ---------- Practice ----------
page('practice/', {
  title: 'Free Practice Questions with Explanations',
  description: 'Free practice questions with worked explanations for quantitative aptitude, reasoning, English and general awareness.',
  active: 'practice',
  body: `<section class="wrap section"><h1>Practice questions</h1>
  <p class="muted">Answer one question at a time and see the worked explanation straight away. Your scores are saved on this device.</p>
  <div class="grid cats">${subjects.map((s) => {
    const topics = [...new Set(s.questions.map((q) => q.topic))];
    return `<a class="card cat-card" href="${u(`practice/${s.subject}/`)}"><strong>${esc(s.name)}</strong><span class="muted small">${s.questions.length} questions · ${topics.length} topics</span><span class="small">${esc(topics.slice(0, 5).join(', '))}${topics.length > 5 ? '…' : ''}</span></a>`;
  }).join('')}</div></section>`
});
for (const s of subjects) {
  page(`practice/${s.subject}/`, {
    title: `${s.name} Practice Questions`,
    description: `${s.questions.length} ${s.name} practice questions with explanations.`,
    active: 'practice',
    body: `<section class="wrap section narrow">
  <nav class="crumbs"><a href="${u()}">Home</a> › <a href="${u('practice/')}">Practice</a> › ${esc(s.name)}</nav>
  <h1>${esc(s.name)}</h1>
  <div class="quiz" data-quiz="practice" data-subject="${esc(s.subject)}"><p class="muted">Loading questions…</p></div>
</section>`
  });
}

// ---------- Mock ----------
page('mock/', {
  title: 'Free Online Mock Tests',
  description: 'Free timed mock tests with negative marking, instant scores and detailed solutions.',
  active: 'mock',
  body: `<section class="wrap section narrow">
  <h1>Mock tests</h1>
  <div class="quiz" data-quiz="mock" data-exams='${esc(JSON.stringify(exams.map((e) => ({ slug: e.slug, name: e.name, subjects: e.subjects }))))}'>
    <p class="muted">Loading…</p>
  </div>
</section>`
});

// ---------- Progress, search, static pages ----------
page('progress/', {
  title: 'My Progress',
  active: 'progress',
  body: `<section class="wrap section narrow"><h1>My progress</h1><p class="muted">Saved in this browser only. Nothing is sent to a server.</p><div data-progress></div></section>`
});
page('search/', {
  title: 'Search',
  body: `<section class="wrap section"><h1>Search</h1>
  <form class="search" role="search"><input name="q" type="search" placeholder="Search exams and updates…" data-search-input aria-label="Search"><button class="btn">Search</button></form>
  <div data-search-results></div>
  <script type="application/json" id="search-data">${JSON.stringify({
    exams: exams.map((e) => ({ slug: e.slug, name: e.name, full: e.full, body: e.body })),
    items: items.slice(0, 1000).map((i) => ({ t: i.title, u: i.url, ty: i.type, d: i.date, s: i.sourceName }))
  }).replace(/</g, '\\u003c')}</script>
</section>`
});

const srcRows = sources.map((s) => {
  const st = status.sources?.[s.id];
  const state = !st ? '<span class="badge">Pending</span>' : st.ok ? '<span class="badge badge-result">OK</span>' : `<span class="badge badge-error" title="${esc(st.error)}">Failed</span>`;
  return `<tr><td>${esc(s.name)}</td><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(new URL(s.url).host)}</a></td><td>${state}</td><td>${st?.ok ? st.found : '–'}</td><td class="small muted">${st && !st.ok ? esc(st.error) : ''}</td></tr>`;
}).join('');
page('sources/', {
  title: 'Sources & Update Status',
  body: `<section class="wrap section"><h1>Sources & update status</h1>
  <p>${esc(config.name)} checks these official websites automatically ${esc(config.updateSchedule)}. Last run: <strong>${esc(lastRunText)}</strong>.</p>
  <div class="table-wrap"><table class="table"><thead><tr><th>Source</th><th>Website</th><th>Last check</th><th>Links found</th><th>Note</th></tr></thead><tbody>${srcRows}</tbody></table></div>
  <p class="muted small">If a website is down or blocks the check, its earlier updates stay listed and it is tried again on the next run.</p></section>`
});
page('about/', {
  title: 'About',
  body: `<section class="wrap section narrow prose"><h1>About ${esc(config.name)}</h1>
  <p>${esc(config.name)} brings together exam notifications, admit cards, results, answer keys and exam dates from official exam-body websites, so you don't have to check a dozen sites every day.</p>
  <p>The list is refreshed automatically ${esc(config.updateSchedule)}. Every update links to the original notice on the official website.</p>
  <p>Our practice questions and mock tests are written by our own team and come with worked explanations.</p></section>`
});
page('disclaimer/', {
  title: 'Disclaimer',
  body: `<section class="wrap section narrow prose"><h1>Disclaimer</h1>
  <p>${esc(config.name)} is an independent information service. It is not affiliated with, endorsed by or connected to any government department, recruitment board, commission, bank or exam-conducting body.</p>
  <p>Updates are collected automatically from public official websites and may be incomplete, delayed or mis-categorised. Always read the original notice on the official website before you apply or act on it.</p>
  <p>All trademarks and exam names belong to their respective owners.</p></section>`
});
pages.push({ path: '404.html', html: layout({ title: 'Page not found', path: '404.html', body: `<section class="wrap section narrow"><h1>Page not found</h1><p><a class="btn" href="${u()}">Go to home page</a></p></section>` }) });

// ---------- Write ----------
await fs.rm(DIST, { recursive: true, force: true });
for (const p of pages) {
  const file = path.join(DIST, p.path.endsWith('.html') ? p.path : path.join(p.path, 'index.html'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, p.html);
}
await fs.cp(path.join(ROOT, 'src/assets'), path.join(DIST, 'assets'), { recursive: true });
await fs.mkdir(path.join(DIST, 'data/questions'), { recursive: true });
for (const s of subjects) await fs.writeFile(path.join(DIST, `data/questions/${s.subject}.json`), JSON.stringify(s));
await fs.writeFile(path.join(DIST, 'data/updates.json'), JSON.stringify(updates));

const t = config.theme || {};
await fs.writeFile(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: config.name, short_name: config.name, description: config.description,
  start_url: BASE, scope: BASE, display: 'standalone', background_color: '#ffffff', theme_color: t.primary,
  icons: [{ src: `${BASE}assets/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
}, null, 2));
const sw = (await fs.readFile(path.join(ROOT, 'src/sw.js'), 'utf8')).replace('__VERSION__', Date.now().toString(36)).replace(/__BASE__/g, BASE);
await fs.writeFile(path.join(DIST, 'sw.js'), sw);
await fs.writeFile(path.join(DIST, '.nojekyll'), '');
await fs.writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n${SITE ? `Sitemap: ${SITE}${BASE}sitemap.xml\n` : ''}`);
if (SITE) {
  const urls = pages.filter((p) => !p.path.endsWith('.html') && p.path !== 'search/' && p.path !== 'progress/').map((p) => `<url><loc>${SITE}${u(p.path)}</loc></url>`).join('');
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
}
console.log(`Built ${pages.length} pages into dist/ (base ${BASE})`);
