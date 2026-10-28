# Prototype module contract

All production code is dependency-free JavaScript, also compatible with Apps Script V8. No network, AI, storage of real data in source, or credential use. Core modules expose `var PPParser`, `var PPEngine`, and `var PPCatalog` globals and optionally `module.exports` for Node tests. The generated browser demo loads the shared core, an invented data artifact, workflow helpers and the app. The Apps Script bundle combines generated copies of the core with Main.gs.

## Records

- Project: `{id, name, length: 'Major'|'Minor'|'Either', types: string[], goals: string[], aliases: string[], enabled: boolean}`. Types canonical lowercase hands/head/heart/feet; goals canonical UN goal numbers as strings. `id` stable slug.
- Student: `{id, name, email, grade: 10|11|12, preference: 'Major'|'Minor'|'Not sure', choices: projectId[], types: string[], goals: string[], previous: projectId[], status: 'eligible'|'late'|'trip'|'leader'|'review', gender: string|null, comments: string, source: {sheet,row}, issues: string[]}`. Comments are carried through only, never used for decisions. Missing/ambiguous identities go to review, never silently dropped.
- Settings defaults: `{minSize:8,targetSize:11,maxSize:14,projectCount:23,minorProjects:8,minorMin:80,minorTarget:88,minorMax:96,allowMajorToMinor:true,checkedBeforeInferred:true}`.
- Project choice keyed by id: `{run: boolean|null, length:'Major'|'Minor'|null, mustRun:boolean, leaders:studentId[], cannotRunWith:projectId[]}`. Empty means suggest.

## Parser

`PPParser.prepare(tables, projects, options)` returns `{students,issues,stats}`. Tables: `[{name,grade,values:[][],backgrounds:[][]}]`; row1 header, backgrounds same coordinates CSS hex. Options may have `statusChanges:[{email,name,status,why}]`, `genders:[{email,gender}]`. Parse actual form headers and styles. Keep latest legitimate duplicate by timestamp, flag email/name collision rather than merging people. Catalog is supplied. `PPParser.parseProjects(table)` returns `{projects,issues}`. Export public helpers as useful.

## Engine

`PPEngine.defaults` settings object.
`PPEngine.interest(students,projects)` returns rows `{projectId,name,checked,aligned,byGrade:{10:number,11:number,12:number}}` counting eligible and late only, each combined project once.
`PPEngine.propose(students,projects,settings,choices)` returns `{projects,issues}` with selected Project records augmented by `finalLength:'Major'|'Minor'`, respecting exclusions/overrides.
`PPEngine.sort(students,projects,settings,choices)` returns `{assignments,projects,issues,checks,summary,fingerprint}`.
Assignment: `{studentId,project1:projectId|null,project2:projectId|null,fit1:number|null,fit2:number|null,reason:string,flags:string[],status:'placed'|'excluded'|'review'}`. For Major, project1 only; minor project1 week1 and project2 week2. Exactly one Assignment per input Student including excluded/review.
Checks: `{code,severity:'error'|'warning'|'info',message,studentId?:string,projectId?:string,week?:number}[]`.
Summary: `{total,eligible,placed,excluded,needsReview,majorStudents,minorStudents,projectCount,minorProjectCount,fitCounts:{1:number,...,6:number},byGrade:{10:{placed,meanFit},11:{placed,meanFit},12:{placed,meanFit}}}`.
`PPEngine.check(students,selectedProjects,assignments,settings,choices)` returns independent Checks array, evaluating actual output, detecting manually changed invalid assignments. `PPEngine.fit(student,project,settings)` returns `{tier,checked,typeMatch,goalMatch,reason}`. `PPEngine.fingerprint(value)` stable reproducibility fingerprint (not cryptographic).

## Browser

Two main views: choose projects, then place students. Supporting panels expose source records, rules, grouped findings, individual evidence and rosters. A five-step walkthrough appears on fresh page loads. Changes invalidate results until rerun with a reason. CSV export escapes formula-like strings and labels results proposed. Comments remain available but do not affect matching. There are no runtime network calls, external fonts or browser persistence.

The public builder uses `preview/demo-data.js` to create invented records in `dist/assets/demo-data.js` with `mode: 'demo'`. The private entry at `preview/index.html` instead requires `../../case-f-private/attached-data.js` with `mode: 'attached'`. Both enforce schemaVersion 1 and validate records; missing or mismatched data stops loading. The private payload stays outside the repository and public build.

## Adapter

Google Sheets menu: Setup, Prepare students, Count interest, Sort, Check again, Make practice data. Source tabs Senior/Junior/Sophomore/Projects read only. Outputs prefixed PP, plus Settings, Project choices, Status changes, Gender. Runtime must refuse malformed settings and missing required sources with descriptive errors. Preserve editable settings and run log on reruns. Log reason and fingerprint. Output MAJ-/MIN- grade master columns Project #1 / Project #2 plus project rosters. Google Sheets live execution remains unverified until run in school account.
