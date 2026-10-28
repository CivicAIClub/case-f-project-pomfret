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

The spreadsheet simulator implements the API methods used by the adapter; it is not Google Sheets. School-account authorization, actual Apps Script execution, real-source reconciliation, independent teammate review and Mr. Litowitz's approval remain outstanding. [SOURCE-AUDIT.md](SOURCE-AUDIT.md) lists implementation gaps, including gender repair and the newer Check again requirements.

CI runs the tests, demo and build on Node 22 with Python 3.12, and fails if rebuilding changes committed Apps Script output. CI results must be read on the PR; defining the workflow is not evidence that a hosted run passed.
