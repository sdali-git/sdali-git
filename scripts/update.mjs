#!/usr/bin/env node
// Pulls the latest exam notifications, admit cards, results, answer keys and
// exam dates from the official sources listed in data/sources.json and merges
// them into data/updates.json. Safe to run repeatedly: existing items are kept,
// failures of one source never wipe its earlier items.
//
// Usage: node scripts/update.mjs [--only=ibps,nta] [--dry-run]

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getHtml, getRenderedHtml, closeBrowser, allowedByRobots } from './lib/fetch.mjs';
import { extractLinks, extractRows, extractRss } from './lib/extract.mjs';
import { isRelevant, EXCLUDE, classifyType, extractDate, dateFromUrl, matchExams } from './lib/classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (p, data) => fs.writeFile(path.join(ROOT, p), JSON.stringify(data, null, 2) + '\n');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const config = await readJson('site.config.json', {});
const { exams } = await readJson('data/exams.json', { exams: [] });
const { sources } = await readJson('data/sources.json', { sources: [] });
const existing = await readJson('data/updates.json', { items: [] });
const examBySlug = Object.fromEntries(exams.map((e) => [e.slug, e]));

const only = args.only ? String(args.only).split(',') : null;
const todo = sources.filter((s) => !only || only.includes(s.id));
const now = new Date();
const today = now.toISOString().slice(0, 10);

const cutoff = new Date(now.getTime() - (config.keepDays || 180) * 864e5).toISOString().slice(0, 10);
const items = new Map(existing.items.map((i) => [i.id, i]));
// Sources we have read before. Undated links found on a source's very first run
// are its back catalogue, not news, so they are flagged and sorted last.
const knownSources = new Set(existing.items.map((i) => i.source));
const status = { lastRun: now.toISOString(), sources: {} };

async function scrape(source) {
  if (!(await allowedByRobots(source.url))) throw new Error('Disallowed by robots.txt');
  const { text, finalUrl } =
    source.mode === 'browser' ? await getRenderedHtml(source.url) : await getHtml(source.url);
  const raw = source.rows
    ? extractRows(text, finalUrl, source.rows)
    : source.mode === 'rss' ? extractRss(text, finalUrl) : extractLinks(text, finalUrl);
  const relevant = (l) => (source.rows ? l.title.length >= 12 && !EXCLUDE.test(l.title) : isRelevant(l.title, l.url));
  const sid = source.alias || source.id;
  const seen = new Set();
  const found = [];
  for (const link of raw) {
    if (!relevant(link)) continue;
    const key = link.title.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    // Drop a leading date stamp such as "Nov 06, 2026, Friday" glued to the title.
    const title = link.title.replace(/^[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4},?\s*(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*/, '').trim() || link.title;
    const examSlugs = matchExams(title, sid, exams);
    const category = examSlugs.length ? examBySlug[examSlugs[0]].category : source.category;
    found.push({
      id: crypto.createHash('sha1').update(link.url + '|' + link.title.toLowerCase()).digest('hex').slice(0, 12),
      title,
      url: link.url,
      source: sid,
      sourceName: source.name,
      category,
      exams: examSlugs,
      type: classifyType(title),
      date: extractDate(link.context || '') || dateFromUrl(link.url) || extractDate(link.title),
      firstSeen: today
    });
  }
  return found;
}

for (const source of todo) {
  const started = Date.now();
  try {
    // Links dated before the retention window are old archive entries, not news.
    const found = (await scrape(source)).filter((it) => !it.date || it.date >= cutoff);
    let added = 0;
    for (const it of found) {
      const prev = items.get(it.id);
      if (prev) {
        items.set(it.id, { ...it, firstSeen: prev.firstSeen, date: it.date || prev.date });
      } else {
        if (!it.date && !knownSources.has(it.source)) it.seed = true;
        items.set(it.id, it);
        added++;
      }
    }
    status.sources[source.id] = { ok: true, found: found.length, added, ms: Date.now() - started };
    console.log(`✔ ${source.id.padEnd(12)} ${String(found.length).padStart(4)} links, ${added} new`);
  } catch (err) {
    status.sources[source.id] = { ok: false, error: String(err.message || err), ms: Date.now() - started };
    console.warn(`✖ ${source.id.padEnd(12)} ${err.message || err}`);
  }
}
await closeBrowser();

// Prune old items and cap the archive size.
const sortKey = (i) => (i.date && i.date > i.firstSeen ? i.firstSeen : i.date || (i.seed ? '0000-00-00' : i.firstSeen));
const merged = [...items.values()]
  .filter((i) => (i.date ? i.date >= cutoff : i.firstSeen >= cutoff))
  .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.firstSeen.localeCompare(a.firstSeen) || a.title.localeCompare(b.title))
  .slice(0, config.maxItems || 2000);

const ok = Object.values(status.sources).filter((s) => s.ok).length;
console.log(`\n${ok}/${todo.length} sources OK · ${merged.length} items in archive`);

if (args['dry-run']) {
  console.log('Dry run: nothing written.');
} else {
  await writeJson('data/updates.json', { generatedAt: now.toISOString(), items: merged });
  const prevStatus = await readJson('data/status.json', { sources: {} });
  await writeJson('data/status.json', { ...status, sources: { ...prevStatus.sources, ...status.sources } });
}

if (ok === 0 && todo.length > 0) process.exitCode = 1;
