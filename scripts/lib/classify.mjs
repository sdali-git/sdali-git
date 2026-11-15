// Classifies scraped links: is it exam-related, what kind of update is it,
// which exams does it belong to, and what date does it carry.

// A link counts as an exam update only if it says something happened:
// a notification, result, admit card, date change and so on. Plain menu links
// such as "Joint Entrance Examination (JEE)" are skipped.
export const RELEVANT = new RegExp(
  [
    'notification', 'notice', 'recruitment', 'advertisement', '\\badvt\\b', 'vacanc', 'result',
    'admit ?card', 'e-?admit', 'call ?letter', 'hall ?ticket', 'answer ?key', 'provisional key', 'schedule',
    'calendar', 'syllabus', 'question paper', 'cut[- ]?off', 'marks', 'score ?card', 'registration',
    'apply online', 'corrigendum', 'addendum', 'interview', 'merit list', 'selection list', 'date sheet',
    'city intimation', 'intimation', 'information bulletin', 'counsell?ing', 'walk[- ]?in', '\\bCEN\\b', '\\bCRP\\b',
    'engagement of', 'posts? of', 'release', 'declar', 'extension', 'extended', 'postpone', 'reschedul',
    'exam(ination)? dates?', 'shortlist', 'allocation', 'document verification', 'skill test', 'response sheet'
  ].join('|'),
  'i'
);

export const EXCLUDE = new RegExp(
  [
    'tender', '\\bRTI\\b', 'annual report', 'press release', 'e-?auction', 'procurement', 'quotation',
    'facebook', 'twitter', 'youtube', 'instagram', 'linkedin', 'privacy', 'disclaimer', 'sitemap',
    'contact us', 'feedback', 'screen reader', 'skip to', 'terms (and|&) conditions', 'copyright',
    'hyperlink', 'web ?information manager', 'accessibility', 'help ?desk', 'grievance portal',
    'empanelment', 'expression of interest', '\\bEOI\\b', 'affidavit', 'authori[sz]ation form',
    'undertaking', 'certificate format', 'format of certificate'
  ].join('|'),
  'i'
);

const TYPES = [
  ['answer-key', /answer ?key|provisional key|response sheet|objection/i],
  ['admit-card', /admit ?card|e-?admit|call ?letter|hall ?ticket|city intimation|exam city/i],
  ['result', /result|merit list|selection list|cut[- ]?off|marks|score ?card|qualified|shortlist/i],
  ['paper', /question paper|previous year|sample paper|mock test/i],
  ['syllabus', /syllabus|scheme of exam|exam pattern/i],
  ['schedule', /schedule|calendar|date sheet|exam date|time ?table|postpone|reschedul/i],
  ['notification', /notification|recruitment|advertisement|\badvt\b|vacanc|apply online|registration|information bulletin|\bCEN\b|\bCRP\b|engagement of|posts? of|walk[- ]?in/i],
  ['notice', /notice|corrigendum|addendum|extension|important|public notice|press note/i]
];

export const TYPE_LABELS = {
  notification: 'Notification',
  'admit-card': 'Admit Card',
  result: 'Result',
  'answer-key': 'Answer Key',
  schedule: 'Exam Date',
  syllabus: 'Syllabus',
  paper: 'Question Paper',
  notice: 'Notice'
};

export function classifyType(title) {
  for (const [type, re] of TYPES) if (re.test(title)) return type;
  return 'notice';
}

export function isRelevant(title, url) {
  if (!title || title.length < 12 || title.length > 400) return false;
  if (EXCLUDE.test(title) || EXCLUDE.test(url)) return false;
  return RELEVANT.test(title) || (/\.pdf($|\?)/i.test(url) && /exam|test|recruit|20\d\d/i.test(title));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function iso(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  const now = new Date();
  if (y < 2015 || y > now.getUTCFullYear() + 2 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

// Returns the most recent plausible date written in the text, or null.
export function extractDate(text) {
  const found = [];
  const t = text.replace(/\s+/g, ' ');
  for (const m of t.matchAll(/\b(\d{1,2})[-./](\d{1,2})[-./](\d{4}|\d{2})\b/g)) found.push(iso(m[3], m[2], m[1]));
  for (const m of t.matchAll(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/g)) found.push(iso(m[1], m[2], m[3]));
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[-\s.,]*([A-Za-z]{3,9})[-\s.,]*(\d{4})\b/g)) {
    const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) found.push(iso(m[3], mo, m[1]));
  }
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) found.push(iso(m[3], mo, m[2]));
  }
  const today = new Date().toISOString().slice(0, 10);
  const valid = found.filter(Boolean).filter((d) => d <= today);
  return valid.sort().pop() || null;
}

// Many official sites put the upload date in the file name, e.g.
// Notice_20261016190564.pdf, uploads/2026/10/..., 26102026_SCO_02.pdf
export function dateFromUrl(url) {
  const file = decodeURIComponent(url.split('?')[0]);
  const today = new Date().toISOString().slice(0, 10);
  const ok = (d) => (d && d <= today ? d : null);
  let m = file.match(/(?:^|[_/-])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{0,8}(?=[_./-])/);
  if (m) return ok(iso(m[1], m[2], m[3]));
  m = file.match(/(?:^|[_/-])(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})(?=[_./-])/);
  if (m) return ok(iso(m[3], m[2], m[1]));
  return null;
}

export function matchExams(title, sourceId, exams) {
  return exams
    .filter((e) => e.sources.includes(sourceId))
    .filter((e) => e.match.some((p) => new RegExp(p, 'i').test(title)))
    .map((e) => e.slug);
}
