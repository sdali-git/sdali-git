/* Shared by the pages (app.js) and the service worker (sw.js).
 * Preferences live in localStorage for the page and are mirrored to IndexedDB
 * so the service worker can check for new updates in the background. */
(function (root) {
  'use strict';
  var ALL_TYPES = ['notification', 'admit-card', 'result', 'answer-key', 'schedule', 'syllabus', 'paper', 'notice'];

  function defaultPrefs() {
    return { exams: [], categories: [], types: ALL_TYPES.slice(), browserAlerts: false, since: null, updatedAt: null };
  }

  // Does an update belong in this user's notifications?
  function matches(item, prefs) {
    if (!prefs) return false;
    if (prefs.types && prefs.types.length && prefs.types.indexOf(item.type) === -1) return false;
    var exams = item.exams || [];
    for (var i = 0; i < exams.length; i++) if (prefs.exams.indexOf(exams[i]) !== -1) return true;
    // "Other updates" in a category: notices not tied to one specific exam.
    return !exams.length && (prefs.categories || []).indexOf(item.category) !== -1;
  }

  function itemDate(item) { return item.date || item.firstSeen || ''; }

  // Unread = matches, newer than when the user started following, not opened.
  function isUnread(item, prefs, readMap) {
    return !readMap[item.id] && !item.seed && (!prefs.since || itemDate(item) >= prefs.since);
  }

  // ---- tiny IndexedDB key/value store ----
  var dbp;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('exam-alerts', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var q = d.transaction('kv').objectStore('kv').get(key);
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { res(undefined); };
      });
    }).catch(function () { return undefined; });
  }
  function idbSet(key, val) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { res(); };
      });
    }).catch(function () {});
  }

  // Finds matching unread updates that have not yet triggered a system alert.
  function pendingAlerts(items, prefs, readMap, alertedMap) {
    return items
      .filter(function (i) { return matches(i, prefs) && isUnread(i, prefs, readMap) && !alertedMap[i.id]; })
      .sort(function (a, b) { return itemDate(b).localeCompare(itemDate(a)); });
  }

  root.NotifyCore = {
    ALL_TYPES: ALL_TYPES,
    defaultPrefs: defaultPrefs,
    matches: matches,
    isUnread: isUnread,
    itemDate: itemDate,
    pendingAlerts: pendingAlerts,
    idbGet: idbGet,
    idbSet: idbSet
  };
})(typeof self !== 'undefined' ? self : this);
