/* Deterministic, local-only placement prototype. The cohort is selected before
 * optimization: Minor-preference students, then the Not-sure students who checked
 * the most running Minors. Within each Major/Minor cohort, total fit is optimized in
 * lexicographic senior/junior/sophomore/green order. This does not guarantee
 * ordered grade means or a globally best cohort/project plan. Balanced quotas
 * are relaxed within the cap when needed; incomplete results are not proofs
 * that all possible plans fail. */
var PPEngine = (function () {
  'use strict';
  var defaults = Object.freeze({minSize:8,targetSize:11,maxSize:14,projectCount:23,minorProjects:8,minorMin:80,minorTarget:88,minorMax:96,allowMajorToMinor:true,checkedBeforeInferred:true});
  function arr(x) { return Array.isArray(x) ? x : []; }
  function eligible(s) { return s.status === 'eligible' || s.status === 'late'; }
  function compare(a,b) { return String(a).localeCompare(String(b),'en'); }
  function note(code,severity,message,extra) { return Object.assign({code:code,severity:severity,message:message},extra || {}); }
  function settings(input) {
    var v = Object.assign({},defaults,input || {});
    ['minSize','targetSize','maxSize','projectCount','minorProjects','minorMin','minorTarget','minorMax'].forEach(function(k) { if (!Number.isInteger(v[k]) || v[k] < 0) throw new Error(k+' must be a nonnegative whole number.'); });
    if (v.minSize < 1 || v.minSize > v.targetSize || v.targetSize > v.maxSize || v.maxSize > 14) throw new Error('Choose group sizes from 1 to 14. The minimum cannot exceed the target, and the target cannot exceed the maximum.');
    if (v.projectCount < 1 || v.minorProjects > v.projectCount) throw new Error('Choose at least one project in total. The number of Minors cannot exceed that total.');
    if (v.minorMin > v.minorTarget || v.minorTarget > v.minorMax) throw new Error('The Minor student target must fall between the minimum and maximum.');
    ['allowMajorToMinor','checkedBeforeInferred'].forEach(function(k) { if (typeof v[k] !== 'boolean') throw new Error(k+' must be TRUE or FALSE.'); });
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
      arr(c.cannotRunWith).forEach(function(other){if(!ids[other]||other===id)issues.push(note('INVALID_PROJECT_CONFLICT','error','Invalid cannot-run-with entry for '+id+': '+other,{projectId:id}));});
    });
    var all=projects.filter(function(p){var c=choiceFor(choices,p.id);if(p.enabled===false&&mandatory(p,choices))issues.push(note('CANCELLED_PROJECT','error','A cancelled project was requested to run: '+p.name,{projectId:p.id}));return p.enabled!==false&&c.run!==false;}).map(function(p){
      var c=choiceFor(choices,p.id), length=c.length||p.length;
      if(length!=='Major'&&length!=='Minor'&&length!=='Either')throw new Error('Invalid project length for '+p.name+'.');
      if(c.length&&p.length!=='Either'&&p.length!==c.length)issues.push(note('LENGTH_OVERRIDE','warning',p.name+' changes from '+p.length+' to '+c.length+' by project choice.',{projectId:p.id}));
      return Object.assign({},p,{finalLength:length});
    }).sort(function(a,b){return Number(mandatory(b,choices))-Number(mandatory(a,choices))||(scores[b.id]||0)-(scores[a.id]||0)||compare(a.id,b.id);});
    var selected=[];
    function add(p){
      var blocked=selected.filter(function(q){return conflicts(p.id,q.id,choices);});
      if(blocked.length){if(mandatory(p,choices))issues.push(note('MANDATORY_CONFLICT','error','Required projects cannot run together: '+p.name+' and '+blocked.map(function(q){return q.name;}).join(', '),{projectId:p.id}));return false;}
      selected.push(p);return true;
    }
    all.filter(function(p){return mandatory(p,choices);}).forEach(add);
    if(selected.length>cfg.projectCount)issues.push(note('TOO_MANY_REQUIRED','error','There are more required projects than the total you chose.'));
    function countMinor(){return selected.filter(function(p){return p.finalLength==='Minor';}).length;}
    // Give required Either projects a length, then fill Minor slots before Majors.
    selected.filter(function(p){return p.finalLength==='Either';}).forEach(function(p){p.finalLength=countMinor()<cfg.minorProjects?'Minor':'Major';});
    all.filter(function(p){return selected.indexOf(p)<0&&(p.finalLength==='Minor'||p.finalLength==='Either');}).forEach(function(p){if(selected.length<cfg.projectCount&&countMinor()<cfg.minorProjects){var old=p.finalLength;p.finalLength='Minor';if(!add(p))p.finalLength=old;}});
    all.filter(function(p){return selected.indexOf(p)<0&&(p.finalLength==='Major'||p.finalLength==='Either');}).forEach(function(p){if(selected.length<cfg.projectCount){var old=p.finalLength;p.finalLength='Major';if(!add(p))p.finalLength=old;}});
    if(selected.length!==cfg.projectCount)issues.push(note('PROJECT_COUNT_SUGGESTION','warning','Selected '+selected.length+' projects; setting requests '+cfg.projectCount+'.'));
    if(countMinor()!==cfg.minorProjects)issues.push(note('MINOR_COUNT_SUGGESTION','warning','Selected '+countMinor()+' Minor projects; setting requests '+cfg.minorProjects+'.'));
    return {projects:selected.sort(function(a,b){return compare(a.id,b.id);}),issues:issues};
  }
  function isLeader(s,p,choices){return arr(choiceFor(choices,p.id).leaders).some(function(id){return String(id).toLowerCase()===String(s.id).toLowerCase()||(s.email&&String(id).toLowerCase()===String(s.email).toLowerCase());});}
  function allowed(s,p,choices){return arr(s.previous).indexOf(p.id)<0||isLeader(s,p,choices);}
  function priority(a,b){return Number(a.status==='late')-Number(b.status==='late')||b.grade-a.grade||compare(a.id,b.id);}
  function weight(s,base){return s.status==='late'?1:Math.pow(base,s.grade===12?3:s.grade===11?2:1);}
  function cohort(students,projects,cfg,issues){
    var active=students.filter(eligible),minors=projects.filter(function(p){return p.finalLength==='Minor';}),majors=projects.length-minors.length,running={};
    minors.forEach(function(p){running[p.id]=true;});
    var lower=Math.max(cfg.minorMin,minors.length*cfg.minSize,active.length-majors*cfg.maxSize),upper=Math.min(cfg.minorMax,minors.length*cfg.maxSize,active.length-majors*cfg.minSize);
    if(lower>upper)issues.push(note('COHORT_CAPACITY','warning','The group sizes cannot fit the requested number of Minor students. Check the project list and Minor student targets.'));
    var desired=Math.max(0,Math.min(minors.length*cfg.maxSize,lower<=upper?Math.max(lower,Math.min(upper,cfg.minorTarget)):cfg.minorTarget)),minimum=Math.min(desired,lower);
    function minorChecks(s){return arr(s.choices).filter(function(id,i,all){return running[id]&&all.indexOf(id)===i;}).length;}
    // Every Minor-preference student does Minors. Not-sure students who checked the most running
    // Minors fill the spots up to the target; ties go to sophomores, then juniors, then seniors.
    var minor=active.filter(function(s){return s.preference==='Minor';}).sort(priority),unknown=active.filter(function(s){return s.preference==='Not sure';}).sort(function(a,b){return minorChecks(b)-minorChecks(a)||a.grade-b.grade||Number(a.status==='late')-Number(b.status==='late')||compare(a.id,b.id);});
    while(minor.length<desired&&unknown.length)minor.push(unknown.shift());
    // Major-preference students move only while the Minor count is below its minimum.
    if(cfg.allowMajorToMinor){var major=active.filter(function(s){return s.preference==='Major';}).sort(function(a,b){return Number(a.status==='late')-Number(b.status==='late')||a.grade-b.grade||compare(a.id,b.id);});while(minor.length<minimum&&major.length)minor.push(major.shift());}
    var members={};minor.forEach(function(s){members[s.id]=true;});
    return {minor:minor.sort(priority),major:active.filter(function(s){return !members[s.id];}).sort(priority)};
  }
  function quotas(count,projects,cfg,scores){
    var sorted=projects.slice().sort(function(a,b){return (scores[b.id]||0)-(scores[a.id]||0)||compare(a.id,b.id);}), result={};
    if(!sorted.length)return result;
    var n=Math.min(count,sorted.length*cfg.maxSize),base=Math.floor(n/sorted.length),extra=n%sorted.length;
    sorted.forEach(function(p,i){result[p.id]=base+(i<extra?1:0);});return result;
  }
  // Successive shortest augmenting paths. Potentials make residual reverse edges
  // usable with Dijkstra. All costs are integer and remain below MAX_SAFE_INTEGER.
  function assignFlow(students,projects,cfg,choices,quota,units,base){
    var n=students.length,m=projects.length,sink=1+n+m,V=sink+1,graph=Array.from({length:V},function(){return [];}),links=[];
    function edge(u,v,cap,cost){var a={to:v,rev:graph[v].length,cap:cap,cost:cost,initial:cap},b={to:u,rev:graph[u].length,cap:0,cost:-cost,initial:0};graph[u].push(a);graph[v].push(b);return a;}
    students.forEach(function(s,i){var w=weight(s,base);edge(0,1+i,units,-6*w);projects.forEach(function(p,j){if(allowed(s,p,choices)){var f=fit(s,p,cfg),e=edge(1+i,1+n+j,1,(f.tier-1)*w);links.push({student:s.id,project:p.id,edge:e});}});});
    projects.forEach(function(p,j){edge(1+n+j,sink,(quota[p.id]||0)*units,0);});
    var potential=Array(V).fill(Infinity);potential[0]=0;
    for(var k=0;k<V;k++){var changed=false;for(var u=0;u<V;u++){if(!isFinite(potential[u]))continue;graph[u].forEach(function(e){if(e.cap>0&&potential[e.to]>potential[u]+e.cost){potential[e.to]=potential[u]+e.cost;changed=true;}});}if(!changed)break;}
    potential=potential.map(function(x){return isFinite(x)?x:0;});
    var flow=0;
    while(flow<n*units){
      var dist=Array(V).fill(Infinity),seen=Array(V).fill(false),prevNode=Array(V).fill(-1),prevEdge=Array(V).fill(-1);dist[0]=0;
      for(var step=0;step<V;step++){var v=-1;for(var d=0;d<V;d++)if(!seen[d]&&(v<0||dist[d]<dist[v]))v=d;if(v<0||!isFinite(dist[v]))break;seen[v]=true;
        graph[v].forEach(function(e,ei){if(e.cap<=0||seen[e.to])return;var nd=dist[v]+e.cost+potential[v]-potential[e.to];if(nd<dist[e.to]){dist[e.to]=nd;prevNode[e.to]=v;prevEdge[e.to]=ei;}});
      }
      if(!isFinite(dist[sink]))break;
      for(var z=0;z<V;z++)if(isFinite(dist[z]))potential[z]+=dist[z];
      var at=sink;while(at!==0){var from=prevNode[at],e=graph[from][prevEdge[at]];e.cap--;graph[at][e.rev].cap++;at=from;}flow++;
    }
    var result={};students.forEach(function(s){result[s.id]=[];});links.forEach(function(l){if(l.edge.cap===0)result[l.student].push(l.project);});return result;
  }
  // Student pairs are edges between Minor projects. Euler orientation gives
  // equal weekly sizes for complete even-degree quotas, or a difference of one
  // for incomplete results. Dummy edges join odd vertices and are never output.
  function orient(pairs,projects){
    var adj={},edges=[],used={},oriented={};projects.forEach(function(p){adj[p.id]=[];});
    function add(a,b,student){var i=edges.length;edges.push({a:a,b:b,student:student});adj[a].push(i);adj[b].push(i);}
    Object.keys(pairs).sort(compare).forEach(function(id){if(pairs[id].length===2)add(pairs[id][0],pairs[id][1],id);});
    var odd=Object.keys(adj).filter(function(id){return adj[id].length%2;}).sort(compare);for(var i=0;i<odd.length;i+=2)add(odd[i],odd[i+1],null);
    Object.keys(adj).sort(compare).forEach(function(start){
      var stack=[start];while(stack.length){var from=stack[stack.length-1];while(adj[from].length&&used[adj[from][adj[from].length-1]])adj[from].pop();if(!adj[from].length){stack.pop();continue;}
        var ei=adj[from].pop(),e=edges[ei];if(used[ei])continue;used[ei]=true;var to=e.a===from?e.b:e.a;if(e.student)oriented[e.student]=[from,to];stack.push(to);
      }
    });return oriented;
  }
  // Fit, reason and flags for one student's projects. The sort uses it, and so does Check again
  // when Mr. Litowitz moves a student by hand (byHand drops the note about the Minor student minimum).
  function explain(s,ids,projects,input,choices,byHand){
    var cfg=settings(input),byId={},flags=[];arr(projects).forEach(function(p){byId[p.id]=p;});
    var fits=arr(ids).map(function(id){return fit(s,byId[id],cfg);});
    if(s.status==='late')flags.push('Green status: the app considered this student after everyone else.');if(!byHand&&s.preference==='Major'&&fits.length===2)flags.push('This student asked for a Major but received Minors to reach the Minor student minimum.');if(s.previousKnown===false)flags.push('Past project information is missing.');arr(ids).forEach(function(id){if(isLeader(s,byId[id],choices)&&arr(s.previous).indexOf(id)>=0)flags.push('Previous-project exception: named leader of '+byId[id].name+'.');});if(fits.some(function(f){return f.tier===6;}))flags.push('Fit 6: review the placement.');
    return {fit1:fits[0]?fits[0].tier:null,fit2:fits[1]?fits[1].tier:null,reason:fits.length>1?'Week 1: '+fits[0].reason+' Week 2: '+fits[1].reason:fits.length?fits[0].reason:'',flags:flags};
  }
  function emptyAssignment(s){return {studentId:s.id,project1:null,project2:null,fit1:null,fit2:null,reason:s.status==='trip'?'Excluded: ExEd trip.':s.status==='leader'?'Excluded: freshman leader.':eligible(s)?'Needs review: the app could not place this student with the selected projects and group sizes.':'Needs review: check the student identity or status in the source records.',flags:[],status:s.status==='trip'||s.status==='leader'?'excluded':'review'};}
  function allocate(students,projects,cfg,choices,scores,issues){
    var groups=cohort(students,projects,cfg,issues),majorProjects=projects.filter(function(p){return p.finalLength==='Major';}),minorProjects=projects.filter(function(p){return p.finalLength==='Minor';}),base=6*Math.max(1,students.length*2)+1;
    if(Math.pow(base,3)*6*students.length*2>Number.MAX_SAFE_INTEGER)throw new Error('Dataset is too large for the prototype integer priority costs.');
    function solve(group,list,units){
      var quota=quotas(group.length,list,cfg,scores),assigned={},relaxed=false;
      for(var attempt=0;attempt<=cfg.maxSize;attempt++){
        assigned=assignFlow(group,list,cfg,choices,quota,units,base);
        if(group.every(function(s){return assigned[s.id].length===units;}))break;
        var expandable=list.filter(function(p){return quota[p.id]<cfg.maxSize;});if(!expandable.length)break;
        expandable.forEach(function(p){quota[p.id]++;});relaxed=true;
      }
      if(relaxed)issues.push(note('QUOTA_RELAXED','info',(units===2?'Minor':'Major')+' groups could not all meet the balanced size targets because of project restrictions. They still stay within the maximum.'));
      return assigned;
    }
    var mp=solve(groups.major,majorProjects,1),np=solve(groups.minor,minorProjects,2),oriented=orient(np,minorProjects);
    var minorIds={};groups.minor.forEach(function(s){minorIds[s.id]=true;});
    return students.map(function(s){var a=emptyAssignment(s);if(!eligible(s))return a;var pair=minorIds[s.id]?oriented[s.id]:mp[s.id];if(!pair||pair.length!==(minorIds[s.id]?2:1))return a;
      var placement=explain(s,pair,projects,cfg,choices,false);a.status='placed';a.project1=pair[0];a.project2=pair[1]||null;a.fit1=placement.fit1;a.fit2=placement.fit2;a.reason=placement.reason;a.flags=placement.flags;return a;
    });
  }
  function counts(projects,assignments){var out={};projects.forEach(function(p){out[p.id]=[0,0];});assignments.forEach(function(a){if(a.status!=='placed')return;if(out[a.project1])out[a.project1][0]++;if(out[a.project2])out[a.project2][1]++;});return out;}
  function sort(students,projects,input,choices){
    var cfg=settings(input),seen={};students.forEach(function(s){if(!s.id||seen[s.id])throw new Error('Each student needs their own ID.');seen[s.id]=true;if(![10,11,12].includes(s.grade))throw new Error('Every student must have grade 10, 11, or 12.');});
    var plan=propose(students,projects,cfg,choices),selected=plan.projects,issues=plan.issues.slice(),scores={};interest(students,projects).forEach(function(r){scores[r.projectId]=r.checked*3+r.aligned;});
    var assignments;
    if(issues.some(function(x){return x.severity==='error';}))assignments=students.map(emptyAssignment);
    else{
      for(var pass=0;pass<=projects.length;pass++){
        var passIssues=[];assignments=allocate(students,selected,cfg,choices,scores,passIssues);var occupancy=counts(selected,assignments);
        var undersized=selected.filter(function(p){return !mandatory(p,choices)&&(occupancy[p.id][0]<cfg.minSize||(p.finalLength==='Minor'&&occupancy[p.id][1]<cfg.minSize));}).sort(function(a,b){return (scores[a.id]||0)-(scores[b.id]||0)||compare(a.id,b.id);});
        // A Minor needs a second different project; never cut its final partner.
        var minorCount=selected.filter(function(p){return p.finalLength==='Minor';}).length;
        var candidate=undersized.find(function(p){return p.finalLength!=='Minor'||minorCount>2;});
        if(!candidate){issues=issues.concat(passIssues);break;}
        issues.push(note('PROJECT_CUT','warning',candidate.name+' was cut because a group was below '+cfg.minSize+' students. The app ran placements again.',{projectId:candidate.id}));selected=selected.filter(function(p){return p.id!==candidate.id;});
      }
    }
    var checks=check(students,selected,assignments,cfg,choices),summary=summarize(students,selected,assignments);
    // Bind run provenance to decision inputs, without reading free-text comments.
    var inputs=students.map(function(s){return {id:s.id,grade:s.grade,status:s.status,preference:s.preference,choices:arr(s.choices).slice().sort(compare),types:arr(s.types).slice().sort(compare),goals:arr(s.goals).slice().sort(compare),previous:arr(s.previous).slice().sort(compare),previousKnown:s.previousKnown!==false,gender:s.gender||null};}).sort(function(a,b){return compare(a.id,b.id);});
    return {assignments:assignments,projects:selected,issues:issues,checks:checks,summary:summary,fingerprint:fingerprint({settings:cfg,choices:choices||{},inputs:inputs,projects:selected,assignments:assignments.slice().sort(function(a,b){return compare(a.studentId,b.studentId);})})};
  }
  function summarize(students,projects,assignments){
    var s={total:students.length,eligible:students.filter(eligible).length,placed:0,excluded:0,needsReview:0,majorStudents:0,minorStudents:0,projectCount:projects.length,minorProjectCount:projects.filter(function(p){return p.finalLength==='Minor';}).length,fitCounts:{1:0,2:0,3:0,4:0,5:0,6:0},byGrade:{10:{placed:0,meanFit:null},11:{placed:0,meanFit:null},12:{placed:0,meanFit:null}}},byId={},totals={10:[0,0],11:[0,0],12:[0,0]};students.forEach(function(x){byId[x.id]=x;});
    assignments.forEach(function(a){if(a.status==='excluded'){s.excluded++;return;}if(a.status!=='placed'){s.needsReview++;return;}s.placed++;if(a.project2)s.minorStudents++;else s.majorStudents++;var st=byId[a.studentId];if(!st)return;s.byGrade[st.grade].placed++;[a.fit1,a.fit2].forEach(function(t){if(t!=null){s.fitCounts[t]=(s.fitCounts[t]||0)+1;totals[st.grade][0]+=t;totals[st.grade][1]++;}});});Object.keys(totals).forEach(function(g){if(totals[g][1])s.byGrade[g].meanFit=totals[g][0]/totals[g][1];});return s;
  }
  function check(students,projects,assignments,input,choices){
    var cfg=settings(input),out=[],studentMap={},projectMap={},seen={},members={},validStatuses=['placed','excluded','review'];
    students.forEach(function(s){if(studentMap[s.id])out.push(note('DUPLICATE_STUDENT','error','Duplicate source student ID.',{studentId:s.id}));studentMap[s.id]=s;});
    projects.forEach(function(p){if(projectMap[p.id])out.push(note('DUPLICATE_PROJECT','error','Duplicate selected project ID.',{projectId:p.id}));projectMap[p.id]=p;members[p.id]=[[],[]];if(p.enabled===false)out.push(note('CANCELLED_PROJECT','error','Cancelled project is selected.',{projectId:p.id}));if(!['Major','Minor'].includes(p.finalLength))out.push(note('UNRESOLVED_LENGTH','error','Choose whether this project runs as a Major or Minor.',{projectId:p.id}));});
    assignments.forEach(function(a){var s=studentMap[a.studentId];seen[a.studentId]=(seen[a.studentId]||0)+1;if(!s){out.push(note('UNKNOWN_STUDENT','error','Assignment names an unknown student.',{studentId:a.studentId}));return;}if(validStatuses.indexOf(a.status)<0)out.push(note('INVALID_ASSIGNMENT_STATUS','error','Unknown assignment status.',{studentId:s.id}));
      if(a.status!=='placed'){if(a.project1||a.project2)out.push(note('HIDDEN_PLACEMENT','error','An excluded or review row still contains a project.',{studentId:s.id}));if(eligible(s)&&a.status==='excluded')out.push(note('WRONG_EXCLUSION','error','Eligible student is marked excluded.',{studentId:s.id}));if((s.status==='trip'||s.status==='leader')&&a.status!=='excluded')out.push(note('EXCLUSION_STATUS','error','Trip or freshman leader is not marked excluded.',{studentId:s.id}));if(a.status==='review')out.push(note('NEEDS_REVIEW','warning','Check the source record or find a complete placement for this student.',{studentId:s.id}));return;}
      if(!eligible(s))out.push(note('INELIGIBLE_PLACED','error','Trip, freshman leader, or unresolved student was placed.',{studentId:s.id}));
      var p1=projectMap[a.project1],p2=projectMap[a.project2];if(!p1)out.push(note('UNKNOWN_PROJECT','error','Project #1 is missing or unknown.',{studentId:s.id}));if(a.project2&&!p2)out.push(note('UNKNOWN_PROJECT','error','Project #2 is unknown.',{studentId:s.id}));
      if(p1&&p2&&p1.finalLength!==p2.finalLength)out.push(note('MIXED_TRACKS','error','Project #1 and Project #2 mix a Major and a Minor. Use one Major (the same label twice, or one label and a blank) or two different Minors.',{studentId:s.id}));
      else{if(p1&&p1.finalLength==='Major'&&a.project2)out.push(note('MAJOR_SECOND_PROJECT','error','A Major student has a second project.',{studentId:s.id}));if(p1&&p1.finalLength==='Minor'&&(!p2||p2.finalLength!=='Minor'||p1.id===p2.id))out.push(note('INVALID_MINOR_PAIR','error','A Minor student needs two different Minor projects, one each week.',{studentId:s.id}));}
      if(p1)members[p1.id][0].push(s);if(p2)members[p2.id][1].push(s);
      [p1,p2].forEach(function(p,i){if(!p)return;if(!allowed(s,p,choices))out.push(note('PREVIOUS_PROJECT','error','Student repeats a previous project without a leader exception.',{studentId:s.id,projectId:p.id}));var actual=fit(s,p,cfg).tier;if(a[i===0?'fit1':'fit2']!==actual)out.push(note('STALE_FIT','error','Displayed fit does not match the source preferences.',{studentId:s.id,projectId:p.id}));if(actual===6)out.push(note('LOW_FIT','warning','Fit 6 placement needs review.',{studentId:s.id,projectId:p.id}));});
      // A track change Mr. Litowitz made by hand is his decision, so it is information only.
      var byHand=a.movedByHand===true?' Moved by hand.':'';
      if(s.preference==='Minor'&&p1&&p1.finalLength==='Major')out.push(note('MINOR_PREFERENCE_CHANGED',byHand?'info':'warning','This student asked for Minors and received a Major.'+byHand,{studentId:s.id}));if(s.preference==='Major'&&p1&&p1.finalLength==='Minor')out.push(note('MAJOR_TO_MINOR',byHand?'info':cfg.allowMajorToMinor?'warning':'error','This student asked for a Major and received Minors.'+byHand,{studentId:s.id}));
    });
    students.forEach(function(s){if(!seen[s.id])out.push(note('MISSING_STUDENT','error','Student has no assignment or review row.',{studentId:s.id}));else if(seen[s.id]!==1)out.push(note('DUPLICATE_ASSIGNMENT','error','Student has more than one assignment row.',{studentId:s.id}));if(s.previousKnown===false&&eligible(s))out.push(note('PREVIOUS_UNAVAILABLE','warning','Past projects are missing for this student, so the app could not fully check for repeats.',{studentId:s.id}));});
    projects.forEach(function(p){var c=choiceFor(choices,p.id);if(c.run===false)out.push(note('PROJECT_DISABLED','error','Project is selected despite Run = FALSE.',{projectId:p.id}));if(c.length&&p.finalLength!==c.length)out.push(note('LENGTH_CHOICE_IGNORED','error','Selected length differs from the project choice.',{projectId:p.id}));projects.forEach(function(q){if(compare(p.id,q.id)<0&&conflicts(p.id,q.id,choices))out.push(note('PROJECT_CONFLICT','error','Projects cannot run together: '+p.name+' and '+q.name,{projectId:p.id}));});
      var weeks=p.finalLength==='Minor'?2:1;for(var w=0;w<weeks;w++){var list=members[p.id][w],extra={projectId:p.id,week:w+1};if(list.length>cfg.maxSize)out.push(note('OVER_CAPACITY','error',p.name+' exceeds '+cfg.maxSize+' students in week '+(w+1)+'.',extra));if(list.length<cfg.minSize)out.push(note('UNDER_MINIMUM',c.mustRun===true?'warning':'error',p.name+' has '+list.length+' students in week '+(w+1)+'; minimum is '+cfg.minSize+(c.mustRun===true?' (must-run exception).':'.'),extra));
        var genders={};list.forEach(function(s){if(s.gender)genders[s.gender]=(genders[s.gender]||0)+1;});if(list.length&&list.some(function(s){return !s.gender;}))out.push(note('GENDER_UNCHECKED','warning',p.name+' week '+(w+1)+': gender balance was not checked because data is missing.',extra));else if(Object.keys(genders).length>1){var small=Object.keys(genders).filter(function(g){return genders[g]<3;});if(small.length)out.push(note('GENDER_BALANCE','warning',p.name+' week '+(w+1)+': a gender group has fewer than three students. Mr. Litowitz must review.',extra));}
      }
    });
    Object.keys(choices||{}).forEach(function(id){if((choiceFor(choices,id).mustRun||choiceFor(choices,id).run===true)&&!projectMap[id])out.push(note('REQUIRED_PROJECT_MISSING','error','A required project is not running.',{projectId:id}));});
    var summary=summarize(students,projects,assignments);if(projects.length!==cfg.projectCount)out.push(note('PROJECT_COUNT','warning','Running '+projects.length+' projects; requested '+cfg.projectCount+'.'));if(summary.minorProjectCount!==cfg.minorProjects)out.push(note('MINOR_PROJECT_COUNT','warning','Running '+summary.minorProjectCount+' Minor projects; requested '+cfg.minorProjects+'.'));if(summary.minorStudents<cfg.minorMin||summary.minorStudents>cfg.minorMax)out.push(note('MINOR_STUDENT_COUNT','warning','Placed '+summary.minorStudents+' Minor students; requested range '+cfg.minorMin+' to '+cfg.minorMax+'.'));
    if(!students.some(function(s){return eligible(s)&&s.gender;}))out.push(note('NO_GENDER_DATA','warning','The app could not check gender balance because no gender data was supplied.'));
    var senior=summary.byGrade[12].meanFit,junior=summary.byGrade[11].meanFit,soph=summary.byGrade[10].meanFit;if((senior!=null&&junior!=null&&senior>junior)||(junior!=null&&soph!=null&&junior>soph))out.push(note('GRADE_FIT_REVIEW','warning','Average interest matches do not follow the intended senior, junior, sophomore order. Check group limits and students marked green. Giving older grades priority does not guarantee this order.'));
    return out;
  }
  function fingerprint(value){function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+stable(v[k]);}).join(',')+'}';}var str=stable(value),h=2166136261;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return ('00000000'+(h>>>0).toString(16)).slice(-8);}
  return {defaults:defaults,settings:settings,interest:interest,propose:propose,fit:fit,explain:explain,sort:sort,check:check,fingerprint:fingerprint};
}());
if (typeof module !== 'undefined' && module.exports) module.exports = PPEngine;
