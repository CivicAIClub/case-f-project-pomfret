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

`PP Senior`, `PP Junior` and `PP Sophomore` are the tabs to edit. Sort also writes these tabs for reading and printing, and Check again rebuilds them from the grade tabs:

- `PP Master list`, laid out like last year's master list: SENIORS, JUNIORS and SOPHOMORES, each a bold title, a header row and its placed students by last name, with Project #1, its faculty, Project #2, its faculty and the reason.
- `PP Projects`: one row per running project, Majors then Minors, with its location, faculty, both weeks' sizes, how many Male, Female, senior, junior and sophomore students it has, and how many in the group picked it. A Minor's counts read "5 / 6" for its two weeks. Flags say when a group is over 12 students (only for projects with no Max size, since a Max size is set on purpose), under the minimum, or has fewer than 3 of one gender.
- A `PP Group` tab for each project, named like "PP Group 02 Biomimicry - 3D Adaptive Tools" (a slash in the name becomes " - "), like last year's rosters: the project's label, "Faculty:" and "Location:", then the students (Student, Grade, Celebration of Learning, Why), seniors first and then by last name, and a bold "TOTAL - N Students". A Minor has "GROUP 1 (week 1)" and "GROUP 2 (week 2)" blocks, each with its own total. Nothing reads these tabs back. Sort deletes a PP Group tab from an earlier run for a project that no longer runs, or under the older name with spaces for the slash.
- `PP Not placed`: every student who isn't placed, and why: "ExEd trip" (with the destination when the hand-typed row gave one, such as "ExEd trip: Japan"), "Freshman leader", or the review reason.

To move a student by hand, pick another label from the dropdown in Project #1 or Project #2. A Major is the same MAJ- label twice, or one label and a blank. A Minor is two different MIN- labels. Then run **Check again**. It first saves every move as a row in `Locked placements` and says "Saved N moves. They'll stay put when you sort again." For each moved student it recomputes Status, Fit #1, Fit #2, Reason and Review flags, starts the reason with "Moved by hand." and writes those cells back. Students who weren't moved keep their cells. PP Check reports any rule a move breaks: group sizes, gender balance when gender data exists, a "Not with" pair together, and a Major mixed with a Minor. A move into a student's project from last year is listed as information ("In last year's project because of a move by hand."), not an error. Moving a student between one Major and two Minors is allowed and listed as information. Check again then rebuilds PP Master list, PP Projects, the PP Group tabs, PP Not placed, PP Summary, PP Needs you, PP Seniors to check and PP Friend check from the grade tabs, without sorting again, and flags changed source inputs. Sort also saves moves first, so a move is kept even without Check again. Delete a student's row in Locked placements to unlock them; rows can also be typed in by hand, naming a project by name, ID or MAJ-/MIN- label.

Sources are `Senior`, `Junior`, `Sophomore` and `Projects`. Normal preparation and sorting read them without changing them. Controls are `Settings`, `Project choices`, `Status changes`, `Gender`, `Locked placements` and `Friend requests`. Setup creates any of these that are missing, adds missing Settings rows and columns, and never changes a value that's already there. Project choices has optional Faculty and Location columns: Faculty can list several names separated by commas, and either can be blank. The sort never reads them; they show on PP Master list, PP Projects and the project tabs. Generated review and roster tabs start with `PP `.

**Sort** places students in this order:

- Locked students go exactly where their Locked placements row says, even on the other track. Their reason starts with "Locked in place:" and the row's Why, or "Locked in place by hand." when Why is blank. The grade tabs show that reason, so write the Why as something fine to share. A locked student in a fit 6 project gets no Fit 6 flag or warning, because a person chose it. A lock that breaks a rule stays, with an error in PP Check naming the student. A lock into a student's project from last year is your decision, so PP Check lists it as information.
- Leaders listed in Project choices go in the project they lead: both weeks for a Major, one week for a Minor.
- Every Minor-preference student does Minors. A Not-sure student leans Minor when they checked at least two running Minors and at least as many Minors as Majors, not counting last year's project. Those students do Minors while the Minor count is below the maximum. If it's still below the minimum, the next Not-sure students do too: first those who would land in the fewest projects they didn't check in two Minors compared with one Major, then those who checked the most Minors over Majors, sophomores first. Every other Not-sure student does a Major. Locked Minor students and Minor leaders count, the minimum and maximum are `minorMin` and `minorMax` (narrowed when the groups can't hold that many), and `minorTarget` doesn't change the sort. With `allowMajorToMinor`, Major-preference students move to Minors only while the count is below the minimum.
- Some students' Major or Minor answer doesn't match what they checked: they said Major but checked no running Major and at least one Minor, or said Minor but checked fewer than two running Minors and at least one Major. Leaders, locked students and students who checked nothing never count. With `followChecksOverTrack` FALSE, nobody's placement changes and each of these students gets a row in PP Needs you. With it TRUE, they're treated as Not sure, and one placed on the other track gets a sentence at the end of their reason and a PP Needs you row saying how to move them back. PP Summary shows how many students this is and whether the setting is on.
- Everyone else is placed so that as few students as possible land in a project they didn't check, seniors first, then juniors and sophomores. Only after that does the fit number count, with seniors' fit counted twice. Green students and students who checked one project or none go after everyone else. Students who tie go in a fixed shuffle set by the `tieSeed` setting, which PP Run log records with Run by. A rerun keeps last run's placements whenever nothing better is possible, so a rerun with nothing changed gives the same groups.
- A student placed in a project they didn't check gets a sentence at the end of that project's part of the reason (for a Minor, that week's part) saying why, with only the parts that apply: "None of their picks are running: X, Y.", "X was their project last year.", "Their other picks were full." or "They checked no projects." Two more cover the rest: "Their other picks run as Minors." when their running picks are all on the other track, and "Their other pick is their week 2 project." when a Minor student's one pick is their other week. Locked students, moves by hand and students a friend request moved don't get one, because their reason already says why. The sentence shows wherever the reason does, including PP Master list, the project tabs, PP Needs you and PP Seniors to check.
- A project with a number in Project choices' Max size column may take up to that many students per group (never more than 14); every other group still reaches the minimum. For a Major, anyone can fill it up to its even split (or `minSize`, if that's bigger), and the seats above that go only to students who checked it. If a student can't be placed otherwise, those seats open to everyone one at a time. A Max size below the even split caps the group. For a Minor, anyone can fill it up to the Max size.
- With `useFriendRequests` TRUE, only rows in Friend requests with Use checked count. "Not with" pairs are never in the same group: the student who wrote the request is the one moved, and the classmate moves only when the writer is locked or leading. Each student with a "With" request gets a classmate they named when that costs them at most one step in fit and breaks no other rule. A student who didn't ask is never moved out of a project they checked, whatever `checkedBeforeInferred` says. Two Minor students who share a Minor in different weeks are first joined by switching one student's weeks, which changes nobody's fit. PP Friend check gives each request's result and the reason. The Email and Classmate email columns also take a Student ID, like Gender, so students who share an email can still be matched. The Comment column is never read.
- With `balanceGender` TRUE, students are swapped between groups, or moved one at a time, so each group has no Male students or at least three, and the same for Female. One student of a gender counts as worse than two, so the sort can bring a second and third Female student into a group with one. A move keeps the group it joins at 12 students or fewer (or its Max size) and the group it leaves at the minimum or more. Each change costs at most one step of fit per student and never takes a student out of a project they checked into one they didn't, judged by the projects they checked rather than the fit number. A moved student's reason ends "Moved to another group to balance the groups." A Gender row that says something other than Male or Female, such as Nonbinary, is kept as written; that student counts as neither and is never moved, and is described as "not listed as Male or Female". A student with no Gender row, or a blank one, has "no gender on file". PP Check reports every group that breaks this rule whether or not it's on, such as "9 Male and 1 Female students (1 not listed as Male or Female)", starting with groups that have a single Male or Female student.

PP Needs you lists only what needs a decision: students in review, and students with a flag such as Fit 6, a shared or missing email, "No response: check." or a Major or Minor answer that disagrees with their checks. Flags that only explain a placement, such as a historical project, being placed last, leading a project or a lock into last year's project, are left out of PP Needs you and the grade tabs' Review flags column. PP Students and the run snapshot still keep every one.

PP Summary shows each grade's placements, fits and checked projects, the friend request counts, each group's size, and how many students' Major or Minor answers disagree with their checks. PP Seniors to check lists every placed senior with a project they didn't check. Student comments appear only in `PP Students`, because the grade and group tabs get shared and comments can name other students.

**Prepare students** handles a few cases from the real forms, and `PP Input check` lists each one:

- Two students who sent forms from the same email both stay eligible. Each Student ID adds the name to the email, such as `jo@example.org:smith-jo`. Use that ID in `Gender`, `Status changes`, `Locked placements` or `Friend requests` for either student. The same student sending the form twice keeps only the newest response.
- A hand-typed row (a name with no email or timestamp) merges into the matching form in its grade, and its trip, freshman-leader or green color wins. A green or uncolored row can also merge into the only form in its grade with the same last name, with a warning. A trip or freshman-leader row needs a full-name match; otherwise it stays its own row and isn't placed. With no matching form, a green or uncolored row is marked late and placed after everyone else. If more than one form could match, the row goes to review.
- An answer about last year's project that can't be matched never blocks a student. Projects it does name still count as repeats.
- A hand-typed trip row often has the trip's destination where the email goes, such as `JAPAN`. It is kept in normal capitals for PP Not placed ("ExEd trip: Japan"). A row with a destination there that isn't colored blue is a warning, so you can check whether that student is on a trip.
- The answer to "What do you want to do for your Celebration of Learning" shows on the project tabs, only the part before " - ": "Project Fair - I want to..." shows as "Project Fair".
- PP Input check counts the students who can be placed but aren't counted as Male or Female, in two groups: no gender on file, and not listed as Male or Female.

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
