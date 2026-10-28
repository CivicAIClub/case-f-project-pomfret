/* Deterministic, local-only placement prototype. The cohort is selected before
 * optimization: Minor-preference students, then the Not-sure students who lean Minor,
 * and others only to reach the minimum. Within each Major/Minor cohort, the flow first keeps students
 * in projects they checked, seniors first, then improves fit. This does not guarantee
 * ordered grade means or a globally best cohort/project plan. Balanced quotas
 * are relaxed within the cap when needed; incomplete results are not proofs
 * that all possible plans fail. */
var PPEngine = (function () {
  'use strict';
  var defaults = Object.freeze({minSize:8,targetSize:11,maxSize:14,projectCount:23,minorProjects:8,minorMin:80,minorTarget:88,minorMax:96,allowMajorToMinor:true,checkedBeforeInferred:true,tieSeed:2026,useFriendRequests:false,balanceGender:false});
  function arr(x) { return Array.isArray(x) ? x : []; }
  function eligible(s) { return s.status === 'eligible' || s.status === 'late'; }
  function compare(a,b) { return String(a).localeCompare(String(b),'en'); }
  function note(code,severity,message,extra) { return Object.assign({code:code,severity:severity,message:message},extra || {}); }
  function settings(input) {
    var v = Object.assign({},defaults,input || {});
    ['minSize','targetSize','maxSize','projectCount','minorProjects','minorMin','minorTarget','minorMax','tieSeed'].forEach(function(k) { if (!Number.isInteger(v[k]) || v[k] < 0) throw new Error(k+' must be a nonnegative whole number.'); });
    if (v.minSize < 1 || v.minSize > v.targetSize || v.targetSize > v.maxSize || v.maxSize > 14) throw new Error('Choose group sizes from 1 to 14. The minimum cannot exceed the target, and the target cannot exceed the maximum.');
    if (v.projectCount < 1 || v.minorProjects > v.projectCount) throw new Error('Choose at least one project in total. The number of Minors cannot exceed that total.');
    if (v.minorMin > v.minorTarget || v.minorTarget > v.minorMax) throw new Error('The Minor student target must fall between the minimum and maximum.');
    ['allowMajorToMinor','checkedBeforeInferred','useFriendRequests','balanceGender'].forEach(function(k) { if (typeof v[k] !== 'boolean') throw new Error(k+' must be TRUE or FALSE.'); });
    return v;
  }
  function overlap(a,b) { return arr(a).filter(function(x) {return arr(b).indexOf(x)>=0;}); }
  function fit(student,project,input) {
    var cfg=settings(input), checked=arr(student.choices).indexOf(project.id)>=0;
    var types=overlap(student.types,project.types), goals=overlap(student.goals,project.goals), t=types.length>0,g=goals.length>0;
    var tier=checked && t && g ? 1 : checked && t ? 2 : checked && g ? 3 : checked ? (cfg.checkedBeforeInferred?4:5) : t && g ? (cfg.checkedBeforeInferred?5:4) : 6;
    var pieces=[checked?'Checked this project':'Did not check this project',t?'type match ('+types.join(', ')+')':'no type match',g?'UN goal match ('+goals.join(', ')+')':'no UN goal match'];
    return {tier:tier,checked:checked,typeMatch:t,goalMatch:g,reason:pieces.join('; ')+'.'};
  }
  function interest(students,projects) {
    return projects.filter(function(p){return p.enabled!==false;}).map(function(p){
      var r={projectId:p.id,name:p.name,checked:0,aligned:0,byGrade:{10:0,11:0,12:0}};
      students.filter(eligible).forEach(function(s){if(arr(s.choices).indexOf(p.id)>=0){r.checked++;r.byGrade[s.grade]=(r.byGrade[s.grade]||0)+1;if(overlap(s.types,p.types).length||overlap(s.goals,p.goals).length)r.aligned++;}});
      return r;
    }).sort(function(a,b){return b.checked-a.checked||b.aligned-a.aligned||compare(a.projectId,b.projectId);});
  }
  function choiceFor(choices,id) {return (choices||{})[id]||{};}
  function conflicts(a,b,choices) {return arr(choiceFor(choices,a).cannotRunWith).indexOf(b)>=0||arr(choiceFor(choices,b).cannotRunWith).indexOf(a)>=0;}
  function mandatory(p,choices) {var c=choiceFor(choices,p.id);return c.mustRun===true||c.run===true;}
  function propose(students,projects,input,choices) {
    var cfg=settings(input), issues=[],scores={},ids={};
    projects.forEach(function(p){if(!p.id||ids[p.id])throw new Error('Each project needs its own ID.');ids[p.id]=true;});
    interest(students,projects).forEach(function(r){scores[r.projectId]=r.checked*3+r.aligned;});
    Object.keys(choices||{}).forEach(function(id){
      var c=choices[id];
      if(!ids[id])issues.push(note('UNKNOWN_PROJECT_CHOICE','error','The project choices include an unknown project: '+id));
      if(c.run!=null&&typeof c.run!=='boolean')throw new Error('Run must be blank, TRUE, or FALSE for '+id+'.');
      if(c.mustRun!=null&&typeof c.mustRun!=='boolean')throw new Error('Must run must be TRUE or FALSE for '+id+'.');
      if(c.length!=null&&c.length!==''&&c.length!=='Major'&&c.length!=='Minor')throw new Error('Final length must be Major or Minor for '+id+'.');
      if(c.mustRun===true&&c.run===false)issues.push(note('CONTRADICTORY_PROJECT_CHOICE','error','Must-run project is also marked not to run: '+id,{projectId:id}));
      if(c.maxSize!=null&&(!Number.isInteger(c.maxSize)||c.maxSize<cfg.minSize||c.maxSize>14))issues.push(note('INVALID_MAX_SIZE','error','Max size for '+id+' must be a whole number from '+cfg.minSize+' (the minimum group size) to 14.',{projectId:id}));
      arr(c.cannotRunWith).forEach(function(other){if(!ids[other]||other===id)issues.push(note('INVALID_PROJECT_CONFLICT','error','Invalid cannot-run-with entry for '+id+': '+other,{projectId:id}));});
    });
    var all=projects.filter(function(p){var c=choiceFor(choices,p.id);if(p.enabled===false&&mandatory(p,choices))issues.push(note('CANCELLED_PROJECT','error','A cancelled project was requested to run: '+p.name,{projectId:p.id}));return p.enabled!==false&&c.run!==false;}).map(function(p){
      var c=choiceFor(choices,p.id), length=c.length||p.length;
      if(length!=='Major'&&length!=='Minor'&&length!=='Either')throw new Error('Invalid project length for '+p.name+'.');
      if(c.length&&p.length!=='Either'&&p.length!==c.length)issues.push(note('LENGTH_OVERRIDE','warning',p.name+' changes from '+p.length+' to '+c.length+' by project choice.',{projectId:p.id}));
      return Object.assign({},p,{finalLength:length});
    }).sort(function(a,b){return Number(mandatory(b,choices))-Number(mandatory(a,choices))||(scores[b.id]||0)-(scores[a.id]||0)||compare(a.id,b.id);});
    var selected=[],tried={},minorInterest={};
    // Minor interest: students who asked for Minors or weren't sure, and checked the project.
    students.filter(function(s){return eligible(s)&&s.preference!=='Major';}).forEach(function(s){arr(s.choices).filter(function(id,i,all){return all.indexOf(id)===i;}).forEach(function(id){minorInterest[id]=(minorInterest[id]||0)+1;});});
    function add(p){
      var blocked=selected.filter(function(q){return conflicts(p.id,q.id,choices);});
      if(blocked.length){if(mandatory(p,choices))issues.push(note('MANDATORY_CONFLICT','error','Required projects cannot run together: '+p.name+' and '+blocked.map(function(q){return q.name;}).join(', '),{projectId:p.id}));return false;}
      selected.push(p);return true;
    }
    function drop(p){selected.splice(selected.indexOf(p),1);}
    function length(name){return selected.filter(function(p){return p.finalLength===name;});}
    function next(test){return all.filter(function(p){return selected.indexOf(p)<0&&!tried[p.id]&&test(p);})[0];}
    function lowest(test){return selected.filter(function(p){return !mandatory(p,choices)&&test(p);}).sort(function(a,b){return all.indexOf(b)-all.indexOf(a);})[0];}
    all.filter(function(p){return mandatory(p,choices);}).forEach(add);
    if(selected.length>cfg.projectCount)issues.push(note('TOO_MANY_REQUIRED','error','There are more required projects than the total you chose.'));
    // Which projects run is decided by score alone. Their lengths come after.
    all.forEach(function(p){if(selected.length<cfg.projectCount&&selected.indexOf(p)<0)add(p);});
    // Too few projects that can run as Minors: bring in the next best ones in place of the
    // lowest-scoring Majors.
    for(var p;length('Minor').length+length('Either').length<cfg.minorProjects&&(p=next(function(x){return x.finalLength!=='Major';}));){
      var out=null;tried[p.id]=true;
      if(selected.length>=cfg.projectCount){out=lowest(function(x){return x.finalLength==='Major';});if(!out)break;drop(out);}
      if(!add(p)&&out)add(out);
    }
    // More Minor-only projects than Minor slots: the lowest-scoring ones make room for the next best
    // Major or Either projects. A Minor-only project never runs as a Major.
    for(var extra;length('Minor').length>cfg.minorProjects&&(extra=lowest(function(x){return x.finalLength==='Minor';}));){
      drop(extra);tried[extra.id]=true;
      var instead=next(function(x){return x.finalLength!=='Minor';});if(instead){tried[instead.id]=true;add(instead);}
    }
    // The Minor slots take every Minor-only project, then the Either projects with the most Minor
    // interest. Every other Either project runs as a Major.
    var slots=cfg.minorProjects-length('Minor').length;
    length('Either').sort(function(a,b){return (minorInterest[b.id]||0)-(minorInterest[a.id]||0)||all.indexOf(a)-all.indexOf(b);}).forEach(function(p,i){p.finalLength=i<slots?'Minor':'Major';});
    function countMinor(){return length('Minor').length;}
    if(selected.length!==cfg.projectCount)issues.push(note('PROJECT_COUNT_SUGGESTION','warning','Selected '+selected.length+' projects; setting requests '+cfg.projectCount+'.'));
    if(countMinor()!==cfg.minorProjects)issues.push(note('MINOR_COUNT_SUGGESTION','warning','Selected '+countMinor()+' Minor projects; setting requests '+cfg.minorProjects+'.'));
    return {projects:selected.sort(function(a,b){return compare(a.id,b.id);}),issues:issues};
  }
  function isLeader(s,p,choices){return arr(choiceFor(choices,p.id).leaders).some(function(id){return String(id).toLowerCase()===String(s.id).toLowerCase()||(s.email&&String(id).toLowerCase()===String(s.email).toLowerCase());});}
  function allowed(s,p,choices){return arr(s.previous).indexOf(p.id)<0||isLeader(s,p,choices);}
  // Students who tie go in a fixed shuffled order made from their Student ID and the tieSeed
  // setting, so the alphabet never decides who wins. Changing tieSeed reshuffles it.
  function tieOrder(students,cfg){
    var keys={};students.forEach(function(s){keys[s.id]=fingerprint([cfg.tieSeed,s.id]);});
    function ids(a,b){return keys[a]<keys[b]?-1:keys[a]>keys[b]?1:compare(a,b);}
    return {keys:keys,ids:ids,students:function(a,b){return ids(a.id,b.id);}};
  }
  function checkedCount(s){return arr(s.choices).filter(function(id,i,all){return all.indexOf(id)===i;}).length;}
  // Green students, and students who checked one project or none, are placed after everyone else.
  // A student who leads a running project is placed by the leader rule instead.
  function placedLast(s,run){return s.status==='late'||(checkedCount(s)<=1&&!run.leading[s.id]);}
  // Each leader listed in Project choices is placed in the project they lead, unless something
  // stops it. Every problem is an error that names the student.
  function leaders(students,projects,choices,issues,run){
    var running={},names={},out={};projects.forEach(function(p){running[p.id]=p;});arr(run.allProjects).forEach(function(p){names[p.id]=p.name;});
    students.forEach(function(s){
      var led=Object.keys(choices||{}).sort(compare).filter(function(id){return isLeader(s,{id:id},choices);});
      if(!led.length)return;
      var who=s.name||s.id,label=led.map(function(id){return names[id]||id;}).join(' and ');
      if(s.status==='trip'||s.status==='leader'||s.status==='review')issues.push(note('LEADER_NOT_PLACED','error',who+' is listed as a leader of '+label+' but '+(s.status==='trip'?'is on an ExEd trip':s.status==='leader'?'is a freshman leader':'needs review')+', so they were not placed there.',{studentId:s.id}));
      else if(led.length>1)issues.push(note('LEADER_NOT_PLACED','error',who+' is listed as a leader of '+label+'. A student can lead only one project, so they were placed by the normal rules.',{studentId:s.id}));
      else if(!running[led[0]])issues.push(note('LEADER_NOT_PLACED','error',who+' is listed as a leader of '+label+", which isn't running, so they were placed by the normal rules.",{studentId:s.id,projectId:led[0]}));
      else out[s.id]=running[led[0]];
    });
    return out;
  }
  function priorityOrder(run){return function(a,b){return Number(run.last(a))-Number(run.last(b))||b.grade-a.grade||run.tie.students(a,b);};}
  function key(v){return String(v==null?'':v).toLowerCase().replace(/\s+/g,'');}
  function genderOf(v){v=plain(v);return v==='m'||v==='male'||v==='boy'?'Male':v==='f'||v==='female'||v==='girl'?'Female':null;}
  function plain(v){return String(v==null?'':v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  // A project's largest group: its Max size from Project choices (never above 14), or maxSize.
  function limit(p,cfg,choices){var c=choiceFor(choices,p.id).maxSize;return Number.isInteger(c)?Math.min(14,c):cfg.maxSize;}
  // Rows from Locked placements. A student is found by email or Student ID, or by name when the
  // email is blank. A project can be a name, an ID or a MAJ-/MIN- label from the grade tabs.
  function resolveLocks(students,projects,rows){
    var out={},issues=[],byKey={},byName={},byProject={};
    function add(map,k,s){if(!k)return;map[k]=map[k]||[];if(map[k].indexOf(s)<0)map[k].push(s);}
    students.forEach(function(s){add(byKey,key(s.id),s);add(byKey,key(s.email),s);add(byName,plain(s.name),s);});
    arr(projects).forEach(function(p){byProject[key(p.id)]=p;byProject[plain(p.name)]=p;});
    function project(token){var t=String(token==null?'':token).trim().replace(/^(MAJ|MIN)-/i,'');return t?byProject[key(t)]||byProject[plain(t)]||undefined:null;}
    arr(rows).forEach(function(r){
      var k=key(r.email),found=k?byKey[k]||[]:byName[plain(r.name)]||[],where='Locked placements row '+r.row;
      if(!k&&!plain(r.name))return;
      if(found.length!==1){issues.push(note('LOCK_UNKNOWN_STUDENT','error',where+': '+(found.length?'more than one student matches':'no student matches')+' "'+String(k?r.email:r.name).trim()+'", so the lock was not used.'));return;}
      var st=found[0],who=st.name||st.id,p1=project(r.project1),p2=project(r.project2);
      if(p1===undefined||p2===undefined){issues.push(note('LOCK_UNKNOWN_PROJECT','error',where+' ('+who+'): "'+String(p1===undefined?r.project1:r.project2).trim()+"\" isn't a project name, ID or MAJ-/MIN- label, so the lock was not used.",{studentId:st.id}));return;}
      if(out[st.id]){issues.push(note('LOCK_DUPLICATE','error','Locked placements has more than one row for '+who+'. Row '+out[st.id].row+' was used.',{studentId:st.id}));return;}
      out[st.id]={project1:p1?p1.id:null,project2:p2?p2.id:null,row:r.row,why:String(r.why==null?'':r.why).replace(/\s+/g,' ').trim()};
    });
    return {byStudent:out,issues:issues};
  }
  // A lock with a Major in one column, or the same Major in both, is one Major. Any other lock stays
  // exactly as it was written, and lockProblems reports the rules it breaks.
  function lockShape(lock,byId){
    var p1=lock.project1,p2=lock.project2,first;
    if(!p1&&p2&&byId[p2].finalLength==='Major'){p1=p2;p2=null;}
    if(p1&&p2===p1&&byId[p1].finalLength==='Major')p2=null;
    first=byId[p1||p2];
    return {project1:p1,project2:p2,track:first?first.finalLength:null,why:lock.why||''};
  }
  // Locks whose projects all run in this pass. A lock into a project that isn't running is an
  // error, and that student is placed by the normal rules.
  function applyLocks(projects,issues,run){
    var byId={},out={};projects.forEach(function(p){byId[p.id]=p;});
    Object.keys(run.locks).sort(compare).forEach(function(id){
      var lock=run.locks[id],st=run.byId[id],missing=[lock.project1,lock.project2].filter(function(pid){return pid&&!byId[pid];});
      if(missing.length)issues.push(note('LOCK_NOT_RUNNING','error',(st.name||st.id)+' is locked into '+(run.names[missing[0]]||missing[0])+", which isn't running, so they were placed by the normal rules.",{studentId:id,projectId:missing[0]}));
      else out[id]=lockShape(lock,byId);
    });
    return out;
  }
  // Running projects a student checked, other than last year's, counted by length.
  function checkedTracks(s,byId){var n={Major:0,Minor:0};arr(s.choices).forEach(function(id,i,all){var p=byId[id];if(p&&all.indexOf(id)===i&&arr(s.previous).indexOf(id)<0&&n[p.finalLength]!==undefined)n[p.finalLength]++;});return n;}
  function cohort(students,projects,cfg,issues,run){
    var priority=priorityOrder(run),leading=run.leading,locked=run.locked,lockedIds=Object.keys(locked),cap=function(list){return list.reduce(function(n,p){return n+limit(p,cfg,run.choices);},0);};
    var active=students.filter(function(s){return eligible(s)&&!locked[s.id];}),free=active.filter(function(s){return !leading[s.id];}),minors=projects.filter(function(p){return p.finalLength==='Minor';}),majors=projects.length-minors.length,byId={};
    projects.forEach(function(p){byId[p.id]=p;});
    // Locked students count toward the Minor bounds, and the cohort fills in around them.
    var lockedMinor=lockedIds.filter(function(id){return locked[id].track==='Minor';}).length,placing=active.length+lockedIds.filter(function(id){return locked[id].track;}).length;
    var majorList=projects.filter(function(p){return p.finalLength!=='Minor';}),lower=Math.max(cfg.minorMin,minors.length*cfg.minSize,placing-cap(majorList)),upper=Math.min(cfg.minorMax,cap(minors),placing-majors*cfg.minSize);
    if(lower>upper)issues.push(note('COHORT_CAPACITY','warning','The group sizes cannot fit the requested number of Minor students. Check the project list and Minor student targets.'));
    // When the group sizes can't fit both, the maximum wins.
    var maximum=Math.max(0,upper),minimum=Math.min(lower,maximum),counts={};
    function count(){return lockedMinor+minor.length;}
    // A Not-sure student leans Minor when they checked at least two Minors and at least as many Minors
    // as Majors. unpicked is how many placements they didn't check that two Minors would give them,
    // minus the same for a Major.
    function leans(s){var n=counts[s.id];return n.Minor>=2&&n.Minor>=n.Major;}
    function unpicked(s){var n=counts[s.id];return Math.max(0,2-n.Minor)-(n.Major?0:1);}
    function lean(s){return counts[s.id].Minor-counts[s.id].Major;}
    // Every Minor-preference student does Minors. A leader follows their project's length whatever
    // they asked for.
    var minor=active.filter(function(s){return leading[s.id]&&leading[s.id].finalLength==='Minor';}).concat(free.filter(function(s){return s.preference==='Minor';}).sort(priority)),taken={};
    // Not-sure students in order: those who lean Minor, then fewest unpicked placements in Minors, then
    // the most Minors over Majors, then sophomores, juniors and seniors, then students placed last,
    // then tie order. Going down it, a student who leans Minor does Minors while the Minor count is
    // below the maximum. While the count is still below the minimum, the next students do too.
    var unknown=free.filter(function(s){return s.preference==='Not sure';});
    unknown.forEach(function(s){counts[s.id]=checkedTracks(s,byId);});
    unknown.sort(function(a,b){return Number(leans(b))-Number(leans(a))||unpicked(a)-unpicked(b)||lean(b)-lean(a)||a.grade-b.grade||Number(run.last(a))-Number(run.last(b))||run.tie.students(a,b);});
    unknown.forEach(function(s){if(leans(s)&&count()<maximum){minor.push(s);taken[s.id]=true;}});
    unknown.forEach(function(s){if(!taken[s.id]&&count()<minimum)minor.push(s);});
    // Major-preference students move only while the Minor count is below its minimum.
    if(cfg.allowMajorToMinor){var major=free.filter(function(s){return s.preference==='Major';}).sort(function(a,b){return Number(run.last(a))-Number(run.last(b))||a.grade-b.grade||run.tie.students(a,b);});while(count()<minimum&&major.length)minor.push(major.shift());}
    var members={};minor.forEach(function(s){members[s.id]=true;});
    return {minor:minor.sort(priority),major:active.filter(function(s){return !members[s.id];}).sort(priority),lockedMinor:lockedMinor,lockedMajor:lockedIds.filter(function(id){return locked[id].track==='Major';}).length};
  }
  function quotas(count,projects,cfg,scores){
    var sorted=projects.slice().sort(function(a,b){return (scores[b.id]||0)-(scores[a.id]||0)||compare(a.id,b.id);}), result={};
    if(!sorted.length)return result;
    var n=Math.min(count,sorted.length*cfg.maxSize),base=Math.floor(n/sorted.length),extra=n%sorted.length;
    sorted.forEach(function(p,i){result[p.id]=base+(i<extra?1:0);});return result;
  }
  // Successive shortest augmenting paths. Each cost has three parts, compared in order:
  //   1. placing everyone, seniors first, then filling every group to the minimum;
  //   2. how many seniors are in a project they didn't check, then juniors, sophomores and the
  //      students placed last;
  //   3. the fit number, seniors counted twice, then keeping last run's placement.
  // Within a part, each level's weight is more than everything below it can add up to, so a senior
  // never loses a project they checked to help a younger student, and a better fit for a senior never
  // costs a younger student a project they checked. Potentials make residual reverse edges usable
  // with Dijkstra. The tie order, through the order of the students, settles what is still equal.
  function assignFlow(members,projects,cfg,choices,capacity,floor,run){
    var n=members.length,m=projects.length,sink=1+n+m,V=sink+1,graph=Array.from({length:V},function(){return [];}),links=[],total=0,units=[0,0,0,0],below=0;
    function edge(u,v,cap,c0,c1,c2){var a={to:v,rev:graph[v].length,cap:cap,c0:c0,c1:c1,c2:c2},b={to:u,rev:graph[u].length,cap:0,c0:-c0,c1:-c1,c2:-c2};graph[u].push(a);graph[v].push(b);return a;}
    function level(s){return run.last(s)?0:s.grade===12?3:s.grade===11?2:1;}
    function kept(s,p){var before=run.previous[s.id];return before&&before.project1!==p.id&&before.project2!==p.id?1:0;}
    function less(a0,a1,a2,b0,b1,b2){return a0<b0||(a0===b0&&(a1<b1||(a1===b1&&a2<b2)));}
    members.forEach(function(mem){units[level(mem.s)]+=mem.units;total+=mem.units;});
    projects.forEach(function(p){below+=floor[p.id]||0;});
    var place=[below+1],miss=[1],stable=total+1;
    for(var k=1;k<4;k++){place[k]=place[k-1]*(units[k-1]+1);miss[k]=miss[k-1]*(units[k-1]+1);}
    if(Math.max(place[3]*(units[3]+1),miss[3]*(units[3]+1),11*stable*(total+1))*4*V>Number.MAX_SAFE_INTEGER)throw new Error('There are too many students for this version of the sorter.');
    members.forEach(function(mem,i){var s=mem.s,lv=level(s);edge(0,1+i,mem.units,-place[lv],0,0);projects.forEach(function(p,j){if(p.id!==mem.skip&&allowed(s,p,choices)){var f=fit(s,p,cfg),e=edge(1+i,1+n+j,1,0,f.checked?0:miss[lv],(f.tier-1)*(lv===3?2:1)*stable+kept(s,p));links.push({student:s.id,project:p.id,edge:e});}});});
    // A seat that brings a group up to the minimum comes right after placing everyone.
    projects.forEach(function(p,j){var low=floor[p.id]||0;if(low)edge(1+n+j,sink,low,-1,0,0);edge(1+n+j,sink,(capacity[p.id]||0)-low,0,0,0);});
    var p0=new Float64Array(V),p1=new Float64Array(V),p2=new Float64Array(V),known=new Uint8Array(V);known[0]=1;
    for(var round=0;round<V;round++){var changed=false;for(var u=0;u<V;u++){if(!known[u])continue;graph[u].forEach(function(e){if(e.cap<=0)return;var a0=p0[u]+e.c0,a1=p1[u]+e.c1,a2=p2[u]+e.c2;if(!known[e.to]||less(a0,a1,a2,p0[e.to],p1[e.to],p2[e.to])){p0[e.to]=a0;p1[e.to]=a1;p2[e.to]=a2;known[e.to]=1;changed=true;}});}if(!changed)break;}
    var d0=new Float64Array(V),d1=new Float64Array(V),d2=new Float64Array(V),reached=new Uint8Array(V),seen=new Uint8Array(V),prevNode=new Int32Array(V),prevEdge=new Int32Array(V),flow=0;
    while(flow<total){
      reached.fill(0);seen.fill(0);d0[0]=0;d1[0]=0;d2[0]=0;reached[0]=1;
      for(var step=0;step<V;step++){
        var v=-1;for(var x=0;x<V;x++)if(reached[x]&&!seen[x]&&(v<0||less(d0[x],d1[x],d2[x],d0[v],d1[v],d2[v])))v=x;
        if(v<0)break;seen[v]=1;
        graph[v].forEach(function(e,ei){if(e.cap<=0||seen[e.to])return;var t=e.to,n0=d0[v]+e.c0+p0[v]-p0[t],n1=d1[v]+e.c1+p1[v]-p1[t],n2=d2[v]+e.c2+p2[v]-p2[t];if(!reached[t]||less(n0,n1,n2,d0[t],d1[t],d2[t])){d0[t]=n0;d1[t]=n1;d2[t]=n2;reached[t]=1;prevNode[t]=v;prevEdge[t]=ei;}});
      }
      if(!reached[sink])break;
      for(var z=0;z<V;z++)if(reached[z]){p0[z]+=d0[z];p1[z]+=d1[z];p2[z]+=d2[z];}
      var at=sink;while(at!==0){var from=prevNode[at],e=graph[from][prevEdge[at]];e.cap--;graph[at][e.rev].cap++;at=from;}flow++;
    }
    var result={};members.forEach(function(mem){result[mem.s.id]=[];});links.forEach(function(l){if(l.edge.cap===0)result[l.student].push(l.project);});return result;
  }
  // Week 1 or week 2 for each Minor student's two projects. Locked students' weeks are fixed. A
  // student with the same two Minors as last run keeps last run's weeks; others start in whichever
  // week is lighter. Then each project's two weeks are evened out, to differ by at most one where
  // possible, by switching the weeks of a chain of students.
  function orientWeeks(pairs,projects,run,fixed){
    var d={},orient={},ids=Object.keys(pairs).filter(function(id){return pairs[id].length===2;}).sort(run.tie.ids);
    projects.forEach(function(p){d[p.id]=fixed[p.id]?fixed[p.id][0]-fixed[p.id][1]:0;});
    ids.forEach(function(id){
      var a=pairs[id][0],b=pairs[id][1],before=run.previous[id],same=before&&before.project2&&[before.project1,before.project2].sort().join()===[a,b].sort().join();
      var first=same?before.project1:d[a]<d[b]||(d[a]===d[b]&&compare(a,b)<=0)?a:b;
      orient[id]=[first,first===a?b:a];d[orient[id][0]]++;d[orient[id][1]]--;
    });
    for(var round=0;round<10000;round++){
      var from={},moved=false;projects.forEach(function(p){from[p.id]=[];});ids.forEach(function(id){from[orient[id][0]].push(id);});
      var starts=projects.map(function(p){return p.id;}).filter(function(id){return d[id]>=1;}).sort(function(x,y){return d[y]-d[x]||compare(x,y);});
      for(var k=0;k<starts.length&&!moved;k++){
        var u=starts[k],step={},queue=[u],best=null;step[u]=null;
        while(queue.length){var x=queue.shift();from[x].forEach(function(id){var y=orient[id][1];if(Object.prototype.hasOwnProperty.call(step,y))return;step[y]={at:x,student:id};queue.push(y);if(d[u]-d[y]>=3&&(best===null||d[y]<d[best]))best=y;});}
        if(best!==null){for(var y=best;step[y];y=step[y].at){var sid=step[y].student;orient[sid]=[orient[sid][1],orient[sid][0]];}d[u]-=2;d[best]+=2;moved=true;}
      }
      if(!moved)break;
    }
    return orient;
  }
  // Fit, reason and flags for one student's projects. The sort uses it, and so does Check again
  // when a student is moved by hand. byHand drops the note about the Minor student minimum, which
  // doesn't apply to a student placed on purpose (by hand, by a lock or as a leader). locked also
  // drops the Fit 6 flag, because a person chose those projects (by hand or with a lock).
  function explain(s,ids,projects,input,choices,byHand,locked){
    var cfg=settings(input),byId={},flags=[];arr(projects).forEach(function(p){byId[p.id]=p;});
    var fits=arr(ids).map(function(id){return fit(s,byId[id],cfg);});
    if(s.status==='late')flags.push('Green status: the app considered this student after everyone else.');if(!byHand&&s.preference==='Major'&&fits.length===2)flags.push('This student asked for a Major but received Minors to reach the Minor student minimum.');if(s.previousKnown===false)flags.push('Past project information is missing.');arr(ids).forEach(function(id){if(isLeader(s,byId[id],choices)&&arr(s.previous).indexOf(id)>=0)flags.push('Previous-project exception: named leader of '+byId[id].name+'.');});if(!locked&&fits.some(function(f){return f.tier===6;}))flags.push('Fit 6: review the placement.');
    return {fit1:fits[0]?fits[0].tier:null,fit2:fits[1]?fits[1].tier:null,reason:fits.length>1?'Week 1: '+fits[0].reason+' Week 2: '+fits[1].reason:fits.length?fits[0].reason:'',flags:flags};
  }
  function emptyAssignment(s){return {studentId:s.id,project1:null,project2:null,fit1:null,fit2:null,reason:s.status==='trip'?'Excluded: ExEd trip.':s.status==='leader'?'Excluded: freshman leader.':eligible(s)?'Needs review: the app could not place this student with the selected projects and group sizes.':'Needs review: check the student identity or status in the source records.',flags:[],status:s.status==='trip'||s.status==='leader'?'excluded':'review'};}
  // A locked student goes exactly where their row says, even on the other track or in a project
  // they didn't check. A lock with no projects keeps the student out of every group. The reason
  // starts with the row's Why and never says who locked it; Locked placements keeps that.
  function lockedAssignment(s,lock,projects,cfg,choices){
    var a=emptyAssignment(s),ids=[lock.project1,lock.project2].filter(Boolean),byId={},why=lock.why?'Locked in place: '+lock.why+(/[.!?]$/.test(lock.why)?'':'.'):'Locked in place by hand.';projects.forEach(function(p){byId[p.id]=p;});a.locked=true;
    if(!ids.length){a.status='review';a.reason=why+' Not placed in a project.';return a;}
    var placement=explain(s,ids,projects,cfg,choices,true,true);
    a.status='placed';a.project1=lock.project1;a.project2=lock.project2;a.fit1=lock.project1?fit(s,byId[lock.project1],cfg).tier:null;a.fit2=lock.project2?fit(s,byId[lock.project2],cfg).tier:null;
    a.reason=why+' '+placement.reason;a.flags=placement.flags;return a;
  }
  function allocate(students,projects,cfg,choices,scores,issues,run){
    run.locked=applyLocks(projects,issues,run);
    run.leading=leaders(students.filter(function(s){return !run.locked[s.id];}),projects,choices,issues,run);run.last=function(s){return placedLast(s,run);};
    var groups=cohort(students,projects,cfg,issues,run),leading=run.leading,locked=run.locked,byId={},majorProjects=projects.filter(function(p){return p.finalLength==='Major';}),minorProjects=projects.filter(function(p){return p.finalLength==='Minor';});
    projects.forEach(function(p){byId[p.id]=p;});
    // Locks and leaders fill their seats first, so the flow gets only the seats left over.
    // A project with a Max size may grow up to it when more students want it and it fits them better.
    // Other projects keep the even split, and then every group fills to the minimum first.
    function solve(members,list,units,fixed,total){
      var quota=quotas(total,list,cfg,scores),assigned={},relaxed=false,sized=list.some(function(p){return Number.isInteger(choiceFor(choices,p.id).maxSize);});
      list.forEach(function(p){if(Number.isInteger(choiceFor(choices,p.id).maxSize))quota[p.id]=limit(p,cfg,choices);});
      for(var attempt=0;attempt<=14;attempt++){
        var capacity={},floor={};list.forEach(function(p){capacity[p.id]=Math.max(0,quota[p.id]*units-(fixed[p.id]||0));floor[p.id]=sized?Math.min(capacity[p.id],Math.max(0,cfg.minSize*units-(fixed[p.id]||0))):0;});
        assigned=assignFlow(members,list,cfg,choices,capacity,floor,run);
        if(members.every(function(mem){return assigned[mem.s.id].length===mem.units;}))break;
        var expandable=list.filter(function(p){return quota[p.id]<limit(p,cfg,choices);});if(!expandable.length)break;
        expandable.forEach(function(p){quota[p.id]++;});relaxed=true;
      }
      if(relaxed)issues.push(note('QUOTA_RELAXED','info',(units===2?'Minor':'Major')+' groups could not all meet the balanced size targets because of project restrictions. They still stay within the maximum.'));
      return assigned;
    }
    var fixedMajor={},fixedMinor={},weeks={};
    function seat(map,pid){map[pid]=(map[pid]||0)+1;}
    Object.keys(locked).forEach(function(id){[locked[id].project1,locked[id].project2].forEach(function(pid,w){if(!pid)return;if(byId[pid].finalLength==='Major')seat(fixedMajor,pid);else{seat(fixedMinor,pid);(weeks[pid]||(weeks[pid]=[0,0]))[w]++;}});});
    Object.keys(leading).forEach(function(id){seat(leading[id].finalLength==='Minor'?fixedMinor:fixedMajor,leading[id].id);});
    // A Major leader is set for both weeks. A Minor leader needs one more Minor, chosen by the normal rules.
    var majorMembers=groups.major.filter(function(s){return !leading[s.id];}).map(function(s){return {s:s,units:1,skip:null};});
    var minorMembers=groups.minor.map(function(s){return leading[s.id]?{s:s,units:1,skip:leading[s.id].id}:{s:s,units:2,skip:null};});
    var mp=solve(majorMembers,majorProjects,1,fixedMajor,groups.major.length+groups.lockedMajor),np=solve(minorMembers,minorProjects,2,fixedMinor,groups.minor.length+groups.lockedMinor);
    Object.keys(leading).forEach(function(id){var p=leading[id];if(p.finalLength==='Major')mp[id]=[p.id];else np[id]=[p.id].concat(np[id]||[]);});
    var oriented=orientWeeks(np,minorProjects,run,weeks);
    var minorIds={};groups.minor.forEach(function(s){minorIds[s.id]=true;});
    return students.map(function(s){if(locked[s.id])return lockedAssignment(s,locked[s.id],projects,cfg,choices);
      var pair=minorIds[s.id]?oriented[s.id]:mp[s.id];
      return eligible(s)&&pair&&pair.length===(minorIds[s.id]?2:1)?describe(s,pair,projects,cfg,choices,run):emptyAssignment(s);
    });
  }
  // The fit, reason and flags the sort writes for a student placed in these projects.
  function describe(s,pair,projects,cfg,choices,run){
    var a=emptyAssignment(s),lead=run.leading[s.id],placement=explain(s,pair,projects,cfg,choices,!!lead);
    a.status='placed';a.project1=pair[0];a.project2=pair[1]||null;a.fit1=placement.fit1;a.fit2=placement.fit2;a.reason=placement.reason;a.flags=placement.flags;
    if(lead)a.flags.unshift('Leading '+lead.name+', so placed there.');else if(checkedCount(s)<=1)a.flags.push(checkedCount(s)?'Checked only one project, so placed after everyone else.':'Checked no projects, so placed after everyone else.');
    return a;
  }
  // Rows from the reviewed Friend requests tab. Only rows marked Use count, and students are matched
  // by email. With useFriendRequests off nothing is applied, and every row says so.
  // Email and Classmate email take an email or a Student ID such as jo@example.org:smith-jo, like the
  // Gender tab, so students who share an email can still be named. A shared email alone is skipped.
  function resolveFriends(students,rows,cfg){
    var byKey={},issues=[],requests=[],report=[];
    students.forEach(function(s){[key(s.id),key(s.email)].forEach(function(k){if(k&&(byKey[k]=byKey[k]||[]).indexOf(s)<0)byKey[k].push(s);});});
    arr(rows).forEach(function(r){
      var line={row:r.row,name:String(r.name||'').trim(),classmate:String(r.classmate||'').trim(),request:String(r.request||'').trim(),result:'Not applied',why:''};
      var kind=plain(r.request)==='with'?'With':plain(r.request)==='not with'?'Not with':null,a=byKey[key(r.email)]||[],b=byKey[key(r.classmateEmail)]||[];
      if(!line.name&&!line.classmate&&!key(r.email)&&!key(r.classmateEmail))return;
      report.push(line);
      if(!cfg.useFriendRequests)line.why='Friend requests are turned off in Settings';
      else if(r.use!==true)line.why='Use is not checked';
      else if(!key(r.email)||!key(r.classmateEmail))line.why='Email or classmate email is blank';
      else if(!kind)line.why='Request must be With or Not with';
      else if(a.length>1||b.length>1){line.why='Two students share this email';issues.push(note('FRIEND_SHARED_EMAIL','warning','Two students share this email, so this friend request was skipped.',{source:{sheet:'Friend requests',row:r.row}}));}
      else if(!a.length)line.why='No student has this email or Student ID';
      else if(!b.length)line.why='No student has the classmate email or Student ID';
      else if(a[0]===b[0])line.why="A student can't name themselves";
      else{line.request=kind;line.name=line.name||a[0].name;line.classmate=line.classmate||b[0].name;requests.push({from:a[0].id,to:b[0].id,kind:kind,named:r.namedEachOther===true,line:line});}
    });
    requests.forEach(function(q){q.mutual=q.kind==='With'&&(q.named||requests.some(function(o){return o.kind==='With'&&o.from===q.to&&o.to===q.from;}));});
    return {requests:requests,report:report,issues:issues};
  }
  // Two placements share a group: the same Major, or the same Minor in the same week.
  function shareGroup(a,b){return !!a&&!!b&&a.status==='placed'&&b.status==='placed'&&(a.project1===b.project1||(!!a.project2&&a.project2===b.project2));}
  // After the main sort: keep "Not with" pairs apart, then bring together students who asked to work
  // with a classmate, wherever every rule still holds. Locked students and leaders never move. With
  // move false it only reports where each request stands, for Check again.
  function arrange(students,projects,assignments,cfg,choices,run,requests,move){
    var byId={},project={},where={},track={},size={},fixed={},notes={},why={},joined=[],apart=[],stuck={};
    students.forEach(function(s){byId[s.id]=s;});projects.forEach(function(p){project[p.id]=p;});
    assignments.forEach(function(a){
      var one=project[a.project1],two=project[a.project2];
      if(a.status!=='placed'||!one)return;
      if(one.finalLength==='Major'&&!a.project2){where[a.studentId]=[a.project1,null];track[a.studentId]='Major';}
      else if(one.finalLength==='Minor'&&two&&two.finalLength==='Minor'&&two.id!==one.id){where[a.studentId]=[a.project1,a.project2];track[a.studentId]='Minor';}
      else return;
      if(a.locked)fixed[a.studentId]='Locked in place by hand';else if(run.leading&&run.leading[a.studentId])fixed[a.studentId]='Leads a project, so stays in place';
    });
    function group(id,w){return track[id]==='Major'?where[id][0]:where[id][w]+'|'+w;}
    function groupsOf(id){return track[id]==='Major'?[group(id,0)]:[group(id,0),group(id,1)];}
    Object.keys(where).forEach(function(id){groupsOf(id).forEach(function(g){size[g]=(size[g]||0)+1;});});
    function together(x,y){return !!where[x]&&!!where[y]&&track[x]===track[y]&&groupsOf(x).some(function(g){return groupsOf(y).indexOf(g)>=0;});}
    function tier(id,pid){return fit(byId[id],project[pid],cfg).tier;}
    function involving(ids,kind){return requests.filter(function(q){return q.kind===kind&&(ids.indexOf(q.from)>=0||ids.indexOf(q.to)>=0);});}
    function name(id){return byId[id].name||id;}
    function remark(id,kind,text){var n=notes[id]=notes[id]||{reason:[],flags:[]};n[kind].push(text);}
    // Make the changes if every rule still holds; otherwise undo them and say which rule stopped it.
    // drop(id) is how many steps of fit that student may lose in all. asked(id) is true for a student
    // who asked for the change; nobody else may end up in fewer projects they checked. That is judged
    // by the projects they checked, not the fit number, so it holds whatever checkedBeforeInferred
    // says. The changes are judged together, so a student's two Minors can trade weeks. A dry run
    // always undoes.
    function tiers(id){return where[id].filter(Boolean).reduce(function(n,pid){return n+tier(id,pid);},0);}
    function held(id){return where[id].filter(function(pid){return pid&&arr(byId[id].choices).indexOf(pid)>=0;}).length;}
    function attempt(changes,drop,keepMet,dry,asked){
      var ids=changes.map(function(c){return c.id;}).filter(function(id,i,all){return all.indexOf(id)===i;}),stop=null,undo=[],before={},fitBefore={},heldBefore={};
      changes.some(function(c){
        if(fixed[c.id])stop=fixed[c.id];
        else if(!allowed(byId[c.id],project[c.to],choices))stop="Would put a student in last year's project";
        return !!stop;
      });
      if(stop)return stop;
      ids.forEach(function(id){fitBefore[id]=tiers(id);heldBefore[id]=held(id);});
      var met=keepMet?involving(ids,'With').filter(function(q){return together(q.from,q.to);}):[],apartBefore=involving(ids,'Not with').filter(function(q){return !together(q.from,q.to);});
      changes.forEach(function(c){var w=track[c.id]==='Major'?0:c.w,old=group(c.id,w),now;undo.push({id:c.id,w:w,from:where[c.id][w]});if(!(old in before))before[old]=size[old];size[old]--;where[c.id][w]=c.to;now=group(c.id,w);if(!(now in before))before[now]=size[now]||0;size[now]=(size[now]||0)+1;});
      ids.some(function(id){
        if(track[id]==='Minor'&&where[id][0]===where[id][1])stop='Would give a Minor student the same project twice';
        else if(!asked(id)&&held(id)<heldBefore[id])stop='Would move another student out of a project they checked';
        else if(tiers(id)-fitBefore[id]>drop(id))stop=drop(id)>0?'Would drop more than one step in fit':'Would give another student a worse fit';
        return !!stop;
      });
      if(!stop)Object.keys(before).some(function(g){var n=size[g]||0,p=project[g.split('|')[0]];if(n>before[g]&&n>limit(p,cfg,choices))stop='A group would go over the maximum';else if(n<before[g]&&n<cfg.minSize)stop='A group would go under the minimum';return !!stop;});
      if(!stop&&apartBefore.some(function(q){return together(q.from,q.to);}))stop='Would put a student with a classmate they asked not to work with';
      if(!stop&&met.some(function(q){return !together(q.from,q.to);}))stop='Would split up another friend request';
      if(stop||dry)undo.reverse().forEach(function(u){var g=group(u.id,u.w);size[g]--;where[u.id][u.w]=u.from;g=group(u.id,u.w);size[g]=(size[g]||0)+1;});
      return stop;
    }
    var any=function(){return Infinity;},everyone=function(){return true;},nobody=function(){return false;};
    // "Not with" is a hard rule. The student who wrote the request moves to their best other group,
    // even when moving the classmate would cost less. Only when the writer is locked or leading does
    // the classmate move instead. The move may cost more than one step, so it is flagged.
    if(move)requests.filter(function(q){return q.kind==='Not with';}).forEach(function(q){
      var mover=!fixed[q.from]?q.from:!fixed[q.to]?q.to:null;
      for(var round=0;round<2&&together(q.from,q.to);round++){
        if(!mover){stuck[q.line.row]=fixed[q.from];break;}
        var shared=groupsOf(q.from).filter(function(g){return groupsOf(q.to).indexOf(g)>=0;})[0],w=track[mover]==='Major'?0:Number(shared.split('|')[1]),here=where[mover][w];
        var pick=projects.filter(function(p){return p.finalLength===track[mover]&&p.id!==here;}).map(function(p){return {id:mover,w:w,to:p.id,loss:tier(mover,p.id)-tier(mover,here)};}).sort(function(a,b){return a.loss-b.loss||compare(a.to,b.to);}).filter(function(o){return !attempt([o],any,false,true,everyone);})[0];
        if(!pick){stuck[q.line.row]='Could not be moved apart without breaking another rule';break;}
        attempt([pick],any,false,false,everyone);apart.push(q);
        remark(mover,'flags',mover!==q.from?'Moved because a classmate asked not to work with them.':'Moved to another group because of a "Not with" friend request. '+(pick.loss>0?'Fit dropped '+pick.loss+(pick.loss===1?' step.':' steps.'):'Fit did not drop.'));
      }
    });
    // The friend pass: pairs who named each other first, then seniors, juniors and sophomores in tie
    // order. Each student not yet with a classmate they named first tries a week switch, then three
    // changes, and keeps the first that works.
    var withs=requests.filter(function(q){return q.kind==='With';});
    function named(id){return withs.filter(function(q){return q.from===id;});}
    function mutual(id){return named(id).some(function(q){return q.mutual;});}
    if(move)withs.map(function(q){return q.from;}).filter(function(id,i,all){return all.indexOf(id)===i;}).sort(function(a,b){return Number(mutual(b))-Number(mutual(a))||byId[b].grade-byId[a].grade||run.tie.ids(a,b);}).forEach(function(id){
      var mine=named(id).filter(function(q){return where[q.from]&&where[q.to]&&track[q.from]===track[q.to];}).sort(function(a,b){return Number(b.mutual)-Number(a.mutual)||run.tie.ids(a.to,b.to);});
      if(!mine.length||mine.some(function(q){return together(q.from,q.to);}))return;
      var weeks=track[id]==='Major'?[0]:[0,1],first=null,done=null;
      function works(stop){if(stop&&!first)first=stop;return !stop;}
      function only(who){return function(x){return x===who?1:0;};}
      // 0. Two Minor students who share a Minor in different weeks: one of them switches their two
      // Minors between week 1 and week 2. Nobody's fit changes.
      if(track[id]==='Minor')mine.some(function(q){
        var mineNow=where[id],theirs=where[q.to];
        if(!mineNow.some(function(pid,w){return theirs[1-w]===pid;}))return false;
        return [id,q.to].some(function(who){return !attempt([{id:who,w:0,to:where[who][1]},{id:who,w:1,to:where[who][0]}],function(){return 0;},true,false,nobody)&&(done={mover:who,other:who===id?q.to:id,q:q,switched:true});});
      });
      // 1. Move the student into a named classmate's group.
      if(!done)mine.some(function(q){return weeks.some(function(w){return works(attempt([{id:id,w:w,to:where[q.to][w]}],only(id),true,false,only(id)))&&(done={mover:id,other:q.to,q:q});});});
      // 2. If they named each other, move the classmate into the student's group.
      if(!done)mine.filter(function(q){return q.mutual;}).some(function(q){return weeks.some(function(w){return works(attempt([{id:q.to,w:w,to:where[id][w]}],only(q.to),true,false,only(q.to)))&&(done={mover:q.to,other:id,q:q});});});
      // 3. Swap the student with a third student in a named classmate's group, in the same week and
      // track. The third student never gets a worse fit or leaves a project they checked.
      if(!done)mine.some(function(q){return weeks.some(function(w){
        var target=where[q.to][w],here=where[id][w];
        return Object.keys(where).filter(function(t){return t!==id&&t!==q.to&&track[t]===track[id]&&where[t][w]===target;}).sort(run.tie.ids).some(function(t){return works(attempt([{id:id,w:w,to:target},{id:t,w:w,to:here}],only(id),true,false,only(id)))&&(done={mover:id,other:q.to,q:q,third:t});});
      });});
      if(!done){why[id]=first;return;}
      joined.push(done.q);withs.forEach(function(o){if(done.q.mutual&&o.from===done.q.to&&o.to===done.q.from)joined.push(o);});
      var asked=done.mover===id||done.q.mutual;
      remark(done.mover,'reason',(done.switched?'Switched weeks':'Moved')+' to be with '+name(done.other)+(asked?', who they asked to work with.':', who asked to work with them.'));
      if(done.third)remark(done.third,'reason','Swapped into this group so classmates who asked to work together could, with no worse fit.');
    });
    // Gender: fix groups that break the rule (no Male students or at least three, and the same for
    // Female) by swapping students between groups in the same week and track. A swap needs every rule
    // above to still hold, drops each student at most one step, and never leaves a student in fewer
    // projects they checked (nobody asked for it). The smallest total drop in fit goes first, then the
    // swap that drops seniors least, then tie order. Unknown genders never move.
    if(move&&cfg.balanceGender){
      var gender={},count={};Object.keys(where).forEach(function(id){gender[id]=genderOf(byId[id].gender);});
      function bad(c){c=c||{Male:0,Female:0};return (c.Male>0&&c.Male<3?1:0)+(c.Female>0&&c.Female<3?1:0);}
      function shifted(c,out,into){var d={Male:0,Female:0};if(c){d.Male=c.Male;d.Female=c.Female;}d[out]--;d[into]++;return d;}
      function better(a,b){for(var i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];return false;}
      for(var round=0;round<1000;round++){
        count={};Object.keys(where).forEach(function(id){if(gender[id])groupsOf(id).forEach(function(g){var c=count[g]=count[g]||{Male:0,Female:0};c[gender[id]]++;});});
        var best=null,movable=Object.keys(where).filter(function(id){return gender[id]&&!fixed[id];}).sort(run.tie.ids);
        Object.keys(count).filter(function(g){return bad(count[g]);}).sort(compare).forEach(function(g){
          var w=g.indexOf('|')<0?0:Number(g.split('|')[1]);
          movable.filter(function(x){return group(x,w)===g;}).forEach(function(x){movable.forEach(function(y){
            var h=group(y,w);
            if(gender[y]===gender[x]||track[y]!==track[x]||h===g)return;
            if(bad(count[g])+bad(count[h])<=bad(shifted(count[g],gender[x],gender[y]))+bad(shifted(count[h],gender[y],gender[x])))return;
            var dx=tier(x,where[y][w])-tier(x,where[x][w]),dy=tier(y,where[x][w])-tier(y,where[y][w]);
            if(dx>1||dy>1)return;
            var score=[dx+dy,(byId[x].grade===12?Math.max(0,dx):0)+(byId[y].grade===12?Math.max(0,dy):0),run.tie.keys[x],run.tie.keys[y]];
            if(best&&!better(score,best.score))return;
            if(!attempt([{id:x,w:w,to:where[y][w]},{id:y,w:w,to:where[x][w]}],function(){return 1;},true,true,nobody))best={score:score,x:x,y:y,w:w};
          });});
        });
        if(!best)break;
        var bx=where[best.x][best.w],by=where[best.y][best.w];
        attempt([{id:best.x,w:best.w,to:by},{id:best.y,w:best.w,to:bx}],function(){return 1;},true,false,nobody);
        [best.x,best.y].forEach(function(id){remark(id,'reason','Swapped with a student in another group to balance the groups.');});
      }
    }
    function status(s,who){return s.status==='trip'?who+' is on an ExEd trip':s.status==='leader'?who+' is a freshman leader':who+' is not placed';}
    function whyNot(q){
      var a=byId[q.from],b=byId[q.to];
      if(!where[q.from])return status(a,'This student');
      if(!where[q.to])return status(b,'Classmate');
      if(track[q.from]!==track[q.to])return a.preference!=='Not sure'&&b.preference!=='Not sure'&&a.preference!==b.preference?'One asked for a Major and the other for Minors':'One is in a Major and the other is in Minors';
      if(named(q.from).some(function(o){return together(o.from,o.to);}))return 'Already with another classmate they named';
      return why[q.from]||(move?'No change worked without breaking a rule':'Not in the same group');
    }
    requests.forEach(function(q){
      var line=q.line,now=together(q.from,q.to);line.result=now?'Together':'Not together';
      if(q.kind==='With')line.why=now?(joined.indexOf(q)>=0?'Moved to be together':'In the same group'):whyNot(q);
      else line.why=now?stuck[line.row]||(move?'Could not be moved apart without breaking another rule':'In the same group'):apart.indexOf(q)>=0?'Moved apart':'Kept apart';
    });
    var askers=withs.map(function(q){return q.from;}).filter(function(id,i,all){return all.indexOf(id)===i;});
    var summary={used:!!cfg.useFriendRequests,withMet:withs.filter(function(q){return q.line.result==='Together';}).length,withUnmet:withs.filter(function(q){return q.line.result!=='Together';}).length,
      studentsWith:askers.length,studentsMet:askers.filter(function(id){return named(id).some(function(q){return q.line.result==='Together';});}).length,notWithBroken:requests.filter(function(q){return q.kind==='Not with'&&q.line.result==='Together';}).length};
    var out=assignments.map(function(a){
      var w=where[a.studentId];
      if(!w||!notes[a.studentId]&&w[0]===a.project1&&w[1]===(a.project2||null))return a;
      var b=describe(byId[a.studentId],w[1]?w:[w[0]],projects,cfg,choices,run),n=notes[a.studentId]||{reason:[],flags:[]};
      if(n.reason.length)b.reason+=' '+n.reason.join(' ');b.flags=b.flags.concat(n.flags);return b;
    });
    return {assignments:out,summary:summary};
  }
  // Where each friend request stands for a set of placements, without moving anyone.
  function friendReport(students,projects,assignments,input,rows,choices){
    var cfg=settings(input),info=resolveFriends(students,rows,cfg),run={leading:{},tie:tieOrder(students,cfg)};run.last=function(s){return placedLast(s,run);};
    var result=arrange(students,projects,assignments,cfg,choices,run,info.requests,false);
    return {rows:info.report,summary:result.summary,issues:info.issues};
  }
  // A lock is kept even when it breaks a rule. Each broken rule is an error that names the student.
  function lockProblems(projects,assignments,cfg,run,requests){
    var out=[],byId={},sizes={};projects.forEach(function(p){byId[p.id]=p;sizes[p.id]=[0,0];});
    assignments.forEach(function(a){if(a.status!=='placed')return;if(sizes[a.project1])sizes[a.project1][0]++;if(a.project2&&sizes[a.project2])sizes[a.project2][1]++;});
    assignments.forEach(function(a){
      if(!a.locked)return;
      var st=run.byId[a.studentId],who=st.name||st.id,p1=byId[a.project1],p2=byId[a.project2],first=p1||p2,extra={studentId:st.id};
      if(!first){out.push(note('LOCKED_OUT','warning',who+' is locked out of every project in Locked placements, so they are not placed.',extra));return;}
      if(p1&&p2&&p1.finalLength!==p2.finalLength)out.push(note('LOCK_BREAKS_RULE','error',who+"'s lock mixes a Major and a Minor.",extra));
      else if(first.finalLength==='Major'&&p1&&p2)out.push(note('LOCK_BREAKS_RULE','error',who+"'s lock has two different Majors, "+p1.name+' and '+p2.name+'.',extra));
      else if(first.finalLength==='Minor'&&!(p1&&p2))out.push(note('LOCK_BREAKS_RULE','error',who+"'s lock has a Minor in only one week. A Minor student needs two different Minors.",extra));
      else if(first.finalLength==='Minor'&&p1.id===p2.id)out.push(note('LOCK_BREAKS_RULE','error',who+"'s lock has "+p1.name+' in both weeks. A Minor student needs two different Minors.',extra));
      [p1,p2].forEach(function(p,w){if(!p)return;var week=p.finalLength==='Major'?0:w,size=sizes[p.id][week],cap=limit(p,cfg,run.choices);if(size>cap)out.push(note('LOCK_BREAKS_RULE','error',who+' is locked into '+p.name+(p.finalLength==='Minor'?', week '+(w+1):'')+', which has '+size+' students, over the maximum of '+cap+'.',{studentId:st.id,projectId:p.id}));});
      arr(requests).forEach(function(q){var other=q.from===a.studentId?q.to:q.to===a.studentId?q.from:null,b=assignments.filter(function(x){return x.studentId===other;})[0];if(q.kind==='Not with'&&other&&shareGroup(a,b))out.push(note('LOCK_BREAKS_RULE','error',who+' is locked into a group with a classmate in a "Not with" request.',extra));});
    });
    return out;
  }
  function counts(projects,assignments){var out={};projects.forEach(function(p){out[p.id]=[0,0];});assignments.forEach(function(a){if(a.status!=='placed')return;if(out[a.project1])out[a.project1][0]++;if(out[a.project2])out[a.project2][1]++;});return out;}
  // context is optional: {previous: last run's assignments, locks: rows from Locked placements,
  // friends: rows from Friend requests}. Old callers that pass four arguments keep working.
  function sort(students,projects,input,choices,context){
    context=context||{};
    var cfg=settings(input),seen={};students.forEach(function(s){if(!s.id||seen[s.id])throw new Error('Each student needs their own ID.');seen[s.id]=true;if(![10,11,12].includes(s.grade))throw new Error('Every student must have grade 10, 11, or 12.');});
    var plan=propose(students,projects,cfg,choices),selected=plan.projects,issues=plan.issues.slice(),scores={},run={tie:tieOrder(students,cfg),allProjects:projects,byId:{},names:{},previous:{},choices:choices};interest(students,projects).forEach(function(r){scores[r.projectId]=r.checked*3+r.aligned;});
    students.forEach(function(s){run.byId[s.id]=s;});projects.forEach(function(p){run.names[p.id]=p.name;});
    arr(context.previous).forEach(function(a){if(a&&run.byId[a.studentId])run.previous[a.studentId]={project1:a.project1||null,project2:a.project2||null};});
    var blocked=issues.some(function(x){return x.severity==='error';}),lockInfo=resolveLocks(students,projects,context.locks),lockProjects={},friends=resolveFriends(students,context.friends,cfg),arranged=null;
    run.locks=lockInfo.byStudent;issues=issues.concat(lockInfo.issues,friends.issues);
    Object.keys(run.locks).forEach(function(id){[run.locks[id].project1,run.locks[id].project2].forEach(function(pid){if(pid)lockProjects[pid]=true;});});
    var assignments;
    if(blocked)assignments=students.map(emptyAssignment);
    else{
      for(var pass=0;pass<=projects.length;pass++){
        var passIssues=[];assignments=allocate(students,selected,cfg,choices,scores,passIssues,run);var occupancy=counts(selected,assignments);
        // A project with a locked student is never cut.
        var undersized=selected.filter(function(p){return !mandatory(p,choices)&&!lockProjects[p.id]&&(occupancy[p.id][0]<cfg.minSize||(p.finalLength==='Minor'&&occupancy[p.id][1]<cfg.minSize));}).sort(function(a,b){return (scores[a.id]||0)-(scores[b.id]||0)||compare(a.id,b.id);});
        // A Minor needs a second different project; never cut its final partner.
        var minorCount=selected.filter(function(p){return p.finalLength==='Minor';}).length;
        var candidate=undersized.find(function(p){return p.finalLength!=='Minor'||minorCount>2;});
        if(!candidate){issues=issues.concat(passIssues);break;}
        issues.push(note('PROJECT_CUT','warning',candidate.name+' was cut because a group was below '+cfg.minSize+' students. The app ran placements again.',{projectId:candidate.id}));selected=selected.filter(function(p){return p.id!==candidate.id;});
      }
      var arranged=arrange(students,selected,assignments,cfg,choices,run,friends.requests,true);assignments=arranged.assignments;
      issues=issues.concat(lockProblems(selected,assignments,cfg,run,friends.requests));
    }
    var checks=check(students,selected,assignments,cfg,choices,{friends:context.friends,afterSort:true}),summary=summarize(students,selected,assignments);
    summary.friends=arranged?arranged.summary:{used:!!cfg.useFriendRequests,withMet:0,withUnmet:0,studentsWith:0,studentsMet:0,notWithBroken:0};
    // Bind run provenance to decision inputs, without reading free-text comments.
    var inputs=students.map(function(s){return {id:s.id,grade:s.grade,status:s.status,preference:s.preference,choices:arr(s.choices).slice().sort(compare),types:arr(s.types).slice().sort(compare),goals:arr(s.goals).slice().sort(compare),previous:arr(s.previous).slice().sort(compare),previousKnown:s.previousKnown!==false,gender:s.gender||null};}).sort(function(a,b){return compare(a.id,b.id);});
    var locks={};Object.keys(run.locks).forEach(function(id){locks[id]=[run.locks[id].project1,run.locks[id].project2];});
    var used=friends.requests.map(function(q){return [q.from,q.to,q.kind,q.mutual];});
    return {assignments:assignments,projects:selected,issues:issues,checks:checks,summary:summary,friends:friends.report,fingerprint:fingerprint({settings:cfg,choices:choices||{},inputs:inputs,projects:selected,locks:locks,previous:run.previous,friends:used,assignments:assignments.slice().sort(function(a,b){return compare(a.studentId,b.studentId);})})};
  }
  // Counts for PP Summary. For each grade: placed students, whether they got projects they checked
  // (a Minor student counts both weeks, one week or neither), and placements at each fit.
  function summarize(students,projects,assignments){
    var s={total:students.length,eligible:students.filter(eligible).length,placed:0,excluded:0,needsReview:0,majorStudents:0,minorStudents:0,projectCount:projects.length,minorProjectCount:projects.filter(function(p){return p.finalLength==='Minor';}).length,fitCounts:{1:0,2:0,3:0,4:0,5:0,6:0},byGrade:{}},byId={},totals={};students.forEach(function(x){byId[x.id]=x;});
    [10,11,12].forEach(function(g){s.byGrade[g]={placed:0,meanFit:null,major:{checked:0,notChecked:0},minor:{bothChecked:0,oneChecked:0,noneChecked:0},fits:{1:0,2:0,3:0,4:0,5:0,6:0}};totals[g]=[0,0];});
    assignments.forEach(function(a){if(a.status==='excluded'){s.excluded++;return;}if(a.status!=='placed'){s.needsReview++;return;}s.placed++;if(a.project2)s.minorStudents++;else s.majorStudents++;var st=byId[a.studentId];if(!st||!s.byGrade[st.grade])return;var g=s.byGrade[st.grade];g.placed++;
      var checked=[a.project1,a.project2].filter(function(id){return id&&arr(st.choices).indexOf(id)>=0;}).length;
      if(a.project2){if(checked===2)g.minor.bothChecked++;else if(checked===1)g.minor.oneChecked++;else g.minor.noneChecked++;}else if(checked)g.major.checked++;else g.major.notChecked++;
      [a.fit1,a.fit2].forEach(function(t){if(t!=null){s.fitCounts[t]=(s.fitCounts[t]||0)+1;g.fits[t]=(g.fits[t]||0)+1;totals[st.grade][0]+=t;totals[st.grade][1]++;}});});
    Object.keys(totals).forEach(function(g){if(totals[g][1])s.byGrade[g].meanFit=totals[g][0]/totals[g][1];});
    var sizes=counts(projects,assignments);s.groups=projects.map(function(p){return {id:p.id,name:p.name,length:p.finalLength,sizes:p.finalLength==='Minor'?sizes[p.id]:[sizes[p.id][0]]};});
    return s;
  }
  function check(students,projects,assignments,input,choices,context){
    var cfg=settings(input),out=[],studentMap={},projectMap={},seen={},members={},validStatuses=['placed','excluded','review'],gendered=[];
    students.forEach(function(s){if(studentMap[s.id])out.push(note('DUPLICATE_STUDENT','error','Duplicate source student ID.',{studentId:s.id}));studentMap[s.id]=s;});
    projects.forEach(function(p){if(projectMap[p.id])out.push(note('DUPLICATE_PROJECT','error','Duplicate selected project ID.',{projectId:p.id}));projectMap[p.id]=p;members[p.id]=[[],[]];if(p.enabled===false)out.push(note('CANCELLED_PROJECT','error','Cancelled project is selected.',{projectId:p.id}));if(!['Major','Minor'].includes(p.finalLength))out.push(note('UNRESOLVED_LENGTH','error','Choose whether this project runs as a Major or Minor.',{projectId:p.id}));});
    assignments.forEach(function(a){var s=studentMap[a.studentId];seen[a.studentId]=(seen[a.studentId]||0)+1;if(!s){out.push(note('UNKNOWN_STUDENT','error','Assignment names an unknown student.',{studentId:a.studentId}));return;}if(validStatuses.indexOf(a.status)<0)out.push(note('INVALID_ASSIGNMENT_STATUS','error','Unknown assignment status.',{studentId:s.id}));
      if(a.status!=='placed'){if(a.project1||a.project2)out.push(note('HIDDEN_PLACEMENT','error','An excluded or review row still contains a project.',{studentId:s.id}));if(eligible(s)&&a.status==='excluded')out.push(note('WRONG_EXCLUSION','error','Eligible student is marked excluded.',{studentId:s.id}));if((s.status==='trip'||s.status==='leader')&&a.status!=='excluded')out.push(note('EXCLUSION_STATUS','error','Trip or freshman leader is not marked excluded.',{studentId:s.id}));if(a.status==='review')out.push(note('NEEDS_REVIEW','warning','Check the source record or find a complete placement for this student.',{studentId:s.id}));return;}
      if(!eligible(s))out.push(note('INELIGIBLE_PLACED','error','Trip, freshman leader, or unresolved student was placed.',{studentId:s.id}));
      var p1=projectMap[a.project1],p2=projectMap[a.project2];if(!p1)out.push(note('UNKNOWN_PROJECT','error','Project #1 is missing or unknown.',{studentId:s.id}));if(a.project2&&!p2)out.push(note('UNKNOWN_PROJECT','error','Project #2 is unknown.',{studentId:s.id}));
      if(p1&&p2&&p1.finalLength!==p2.finalLength)out.push(note('MIXED_TRACKS','error','Project #1 and Project #2 mix a Major and a Minor. Use one Major (the same label twice, or one label and a blank) or two different Minors.',{studentId:s.id}));
      else{if(p1&&p1.finalLength==='Major'&&a.project2)out.push(note('MAJOR_SECOND_PROJECT','error','A Major student has a second project.',{studentId:s.id}));if(p1&&p1.finalLength==='Minor'&&(!p2||p2.finalLength!=='Minor'||p1.id===p2.id))out.push(note('INVALID_MINOR_PAIR','error','A Minor student needs two different Minor projects, one each week.',{studentId:s.id}));}
      if(p1)members[p1.id][0].push(s);if(p2)members[p2.id][1].push(s);
      // A fit 6 that a person chose, with a lock or by hand, isn't a warning.
      [p1,p2].forEach(function(p,i){if(!p)return;if(!allowed(s,p,choices))out.push(note('PREVIOUS_PROJECT','error','Student repeats a previous project without a leader exception.',{studentId:s.id,projectId:p.id}));var actual=fit(s,p,cfg).tier;if(a[i===0?'fit1':'fit2']!==actual)out.push(note('STALE_FIT','error','Displayed fit does not match the source preferences.',{studentId:s.id,projectId:p.id}));if(actual===6&&a.locked!==true&&a.movedByHand!==true)out.push(note('LOW_FIT','warning','Fit 6 placement needs review.',{studentId:s.id,projectId:p.id}));});
      // A track change made by hand or with a lock is a person's decision, so it is information only.
      var byHand=a.locked===true?' Locked in place.':a.movedByHand===true?' Moved by hand.':'';
      if(s.preference==='Minor'&&p1&&p1.finalLength==='Major')out.push(note('MINOR_PREFERENCE_CHANGED',byHand?'info':'warning','This student asked for Minors and received a Major.'+byHand,{studentId:s.id}));if(s.preference==='Major'&&p1&&p1.finalLength==='Minor')out.push(note('MAJOR_TO_MINOR',byHand?'info':cfg.allowMajorToMinor?'warning':'error','This student asked for a Major and received Minors.'+byHand,{studentId:s.id}));
    });
    students.forEach(function(s){if(!seen[s.id])out.push(note('MISSING_STUDENT','error','Student has no assignment or review row.',{studentId:s.id}));else if(seen[s.id]!==1)out.push(note('DUPLICATE_ASSIGNMENT','error','Student has more than one assignment row.',{studentId:s.id}));if(s.previousKnown===false&&eligible(s))out.push(note('PREVIOUS_UNAVAILABLE','warning','Past projects are missing for this student, so the app could not fully check for repeats.',{studentId:s.id}));});
    projects.forEach(function(p){var c=choiceFor(choices,p.id);if(c.run===false)out.push(note('PROJECT_DISABLED','error','Project is selected despite Run = FALSE.',{projectId:p.id}));if(c.length&&p.finalLength!==c.length)out.push(note('LENGTH_CHOICE_IGNORED','error','Selected length differs from the project choice.',{projectId:p.id}));projects.forEach(function(q){if(compare(p.id,q.id)<0&&conflicts(p.id,q.id,choices))out.push(note('PROJECT_CONFLICT','error','Projects cannot run together: '+p.name+' and '+q.name,{projectId:p.id}));});
      var weeks=p.finalLength==='Minor'?2:1;for(var w=0;w<weeks;w++){var list=members[p.id][w],extra={projectId:p.id,week:w+1},cap=limit(p,cfg,choices);if(list.length>cap)out.push(note('OVER_CAPACITY','error',p.name+' exceeds '+cap+' students in week '+(w+1)+'.',extra));if(list.length<cfg.minSize)out.push(note('UNDER_MINIMUM',c.mustRun===true?'warning':'error',p.name+' has '+list.length+' students in week '+(w+1)+'; minimum is '+cfg.minSize+(c.mustRun===true?' (must-run exception).':'.'),extra));
        // The gender rule: a group has no Male students or at least three, and no Female students or at
        // least three. Unknown genders aren't counted, and the message says how many there are.
        var male=0,female=0,unknown=0;list.forEach(function(s){var g=genderOf(s.gender);if(g==='Male')male++;else if(g==='Female')female++;else unknown++;});
        if((male&&male<3)||(female&&female<3))gendered.push({alone:male===1||female===1,note:note('GENDER_BALANCE','warning',p.name+(weeks===2?', week '+(w+1):'')+': '+female+' Female and '+male+' Male students'+(unknown?' ('+unknown+' with unknown gender)':'')+'. '+(!cfg.balanceGender?'Gender balancing is turned off in Settings.':context&&context.afterSort?"We couldn't fix it without breaking another rule.":'Sort again to try to fix it.'),extra)});
      }
    });
    // Groups with a single Male or a single Female student are listed first.
    gendered.sort(function(a,b){return Number(b.alone)-Number(a.alone);}).forEach(function(g){out.push(g.note);});
    Object.keys(choices||{}).forEach(function(id){if((choiceFor(choices,id).mustRun||choiceFor(choices,id).run===true)&&!projectMap[id])out.push(note('REQUIRED_PROJECT_MISSING','error','A required project is not running.',{projectId:id}));});
    var summary=summarize(students,projects,assignments);if(projects.length!==cfg.projectCount)out.push(note('PROJECT_COUNT','warning','Running '+projects.length+' projects; requested '+cfg.projectCount+'.'));if(summary.minorProjectCount!==cfg.minorProjects)out.push(note('MINOR_PROJECT_COUNT','warning','Running '+summary.minorProjectCount+' Minor projects; requested '+cfg.minorProjects+'.'));if(summary.minorStudents<cfg.minorMin||summary.minorStudents>cfg.minorMax)out.push(note('MINOR_STUDENT_COUNT','warning','Placed '+summary.minorStudents+' Minor students; requested range '+cfg.minorMin+' to '+cfg.minorMax+'.'));
    if(!students.some(function(s){return eligible(s)&&genderOf(s.gender);}))out.push(note('NO_GENDER_DATA','warning','The app could not check gender balance because no gender data was supplied.'));
    // "Not with" is a hard rule, including after moves by hand.
    if(context&&context.friends){var placedBy={};assignments.forEach(function(a){placedBy[a.studentId]=a;});resolveFriends(students,context.friends,cfg).requests.forEach(function(q){if(q.kind==='Not with'&&shareGroup(placedBy[q.from],placedBy[q.to]))out.push(note('NOT_WITH_TOGETHER','error',(studentMap[q.from].name||q.from)+' and '+(studentMap[q.to].name||q.to)+' are in the same group, but one asked not to work with the other.',{studentId:q.from}));});}
    var senior=summary.byGrade[12].meanFit,junior=summary.byGrade[11].meanFit,soph=summary.byGrade[10].meanFit;if((senior!=null&&junior!=null&&senior>junior)||(junior!=null&&soph!=null&&junior>soph))out.push(note('GRADE_FIT_REVIEW','warning','Average interest matches do not follow the intended senior, junior, sophomore order. Check group limits and students marked green. Giving older grades priority does not guarantee this order.'));
    return out;
  }
  function fingerprint(value){function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+stable(v[k]);}).join(',')+'}';}var str=stable(value),h=2166136261;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return ('00000000'+(h>>>0).toString(16)).slice(-8);}
  return {defaults:defaults,settings:settings,interest:interest,propose:propose,fit:fit,explain:explain,sort:sort,check:check,summarize:summarize,locks:resolveLocks,friends:friendReport,fingerprint:fingerprint};
}());
if (typeof module !== 'undefined' && module.exports) module.exports = PPEngine;
