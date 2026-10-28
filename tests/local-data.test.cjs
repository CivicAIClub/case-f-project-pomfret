const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const importer = require('../scripts/prepare-local-data.cjs');

function payload() {
  const tables = [12,11,10].map(grade => ({
    name:grade===12?'Senior':grade===11?'Junior':'Sophomore', grade, role:'student_responses',
    sourceFile:'practice-grade-' + grade + '.xlsx', originalSheet:'Form Responses 1', sha256:'a'.repeat(64),
    values:[['Timestamp','Email Address','Name','Previous projects','UN goals','Types','Preference','Projects selected','Comments'],
      ['2026-10-01T12:00:00Z','practice' + grade + '@example.org','Example, Grade ' + grade,'None','9','Hands','Major','Robotics','Made-up response']],
    backgrounds:[Array(9).fill('#ffffff'),Array(9).fill('#ffffff')],
  }));
  return {schemaVersion:1, tables, projectTable:{name:'Projects', role:'project_catalog',sourceFile:'practice-projects.xlsx',originalSheet:'Sheet1',sha256:'b'.repeat(64),
    values:[['Project','Length','Type','UN Goals'],['Robotics','Major','Hands','9'],['Glass Fusing','Major','Hands','9']]}, sourceIntegrity:{unchanged:true}};
}

test('attached-data preparation uses supplied records, metadata and source references without mutating payload',()=>{
  const input=payload(), before=JSON.stringify(input), data=importer.prepareData(input,'2026-10-26T12:00:00.000Z');
  assert.equal(JSON.stringify(input),before); assert.equal(data.mode,'attached'); assert.equal(data.schemaVersion,1);
  assert.equal(data.students.length,3); assert.equal(data.preparedAt,'2026-10-26T12:00:00.000Z');
  assert.equal(data.sourceFiles.length,4); assert.equal(data.students[0].source.file,'practice-grade-12.xlsx');
  assert.equal(data.students[0].source.originalSheet,'Form Responses 1'); assert.equal(data.students[0].source.sheet,'Senior');
  assert.equal(data.projects.find(p=>p.name==='Glass Fusing').length,'Either');
});

test('malformed inputs and unverified sources fail closed; two students on one email are both kept',()=>{
  let input=payload(); input.sourceIntegrity.unchanged=false; assert.throws(()=>importer.prepareData(input),/UNVERIFIED_SOURCES/);
  input=payload(); input.tables.pop(); assert.throws(()=>importer.prepareData(input),/INVALID_PAYLOAD/);
  input=payload(); input.tables[0].values[0][7]='Missing project selection header'; assert.throws(()=>importer.prepareData(input));
  input=payload(); const duplicate=input.tables[0].values[1].slice(); duplicate[2]='Example, Different Person'; input.tables[0].values.push(duplicate);
  const data=importer.prepareData(input); assert.equal(data.students.length,4);
  assert.equal(data.students.filter(s=>s.email==='practice12@example.org' && s.status==='eligible').length,2);
  assert.equal(data.issues.filter(i=>i.code==='SHARED_EMAIL' && i.severity==='warning').length,2);
});
test('all seven resources can be represented while historical roster and documents stay metadata only',()=>{
  const input=payload(); input.referenceFiles=[
    {name:'practice-old-roster.xlsx',role:'historical_output_layout',sha256:'c'.repeat(64)},
    {name:'practice-transcript.docx',role:'requirements',sha256:'d'.repeat(64)},
    {name:'practice-handoff.txt',role:'later_defaults',sha256:'e'.repeat(64)},
  ];
  const data=importer.prepareData(input); assert.equal(data.sourceFiles.length,7); assert.equal(data.students.length,3);
  assert.deepEqual(Object.keys(data.sourceFiles[4]).sort(),['name','role','sha256']);
  input.referenceFiles[0].name='../escape.xlsx'; assert.throws(()=>importer.prepareData(input),/INVALID_REFERENCE_FILE/);
});

test('hostile source text remains data when artifact is executed',()=>{
  const input=payload(); const hostile='</script><script>globalThis.compromised=true</script>\u2028\u2029"; globalThis.compromised=true; //';
  input.tables[0].values[1][8]=hostile;
  const data=importer.prepareData(input), script=importer.serializeData(data), context={};
  assert.equal(script.includes('<'),false); assert.equal(script.includes('\u2028'),false); assert.equal(script.includes('\u2029'),false);
  vm.runInNewContext(script,context); assert.equal(context.compromised,undefined); assert.equal(context.PPAttachedData.students[0].comments,hostile);
});

test('private atomic writes have restrictive permissions and overwrite only generated artifact',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'case-f-test-'));
  try {
    const output=path.join(directory,'private'), data=importer.prepareData(payload());
    const file=await importer.writePrivateData(output,data);
    assert.equal((await fs.stat(output)).mode & 0o777,0o700); assert.equal((await fs.stat(file)).mode & 0o777,0o600);
    data.preparedAt='second run'; await importer.writePrivateData(output,data);
    assert.ok((await fs.readFile(file,'utf8')).includes('second run')); assert.deepEqual(await fs.readdir(output),['attached-data.js']);
    await fs.writeFile(file,'Unrelated user file');
    await assert.rejects(importer.writePrivateData(output,data),/REFUSE_UNRELATED_FILE/);
    assert.equal(await fs.readFile(file,'utf8'),'Unrelated user file');
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('importer rejects symlink output and code-directory storage',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'case-f-test-'));
  try {
    const actual=path.join(directory,'actual'); await fs.mkdir(actual); const link=path.join(directory,'link'); await fs.symlink(actual,link);
    await assert.rejects(importer.writePrivateData(link,importer.prepareData(payload())),/INVALID_OUTPUT_DIRECTORY/);
    await assert.rejects(importer.writePrivateData(path.resolve(__dirname,'../private'),importer.prepareData(payload())),/OUTPUT_INSIDE_CODE/);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('command prints only an aggregate receipt and suppresses source-bearing errors',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'case-f-test-'));
  try {
    const cli=path.resolve(__dirname,'../scripts/prepare-local-data.cjs'), input=payload();
    let result=spawnSync(process.execPath,[cli,'--output-dir',directory],{input:JSON.stringify(input),encoding:'utf8'});
    assert.equal(result.status,0); const receipt=JSON.parse(result.stdout); assert.equal(receipt.students,3); assert.equal(receipt.originalsUnchanged,true);
    assert.equal(result.stdout.includes('@example.org'),false); assert.equal(result.stdout.includes('Example, Grade'),false);
    input.tables[0].name='PRIVATE-PERSON-VALUE'; input.tables[0].values[0][0]='invalid';
    result=spawnSync(process.execPath,[cli,'--output-dir',directory],{input:JSON.stringify(input),encoding:'utf8'});
    assert.equal(result.status,1); assert.equal((result.stdout+result.stderr).includes('PRIVATE-PERSON-VALUE'),false);
    assert.deepEqual(JSON.parse(result.stderr),{status:'failed',stage:'prepare_data',code:'PARSER_ERROR',type:'Error'});
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
test('Python reader handles read-only empty cells without fill and preserves RGB status colors',()=>{
  const python=process.env.PYTHON || 'python3';
  const moduleFile=path.resolve(__dirname,'../scripts/prepare-local-data.py');
  const script=[
    'import importlib.util, sys',
    'from types import SimpleNamespace as N',
    'spec=importlib.util.spec_from_file_location("casef_importer",sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
    'assert m.background_of(N(fill=None)) == "#ffffff"',
    'assert m.background_of(N()) == "#ffffff"',
    'assert m.background_of(N(fill=N(fgColor=N(type="rgb",rgb="FF00FFFF")))) == "#00FFFF"',
    'assert m.background_of(N(fill=N(fgColor=N(type="theme",rgb=None)))) == "#ffffff"',
    'print("read-only color regression passed")',
  ].join('\n');
  const result=spawnSync(python,['-B','-c',script,moduleFile],{encoding:'utf8'});
  assert.equal(result.status,0,result.error?.message || result.stderr); assert.equal(result.stdout.trim(),'read-only color regression passed');
});
