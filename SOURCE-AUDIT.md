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

Updated October 28, 2026 for rounds 1 and 2, the Not-sure rule, and the Max size and gender changes that followed. These rows describe the current implementation, not a claim that the expanded specification is complete.

| Area | Current prototype | Remaining work |
| --- | --- | --- |
| Identity/nonresponse | Two students who sent forms from one email are both kept, with IDs that add the name and a warning. A hand-typed row (name, no email or timestamp) merges into the matching form in its grade; trip and freshman-leader rows merge only on a full-name match. An unmatched row is a no-response student placed last. Ambiguous matches and the same name in two grades go to review. | Confirm the name rule on the real hand-typed rows. Hand-typed rows that do have an email still go to review. |
| Project suggestions | Projects run by checked-interest and alignment score. The Minor slots take Minor-only projects first, then the Either projects with the most Minor interest; the rest of the Either projects run as Majors. | Reconcile good-fit ranking and a cohort-derived Major count. |
| Sorting and seniority | Deterministic capacity-constrained matching inside each track. Getting a project they checked comes first, seniors before juniors before sophomores; the fit number comes after, with seniors counted twice. Students who checked one project or none go last, like green students. Ties follow a fixed shuffle set by `tieSeed`. Reruns keep last run's placements as the smallest tie-break. | Overall grade-average fit ordering is not guaranteed; on the invented practice data, juniors average slightly better than seniors. |
| Major/Minor cohort | Every Minor-preference student does Minors. A Not-sure student who checked at least two running Minors, and at least as many Minors as Majors, leans Minor and does Minors while the Minor count is below the maximum; other Not-sure students do Minors only to reach the minimum, in a set order (fewest unpicked placements in Minors compared with a Major, then most Minors over Majors, then sophomores first). Last year's projects don't count as checked. This replaces round 1's Part 7 rule, which filled the Minors up to `minorTarget` with the Not-sure students who checked the most running Minors; `minorTarget` no longer affects the sort, and the project suggestion never used it. A student whose Major or Minor answer disagrees with their checks is counted in PP Summary. With `followChecksOverTrack` FALSE (the default) they're listed in PP Needs you; with it TRUE they're treated as Not sure, and the ones placed on the other track are listed. | Check the Minor count and the Not-sure placements on the real forms, and decide whether `followChecksOverTrack` should be on. |
| Small projects/overrides | Run=Yes or Must run keeps a project. A project with a locked student is never cut. Max size in Project choices lets a popular project take a bigger group while every other group still reaches the minimum. For a Major, only students who checked it fill the seats above its even split, unless a student can't be placed otherwise; this replaces round 2's rule, where anyone could fill them. A Minor keeps round 2's rule. | Separate Run=Yes from Must run for cutting, and scale the Minor bounds. |
| Leaders | Leaders listed in Project choices are placed in the project they lead before anyone else: both weeks for a Major, one week for a Minor. Errors name any leader who can't be placed. | Add the same-Minor-both-weeks leader exception if the client wants it. Leaders still need the school's approved list. |
| Gender | Reads Male and Female from the Gender tab and never guesses. Every group is checked using known genders, and `balanceGender` fixes breaks with swaps, or moves of one student, that drop fit at most one step and never move a student out of a project they checked. Following Mr. Litowitz's rule (one of a gender is a failure, two a warning), one student of a gender counts as worse than two, so a group can go from one Female student to two and then three. A move keeps groups between the minimum and 12 students, or the project's Max size. | Validate with the school's export. Confirm 12 as the most a gender move may bring a group to; there is no Target high setting. |
| Friend requests | Comments are never read. With `useFriendRequests` on, the reviewed Friend requests tab keeps "Not with" pairs apart by moving the student who wrote the request, and meets "With" requests where a student drops at most one step of fit. Rows can name students by email or Student ID. PP Friend check explains each request. | Validate with the reviewed tab and Mr. Litowitz. |
| Change history | The log has reason, counts, fingerprint, tie seed and Run by. Moves are saved in Locked placements with Locked by and When. Configuration is saved in the snapshot. | Readable settings and choices in the append-only log. |
| Check again | Saves moves as locks first, recomputes moved rows, reports any rule a move breaks, and rebuilds the group tabs, PP Summary, PP Needs you, PP Seniors to check and PP Friend check from the grade tabs. | Read fresh sources without a new sort. |
| Catalog/mappings | Known corrections and aliases live in code. | Move specified form/historical-name mappings into editable control tabs. |
| Output ownership | Normal runs preserve sources and existing control settings. | Review all output-name collision and write-boundary cases against the expanded specification before school use. |
| School validation | Local tests execute the bundle in a spreadsheet simulator. | Actual school-account scratch-Sheets trial, independent review and client acceptance. |

## Packaging supplied in this PR

Current interface and five-step walkthrough; both practice generators; portable demo command; all source and regression tests; CI; committed single-file Apps Script installation. The demo exports every generated PP table as CSV. Tests compare the bundle with source, execute it end to end and scan public files for school addresses, document links and personal paths.

The implementation uses `core/` and a shared `apps-script/Main.gs` adapter rather than the expanded specification's proposed file names. It preserves the shared engine across Node, browser and Sheets. No original workbooks, private captures or deployment credentials belong in this repository.
