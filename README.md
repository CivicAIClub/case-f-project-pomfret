# Case F: Project: Pomfret Sorting

## What this is

Mr. Litowitz (Project: Pomfret, Pomfret School) is the client for this case. He needs students sorted into their Project: Pomfret groups, which he calls a one-time, complex project. The first meeting is being scheduled, so there is no code yet. Status: first meeting being scheduled.

| | |
|---|---|
| **Client** | Mr. Litowitz, Project: Pomfret, Pomfret School |
| **Developers** | _Not yet assigned_ |
| **Club lead** | Cayden Auyang |
| **Status** | 🔵 First meeting being scheduled |

## The problem

Mr. Litowitz needs students sorted into their Project: Pomfret groups. He calls it a one-time, complex project.

How students choose, what limits each project has, and when final groups are due: _To be written in the first meeting._

## Goal

_To be written in the first meeting._ Likely direction (not a commitment): students rank their choices, and a tool places everyone within each project's size and rules, with Mr. Litowitz making the final call.

## Stack

_Not decided._ Prefer Google Workspace (Forms, Sheets, Apps Script). Decide in the first meeting and record the decision here and in `.cursor/rules/case-f-project-pomfret.mdc`.

## Student data

This repository is public. Never commit real student names, choices or rosters. Build and test with made-up students only.

## Repository layout

```
case-f-project-pomfret/
├── README.md              ← this file; keep it the source of truth for setup
├── .cursor/rules/         ← committed Cursor rules (workflow + project context)
├── .github/               ← pull request template, CODEOWNERS
└── .gitignore
```

Add code at the repo root (no `projects/` folder). When you add a real setup, write a "Setup from a fresh clone" section here: install, env vars (with a `.env.example`), run, build.

## Working on this repo

- Branch from `main` as `feature/<short-description>`, `fix/<short-description>`, or `chore/<short-description>` (lowercase, hyphens).
- Every change goes through a pull request with at least one approval. `main` cannot be pushed to directly.
- Never commit secrets. Put real values in a gitignored `.env`; list variable names with placeholders in `.env.example`.
- Cursor rules for this project are committed in `.cursor/rules/`. You do not need to paste anything into your IDE settings.
- The full Git walkthrough for beginners is the club's **[Developer Onboarding Guide](https://github.com/CivicAIClub/docs/blob/main/developer-onboarding.md)**.

## Definition of done (Phase 1)

_To be written in the first meeting._

## Contributors

- **Cayden Auyang:** club lead; set up this repository
- Developers: not yet assigned
