// A prompt to paste into any AI chat: it interviews the user, then replies with a program in
// the JSON format normalizeProgram (lib/import.js) accepts, ready for Settings → Paste program.

import { MAX_RUNS } from './runs.js'

/** The current program as the AI should see it: the import format, without app-only fields. */
export function programForPrompt(program) {
  const { updatedAt, ...p } = program
  return {
    ...p,
    days: p.days.map(d => ({
      id: d.id, week: d.week, name: d.name,
      exercises: d.exercises.map(({ id, muscles, ...e }) => e)
    }))
  }
}

export function buildPrompt(program, unit = 'lb') {
  const inc = unit === 'kg' ? '2.5' : '5'
  const current = program
    ? `\n## My current program\nChange this rather than starting over, unless I ask for something new. When you rename an exercise I have been doing, add "renamedFrom": ["Old name"] to it so my logged history moves over.\n\n\`\`\`json\n${JSON.stringify(programForPrompt(program), null, 2)}\n\`\`\`\n`
    : ''
  return `You are an experienced strength coach. Help me set up a lifting program for my workout app, Overload.

First ask me, in one short message, anything you need to know: my goals, how many days a week I can train, how long a session can be, what equipment I have, my experience, any injuries, and whether I run. Wait for my answers. Then reply with the program as a single \`\`\`json code block and nothing else, so I can paste it into the app.

## How the app works
- The days are a rotation: after the last day it goes back to the first, whatever the calendar says.
- Double progression: each exercise has a rep range. When every set reaches the top of the range ("hitsToProgress" sessions in a row), the weight goes up by "increment". Otherwise the target is one more rep than last time.
- Training blocks: "build" weeks, then "deload" week(s) with fewer sets and more reps in reserve.

## Format
\`\`\`json
{
  "name": "Upper / Lower",
  "unit": "${unit}",
  "block": { "build": 3, "deload": 1 },
  "runs": { "enabled": true, "plan": [{ "name": "Easy", "km": 5, "notes": "Conversational pace" }] },
  "days": [
    { "id": "A1", "week": "A", "name": "Upper 1", "exercises": [
      { "name": "Barbell Bench Press", "sets": 3, "reps": "6-8", "rir": 2, "increment": ${inc}, "startWeight": 0, "hitsToProgress": 1, "notes": "" }
    ]}
  ]
}
\`\`\`

## Rules
- "unit" is "${unit}". Weights and increments are in ${unit}.
- "reps" is a range as text ("8-12") or a single number. "sets" is a whole number of 1 or more. "rir" is reps in reserve (0–4).
- "increment": ${inc} for most lifts, 0 for bodyweight exercises (those progress by reps).
- "startWeight": a sensible guess from what I tell you, or 0 if you can't tell.
- Day "id"s must be unique. Use "week": "A" for every day, unless the program alternates two different weeks: then use "A" and "B".
- Use common gym names for exercises (e.g. "Romanian Deadlift", "Lat Pulldown"). Leave muscles out: the app fills them in.
- "block": { "build": 2–6, "deload": 1 or 2 }, or null for no planned deloads.
- "runs": up to ${MAX_RUNS} runs a week, each with a "name" and an optional "km" and "notes". Use { "enabled": false, "plan": [] } if I don't run.
- Put short coaching cues in "notes" if they help.
${current}`
}
