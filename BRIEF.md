# What Mr. Litowitz needs

Project: Pomfret needs a workable project list and proposed student groups. Reading hundreds of form responses and balancing groups by hand takes time. Popularity alone is insufficient: each project needs enough students, Major/Minor capacity, available staff and reasonable matches.

The prototype supports two decisions:

1. **Choose projects.** Count interest by grade, combine related form options correctly, and suggest Majors and Minors. Mr. Litowitz can revise the choices before sorting.
2. **Place students.** Propose one Major across both weeks or two different Minors, explain placements, and expose cases that need a person to decide.

Form choices are unranked checkboxes. Matching considers checked projects, Type (hands, head, heart, feet), UN goals, previous projects, grade priority and capacity. A suitable unchecked project is allowed. Comments are never used for decisions. A person reviews friend requests in the Friend requests tab first, and only when `useFriendRequests` is TRUE does the sort use that tab: "Not with" pairs are kept apart, and "With" requests are met where a student drops at most one step in fit. Leaders listed in Project choices are placed in the project they lead, and Mr. Litowitz's moves in the grade tabs are kept as locks when he sorts again.

The attachment-based defaults are 23 projects, eight Minors, 88 Minor students within an 80–96 range, and group sizes 8–14 with 10–12 preferred. Cyan trip rows and orange freshman-leader rows are excluded. Green rows, students who checked one project or none, and hand-typed rows with no matching form are placed after everyone else. Two students who sent forms from the same email are both kept, and a hand-typed row merges into the form with a matching name. Ambiguous matches go to review with a reason. Freshmen's Stories Matter program is outside this task.

The supplied catalog has 27 projects. Applying the recorded Glass Fusing/Either and canceled Derelict Sculpture corrections leaves 26 enabled: 15 Major, six Minor and five Either. Six combined projects map multiple checkbox options to one project. Happiness Project has no supplied UN goal; none is invented.

The historical roster workbook establishes output format, not current enrollment. The adapter produces grade masters with Project #1 / Project #2 and MAJ-/MIN- labels, plus project rosters, explanations and checks.

A school delivery still needs the rules reconciled in [SOURCE-AUDIT.md](SOURCE-AUDIT.md), approved inputs for leaders, staffing and gender where applicable, a scratch-Sheets trial, and Mr. Litowitz's review. Local tests and a public practice demo do not establish client acceptance.
