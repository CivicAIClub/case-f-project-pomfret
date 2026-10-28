/* Public deployment builder. Reads code and invented fixtures only, never school records. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = [
  'index.html', 'notes.html', 'style.css', 'walkthrough.css', 'walkthrough.js',
  'app.js', 'workflow.js', 'core/catalog.js', 'core/parser.js', 'core/engine.js',
  'assets/demo-data.js', 'vercel.json', '.vercelignore'
];
function replaceOnce(text, before, after) {
  if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) {
    throw new Error('Public demo template changed; review replacement: ' + before.slice(0, 80));
  }
  return text.replace(before, after);
}
function checkDirectory(destination) {
  if (!fs.existsSync(destination)) return;
  if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('Public directory must not be a symlink.');
  function visit(dir, prefix) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Unexpected symlink: ' + relative);
      if (!prefix && (relative === '.vercel' || relative === '.gitignore')) continue;
      if (entry.isDirectory()) {
        if (!files.some(file => file.startsWith(relative + '/'))) throw new Error('Unexpected directory: ' + relative);
        visit(path.join(dir, entry.name), relative + '/');
      } else if (!files.includes(relative)) throw new Error('Unexpected public file: ' + relative);
    }
  }
  visit(destination, '');
}
function build(destination = path.resolve(root, 'dist')) {
  destination = path.resolve(destination);
  checkDirectory(destination);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const output = {};
  ['style.css','walkthrough.css','walkthrough.js','app.js','workflow.js'].forEach(file => {output[file] = read('preview/' + file);});
  ['parser.js','engine.js'].forEach(file => {output['core/' + file] = read('core/' + file);});
  const context = {};
  vm.runInNewContext(read('core/catalog.js'), context);
  // Only the project fields needed by the public app; omit source rows and teacher annotations.
  const projects = context.PPCatalog.map(({id,name,length,enabled,types,goals,aliases}) => ({id,name,length,enabled,types,goals,aliases}));
  const students = require('../preview/demo-data.js').create(projects).map(student => ({
    ...student, previousKnown:true, source:{...student.source, file:'Invented demo responses'}
  }));
  const data = {schemaVersion:1, mode:'demo', projects, students, issues:[],
    sourceFiles:[{name:'Invented practice responses',role:'demo_responses'}]};
  output['core/catalog.js'] = '/* Project metadata only. No student records. */\nvar PPCatalog = ' + JSON.stringify(projects) + ';\nvar PPGoalNames = ' + JSON.stringify(context.PPGoalNames) + ';\n';
  output['assets/demo-data.js'] = '/* All students and responses are invented. */\nvar PPAttachedData = ' + JSON.stringify(data) + ';\n';
  let html = read('preview/index.html');
  html = replaceOnce(html, 'Case F prototype</title>', 'Case F public demo</title>');
  html = replaceOnce(html, 'Local draft</span>', 'Demo draft</span>');
  html = replaceOnce(html, '<main id="main"', '<div class="public-demo-banner"><strong>Public demo</strong><span>All students and responses are invented. Reload the page to start over.</span></div>\n    <main id="main"');
  html = replaceOnce(html, 'This updates the local draft only.', 'This only changes the demo draft in your browser.');
  html = replaceOnce(html, '../../case-f-private/attached-data.js', 'assets/demo-data.js');
  html = html.replaceAll('../core/', 'core/').replaceAll('../README.md', 'notes.html').replaceAll('Setup &amp; project notes', 'About this demo');
  output['index.html'] = html;
  output['style.css'] += '\n/* Public demo context, separate from the local school-data prototype. */\n.public-demo-banner{display:flex;align-items:baseline;gap:12px;padding:13px 32px;border-bottom:1px solid #e9e9e7;background:#fafaf9;color:#6b6b67;font-size:12px;line-height:1.6}.public-demo-banner strong{color:#37352f;white-space:nowrap;font-weight:600}.demo-notes{max-width:760px;margin:60px auto;padding:0 24px;line-height:1.7}.demo-notes h1{font-size:32px;line-height:1.25}.demo-notes h2{margin-top:32px;font-size:19px}.demo-notes li{margin:12px 0}.demo-notes a{color:#2879b8}@media(max-width:600px){.public-demo-banner{padding:12px 20px;gap:8px;flex-direction:column}}\n';
  let app = output['app.js'];
  const errorStart = app.indexOf('    main.innerHTML = ', app.indexOf('if (dataError)'));
  const errorEnd = app.indexOf('\n', errorStart);
  if (errorStart < 0 || errorEnd < 0) throw new Error('Public data error template changed.');
  app = app.slice(0,errorStart) + '    main.innerHTML = \'<div class="notice error" role="alert"><div><strong>The demo could not load.</strong><p id="data-error-detail"></p><p>Refresh this page to reload the sample data.</p><a href="notes.html">About this demo</a></div></div>\';' + app.slice(errorEnd);
  app = replaceOnce(app, 'The local sorting files could not load. Keep the preview and core folders together, then reopen this page.', 'The sorting files could not load. Refresh this page and try again.');
  app = replaceOnce(app, "data.mode !== 'attached'", "data.mode !== 'demo'");
  app = replaceOnce(app, 'The attached-data file is missing or uses an unsupported format.', 'The sample data is missing or uses an unsupported format.');
  app = replaceOnce(app, 'This uses your attached workbooks.', 'This uses invented students and responses.');
  app = replaceOnce(app, 'Gender data is missing, and the sophomore form did not ask about past projects. The draft will show which checks are missing.', 'The sample records leave out gender data, so the app cannot check gender balance. They also include problems for you to review.');
  app = replaceOnce(app, 'First draft from the attached workbooks.', 'First draft using invented students.');
  app = replaceOnce(app, 'Correct errors in the working spreadsheet, then import the updated file.', 'The sample records include a few problems for you to review.');
  app = replaceOnce(app, 'Original spreadsheet row', 'Sample response reference');
  const aboutStart = app.indexOf('  function showAbout(){');
  const aboutEnd = app.indexOf('  function settingNumber(', aboutStart);
  if (aboutStart < 0 || aboutEnd < 0) throw new Error('Public About template changed.');
  app = app.slice(0,aboutStart) + `  function showAbout(){
    return '<h2 id="support-title">About this demo</h2><p>This is a practice version of the Project: Pomfret planning tool. The students and responses are invented, so the interest counts are examples too.</p><ol class="about-goals"><li><strong>Choose projects.</strong> Compare student interest and choose a Major or Minor where allowed. Mr. Litowitz checks group sizes and teacher availability.</li><li><strong>Place students.</strong> Make a schedule for both weeks, read the reasons for each placement and check the problems in the draft.</li></ol>'+lengthGuide()+'<p>The app matches project choices, Types and UN goals within the group limits. Comments do not affect placements. Mr. Litowitz makes the final decisions.</p><div class="prototype-limits"><h3>What still needs work</h3><p>We still need to improve gender balancing, senior priority across all groups and how the app handles records with missing or conflicting details. We have not tested the full workflow in the school Google Sheets account.</p></div><p>The app runs in your browser with sample records. It leaves the school spreadsheet unchanged. Reloading clears your choices and placements.</p><p><a href="notes.html">More about this demo</a></p>';
  }
` + app.slice(aboutEnd);
  output['app.js'] = app;
  output['workflow.js'] = replaceOnce(output['workflow.js'],
    'Correct the missing or conflicting details in the working spreadsheet. Import it again, then update placements.',
    'These sample records need review. With real data, correct the spreadsheet, import it again and update placements.');
  output['walkthrough.js'] = replaceOnce(output['walkthrough.js'],
    'Use student interest to choose which projects to offer. Then make a draft schedule for Mr. Litowitz to review.',
    'Use student interest to choose which projects to offer. Then make a draft schedule for Mr. Litowitz to review. This public demo uses invented students and responses.');
  output['walkthrough.js'] = replaceOnce(output['walkthrough.js'], 'This is a local prototype.', 'This demo uses invented students.');
  output['notes.html'] = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'"><title>About the demo · Project: Pomfret</title><link rel="stylesheet" href="style.css"></head>
<body><main class="demo-notes"><a href="/">← Back to the demo</a><h1>About the Project: Pomfret demo</h1><p>Civic AI Club · Case F</p><p>This is a practice version of the planning tool for Mr. Litowitz. It uses invented students and responses. The counts and placements are examples, not results for Pomfret students. The site contains no student workbooks or meeting transcripts.</p><h2>How to use it</h2><p>Start with Choose projects. Compare interest by grade and decide which projects to offer. A Major lasts both weeks with the same group. A Minor lasts one week, so each Minor student takes two different projects.</p><p>Then open Place students to create a draft schedule. Read the placement reasons and review notes before exporting it for discussion. Mr. Litowitz approves the final project list and placements.</p><p>The five-step walkthrough opens when you load the app. It explains the purpose, choosing projects, creating and checking placements, and exporting the draft. Click Walkthrough in the header to open it again.</p><h2>How placements work</h2><p>The app matches project choices, Types and UN goals within the group limits. The same inputs give the same result. Students marked as going on trips or serving as freshman leaders stay out of the sort. Records with missing or conflicting details stay on the review list. Comments and friend requests do not affect placements.</p><h2>What still needs work</h2><p>We still need to improve gender balancing, senior priority across all groups and how the app handles records that need fixing. Teacher scheduling constraints, approved project leaders and the full school Google Sheets workflow still need testing. Mr. Litowitz must review the draft before anyone uses it as a roster.</p><h2>Saving your draft</h2><p>The app runs in your browser. Drafts are not shared, and this page does not connect to the school spreadsheet. Reloading clears your choices and placements. You can export CSV files, which contain only the sample records shown here.</p></main></body></html>\n`;
  output['vercel.json'] = JSON.stringify({framework:null, headers:[{source:'/(.*)',headers:[
    {key:'X-Robots-Tag',value:'noindex, nofollow'},
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'no-referrer'}
  ]}]}, null, 2) + '\n';
  output['.vercelignore'] = '.vercel\n.git\n.gitignore\n.env*\nnode_modules\n*.xlsx\n*.docx\n*.zip\nattached-data.*\ncase-f-private\n';
  for (const file of files) {
    const text = output[file];
    if (typeof text !== 'string') throw new Error('Missing output: ' + file);
    if (file !== '.vercelignore' && /case-f-private|attached-data|\/Users\/|@pomfret\.org|\.xlsx|\.docx|SOURCE-AUDIT\.md/.test(text)) throw new Error('Private source reference in ' + file);
    if (file.endsWith('.js')) new vm.Script(text, {filename:file});
  }
  for (const file of files) {
    const target = path.join(destination,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,output[file]);
  }
  checkDirectory(destination);
  return {destination,files:[...files],students:students.length};
}
module.exports = {build,checkDirectory,files};
if (require.main === module) console.log(JSON.stringify(build(process.argv[2]),null,2));
