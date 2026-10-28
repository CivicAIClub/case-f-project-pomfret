# Project: Pomfret — Case F

A prototype for two decisions Mr. Litowitz needs to make: **which projects should run**, then **where each student should go**. It counts interest, suggests Majors and Minors, proposes placements, and keeps the reasons and problems visible for review.

This is a working prototype, not an approved school roster. The browser demo and repository use invented students. Some rules in the October 26 running document remain unfinished; see [SOURCE-AUDIT.md](SOURCE-AUDIT.md).

## Setup from a fresh clone

Requirements: Node.js 22 or newer, Git, and Python 3 for one importer regression test. No npm dependencies, environment variables, API keys or account credentials are needed. Python's `openpyxl` is only needed for optional private workbook imports.

```sh
git clone https://github.com/CivicAIClub/case-f-project-pomfret.git
cd case-f-project-pomfret
# While this build is under review:
git switch feature/project-pomfret-sorter
npm test
npm run demo
npm run build:demo
npm run preview
```

Open `http://127.0.0.1:3000`. Stop the server with Ctrl+C. Set `PORT` if needed. Tests use `python3` on PATH; `PYTHON` can select another Python 3 executable. No install step is needed for these commands.

| Command | Purpose |
| --- | --- |
| `npm test` | Parser, sorter, Sheets adapter, browser helpers, importer boundaries, public build and committed-bundle checks. |
| `npm run demo` | Generate 240 practice students in a simulated spreadsheet; prepare, count, sort and check using the committed Apps Script bundle. Print the summary and first 20 findings, and export every PP table as CSV to `demo-output/`. |
| `npm run bundle` | Rebuild the generated `.gs` modules and `paste-into-apps-script/ProjectPomfret.gs`. Commit generated changes with their sources. |
| `npm run build:demo` | Build the browser demo in `dist/` from invented records. Never reads the private import folder. |
| `npm run preview` | Serve only the generated demo assets on localhost. |
| `npm run build` | Build both the Apps Script bundle and browser demo. |

`demo-output/` and `dist/` are ignored by Git.

## Browser walkthrough

A five-step introduction appears on each fresh page load and can be reopened from **Walkthrough**:

1. Read project interest by grade and the suggested Major/Minor choices.
2. Change a project's decision or open the rules when needed.
3. Create draft placements. Explain what changed when you rerun them.
4. Review students, project rosters and grouped warnings.
5. Export the proposal for review.

The app has two main screens: choose projects, then place students. Changes to rules or project decisions mark old results as out of date. Reloading resets the demo. Comments are available for a person to read and never affect placements. The browser demo has no friend requests; the Google Sheets version uses the reviewed Friend requests tab only when `useFriendRequests` is TRUE.

`preview/demo-data.js` generates 253 invented browser records: 240 eligible or late students, 11 excluded records and two identity-review examples. The Sheets practice generator creates 240 students. These are separate fixtures for different review cases.

## Google Sheets practice trial

Use an **empty scratch spreadsheet** with practice data first. This trial has not yet been verified in a school account.

1. Run `npm run bundle`.
2. In the spreadsheet's bound Apps Script project, replace `Code.gs` with the entire `paste-into-apps-script/ProjectPomfret.gs`. Do not also add the separate generated modules.
3. Enable the manifest in Apps Script project settings and use `apps-script/appsscript.json`. It asks for two permissions: the current spreadsheet, and your email address, which fills in Locked by and Run by.
4. Save and reload the spreadsheet. Select **Project: Pomfret → Make practice data**. This refuses to run if any sheet contains data.
5. Run **Prepare students**, **Count interest**, then **Sort** with a reason. Read `PP Interest`, `PP Summary`, `PP Check` and `PP Needs you` before using the grade masters or project rosters.

In the grade tabs, a Major shows the same MAJ- label in Project #1 and Project #2, like last year's master list. A Minor shows two different MIN- labels, week 1 then week 2.

To move a student by hand, pick another label from the dropdown in Project #1 or Project #2. A Major is the same MAJ- label twice, or one label and a blank. A Minor is two different MIN- labels. Then run **Check again**. It first saves every move as a row in `Locked placements` and says "Saved N moves. They'll stay put when you sort again." For each moved student it recomputes Status, Fit #1, Fit #2, Reason and Review flags, starts the reason with "Moved by hand." and writes those cells back. Students who weren't moved keep their cells. PP Check reports any rule a move breaks: group sizes, last year's project, gender balance when gender data exists, a "Not with" pair together, and a Major mixed with a Minor. Moving a student between one Major and two Minors is allowed and listed as information. Check again then rebuilds the PP Group tabs, PP Summary, PP Needs you, PP Seniors to check and PP Friend check from the grade tabs, without sorting again, and flags changed source inputs. Sort also saves moves first, so a move is kept even without Check again. Delete a student's row in Locked placements to unlock them; rows can also be typed in by hand, naming a project by name, ID or MAJ-/MIN- label.

Sources are `Senior`, `Junior`, `Sophomore` and `Projects`. Normal preparation and sorting read them without changing them. Controls are `Settings`, `Project choices`, `Status changes`, `Gender`, `Locked placements` and `Friend requests`. Setup creates any of these that are missing, adds missing Settings rows and columns, and never changes a value that's already there. Generated review and roster tabs start with `PP `.

**Sort** places students in this order:

- Locked students go exactly where their Locked placements row says, even on the other track. A lock that breaks a rule stays, with an error in PP Check naming the student.
- Leaders listed in Project choices go in the project they lead: both weeks for a Major, one week for a Minor.
- Everyone else is placed so that as few students as possible land in a project they didn't check, seniors first, then juniors and sophomores. Only after that does the fit number count, with seniors' fit counted twice. Green students and students who checked one project or none go after everyone else. Students who tie go in a fixed shuffle set by the `tieSeed` setting, which PP Run log records with Run by. A rerun keeps last run's placements whenever nothing better is possible, so a rerun with nothing changed gives the same groups.
- A project with a number in Project choices' Max size column may take up to that many students per group (never more than 14) when more students want it; every other group still reaches the minimum.
- With `useFriendRequests` TRUE, only rows in Friend requests with Use checked count. "Not with" pairs are never in the same group, and each student with a "With" request gets a classmate they named when that costs them at most one step in fit and breaks no other rule. PP Friend check gives each request's result and the reason. The Comment column is never read.
- With `balanceGender` TRUE, students are swapped between groups so each group has no Male students or at least three, and the same for Female, at no more than one step of fit each. PP Check reports every group that breaks this rule whether or not it's on.

PP Summary shows each grade's placements, fits and checked projects, the friend request counts and each group's size. PP Seniors to check lists every placed senior with a project they didn't check. Student comments appear only in `PP Students`, because the grade and group tabs get shared and comments can name other students.

**Prepare students** handles a few cases from the real forms, and `PP Input check` lists each one:

- Two students who sent forms from the same email both stay eligible. Each Student ID adds the name to the email, such as `jo@example.org:smith-jo`. Use that ID in `Gender` or `Status changes` for either student. The same student sending the form twice keeps only the newest response.
- A hand-typed row (a name with no email or timestamp) merges into the matching form in its grade, and its trip, freshman-leader or green color wins. A green or uncolored row can also merge into the only form in its grade with the same last name, with a warning. A trip or freshman-leader row needs a full-name match; otherwise it stays its own row and isn't placed. With no matching form, a green or uncolored row is marked late and placed after everyone else. If more than one form could match, the row goes to review.
- An answer about last year's project that can't be matched never blocks a student. Projects it does name still count as repeats.

## Optional private workbook preview

The reader is included for authorized local work with copies of the supplied exports. It requires Python 3 with `openpyxl` available. It opens originals read-only, verifies hashes, passes values to Node through stdin and prints aggregate receipts.

```sh
python3 scripts/prepare-local-data.py --source-dir /path/to/approved/copies
```

The four expected filenames are listed in `scripts/prepare-local-data.py`. Optional `--handoff /path/to/handoff.txt` records that file's checksum; `--node` selects a Node executable. Default output is the sibling `../case-f-private/attached-data.js`, outside this repository. Keep that location to use `preview/index.html` locally. Missing or invalid private data displays an error, never a fallback to invented students.

Do not serve the parent folder, publish the private preview, or commit workbook exports. The public builder uses an explicit file allowlist and only invented records. The importer is a development tool, not permission to process school data.

## Where to work

| Location | Responsibility |
| --- | --- |
| `core/` | Shared catalog, form parser, deterministic matching and checks. |
| `preview/` | Two-screen interface, walkthrough, exports and browser practice generator. |
| `apps-script/Main.gs` | Sheets menu, controls, source reads, outputs, run log and practice generator. |
| `apps-script/Catalog.gs`, `Parse.gs`, `Engine.gs` | Generated copies; edit the core JavaScript. |
| `paste-into-apps-script/ProjectPomfret.gs` | Committed single-file installation, tested end to end. |
| `scripts/` | Bundle, browser build, demo runner, localhost server, private importer and code-only archive utility. |
| `tests/` | Synthetic fixtures, spreadsheet simulator and regression checks. |
| `.github/workflows/test.yml` | Node 22 checks, demo, build and generated-file parity. |

[BRIEF.md](BRIEF.md) explains the goals. [CONTRACT.md](CONTRACT.md) describes module interfaces. [SOURCE-AUDIT.md](SOURCE-AUDIT.md) maps sources and gaps. [VERIFICATION.md](VERIFICATION.md) records actual checks.

Luke leads Case F and assigns delivery work. Cayden is club lead; Keke coordinates club operations. Use feature branches and an independently reviewed PR into `main`. No student records, school document links, credentials or deployment account metadata in this repository. The existing CODEOWNERS file is preserved; ownership changes belong to maintainers.
