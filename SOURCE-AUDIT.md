# Sources and remaining work

Reviewed for repository integration on October 27, 2026. This public summary contains no student records, source exports or school document links. Original attachments were inspected read-only during prototype development. The three relevant running-document tabs were fetched again for this PR; their text matched the October 26 captures after removing the encoding marker.

## Source map

| Resource | Contribution and limits |
| --- | --- |
| October 20 discovery transcript, Mr. Litowitz | Direct evidence for project selection, Type/goal matching, grade priority, previous projects, group sizes, friendship review and familiar rosters. Speaker labels are unreliable; the final discussion continues after the client leaves. |
| Luke's attached handoff | Later defaults, catalog corrections, two deliverables and milestones. The original two-part build plan is superseded by the October 26 specification. |
| Running document: Case F Development | Luke's ownership, `feature/project-pomfret-sorter`, test/demo/bundle commands, practice-data review, CI and scratch-Sheets validation. The expanded specification is more detailed than the original prototype brief. |
| Running document: School Case F | Historical intake and meeting setup; predates discovery. |
| Running document: Sch. Discov F1 | Meeting plan and questions. NOTES is empty. Checked-project-only matching was an assumption, not a final client rule. |
| Project list for sorting | Names, lengths, Type tags, goals and combined options. Corrections are applied in memory; originals stay unchanged. |
| Historical student rosters | All 31 populated sheets were inspected for master/project roster layout. Not current enrollment. |
| Sophomore ideation | Grade-specific headers, choices, name-cell status fills and identity cases. No previous-project question. |
| Junior ideation | Its own header order, previous projects, status fills, comments and leadership interest. Requesting leadership is not approval. |
| Senior ideation | Different choice/comment order from juniors, previous projects, status fills and leadership interest. Fixed-position parsing would confuse fields. |

The five workbooks, transcript and attached handoff are the seven original resources. None supplies an authoritative gender table, approved project-leader list, teacher-conflict list or final must-run list.

## Client goals represented here

The transcript supports project selection and Major/Minor decisions (paragraphs 42–46, 103–108, 280–295); checked projects plus Type and goals, including suitable unchecked projects (21–29, 256–267); seniority (29, 234); avoiding repeats except approved leaders (113–128); preferred group size 10–12 and minimum eight (296–309); avoiding isolated gender counts (228–234); leaving friendship judgments to Mr. Litowitz (243–246); and reviewable rosters and explanations (90–103, 164–179, 336–341). Paragraph numbers count blanks in the source transcript.

The client's expectation was the end of the first week of November (206–214). The October 28 demo and October 30/November 2 targets are later team milestones, not evidence of a completed demonstration or delivery.

## Differences from the October 26 specification

These remain open. This PR packages the current implementation, not a claim that the expanded specification is complete.

| Area | Current prototype | Remaining work |
| --- | --- | --- |
| Identity/nonresponse | Missing or ambiguous identities are held for review and accounted for. | Reconcile placeholder/name matching and last-pass placement of no-response students, including shared-email cases. |
| Project suggestions | Checked-interest/alignment score and explicit project count. | Reconcile good-fit ranking, Minor demand and cohort-derived Major count. |
| Sorting and seniority | Deterministic capacity-constrained matching, grade priority inside selected cohorts. | Reconcile track selection, crowding, tie-breaks and improvement passes. Overall grade-average fit ordering is not guaranteed. |
| Small projects/overrides | Run=Yes can preserve an undersized project with findings. Fixed Minor bounds. | Separate Run=Yes from Must run for cutting, consider Minor week swaps and scale bounds. |
| Approved Minor leaders | General rule requires different projects across weeks. | Add the same-Minor-both-weeks leader exception and checks. |
| Gender | Audits supplied values; missing data is unchecked. | Automatic repair is absent. Validate move rules with approved input. |
| Change history | Reason, counts and fingerprint in log; configuration saved in snapshot. | Add operator identity and readable settings/choices to the append-only log. |
| Check again | Checks edited masters against saved run; retains findings and flags source changes. | Read fresh sources and rebuild summary, review list and project rosters without changing masters. |
| Catalog/mappings | Known corrections and aliases live in code. | Move specified form/historical-name mappings into editable control tabs. |
| Output ownership | Normal runs preserve sources and existing control settings. | Review all output-name collision and write-boundary cases against the expanded specification before school use. |
| School validation | Local tests execute the bundle in a spreadsheet simulator. | Actual school-account scratch-Sheets trial, independent review and client acceptance. |

## Packaging supplied in this PR

Current interface and five-step walkthrough; both practice generators; portable demo command; all source and regression tests; CI; committed single-file Apps Script installation. The demo exports every generated PP table as CSV. Tests compare the bundle with source, execute it end to end and scan public files for school addresses, document links and personal paths.

The implementation uses `core/` and a shared `apps-script/Main.gs` adapter rather than the expanded specification's proposed file names. It preserves the shared engine across Node, browser and Sheets. No original workbooks, private captures or deployment credentials belong in this repository.
