import * as cheerio from 'cheerio';

export const clean = (s) =>
  (s || '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*NEW\s*\)/gi, '')
    .replace(/\(\s*[\d.,\s]+\s*(KB|MB)\s*\)/gi, '')
    .replace(/\bRead More\b\.?/gi, '')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function absolute(href, base) {
  try {
    const u = new URL(href.trim(), base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

const GENERIC = /^(click here.*|download|view|here|link|pdf|new|more|details|know more.*|english|hindi|हिंदी|हिन्दी|corrigendum|addendum|advertisement|notification|notice|result|results|apply online|apply now|apply|biodata|annexures?|interview schedule|admit card|call letter|answer key|syllabus|fee details|ctc negotiation form)\s*\.?$/i;

// Finds the heading an anchor sits under: an accordion/tab toggle that controls
// one of its ancestors, or the nearest heading before it.
function headingFor($, a) {
  let node = a.parent();
  for (let depth = 0; node.length && depth < 8; depth++, node = node.parent()) {
    const id = node.attr('id');
    if (id) {
      const toggle = $(`[data-target="#${id}"], [data-bs-target="#${id}"], [href="#${id}"], [aria-controls="${id}"]`).first();
      if (toggle.length) {
        const t = clean(toggle.find('p, h2, h3, h4, h5, span').first().text() || toggle.text());
        if (t.length >= 8) return t;
      }
    }
    const prevHeading = node.prevAll('h1, h2, h3, h4, h5, h6, .card-header, .panel-heading, .accordion-header, .accordion-button').first();
    if (prevHeading.length) {
      const t = clean(prevHeading.text());
      if (t.length >= 8 && t.length <= 250) return t;
    }
  }
  return '';
}

// Pulls every link from a page together with the most descriptive nearby text.
export function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  $('script, style, noscript, footer').remove();
  const out = [];
  $('a[href]').each((_, el) => {
    const a = $(el);
    const url = absolute(a.attr('href') || '', baseUrl);
    if (!url) return;
    const anchor = clean(a.text()) || clean(a.attr('title')) || clean(a.attr('aria-label'));
    if (/^(hindi|हिंदी|हिन्दी)$/i.test(anchor)) return; // keep the English copy only
    const row = a.closest('tr, li, p');
    const context = row.length ? clean(row.text()) : '';
    let title = anchor;
    if ((title.length < 15 || GENERIC.test(title)) && context && context.length <= 300 && context.length > title.length) {
      title = context;
    }
    if (title.length < 40 || GENERIC.test(anchor)) {
      const heading = headingFor($, a);
      if (heading && !title.toLowerCase().includes(heading.toLowerCase().slice(0, 30))) title = `${heading} — ${title}`;
    }
    title = clean(title);
    if (GENERIC.test(title)) return; // nothing descriptive to show
    out.push({ title, url, context: context.length <= 600 ? context : '' });
  });
  return out;
}

// For sites whose notices are click handlers rather than links, a source can
// declare CSS selectors: { row, title, date, link }. Items without their own
// link point at the official page they were read from.
export function extractRows(html, baseUrl, sel) {
  const $ = cheerio.load(html);
  const out = [];
  $(sel.row).each((_, el) => {
    const row = $(el);
    const title = clean(row.find(sel.title).first().text());
    if (!title) return;
    const dateEl = sel.date ? row.find(sel.date).first() : null;
    const dateText = dateEl && dateEl.length
      ? dateEl.children().length ? dateEl.children().map((_, c) => $(c).text().trim()).get().join(' ') : dateEl.text()
      : '';
    const href = row.find(sel.link || 'a[href]').first().attr('href');
    const url = (href && absolute(href, baseUrl)) || baseUrl;
    out.push({ title, url, context: dateText });
  });
  return out;
}

export function extractRss(xml, baseUrl) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $('item, entry').each((_, el) => {
    const it = $(el);
    const title = clean(it.find('title').first().text());
    const link = it.find('link').first().attr('href') || it.find('link').first().text();
    const url = absolute(link || '', baseUrl);
    const date = it.find('pubDate, published, updated').first().text();
    if (title && url) out.push({ title, url, context: date });
  });
  return out;
}
