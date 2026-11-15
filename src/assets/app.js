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
