# ExamNest

An exam-preparation website. It shows the latest exam notifications, admit cards, results, answer keys and exam dates, all collected **automatically from official exam-body websites** every **Monday, Wednesday and Friday at 1:00 AM IST**. It also has free practice questions with worked explanations and timed mock tests.

"ExamNest" and the teal/amber colours are placeholders. Change them in `site.config.json`.

## What's included

| Area | Details |
| --- | --- |
| Latest updates | Filter by type (notification, admit card, result, answer key, exam date, syllabus) and category, plus keyword search. Every item links to the official notice. |
| Exam pages | 32 exams across Banking, SSC, Railways, UPSC & Defence, Teaching and Entrance. Each page has an overview, stages, its latest updates, answer keys, the official papers archive, practice links and a mock test. |
| Papers & keys | Answer keys and papers recently published by exam bodies, plus links to each body's official archive. |
| Practice | Original questions with explanations in Quant, Reasoning, English and General Awareness, filterable by topic. |
| Mock tests | Timed (45 s per question), +1 / −0.25 marking, question palette, score card and full solution review. |
| Exam alerts | **My Exams** page: tick exams (or a whole category), choose update types, turn on device notifications. **Notifications** tab: matching updates with Unread / All, per-exam filter and mark as read. The header bell shows the unread count, and each exam page has a one-click *Get alerts* button. The installed app checks in the background (Periodic Background Sync, Chrome/Android). |
| My progress | Attempt history, stored in the browser (no login or server needed). |
| App | Installable PWA (manifest + service worker) that works on Android/iOS home screens. It can be wrapped for the Play Store with a Trusted Web Activity (e.g. Bubblewrap / PWABuilder). |
| Status page | `/sources/` shows when each official source was last checked and whether the check succeeded. |

### About alert settings
Settings are saved on the user's device (localStorage, mirrored to IndexedDB for the service worker). No login is needed. To move them to another device, use the copy/paste *settings code* on the My Exams page. Server-side accounts, plus push notifications delivered while the app is closed on any browser, would need a backend such as Firebase or Supabase.

## How auto-update works

1. On the server, the `exam-aim-update.timer` systemd timer runs `deploy/refresh.sh` every Mon/Wed/Fri at 1:00 AM IST.
2. `scripts/update.mjs` reads every site in `data/sources.json`. Pages that only render with JavaScript (SSC, SBI, RBI, CAT) are opened in headless Chromium. It respects `robots.txt`, keeps only exam-related links, labels each one by type and exam, picks out the date, removes duplicates and merges into `data/updates.json`. If one source fails, its earlier items are kept.
3. `scripts/build.mjs` builds the site into a new release folder, and the live site switches over to it in a single step. Collected data is kept in `/opt/exam-aim/live-data`, outside the git checkout.

### Add or fix a source
Add an entry to `data/sources.json` (`mode`: `html`, `browser` or `rss`), then add its `id` to the `sources` list of the matching exams in `data/exams.json`. For sites whose notices aren't links, add `rows` selectors (see the SSC entry).

### Add questions
Put more items in `data/questions/<subject>.json`, or add a new subject file and reference it from an exam's `subjects`.

## Run locally

```bash
npm install
npm run update   # fetch latest from official sources (needs internet)
npm run build    # writes dist/
npm run serve    # http://localhost:8080
```

## Go live

Production runs on the EC2 server at **https://exam-aim.orbit-group.online**. Follow [`deploy/DEPLOY.md`](deploy/DEPLOY.md). It installs into `/opt/exam-aim` only, adds a single nginx site and a systemd timer for Mon/Wed/Fri 1:00 AM IST, and doesn't touch other sites or services.

`.github/workflows/update-and-deploy.yml` is an optional manual alternative that deploys to GitHub Pages.

## Content policy

- Updates are links to official notices. Nothing is rehosted.
- Practice and mock questions are original.
- The site states that it is not affiliated with any exam body (see `/disclaimer/`).
