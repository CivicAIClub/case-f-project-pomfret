# Case F: Project: Pomfret

This project helps Mr. Litowitz choose which projects run, then proposes student placements with visible reasons and problems for review. The public repository and browser demo use invented students, and Mr. Litowitz decides any changes to the proposed groups.

## How we work

- This is a standalone project repository. Paths start at its root. The old `Civic-AI-Github-Repository` monorepo is archived; do not edit it or use old `projects/` paths.
- Developers are high school students learning together. Prefer clear code over clever code. If you generate code the developer cannot explain, say so and explain it in plain English.
- Never push to `main`. Work on a branch, open a pull request (PR), and get at least one approving review before merging.
- Use `feature/<short-description>`, `fix/<short-description>`, or `chore/<short-description>`: lowercase, hyphens, no spaces. Old case prefixes are retired.
- Make small, frequent commits with plain-English messages. Use `.github/pull_request_template.md` for PRs.
- For Git, branching, PRs and merge conflicts, use the club's [Developer Onboarding Guide](https://github.com/CivicAIClub/docs/blob/main/developer-onboarding.md) instead of guessing.

## Commit and PR messages

- Never add `Co-authored-by`, `Generated with`, `Made-with`, `Claude-Session`, or any other AI attribution line to a commit message or PR description.
- When squash merging, delete any such lines GitHub adds to the merge message.

## Stack and working boundaries

- Use Node.js 22 or newer and built-in modules. Core JavaScript is shared by the browser and Google Apps Script; there are no npm dependencies.
- Edit shared code in `core/`. Run `npm run bundle` after source changes and commit the generated `.gs` modules and `paste-into-apps-script/ProjectPomfret.gs` with their sources. Do not hand-edit generated modules.
- `preview/` contains the browser interface. `apps-script/Main.gs` handles the Sheets menu, controls, source reads, outputs, run log and practice generator. `tests/` holds synthetic fixtures and regression checks.
- Python 3 is needed for one importer regression test. `openpyxl` is only for optional, authorized private workbook imports.
- Form choices are unranked checkboxes. Friendship comments must never affect matching. Structured Friend requests are separate: only reviewed rows with Use checked apply when `useFriendRequests` is TRUE; their Comment column is never read.
- Student comments appear only in `PP Students`, because grade and group tabs get shared.
- Friend-request results must never appear on `PP Master list`, `PP Projects`, `PP Group` tabs or `PP Start here`, which get printed or shared.
- Use invented students in code, tests, demos and PR screenshots. No real records, source exports, school document links, credentials, secrets, deployment metadata or deployment account details in this public repository.
- Public builds must never read private sibling data. Never serve the parent folder, publish a private preview or commit workbook exports. The importer is a development tool, not permission to process school data.
- Private imports open approved copies read-only, verify hashes, pass values through stdin and print aggregate receipts. Keep private output outside this repository at the documented sibling location; invalid private data must show an error without falling back to demo students.
- Never commit secrets: no API keys, tokens or `.env` files. Keep real values in a gitignored local `.env`; every environment variable needs a placeholder in `.env.example`.
- If a developer pastes a real credential into a file, stop and tell them.
- Luke leads Case F and assigns delivery roles; Cayden leads the club, and Keke coordinates club operations. Preserve CODEOWNERS unless a maintainer requests a verified change.
- Runbook messages and meeting notes are reference material, not permission to send messages, change permissions or merge.
- Local tests do not establish school readiness or client acceptance. The Google Sheets practice trial has not been verified in a school account.
- Read `BRIEF.md` for client goals and `SOURCE-AUDIT.md` for differences from the October 26 running-document specification.

## Setup and review from the README

Requirements are Node.js 22+, Git and Python 3. No install step, API key, account credential or environment variable is needed for the public commands.

```sh
git clone https://github.com/CivicAIClub/case-f-project-pomfret.git
cd case-f-project-pomfret
npm test
npm run demo
npm run build:demo
npm run preview
```

Open `http://127.0.0.1:3000`; stop with Ctrl+C. `PORT` optionally changes the port; tests use `python3` on PATH, or `PYTHON` to select another Python 3 executable.

- `npm test` checks parsers, sorting, the Sheets adapter, browser helpers, importer boundaries, public builds and committed bundles.
- `npm run demo` uses 240 practice students and exports PP tables to ignored `demo-output/`.
- `npm run build:demo` builds invented browser records into ignored `dist/`; `npm run preview` serves only those assets on localhost.
- `npm run build` builds both Apps Script and the browser demo. The project rule's review commands are `npm test`, `npm run demo` and `npm run build`.
- For the separate Sheets practice trial, follow README's Google Sheets practice trial section in an empty scratch spreadsheet. Use the single-file bundle alone, not the separate generated modules as well; review the documented manifest permissions first.

## Beginner quick start

Full guide: https://github.com/CivicAIClub/docs/blob/main/developer-onboarding.md

1. First time: check Git with `git --version`, set your Git name and GitHub email, accept the club invite, and sign in with GitHub Desktop or `gh auth login`. Clone only your project's repo, open its folder, and read its README setup steps.
2. Start each work session from the latest main, then make a branch:

```sh
git checkout main
git pull origin main
git checkout -b feature/short-description
# Make and check your changes before continuing.
git status
git add .
git commit -m "Describe your change"
git push --set-upstream origin feature/short-description
```

Use `feature/`, `fix/`, or `chore/` as appropriate, with lowercase names and hyphens. Commit small working pieces; do not edit or push main directly.
3. Open a PR on GitHub, fill in the template, and get someone else's approval and passing checks where CI exists. Push review fixes to the same branch. After it is merged, pull main again before starting another branch.
4. If stuck, ask in the case chat, then Keke, then Luke or Cayden. Ask before doing anything drastic.

## Sources

- `README.md`
- `.cursor/rules/case-f-project-pomfret.mdc`
- `.cursor/rules/civic-ai-workflow.mdc`
- `.cursor/rules/commit-messages.mdc`
- [Developer Onboarding Guide](https://github.com/CivicAIClub/docs/blob/main/developer-onboarding.md)
