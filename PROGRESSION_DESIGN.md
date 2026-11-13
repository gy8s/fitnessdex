# FitnessDex — Adaptive progression and exercise-variant design

Status: **Design only**. Nothing in this document is implemented or part of a saved activity schema. Written 13 November 2026.

## Product intent

One familiar interaction: **Choose progression → Test → Prescribed set → Rest → Record actual result → Adapt next session**.

This borrows the broadly described *experience* of the Just 6 Weeks app, not its private training tables, code or brand. FitnessDex should go further by making repetition/hold progression and exercise-variant progression **two independent, compatible axes**.

### What we can verify about Just 6 Weeks

Its Google Play listing, updated 23 July 2026, describes an initial maximum-repetition fitness test, three progressive workouts of roughly 10–15 minutes a week, a built-in rest timer, recording actual sets and a performance chart. It advertises eleven exercise programmes. This supports the overall workflow, but **not the actual numerical progression algorithm, internal level cut-offs or a right to reproduce its schedules**.

Sources:
- [Google Play — Push Up Counter: Just 6 Weeks](https://play.google.com/store/apps/details?id=alexcrusher.just6weeks.pushups&hl=en_GB)
- [Apple App Store — 100 Push Ups: Just 6 Weeks](https://apps.apple.com/gb/app/100-push-ups-just-6-weeks/id586139454)

The following is an **original FitnessDex design proposal**, not an assertion about how Just 6 Weeks internally works.

## Two independent dimensions

1. **Within-exercise capacity:** Starting from a baseline clean set, improve controlled repetitions, sets, total weekly volume or duration **for the same exercise ID**. A test of 12 standard push-ups does not imply 12 diamond push-ups.
2. **Variation / skill development:** Practice a harder or different movement alongside the main exercise. A difficulty change is its own baseline and its own performance track. Keep simpler variations available as a back-off without treating them as a failed attempt.

A user could be increasing standard push-ups from 12 to 20 **while learning two controlled diamond push-ups**. During the same session they may return to incline push-ups for comfortable additional volume. These are distinct, correctly labelled records.

**Variant examples (not a strict universal ladder):** Wall push-up (e001), incline (e002), knee (e003), standard (e004), close-grip (e005), diamond (e006), tempo (e055), paused (e056), decline (e007), archer (e008). Knee and incline are alternative easier choices, not necessarily an ordered rank. Close-grip, diamond and decline train different demands; transitions must be elective and based on quality rather than an automatic unlock.

## Screen flow — one thing at a time

1. **Choose track**, e.g. “Improve standard push-ups”. Existing campaign can suggest it, but it must also work alone.
2. **Establish baseline**: perform a comfortably safe, technically valid max-repetition test *or* opt to use recent actual logs. Ask which variation was tested and store the test as an ordinary exercise log with a separate test reference.
3. **Today's session**: show only the next prescribed set and its exercise. Allow the user to lower the target or pick a suitable variation; never award credit for an unperformed set.
4. **Rest**: timer with Pause, Skip and Extend. It should not imply the user must continue if unwell or in pain. Foreground works without push infrastructure; background timer timing needs separate PWA testing.
5. **Log actual**: default to one-tap accept of the target or edit to the actual number; the saved record must reflect reality.
6. **Optional variant practice**: offer a small exploratory set (e.g. diamond push-up) before or after main work; own record and own baseline. Do not silently replace the main track with the variant.
7. **Optional back-off**: offer a simpler version if fatigue or failed reps make continuing the primary exercise inappropriate. Never disguise back-off repetitions as standard ones.
8. **Result**: actual total, main-variant performance, any new variation practiced and milestones. “Log another” remains available for spontaneous standalone sets.

**Example only**: someone improving standard push-ups might be shown their next standard set, then a modest diamond-push-up experiment if they choose to try it, followed by optional incline push-ups. All three exercise IDs remain separate. These examples are not universal prescriptions.

## Adaptive plan rules to prototype and validate

- Initial test determines a **conservative starting workload**; no automatic assignment to a generic 'week 3' based on demographic assumptions.
- Generate attainable sets from the user's recent successful repetitions (and optionally effort feedback), leaving room for form and recovery. Limit jumps to small increments; exact formulas require experimentation and evidence, not guesses.
- **Progress** after repeatable, accurately logged completion with satisfactory technique/effort. Completing a single unusually strong session is not sufficient evidence to leap forward.
- **Hold** after a borderline session; **reduce / simplify** after repeated misses or when recovery is indicated. Users may always override, pause or perform an easier alternative.
- **Practice a harder variation** without stopping progress on the standard one. Harder variants need their own performance baseline, tiny initial exposure and their own target range.
- Prefer actual log performance and record age to inferred training state. If no log exists, say “nothing logged”; do not infer physical inactivity or readiness.
- Keep intensity, soreness and pain distinct: optional subjective feedback (“easy / comfortable / difficult / stop due to discomfort”) could help, but **pain always triggers a stop recommendation**, not a punitive missed session.
- Plan around other logged upper-body sessions and non-app training reported by the user; do not over-prescribe simply to preserve a streak.
- Six-week blocks are a **useful short planning cadence**, not a promise that all users will hit an arbitrary 100-repetition target in six weeks.
- User-selectable target variations, preferred training days and rest timing. No enforced daily streak on strength progression.

## Integration and save safety

- **Exercise records are the single source of truth:** each actual set must save with its existing exercise ID, performed time, reps/weight/seconds and session association as appropriate.
- Do not create duplicate logs when a set simultaneously advances a progression track, Arm Forge, a challenge and an achievement.
- Tracks reference existing log IDs for completed tests/sessions and prescribed-versus-actual targets. They should not create a second shadow exercise history.
- Activity corrections or deletion must recalculate track progress. Never award duplicate XP or retroactively make a log count for a challenge issued after it was performed.
- Track definitions, optional enrolment, selected variation, a record of prescriptions/adjustments, and rest preferences belong in **new validated, versioned state** with canonical defaults in cloud fingerprints, old-backup compatibility and restore conflict protection.
- A multi-exercise progression session is **not necessarily a workout**. Grouping remains user-controlled and only suggested under existing rules.
- Expose a quick deep link for notifications or Quick Missions later, while keeping a simple standalone workout flow available to everyone.
- Guarantee one result is recorded once across offline saving, reconnection, account changes and two devices. Persist partially completed sessions only after explicit user confirmation.

## Testing required before implementation

- Baseline test at 1, 8, 20 and 50 clean reps, including no test at all.
- Standard push-up improvements with diamond practice and an incline fallback; confirm separate exercise IDs, counts and graphs.
- Consecutive missed targets, recovery days, exercise substitution, changed target, extra spontaneous sets and a user returning after weeks away.
- Mid-session navigation, refresh, offline operation and phone screen lock during a rest timer.
- Editing or deleting a single set never duplicates, loses or confuses cloud-synced exercises, campaign credit or reward XP.
- Safely handle exercises with seconds (plank), weighted sets (bench press), unilateral sides or incompatible units; no false numeric cross-variant comparison.
- Permissionless in-app progression works even if real mobile push is disabled.

## Development decision

**Do not implement the adaptive progression engine in the current campaign release.** First verify exercise/workout structure and cloud-save reliability, then prototype the session flow and adaptable algorithm using push-ups with saved fixtures, followed by multi-variant and fallback tests. Only after that should the general engine be exposed to all eligible movements.
