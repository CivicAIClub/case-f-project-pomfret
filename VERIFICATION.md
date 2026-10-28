# Verification — October 27, 2026

This records checks of the repository integration. It does not certify a school roster or full compliance with the expanded build specification.

| Check | Observed result |
| --- | --- |
| Full local suite, Node 22.22.3 | 71 tests passed; no failures or skipped tests. |
| `npm run demo` | Committed Apps Script bundle ran practice generation → preparation → interest → sort → Check again in the spreadsheet simulator. |
| Practice result | 240 students placed: 152 Major, 88 Minor; 23 projects, including eight Minors. All four source tables stayed unchanged after generation. |
| Review tables | 36 PP tables exported to ignored `demo-output/`. Final PP Check retained 108 warnings and two informational findings, with no errors. Placement count alone is not approval: the deliberately broad fixture includes weak matches. |
| `npm run bundle` | Regenerated the three shared modules and single-file installation. Byte-for-byte parity is tested. Only the current-spreadsheet OAuth scope is declared. |
| `npm run build:demo` | Generated the 13-file public bundle from 253 invented records. Explicit allowlist and private-reference tests passed. |
| Browser check | Generated localhost demo loaded; all five walkthrough steps advanced and closed; project navigation and draft placement creation worked. Displayed 240 placed, 152 Major, 88 Minor, two review records and 11 exclusions. |
| Browser CSV | Downloaded draft placements; all 253 rows used invented student names. |
| Browser layout | Desktop screenshot reviewed; no horizontal page overflow. No new mobile-device trial was performed for this packaging change. |
| Privacy checks | Tests cover school addresses, school document links and personal filesystem paths in repository files, plus forbidden source-data filenames and public build boundaries. Screenshot contains practice counts only. |

![Practice placement review](docs/demo-placements.png)

## Rounds 1 and 2, October 28, 2026

Round 1 fixed what the first run on the real forms showed: shared emails, hand-typed rows, unreadable last-year answers, comments in shared tabs, Major labels and moves by hand. Round 2 added tie order, students who checked one project or none, leaders, the results summary, locks, friend requests, gender balance, Minor selection and Max size.

| Check | Observed result |
| --- | --- |
| Full local suite, Node 24.12.0 | 139 tests passed; no failures or skipped tests. Every rule in both rounds has Node tests with invented students at `example.org`. |
| `npm run demo` | 240 students placed: 152 Major, 88 Minor; 23 projects, including eight Minors. 38 PP tables exported. PP Check: no errors, 58 warnings, 2 informational findings. |
| Grade averages on practice data | Seniors 2.21, juniors 2.16, sophomores 4.24. Juniors averaging slightly better than seniors raises the existing review warning; the practice data is invented and broad. |
| `npm run build` | Bundle and the 253-record public demo rebuilt; the bundle's first line is still `/** @OnlyCurrentDoc */`. |
| Manifest | Two OAuth scopes: the current spreadsheet, and `userinfo.email` for Locked by and Run by. |

The identity rules from before round 1 (every shared email or unmatched row held for review) no longer apply. [SOURCE-AUDIT.md](SOURCE-AUDIT.md) describes the current rules.

The spreadsheet simulator implements the API methods used by the adapter, including data validation and cell writes; it is not Google Sheets. School-account authorization, actual Apps Script execution, real-source reconciliation, independent teammate review and Mr. Litowitz's approval remain outstanding. [SOURCE-AUDIT.md](SOURCE-AUDIT.md) lists the remaining gaps.

CI runs the tests, demo and build on Node 22 with Python 3.12, and fails if rebuilding changes committed Apps Script output. CI results must be read on the PR; defining the workflow is not evidence that a hosted run passed.
