(function () {
  'use strict';
  var BASE = window.BASE || '/';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = {
    get: function (k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  var TYPE_LABELS = { notification: 'Notification', 'admit-card': 'Admit Card', result: 'Result', 'answer-key': 'Answer Key', schedule: 'Exam Date', syllabus: 'Syllabus', paper: 'Question Paper', notice: 'Notice' };
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function loadSubject(s) { return fetch(BASE + 'data/questions/' + s + '.json').then(function (r) { return r.json(); }); }
  function saveAttempt(a) { var all = store.get('attempts', []); all.unshift(a); store.set('attempts', all.slice(0, 100)); }

  // ---- Theme & menu ----
  var tt = $('[data-theme-toggle]');
  if (tt) tt.addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });
  var mb = $('[data-menu]');
  if (mb) mb.addEventListener('click', function () {
    var nav = $('[data-nav]'); var open = nav.classList.toggle('open'); mb.setAttribute('aria-expanded', open);
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register(BASE + 'sw.js').catch(function () {});
  }

  // ---- Latest filters ----
  var list = $('[data-filter-list]');
  if (list) {
    var q = $('[data-filter-q]'), cat = $('[data-filter-cat]'), chips = $$('[data-filter-type] .chip');
    var params = new URLSearchParams(location.search);
    var type = params.get('type') || '';
    if (params.get('cat')) cat.value = params.get('cat');
    var apply = function () {
      var term = q.value.trim().toLowerCase(), shown = 0;
      chips.forEach(function (c) { c.classList.toggle('active', c.dataset.type === type); });
      $$('.update', list).forEach(function (li) {
        var ok = (!type || li.dataset.type === type) && (!cat.value || li.dataset.cat === cat.value) && (!term || li.textContent.toLowerCase().indexOf(term) !== -1);
        li.hidden = !ok; if (ok) shown++;
      });
      $('[data-filter-empty]').hidden = shown > 0;
    };
    chips.forEach(function (c) { c.addEventListener('click', function () { type = c.dataset.type; apply(); }); });
    q.addEventListener('input', apply); cat.addEventListener('change', apply);
    apply();
  }

  // ---- Search ----
  var sr = $('[data-search-results]');
  if (sr) {
    var data = JSON.parse($('#search-data').textContent);
    var input = $('[data-search-input]');
    var term0 = new URLSearchParams(location.search).get('q') || '';
    input.value = term0;
    var run = function () {
      var t = input.value.trim().toLowerCase();
      if (!t) { sr.innerHTML = ''; return; }
      var words = t.split(/\s+/);
      var hit = function (s) { s = s.toLowerCase(); return words.every(function (w) { return s.indexOf(w) !== -1; }); };
      var ex = data.exams.filter(function (e) { return hit(e.name + ' ' + e.full + ' ' + e.body); });
      var it = data.items.filter(function (i) { return hit(i.t + ' ' + i.s); }).slice(0, 80);
      sr.innerHTML =
        (ex.length ? '<h2>Exams</h2><div class="grid exams-grid">' + ex.map(function (e) { return '<a class="card exam-card" href="' + BASE + 'exams/' + e.slug + '/"><strong>' + esc(e.name) + '</strong><span class="muted small">' + esc(e.full) + '</span></a>'; }).join('') + '</div>' : '') +
        '<h2>Updates (' + it.length + ')</h2>' +
        (it.length ? '<ul class="updates">' + it.map(function (i) { return '<li class="update"><div class="update-meta"><span class="badge badge-' + esc(i.ty) + '">' + esc(TYPE_LABELS[i.ty] || 'Update') + '</span><span class="muted small">' + esc(i.d || '') + '</span></div><a class="update-title" target="_blank" rel="noopener" href="' + esc(i.u) + '">' + esc(i.t) + '</a><span class="muted small">Source: ' + esc(i.s) + '</span></li>'; }).join('') + '</ul>' : '<p class="empty">No updates match “' + esc(t) + '”.</p>');
    };
    input.form.addEventListener('submit', function (e) { e.preventDefault(); history.replaceState(null, '', '?q=' + encodeURIComponent(input.value)); run(); });
    run();
  }

  // ---- Practice mode ----
  var practice = $('[data-quiz="practice"]');
  if (practice) {
    loadSubject(practice.dataset.subject).then(function (bank) {
      var topics = Array.from(new Set(bank.questions.map(function (q) { return q.topic; })));
      var qs, idx, correct, answered;
      function start(topic) {
        qs = shuffle(bank.questions.filter(function (q) { return !topic || q.topic === topic; }));
        idx = 0; correct = 0; answered = 0; render();
      }
      function render() {
        if (idx >= qs.length) return finish();
        var q = qs[idx];
        practice.innerHTML =
          '<div class="quiz-top"><span class="muted small">Question ' + (idx + 1) + ' of ' + qs.length + '</span><span class="small"><strong>' + correct + '</strong> / ' + answered + ' correct</span></div>' +
          '<div class="progress-bar"><span style="width:' + (idx / qs.length * 100) + '%"></span></div>' +
          '<div class="q-topic">' + esc(q.topic) + '</div><div class="q-text">' + esc(q.q) + '</div>' +
          '<div class="options">' + q.options.map(function (o, i) { return '<button class="option" data-i="' + i + '">' + String.fromCharCode(65 + i) + '. ' + esc(o) + '</button>'; }).join('') + '</div>' +
          '<div data-exp></div><div class="quiz-nav"><select data-topic aria-label="Topic"><option value="">All topics</option>' + topics.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select><button class="btn btn-primary" data-next hidden>Next question →</button></div>';
        $$('.option', practice).forEach(function (b) {
          b.addEventListener('click', function () {
            var pick = +b.dataset.i; answered++;
            if (pick === q.answer) correct++;
            $$('.option', practice).forEach(function (x, i) { x.disabled = true; if (i === q.answer) x.classList.add('correct'); else if (i === pick) x.classList.add('wrong'); });
            $('[data-exp]', practice).innerHTML = '<div class="explanation"><strong>' + (pick === q.answer ? '✔ Correct.' : '✘ Incorrect. Answer: ' + String.fromCharCode(65 + q.answer) + '.') + '</strong> ' + esc(q.explanation) + '</div>';
            $('[data-next]', practice).hidden = false;
          });
        });
        $('[data-next]', practice).addEventListener('click', function () { idx++; render(); });
        var sel = $('[data-topic]', practice); sel.value = practice.dataset.topic || '';
        sel.addEventListener('change', function () { practice.dataset.topic = sel.value; start(sel.value); });
      }
      function finish() {
        saveAttempt({ kind: 'practice', name: bank.name + (practice.dataset.topic ? ' · ' + practice.dataset.topic : ''), score: correct, total: qs.length, at: Date.now() });
        practice.innerHTML = '<h2>Well done!</h2><p>You got <strong>' + correct + '</strong> out of ' + qs.length + ' right (' + Math.round(correct / qs.length * 100) + '%).</p><div class="quiz-nav"><button class="btn btn-primary" data-again>Practise again</button><a class="btn btn-ghost" href="' + BASE + 'mock/">Try a mock test</a></div>';
        $('[data-again]', practice).addEventListener('click', function () { start(practice.dataset.topic); });
      }
      start('');
    }).catch(function () { practice.innerHTML = '<p class="empty">Could not load questions. Please refresh the page.</p>'; });
  }

  // ---- Mock test ----
  var mock = $('[data-quiz="mock"]');
  if (mock) {
    var examList = JSON.parse(mock.dataset.exams);
    var pre = new URLSearchParams(location.search).get('exam');
    var timerId;
    function setup() {
      mock.innerHTML = '<div class="setup"><h2>Set up your test</h2>' +
        '<label for="m-exam">Exam</label><select id="m-exam">' + examList.map(function (e) { return '<option value="' + e.slug + '"' + (e.slug === pre ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') + '</select>' +
        '<label for="m-n">Number of questions</label><select id="m-n"><option>10</option><option selected>20</option><option>30</option><option>40</option></select>' +
        '<p class="muted small">1 mark for each correct answer, 0.25 deducted for each wrong answer, 45 seconds per question.</p>' +
        '<button class="btn" data-start>Start test</button></div>';
      $('[data-start]', mock).addEventListener('click', function () {
        var ex = examList.filter(function (e) { return e.slug === $('#m-exam').value; })[0];
        var n = +$('#m-n').value;
        Promise.all(ex.subjects.map(loadSubject)).then(function (banks) {
          // Draw evenly from each subject the exam covers.
          var per = Math.ceil(n / banks.length), pool = [];
          banks.forEach(function (b) { shuffle(b.questions).slice(0, per).forEach(function (q) { pool.push(Object.assign({ subject: b.name }, q)); }); });
          run(ex, shuffle(pool).slice(0, n));
        });
      });
    }
    function run(ex, qs) {
      var answers = qs.map(function () { return null; }), idx = 0, left = qs.length * 45;
      function tick() {
        left--; var t = $('.timer', mock);
        if (t) { t.textContent = Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2); t.classList.toggle('low', left < 60); }
        if (left <= 0) submit();
      }
      clearInterval(timerId); timerId = setInterval(tick, 1000);
      function render() {
        var q = qs[idx];
        mock.innerHTML =
          '<div class="quiz-top"><strong>' + esc(ex.name) + ' mock test</strong><span class="timer">' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) + '</span></div>' +
          '<div class="progress-bar"><span style="width:' + (answers.filter(function (a) { return a !== null; }).length / qs.length * 100) + '%"></span></div>' +
          '<div class="q-topic">Q' + (idx + 1) + ' · ' + esc(q.subject) + ' · ' + esc(q.topic) + '</div><div class="q-text">' + esc(q.q) + '</div>' +
          '<div class="options">' + q.options.map(function (o, i) { return '<button class="option' + (answers[idx] === i ? ' selected' : '') + '" data-i="' + i + '">' + String.fromCharCode(65 + i) + '. ' + esc(o) + '</button>'; }).join('') + '</div>' +
          '<div class="quiz-nav"><button class="btn btn-ghost" data-prev' + (idx === 0 ? ' disabled' : '') + '>← Previous</button><button class="btn btn-ghost" data-clear>Clear answer</button>' +
          (idx < qs.length - 1 ? '<button class="btn btn-primary" data-nxt>Save & next →</button>' : '<button class="btn" data-submit>Submit test</button>') + '</div>' +
          '<div class="palette">' + qs.map(function (_, i) { return '<button class="' + (answers[i] !== null ? 'answered ' : '') + (i === idx ? 'current' : '') + '" data-go="' + i + '">' + (i + 1) + '</button>'; }).join('') + '</div>' +
          '<p style="margin-top:16px"><button class="btn btn-ghost" data-submit>Submit test</button></p>';
        $$('.option', mock).forEach(function (b) { b.addEventListener('click', function () { answers[idx] = +b.dataset.i; render(); }); });
        var on = function (sel, fn) { $$(sel, mock).forEach(function (el) { el.addEventListener('click', fn); }); };
        on('[data-prev]', function () { idx--; render(); });
        on('[data-nxt]', function () { idx++; render(); });
        on('[data-clear]', function () { answers[idx] = null; render(); });
        on('[data-go]', function (e) { idx = +e.currentTarget.dataset.go; render(); });
        on('[data-submit]', function () {
          var un = answers.filter(function (a) { return a === null; }).length;
          if (!un || confirm(un + ' question(s) unanswered. Submit anyway?')) submit();
        });
      }
      function submit() {
        clearInterval(timerId);
        var c = 0, w = 0;
        qs.forEach(function (q, i) { if (answers[i] === null) return; if (answers[i] === q.answer) c++; else w++; });
        var score = Math.round((c - w * 0.25) * 100) / 100;
        saveAttempt({ kind: 'mock', name: ex.name + ' mock', score: score, total: qs.length, correct: c, wrong: w, at: Date.now() });
        mock.innerHTML = '<h2>Your result</h2>' +
          '<div class="score-grid"><div><strong>' + score + '</strong>Score / ' + qs.length + '</div><div><strong>' + c + '</strong>Correct</div><div><strong>' + w + '</strong>Wrong</div><div><strong>' + (qs.length - c - w) + '</strong>Unanswered</div></div>' +
          '<p>Accuracy: <strong>' + (c + w ? Math.round(c / (c + w) * 100) : 0) + '%</strong></p>' +
          '<div class="quiz-nav"><button class="btn btn-primary" data-again>Take another test</button><a class="btn btn-ghost" href="' + BASE + 'progress/">See my progress</a></div>' +
          '<h2>Solutions</h2>' + qs.map(function (q, i) {
            var a = answers[i];
            return '<div class="review-item"><div class="q-topic">Q' + (i + 1) + ' · ' + esc(q.topic) + ' · ' + (a === null ? 'Not answered' : a === q.answer ? '✔ Correct' : '✘ Wrong') + '</div><div class="q-text">' + esc(q.q) + '</div>' +
              '<div class="options">' + q.options.map(function (o, j) { return '<div class="option ' + (j === q.answer ? 'correct' : j === a ? 'wrong' : '') + '">' + String.fromCharCode(65 + j) + '. ' + esc(o) + '</div>'; }).join('') + '</div>' +
              '<div class="explanation">' + esc(q.explanation) + '</div></div>';
          }).join('');
        $('[data-again]', mock).addEventListener('click', setup);
        window.scrollTo(0, mock.offsetTop - 80);
      }
      render();
    }
    setup();
  }

  // ---- Progress ----
  var pg = $('[data-progress]');
  if (pg) {
    var all = store.get('attempts', []);
    if (!all.length) {
      pg.innerHTML = '<p class="empty">No attempts yet. <a href="' + BASE + 'practice/">Start practising</a> or <a href="' + BASE + 'mock/">take a mock test</a>.</p>';
    } else {
      var mocks = all.filter(function (a) { return a.kind === 'mock'; });
      var avg = mocks.length ? Math.round(mocks.reduce(function (s, a) { return s + Math.max(0, a.score) / a.total; }, 0) / mocks.length * 100) : 0;
      pg.innerHTML = '<div class="score-grid"><div><strong>' + all.length + '</strong>Attempts</div><div><strong>' + mocks.length + '</strong>Mock tests</div><div><strong>' + avg + '%</strong>Avg mock score</div><div><strong>' + all.reduce(function (s, a) { return s + a.total; }, 0) + '</strong>Questions done</div></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Test</th><th>Score</th></tr></thead><tbody>' +
        all.map(function (a) { return '<tr><td>' + new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + '</td><td>' + esc(a.name) + '</td><td>' + a.score + ' / ' + a.total + '</td></tr>'; }).join('') +
        '</tbody></table></div><p><button class="btn btn-ghost" data-reset>Clear history</button></p>';
      $('[data-reset]', pg).addEventListener('click', function () { if (confirm('Clear all saved attempts?')) { store.set('attempts', []); location.reload(); } });
    }
  }
})();

// ======================= Exam alerts =======================
(function () {
  'use strict';
  var Core = window.NotifyCore;
  if (!Core) return;
  var BASE = window.BASE || '/';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var get = function (k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
  var put = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} Core.idbSet(k.replace('alert', '').toLowerCase(), v); };
  var TYPE_LABELS = { notification: 'Notification', 'admit-card': 'Admit Card', result: 'Result', 'answer-key': 'Answer Key', schedule: 'Exam Date', syllabus: 'Syllabus', paper: 'Question Paper', notice: 'Notice' };
  var daysAgo = function (n) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); };
  var fmt = function (d) { return d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''; };

  // Storage: alertPrefs, alertRead {id:1}, alertAlerted {id:1}. Mirrored to IndexedDB as prefs/read/alerted.
  function prefs() { return Object.assign(Core.defaultPrefs(), get('alertPrefs', {})); }
  function hasSelection(p) { return p.exams.length > 0 || p.categories.length > 0; }
  function savePrefs(p) {
    if (!p.since) p.since = daysAgo(14); // start with the last two weeks as unread
    p.updatedAt = new Date().toISOString();
    put('alertPrefs', p);
    refreshBell();
  }
  function readMap() { return get('alertRead', {}); }
  function markRead(ids) { var m = readMap(); ids.forEach(function (id) { m[id] = 1; }); put('alertRead', m); refreshBell(); }

  var updatesP;
  function updates() {
    if (!updatesP) updatesP = fetch(BASE + 'data/updates.json').then(function (r) { return r.json(); }).then(function (d) { return d.items || []; }).catch(function () { return []; });
    return updatesP;
  }
  function myItems(items, p) { return items.filter(function (i) { return Core.matches(i, p); }); }

  // ---- Bell badge + system notifications on every page ----
  function refreshBell() {
    var p = prefs(), el = $('[data-bell-count]');
    if (!hasSelection(p)) { if (el) el.hidden = true; return Promise.resolve(0); }
    return updates().then(function (items) {
      var rm = readMap();
      var unread = myItems(items, p).filter(function (i) { return Core.isUnread(i, p, rm); });
      if (el) { el.textContent = unread.length > 99 ? '99+' : unread.length; el.hidden = unread.length === 0; }
      if (navigator.setAppBadge) (unread.length ? navigator.setAppBadge(unread.length) : navigator.clearAppBadge()).catch(function () {});
      return unread.length;
    });
  }
  function alertNew() {
    var p = prefs();
    if (!p.browserAlerts || !hasSelection(p) || !('Notification' in window) || Notification.permission !== 'granted') return;
    updates().then(function (items) {
      var alerted = get('alertAlerted', {});
      var fresh = Core.pendingAlerts(items, p, readMap(), alerted);
      if (!fresh.length) return;
      fresh.forEach(function (i) { alerted[i.id] = 1; });
      put('alertAlerted', alerted);
      var title = fresh.length === 1 ? 'New exam update' : fresh.length + ' new exam updates';
      var opts = { body: fresh.slice(0, 3).map(function (i) { return '• ' + i.title; }).join('\n'), icon: BASE + 'assets/icon.svg', tag: 'exam-updates', data: { url: BASE + 'notifications/' } };
      var show = function () { try { var n = new Notification(title, opts); n.onclick = function () { location.href = BASE + 'notifications/'; }; } catch (e) {} };
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (reg) { reg ? reg.showNotification(title, opts) : show(); }).catch(show);
      } else show();
    });
  }
  function enableBackgroundSync() {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.periodicSync) reg.periodicSync.register('exam-updates', { minInterval: 6 * 3600 * 1000 }).catch(function () {});
    }).catch(function () {});
  }
  // Keep IndexedDB in sync for the service worker.
  Core.idbSet('prefs', prefs()); Core.idbSet('read', readMap()); Core.idbSet('alerted', get('alertAlerted', {}));
  refreshBell().then(alertNew);
  if (prefs().browserAlerts) enableBackgroundSync();

  // ---- Follow buttons on exam pages ----
  $$('[data-follow]').forEach(function (btn) {
    var slug = btn.dataset.follow, name = btn.dataset.name;
    var paint = function () {
      var on = prefs().exams.indexOf(slug) !== -1;
      btn.textContent = on ? '✓ Following ' + name : '🔔 Get ' + name + ' alerts';
      btn.classList.toggle('btn-ghost', on); btn.classList.toggle('btn-primary', !on);
      btn.setAttribute('aria-pressed', on);
    };
    btn.addEventListener('click', function () {
      var p = prefs(), i = p.exams.indexOf(slug);
      if (i === -1) p.exams.push(slug); else p.exams.splice(i, 1);
      savePrefs(p); paint();
      toast(i === -1 ? 'You will now get ' + name + ' updates in Notifications.' : 'Stopped ' + name + ' alerts.', i === -1 ? { href: BASE + 'my-exams/', label: 'Settings' } : null);
    });
    paint();
  });

  function toast(msg, link) {
    var t = $('.toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast', role: 'status' }));
    t.innerHTML = esc(msg) + (link ? ' <a href="' + link.href + '">' + esc(link.label) + '</a>' : '');
    t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  // ---- Home banner ----
  var home = $('[data-home-alerts]');
  if (home) {
    var hp = prefs();
    if (!hasSelection(hp)) {
      home.innerHTML = '<div class="alert-cta"><div><strong>🔔 Get alerts for your exams</strong><p class="small muted">Choose your exams and we will collect their notifications, admit cards, results and answer keys in one place.</p></div><a class="btn" href="' + BASE + 'my-exams/">Choose my exams</a></div>';
    } else {
      updates().then(function (items) {
        var rm = readMap(), mine = myItems(items, hp), unread = mine.filter(function (i) { return Core.isUnread(i, hp, rm); });
        home.innerHTML = '<div class="alert-cta"><div><strong>🔔 ' + (unread.length ? unread.length + ' new update' + (unread.length > 1 ? 's' : '') + ' for your exams' : 'You are all caught up') + '</strong>' +
          (unread.length ? '<ul class="mini-list">' + unread.slice(0, 3).map(function (i) { return '<li>' + esc(i.title) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">New updates for the exams you follow will show here.</p>') +
          '</div><div class="exam-actions"><a class="btn" href="' + BASE + 'notifications/">Open notifications</a><a class="btn btn-ghost" href="' + BASE + 'my-exams/">My exams</a></div></div>';
      });
    }
  }

  // ---- Settings page ----
  var settings = $('[data-alert-settings]');
  if (settings) {
    var cat = JSON.parse(settings.dataset.catalog);
    var p = prefs();
    var permText = function () {
      if (!('Notification' in window)) return 'This browser does not support notifications.';
      return { granted: 'Allowed on this device.', denied: 'Blocked. Allow notifications for this site in your browser settings.', default: 'Not yet allowed.' }[Notification.permission];
    };
    settings.innerHTML =
      '<div class="card"><div class="section-head"><h2 style="margin-top:0">1. Exams I follow</h2><span class="small muted" data-count></span></div>' +
      '<input type="search" class="field" placeholder="Find an exam…" data-exam-filter aria-label="Find an exam">' +
      cat.categories.map(function (c) {
        var ex = cat.exams.filter(function (e) { return e.category === c.slug; });
        return '<fieldset class="exam-group" data-group="' + c.slug + '"><legend>' + c.icon + ' ' + esc(c.name) + ' <label class="small select-all"><input type="checkbox" data-all="' + c.slug + '"> Select all</label></legend>' +
          '<div class="check-grid">' + ex.map(function (e) {
            return '<label class="check" data-name="' + esc((e.name + ' ' + e.full).toLowerCase()) + '"><input type="checkbox" name="exam" value="' + e.slug + '"' + (p.exams.indexOf(e.slug) !== -1 ? ' checked' : '') + '><span><strong>' + esc(e.name) + '</strong><small class="muted">' + esc(e.full) + '</small></span></label>';
          }).join('') +
          '<label class="check" data-name="other ' + esc(c.name.toLowerCase()) + '"><input type="checkbox" name="cat" value="' + c.slug + '"' + (p.categories.indexOf(c.slug) !== -1 ? ' checked' : '') + '><span><strong>Other ' + esc(c.name) + ' notices</strong><small class="muted">Updates not linked to one specific exam</small></span></label>' +
          '</div></fieldset>';
      }).join('') + '</div>' +
      '<div class="card"><h2 style="margin-top:0">2. Types of updates</h2><div class="chips">' +
      Object.keys(cat.types).map(function (t) { return '<label class="chip-check"><input type="checkbox" name="type" value="' + t + '"' + (p.types.indexOf(t) !== -1 ? ' checked' : '') + '> ' + esc(cat.types[t]) + '</label>'; }).join('') + '</div></div>' +
      '<div class="card"><h2 style="margin-top:0">3. Device notifications</h2>' +
      '<label class="check"><input type="checkbox" name="browserAlerts"' + (p.browserAlerts ? ' checked' : '') + '><span><strong>Show a phone/desktop notification when new updates arrive</strong><small class="muted" data-perm>' + permText() + '</small></span></label>' +
      '<p class="small muted">On Android, install the site (browser menu → “Install app” / “Add to Home screen”) so it can check in the background.</p></div>' +
      '<div class="card"><h2 style="margin-top:0">Use these settings on another device</h2>' +
      '<p class="small muted">Settings are saved on this device. To copy them, copy this code and paste it on the other device.</p>' +
      '<div class="sync-row"><input class="field" readonly data-sync-out aria-label="Your settings code"><button class="btn btn-ghost" data-copy>Copy code</button></div>' +
      '<div class="sync-row"><input class="field" placeholder="Paste a settings code…" data-sync-in aria-label="Paste settings code"><button class="btn btn-ghost" data-import>Apply</button></div></div>' +
      '<div class="settings-bar"><span class="small" data-saved aria-live="polite"></span><div class="exam-actions"><button class="btn btn-ghost" data-reset>Reset</button><a class="btn" href="' + BASE + 'notifications/">View notifications →</a></div></div>';

    var syncOut = $('[data-sync-out]', settings);
    var paintMeta = function () {
      var q = prefs();
      $('[data-count]', settings).textContent = q.exams.length + ' exam' + (q.exams.length === 1 ? '' : 's') + ' selected';
      syncOut.value = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, exams: q.exams, categories: q.categories, types: q.types }))));
      cat.categories.forEach(function (c) {
        var boxes = $$('[data-group="' + c.slug + '"] input[name="exam"]', settings);
        var all = $('[data-all="' + c.slug + '"]', settings);
        var n = boxes.filter(function (b) { return b.checked; }).length;
        all.checked = n === boxes.length; all.indeterminate = n > 0 && n < boxes.length;
      });
    };
    var collect = function () {
      var q = prefs();
      q.exams = $$('input[name="exam"]:checked', settings).map(function (i) { return i.value; });
      q.categories = $$('input[name="cat"]:checked', settings).map(function (i) { return i.value; });
      q.types = $$('input[name="type"]:checked', settings).map(function (i) { return i.value; });
      q.browserAlerts = $('input[name="browserAlerts"]', settings).checked;
      savePrefs(q); paintMeta();
      var s = $('[data-saved]', settings); s.textContent = '✓ Saved'; clearTimeout(s._h); s._h = setTimeout(function () { s.textContent = ''; }, 2000);
    };
    settings.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.all) $$('[data-group="' + t.dataset.all + '"] input[name="exam"]', settings).forEach(function (b) { b.checked = t.checked; });
      if (t.name === 'browserAlerts' && t.checked && 'Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().then(function (r) {
          $('[data-perm]', settings).textContent = permText();
          if (r !== 'granted') { t.checked = false; collect(); } else { enableBackgroundSync(); collect(); alertNew(); }
        });
        return;
      }
      if (t.name === 'browserAlerts' && t.checked) enableBackgroundSync();
      if (t.matches('input[type="checkbox"]')) collect();
    });
    $('[data-exam-filter]', settings).addEventListener('input', function (e) {
      var term = e.target.value.trim().toLowerCase();
      $$('.check[data-name]', settings).forEach(function (l) { l.hidden = term && l.dataset.name.indexOf(term) === -1; });
      $$('.exam-group', settings).forEach(function (g) { g.hidden = !$$('.check[data-name]', g).some(function (l) { return !l.hidden; }); });
    });
    $('[data-copy]', settings).addEventListener('click', function () {
      syncOut.select();
      (navigator.clipboard ? navigator.clipboard.writeText(syncOut.value) : Promise.reject()).then(function () { toast('Settings code copied.'); }).catch(function () { document.execCommand && document.execCommand('copy'); toast('Settings code copied.'); });
    });
    $('[data-import]', settings).addEventListener('click', function () {
      try {
        var d = JSON.parse(decodeURIComponent(escape(atob($('[data-sync-in]', settings).value.trim()))));
        var valid = cat.exams.map(function (e) { return e.slug; });
        var q = prefs();
        q.exams = (d.exams || []).filter(function (s) { return valid.indexOf(s) !== -1; });
        q.categories = (d.categories || []).filter(function (s) { return cat.categories.some(function (c) { return c.slug === s; }); });
        q.types = (d.types || Core.ALL_TYPES).filter(function (t) { return Core.ALL_TYPES.indexOf(t) !== -1; });
        savePrefs(q); location.reload();
      } catch (e) { toast('That code is not valid.'); }
    });
    $('[data-reset]', settings).addEventListener('click', function () {
      if (!confirm('Unfollow all exams and reset alert settings?')) return;
      put('alertPrefs', Core.defaultPrefs()); put('alertRead', {}); put('alertAlerted', {}); location.reload();
    });
    paintMeta();
  }

  // ---- Notifications page ----
  var box = $('[data-notifications]');
  if (box) {
    var catalog = JSON.parse(box.dataset.catalog);
    var nameOf = {}; catalog.exams.forEach(function (e) { nameOf[e.slug] = e.name; });
    var view = 'unread', examFilter = '';
    var render = function (items) {
      var q = prefs();
      if (!hasSelection(q)) {
        box.innerHTML = '<div class="empty"><p><strong>You are not following any exams yet.</strong></p><p>Choose your exams to get their notifications, admit cards, results and answer keys here.</p><a class="btn" href="' + BASE + 'my-exams/">Choose my exams</a></div>';
        return;
      }
      var rm = readMap();
      var mine = myItems(items, q).sort(function (a, b) { return Core.itemDate(b).localeCompare(Core.itemDate(a)); });
      var unreadCount = mine.filter(function (i) { return Core.isUnread(i, q, rm); }).length;
      var list = mine.filter(function (i) {
        return (view === 'all' || Core.isUnread(i, q, rm)) && (!examFilter || (examFilter.indexOf('cat:') === 0 ? !i.exams.length && i.category === examFilter.slice(4) : i.exams.indexOf(examFilter) !== -1));
      });
      box.innerHTML =
        '<p class="small muted">Following: ' + q.exams.map(function (s) { return esc(nameOf[s] || s); }).concat(q.categories.map(function (c) { var k = catalog.categories.filter(function (x) { return x.slug === c; })[0]; return 'Other ' + esc(k ? k.name : c) + ' notices'; })).join(', ') + ' · <a href="' + BASE + 'my-exams/">Edit</a></p>' +
        '<div class="notif-bar"><div class="tabs" role="tablist"><button role="tab" class="tab' + (view === 'unread' ? ' active' : '') + '" data-view="unread">Unread (' + unreadCount + ')</button><button role="tab" class="tab' + (view === 'all' ? ' active' : '') + '" data-view="all">All (' + mine.length + ')</button></div>' +
        '<div class="exam-actions"><select data-exam-pick aria-label="Filter by exam"><option value="">All my exams</option>' + q.exams.map(function (s) { return '<option value="' + s + '"' + (examFilter === s ? ' selected' : '') + '>' + esc(nameOf[s] || s) + '</option>'; }).join('') + q.categories.map(function (c) { return '<option value="cat:' + c + '"' + (examFilter === 'cat:' + c ? ' selected' : '') + '>Other ' + esc(c) + ' notices</option>'; }).join('') + '</select>' +
        (unreadCount ? '<button class="btn btn-ghost" data-read-all>Mark all as read</button>' : '') + '</div></div>' +
        (list.length ? '<ul class="updates">' + list.map(function (i) {
          var un = Core.isUnread(i, q, rm);
          return '<li class="update' + (un ? ' unread' : '') + '" data-id="' + i.id + '"><div class="update-meta">' + (un ? '<span class="dot" aria-label="Unread"></span>' : '') + '<span class="badge badge-' + esc(i.type) + '">' + esc(TYPE_LABELS[i.type] || 'Update') + '</span><span class="muted small">' + esc(fmt(i.date) || ('Added ' + fmt(i.firstSeen))) + '</span></div>' +
            '<a class="update-title" href="' + esc(i.url) + '" target="_blank" rel="noopener" data-open="' + i.id + '">' + esc(i.title) + '</a>' +
            '<div class="update-foot"><span class="muted small">Source: ' + esc(i.sourceName) + '</span>' + i.exams.filter(function (s) { return nameOf[s]; }).map(function (s) { return '<a class="chip" href="' + BASE + 'exams/' + s + '/">' + esc(nameOf[s]) + '</a>'; }).join('') +
            (un ? '<button class="link-btn small" data-mark="' + i.id + '">Mark as read</button>' : '') + '</div></li>';
        }).join('') + '</ul>'
          : '<p class="empty">' + (view === 'unread' ? 'You are all caught up. 🎉 New updates for your exams will appear here after the next check (Mon, Wed & Fri, 1 AM IST).' : 'No updates for these exams yet.') + '</p>');
      $$('[data-view]', box).forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.view; render(items); }); });
      $('[data-exam-pick]', box).addEventListener('change', function (e) { examFilter = e.target.value; render(items); });
      var ra = $('[data-read-all]', box);
      if (ra) ra.addEventListener('click', function () { markRead(mine.map(function (i) { return i.id; })); render(items); });
      $$('[data-mark]', box).forEach(function (b) { b.addEventListener('click', function () { markRead([b.dataset.mark]); render(items); }); });
      $$('[data-open]', box).forEach(function (a) { a.addEventListener('click', function () { markRead([a.dataset.open]); setTimeout(function () { render(items); }, 50); }); });
    };
    updates().then(render);
  }
})();
