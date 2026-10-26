# Overload

A small phone app (an installable PWA) that does one thing: it tells you what to lift today and
what weight and reps to aim for, so you keep progressively overloading. It's built for a
two-week PPLUL A/B rotation plus three runs a week (easy, quality, long), with planned deload
weeks. It's a slimmed-down derivative of [openGym](https://github.com/DuarteSantos8/openGym).

- **Today**: shows which day of the rotation is next (it follows what you logged, not the
  calendar), with per-exercise targets, this week's runs as checkboxes, and a quick bodyweight entry.
- **Workout**: set rows come prefilled with the target. Tap ✓ as you go and adjust with the ± buttons.
- **Progression** (double progression): hit the top of the rep range on every set and the weight
  goes up by `Increment`. Otherwise, beat last time by a rep. Two sessions in a row under the
  range trigger a drop of 10%.
- **Blocks**: 3 build weeks then 1 deload week by default (2:1–6:1 or off in Settings). In a deload
  week you do half the sets at the same weight with RIR +2, and runs are cut to 70% with the
  quality session swapped for strides. Deload sessions never count toward progression.
- **History**: a lift/run heatmap with deload weeks marked, plus per-exercise charts (top set,
  estimated 1RM, volume).
- **Body**: a bodyweight trend with a 7-day average, and a muscle map of recent training.
- Data is stored on the device first, and it works offline. Sync through Supabase is optional.

## Programs

Import from **Settings → Import**. JSON, `.xlsx` and `.csv` are accepted. Templates:
[`examples/program.json`](examples/program.json), or download the Excel template from Settings.

Spreadsheet format: one row per exercise.

| Week | Day | DayName | Order | Exercise | Sets | Reps | RIR | Increment | StartWeight | HitsToProgress | Muscles | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 1 | Push A | 1 | Barbell Bench Press | 3 | 6-8 | 2 | 5 | 135 | 1 | chest, triceps | |

There's also an optional sheet named `Settings` with these columns: `Build`, `Deload`,
`RunEasyMiles`, `RunQualityMiles`, `RunLongMiles`, `RunEasyNotes`, and so on. Set `Increment`
to 0 for exercises where you progress by reps only. If a file has any invalid rows, none of it is
imported, and you get a list of the errors by row number.

Re-importing a program keeps your history. Exercises are matched by name, so their progression
carries on.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: progression, blocks, rotation, import, merge, …
npm run build
node scripts/make-icons.mjs   # regenerate the PWA icons
```

## Deploy (free): Vercel + Supabase

1. **Supabase** (optional, needed for sync): create a free project. In the SQL Editor, run
   [`supabase/schema.sql`](supabase/schema.sql). Under Authentication → URL Configuration, set
   the Site URL to your Vercel URL and add it to Redirect URLs. Copy the Project URL and the
   anon key from Project Settings → API. In Authentication → Email Templates, add
   `{{ .Token }}` to both the **Magic Link** and **Confirm signup** templates. The app asks for
   that code, because on iPhone a home-screen app can't receive the email link (it opens in
   Safari, which has separate storage).
2. **Vercel**: push this repo to GitHub, then import it at vercel.com/new. Vite is detected
   automatically. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   and deploy. Every push to `main` redeploys.
3. On your phone, open the URL, then Share → **Add to Home Screen**.

Friends can use the same URL. They sign in with their own email and get their own data, which
row-level security keeps separate. Once everyone has joined, you can turn off new sign-ups in
Supabase (Authentication → Providers → Email). Free Supabase projects pause after a week with no
traffic. Regular use keeps yours awake, and a paused project can be resumed from the dashboard.

Without the Supabase variables, the app runs in local-only mode. Use **Export backup** in
Settings to keep a copy of your data.

## License

AGPL-3.0-or-later, the same as openGym. See [NOTICE.md](NOTICE.md).
