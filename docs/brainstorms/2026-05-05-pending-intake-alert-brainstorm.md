---
date: 2026-05-05
topic: pending-intake-alert
---

# Pending Intake Submissions — Global Alert

## What We're Building

A subtle but persistent alert that surfaces pending intake form submissions
to staff who can act on them. It has two coordinated surfaces:

- **A badge** on the **Pacientes** nav item (sidebar + desktop header) showing
  the live count of `IntakeSubmissionStatus.PENDING` submissions.
- **A dismissible-looking banner** at the top of every page (rendered by
  AppShell) that says how many submissions are waiting and links to the
  intake submissions tab. The banner stays while count > 0.

Both surfaces read from the same client-side count source so they never
disagree.

## Why This Approach

Of three options considered:

- **A. Single client poller in AppShell (chosen).** A `usePendingIntakeCount`
  hook fetches `/api/intake-submissions/pending-count` on mount and on a
  ~60s interval, exposes the count via context. Banner + badge both read
  from the context. Cheap (1 request/minute/user), live enough that a new
  submission appears within a minute, no shell refactor required.

- **B. Server-rendered in the layout.** Cheaper but stale until the user
  navigates. A new public intake submission wouldn't reflect on a tab that
  was already open — that's exactly the case we care about.

- **C. SSE/WebSocket push.** Real-time but adds connection management,
  Vercel long-lived limitations, and infra. Overkill for an event that
  fires a handful of times a day at most.

A wins on correctness/freshness for the cost.

## Key Decisions

- **Surfaces:** badge on Pacientes nav item + global banner in AppShell.
- **Audience:** anyone with `patients` permission at WRITE access. Readers
  don't see the alert (they can't act on it) and don't trigger the fetch.
- **Clear behavior:** badge follows the live PENDING count; banner stays
  visible while count > 0. No per-user dismiss state — once everything is
  reviewed, the alert goes away on its own.
- **Data source:** new endpoint `GET /api/intake-submissions/pending-count`
  returning `{ count: number }`, scoped to `clinicId` + permission gate.
- **Polling:** every ~60s via `usePendingIntakeCount` hook; on tab focus
  also re-fetch immediately (so returning to a tab after lunch shows fresh
  count without waiting for the next tick).
- **Single source of truth:** a `PendingIntakeProvider` puts the count on
  React context; both the nav badge and the banner consume it. No
  duplicate fetches.
- **Visual style:** badge mirrors any existing nav badge styling (look at
  the agenda's todo overdue indicator if one exists); banner uses the
  warn/info palette already used elsewhere in the shell.

## Open Questions

- **Banner copy:** "X ficha(s) de cadastro pendente(s) — revisar" with link
  to `/patients?tab=intake`? Confirm exact text in the planning step.
- **Mobile bottom-nav badge:** include? The bottom nav already shows a
  Pacientes entry — we should be consistent. Default to yes unless space
  is too tight.
- **Banner dismissal:** locked-on for now (clears when count hits 0).
  Revisit if it gets noisy in practice.

## Next Steps

→ `/ce:plan` for implementation details (endpoint, hook, context provider,
badge integration, banner placement, tests).
