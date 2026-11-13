# FitnessDex development roadmap

Updated: 13 November 2026

This file records priorities and planned features. A roadmap item is **not** an implementation commitment or a completed feature. Keep the app's one-action-at-a-time design and preserve existing exercise IDs, activity history, rewards and cloud saves.

## Priority 0 — Foundation (current focus)

- [ ] Exercise/set/repetition records remain individually loggable, including one-off spontaneous sets. Workouts are optional groups of existing activities; the app may **suggest** grouping when three or more exercises are logged close together, but never silently groups records.
- [ ] Verify exercise logging and editing across modalities (sets, timed holds, distance, duration, swimming, side-specific mobility), including the updated v0.6 mobile flow.
- [ ] Verify cloud sync, conflict resolution, local-first offline saves, import/export, cross-device updates and save recovery with realistic user data. Prevent silent overwrite or duplicate logs.
- [ ] Check that challenges, achievements and monthly rewards are counted exactly once from actual qualifying activity records, with correction and deletion handled safely.
- [ ] Reduce remaining UI friction through phone-width interaction tests. Keep optional controls and detailed statistics behind navigation, not on the primary action screen.

**Gate:** Do not implement scheduled notifications before these foundations are reliable. Test changes against saved progress, not only empty profiles.

## Priority 1 — Exercise catalogue and experience

- [ ] Review unresolved exercise-reference mappings and avoid duplicate variants.
- [ ] Improve visual feedback for completed exercises, earned rewards and the collection without crowding logging screens.
- [ ] Keep the media architecture inactive/hidden until genuinely usable and appropriately licensed exercise illustrations or GIFs can appear directly in the app.

## Long-term Campaigns (v0.6.1)

- **Arm Forge — 12 weeks:** biceps/pulling, triceps/pressing, shoulders, grip
- **Core Foundation — 12 weeks:** front bracing, lateral/anti-rotation, controlled core movement
- **Squat Masterwork — 52 weeks:** squat pattern, single-leg control, hips/posterior chain, mobility

Each programme is a time-boxed training track with two training days per week and required movement families, not a fixed weight or bodyweight target. Only existing exercises are counted. Campaign credit is derived from original logs; standalone sets work just like grouped workouts. There are three or four chapters; chapter medals require at least 70% of its weeks meeting targets and the campaign finale needs 75% of all weeks. These thresholds are **gamification choices**, not medical training prescriptions. Missed weeks don't destroy past progress and neither campaign enrolment nor weekly credit grants duplicate XP. Comparisons use the same logged exercise over time, and performance is not compared between exercise variations.

Campaigns are deliberately separate from the daily/weekly challenge generator and don't modify workout assignments. Future versions may add user-customisable schedules, equipment options, campaign artwork, planned deloads and other long-term masterworks. Existing **Priority 0 stability work** still applies, including cloud-save and restoration tests.

## Four additional campaigns (v0.6.2)

Added four user-approved programmes under **More → Campaigns**. Campaign enrolment and credit remain in the existing v7 save model; no duplicate exercise logs, forced workouts or separate XP.

| Campaign | Duration | Weekly emphasis |
| --- | --- | --- |
| **Deadlift Mastery** | 52 weeks / 4 chapters | At least 2 training days, with hinge practice, posterior-chain support, bracing and mobility |
| **Swimcraft** | 26 weeks / 3 chapters | At least 2 swimming days, including at least one stroke-specific session |
| **The 5K Engine** | 16 weeks / 4 chapters | At least 3 distinct running days plus one runner-mobility session |
| **Grip Mastery** | 12 weeks / 3 chapters | At least 2 hanging-practice days, plus shoulder/scapular control and pulling |

The 5K Engine uses ordinary running logs, not an inferred interval/easy/tempo tag. Swimcraft uses explicit lengths when logged; it does **not** assume a pool length or convert lengths to kilometres. Do not claim an exact 5K pace without a logged run of about 5 km and an optional time. Every campaign proposes simple A/B sessions (A/B/C for 5K), with future work needed for adaptive session prescriptions.

**Separate research/design:** [PROGRESSION_DESIGN.md](./PROGRESSION_DESIGN.md) describes how an independent Just 6 Weeks-style repetition/hold progression engine could run alongside variant progressions and simpler fallback exercises. Not implemented in v0.6.2.

## Progression feedback UI — v0.7.3

- Visual redesign only: high-contrast one-set target, clearer completed-set indicators, more legible rest feedback, and a focused result showing actual repetitions against suggested targets.
- One prominent next action and a compact persistence-award panel; newly unlocked awards are prominent but ordinary completed sessions still receive useful feedback.
- Incomplete and substituted sets remain productive training, not false passes. Missing/revised exercise records are read from the existing logs, not from duplicated session data.
- No changes to logging schema, progression formula, workout grouping, or Supabase sync. Validate old saves, offline cache updates and phone rendering before extending the features.

## Deep squat mobility progression — v0.7.2

- Added **Supported deep squat hold** (e147) → **Unsupported deep squat hold** (e148) as two distinct, individually logged time-based skills in ExerciseDex → Flexibility & mobility → General mobility.
- The existing **Deep squat hold** (e104) remains unchanged, including its historic records and its general supported/unsupported guidance. Existing entries must not be silently reclassified as unsupported.
- The unsupported variation has an advisory preparation milestone of 20 seconds of supported practice. This is not an automatic safety or balance clearance; users can record actual practice freely.

## Progressive Overload — v0.7.0

- Choose **Just log sets & reps** or **Follow a progression** after selecting a suitable exercise.
- Log mode uses a StrongLifts-style compact set grid. Progression mode follows a Just 6 Weeks-style one-set screen, with editable targets and rest timer.
- Tracks have three independent focus modes: increase volume, develop variants, or combine both. Existing exercises remain separate real records, even if a user switches variation during a session.
- Each variant's suggested reps increase conservatively after two successful sessions involving that exact movement; three persistent misses can reduce an elevated target. This is an initial testable heuristic, **not a verified clinical exercise prescription**.
- A varied session is productive even when targets are missed. Missing a target does not automatically fail a workout. On a plateau, optional supporting exercises can be suggested without diagnosing the limiting muscle.
- Persistence awards derive from logged, referenced real sets (First Steps, 5 and 10 distinct training days, four and twelve distinct weeks, returning after a break). They do not add duplicate exercise XP.
- A separately validated **v8** state stores track plans and session-to-log references; existing logs remain the source of truth. An unsaved draft is kept locally for same-device recovery, separate from cloud data.
- Keep testing real-device behaviour, rest timers when backgrounded, cloud-conflict handling and interrupted saves as the next **Priority 0** checks. The adaptive formula must be tuned with real training evidence before strong training recommendations.

## Priority 2 — Smart movement prompts and Quick Missions (deferred)

**Goal:** Encourage useful spontaneous activity throughout the day without making every movement a formal workout.

**Core journey:** **Nudge → Activity → Log → Progress.**

### Quick Missions — in-app first

From a single accessible action, choose **2 minutes**, **5 minutes**, **15 minutes** or **Surprise me**. FitnessDex suggests **one** appropriate movement or mini-challenge with a clear target (for example, a 45-second plank, a short walk, easy shoulder mobility or a small number of push-ups).

Acceptance criteria:

- [ ] One action at a time: choose available time → one suggested activity → start/timer or log → visible result. Do not expose a screen full of competing missions.
- [ ] Suggest a relevant existing exercise ID, preserve its original logging mode (sets, hold, distance, duration, etc.) and use its existing form, timer or an appropriate quick log.
- [ ] Allow **Skip**, **Something else** and **Not now**; suggestions are invitations, never obligations.
- [ ] Save completed missions as **standalone exercise records by default**, with optional later workout grouping. Do not create a synthetic workout or award credit merely for viewing, accepting or skipping a prompt.
- [ ] Count real logged performance towards applicable exercise progression, existing achievements and active monthly challenges using the same validation and time rules as ordinary logs.
- [ ] Tailor suggestions to demonstrated ability, user goals, recent exercise and trained muscle groups; avoid repeating the same movement or encouraging unsafe escalation.
- [ ] Offer a mobility, easy movement or rest alternative after heavy recent activity. Recovery suggestions should not be penalised as missed activity.
- [ ] Where evidence is limited, label suggestions as optional and conservative rather than assuming readiness.

### Five notification categories

1. **Inactivity nudges:** If no activity has been *logged* in a configured period, occasionally offer a short movement. Say “Nothing logged recently,” not “You have been inactive.”
2. **Challenge reminders:** Before an approaching deadline, show the specific challenge, remaining target and one clear action. Check live challenge validity and already completed work before sending; avoid reminders for expired or completed challenges.
3. **Random activities:** Occasionally offer a suitable standalone exercise/mini-challenge with variety and ability/recovery safeguards.
4. **Progress reminders:** Point out an achievable next milestone, personal best or nearly completed collection, using actual recorded data rather than fabricated proximity.
5. **Recovery suggestions:** Offer rest or gentler activity when recent logged training warrants it. Never imply the app has complete knowledge of fatigue or movement outside FitnessDex.

**All notifications must be actionable:** tapping goes directly to the relevant exercise, challenge, mini-timer or log screen, retaining enough context for the user to start with minimal steps.

### Preferences, relevance and safeguards

- [ ] Notifications are **opt-in**. Ask permission contextually rather than on first launch; an explicit control can disable them again.
- [ ] General nudge frequency: **Gentle (up to 1/day)**, **Active (up to 3/day)** or **Intense (up to 5/day)**. These are ceilings, not targets.
- [ ] Enable or disable each notification category independently.
- [ ] Quiet hours configurable. Respect them across all categories; avoid inappropriate delivery when local time or timezone changes.
- [ ] Challenge deadline reminders have their own on/off and timing rules, independent of the general-nudge frequency budget, but still follow quiet hours, deduplication and anti-spam rules.
- [ ] Cooldowns, recency limits and variety checks prevent repeated or overlapping prompts. Do not queue a burst of notifications after hours offline.
- [ ] Logging a relevant exercise, dismissing or snoozing a prompt, marking a recovery day, or changing preferences should update future suggestions.
- [ ] Treat **nothing logged** as insufficient evidence about physical activity; it must never be described as confirmed inactivity.
- [ ] Suggestions should account for current active challenge goals without pressuring the user to overtrain or ignoring recovery.
- [ ] Keep notification settings and delivery state separate from training records and preserve them through upgrades and cross-device sync where appropriate.

### Technical distinction and implementation sequence

**In-app prompts (first phase):** Can be shown when FitnessDex is open using its existing activity logs, challenge calculations and local UI. No mobile push permission or delivery service is required. These may also power Quick Missions independently of any notification subscription.

**Genuine mobile push notifications (later phase):** Must deliver while FitnessDex is not open. Browser/PWA push is platform- and installation-dependent and needs a supported service worker, user permission, Push API subscriptions, a push delivery endpoint, secure subscription storage, notification click routing and a scheduled backend (e.g. Supabase Edge Functions plus a scheduler). The current app's service worker handles caching and version updates; it does **not** by itself provide scheduled push delivery. Assess iOS/Android installation/permission constraints before committing to coverage.

Proposed rollout after Priority 0 is complete:

1. Build a data-backed, testable **suggestion engine**; don't couple exercise-selection logic to notification transport.
2. Ship **Quick Missions** and optional **in-app prompts**, validating the Nudge → Activity → Log → Progress sequence.
3. Add notification preferences, quiet hours, deduplication and recovery/relevance filters.
4. Add genuine push infrastructure, subscription lifecycle handling, notification tap deep links, offline/expired state checks, and end-to-end mobile testing.
5. Evaluate utility and frequency based on actual opt-in use; reduce unwanted reminders before adding more.

### Important test scenarios

- An exercise has not been logged today but the user was physically active elsewhere: use neutral wording.
- Three spontaneous sets in a short window are logged separately and only *suggested* as a workout.
- A reminder for a challenge is cancelled when the user has just completed it on another device.
- A challenge has 20 minutes remaining but the user is within quiet hours: do not send a disruptive alert.
- A user completes a Quick Mission while offline: one real activity record is saved and later synced once, with no duplicate reward.
- Heavy recent leg training leads to recovery/easy alternatives rather than more leg repetitions.
- Gentle, Active and Intense caps work independently of challenge-specific deadline rules; category switches, snooze and quiet hours work.
- Tapping a push notification opens the intended exercise or challenge directly rather than dumping the user on the dashboard.
- New app versions and device changes preserve progress and don't create duplicate subscriptions or notifications.

## Out of scope until explicitly prioritised

No automatic activity inference from silence, no compulsory workouts, no escalating exercise for streak preservation, and no claims that FitnessDex has measured fatigue or activity outside the app without an authorised data source.

### v0.7.1 safety refinement

Each guided draft has a stable session ID before the first set. The save function checks whether that exact session is already in the saved history before creating any exercise records; this prevents a re-opened draft from duplicating a completed session. Persistence badges require distinct training days so several sessions on one day cannot earn long-term consistency awards by themselves.
