// Offline support + background exam alerts.
// Pages are served network-first so new exam updates always show when online.
importScripts('__BASE__assets/notify-core.js');

const CACHE = 'site-__VERSION__';
const BASE = '__BASE__';
const SHELL = [BASE, BASE + 'assets/style.css', BASE + 'assets/app.js', BASE + 'assets/notify-core.js', BASE + 'assets/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match(BASE)))
  );
});

// Background check (installed app on Chrome/Android via Periodic Background Sync).
async function checkForUpdates() {
  const prefs = await NotifyCore.idbGet('prefs');
  if (!prefs || !prefs.browserAlerts || (!prefs.exams.length && !prefs.categories.length)) return;
  if (self.Notification && Notification.permission !== 'granted') return;
  const res = await fetch(BASE + 'data/updates.json', { cache: 'no-store' });
  const { items } = await res.json();
  const read = (await NotifyCore.idbGet('read')) || {};
  const alerted = (await NotifyCore.idbGet('alerted')) || {};
  const fresh = NotifyCore.pendingAlerts(items, prefs, read, alerted);
  if (!fresh.length) return;
  fresh.forEach((i) => { alerted[i.id] = 1; });
  await NotifyCore.idbSet('alerted', alerted);
  const unread = items.filter((i) => NotifyCore.matches(i, prefs) && NotifyCore.isUnread(i, prefs, read)).length;
  if (self.navigator.setAppBadge) self.navigator.setAppBadge(unread).catch(() => {});
  await self.registration.showNotification(
    fresh.length === 1 ? 'New exam update' : `${fresh.length} new exam updates`,
    {
      body: fresh.slice(0, 3).map((i) => '• ' + i.title).join('\n'),
      icon: BASE + 'assets/icon.svg',
      badge: BASE + 'assets/icon.svg',
      tag: 'exam-updates',
      data: { url: BASE + 'notifications/' }
    }
  );
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'exam-updates') e.waitUntil(checkForUpdates().catch(() => {}));
});
self.addEventListener('message', (e) => {
  if (e.data === 'check-updates') e.waitUntil(checkForUpdates().catch(() => {}));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || BASE + 'notifications/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
