import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=readFileSync(new URL('../public/demo.html',import.meta.url),'utf8');
const start=html.indexOf('    function myWorkValues(task) {'),end=html.indexOf('    let announcementReadRevision',start);
assert.ok(start>0&&end>start);
const source=html.slice(start,end);
function fixture(creating=false){
  const errors:string[]=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<div id="my-work-view"><input id="editor"><div data-my-work-save-status role="status"></div></div>',{url:'https://test.invalid',runScripts:'outside-only',virtualConsole:vc}),w=dom.window as any;
  w.structuredClone=structuredClone;w.eval(readFileSync(new URL('../public/workspace-sync.js',import.meta.url),'utf8'));
  const task:any={id:creating?'task-local':'saved-task',title:'SP2DK work',note:'',steps:[{title:'Worksheet',done:false}],reminder:'',dueDate:'',caseId:'case-a',repeatRule:'none',repeatCustomDate:'',done:false,version:'v1'};
  let server:any=null,hold:(()=>void)|null=null,delayed=false,failed=false;
  const writes:any[]=[],history:string[]=[],issues:string[]=[];
  const state:any={currentView:'my-work-view',selectedMyWorkId:task.id,newMyWorkTaskId:creating?task.id:'',myWork:[task],caseProgressById:{'case-a':{loadedAt:123,taskTimeline:[{id:'retained'}]}},expandedHimbauanId:'case-a'};
  const harness:any={state,editing:false,history,issues,appFetch:async(_url:string,init:any)=>{
    const body=JSON.parse(init.body);writes.push({...body,method:init.method});
    if(writes.length>8)throw Error('Unbounded save queue detected');
    if(delayed)await new Promise<void>(resolve=>{hold=resolve;});
    if(failed)return {ok:false,json:async()=>({error:'Database unavailable'})};
    if(init.method==='PATCH'&&server&&body.version!==server.version)return {ok:false,json:async()=>({code:'VERSION_CONFLICT',task:structuredClone(server)})};
    server={...(server||{}),...body,id:init.method==='POST'?'saved-task':body.id,version:`v${writes.length+1}`,createdAt:1,creatorName:'Synthetic PIC'};
    return {ok:true,json:async()=>({task:structuredClone(server)})};
  }};
  w.harness=harness;
  w.eval(`const state=harness.state,myWorkDemoMode=false,caseProgressReadRevision=new Map();
    const appFetch=harness.appFetch,persistDemoState=()=>{},safeHtml=value=>value,escapeAttr=value=>String(value);
    const clearSyncFailure=()=>{},markSyncFailure=(scope,error)=>harness.issues.push(error.message);
    const activeEditorSnapshot=()=>harness.editing?{}:null,rerender=()=>{};
    const loadCaseProgress=id=>harness.history.push(id);
    ${source}
    window.queueTest={save:saveMyWorkTaskToDatabase,values:myWorkValues};`);
  if(!creating){task.serverBase=w.queueTest.values(task);server={...structuredClone(task.serverBase),id:task.id,version:'v1'};}
  return {dom,w,task,state,writes,history,issues,errors,harness,save:()=>w.queueTest.save(task),delay:()=>{delayed=true;},release:()=>{delayed=false;hold?.();},fail:()=>{failed=true;},server:()=>server};
}
const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};

test('rapid task creation and subtask edits drain to a finite POST/PATCH queue without self-scheduling',async()=>{
  const d=fixture(true);try{
    d.delay();const first=d.save();await tick();d.task.steps.push({title:'Meeting',done:false});const second=d.save();d.task.steps[0].done=true;d.task.steps.push({title:'Final worksheet',done:true});const third=d.save();
    assert.equal(d.writes.length,1);d.release();await first;await second;await third;await tick();
    assert.equal(d.writes.length,2);assert.deepEqual(d.writes.map(row=>row.method),['POST','PATCH']);
    assert.equal(d.server().steps.length,3);assert.equal(d.server().steps[0].done,true);assert.equal(d.server().steps[2].done,true);
    assert.equal(d.task.pendingSync,false);assert.equal(d.task.saving,false);assert.equal(d.w.document.querySelector('[data-my-work-save-status]').textContent,'Saved');
    assert.deepEqual(d.issues,[]);assert.deepEqual(d.errors,[]);
  }finally{d.dom.window.close();}
});

test('checklist baselines remain immutable and unchanged queued saves do not send database writes',async()=>{
  const d=fixture();try{
    d.task.steps[0].done=true;assert.equal(d.task.serverBase.steps[0].done,false);
    const snapshot=d.w.queueTest.values(d.task);d.task.steps[0].title='Revised worksheet';assert.equal(snapshot.steps[0].title,'Worksheet');
    await d.save();assert.equal(d.server().steps[0].title,'Revised worksheet');assert.equal(d.writes.length,1);
    await d.save();await d.save();assert.equal(d.writes.length,1);assert.equal(d.task.pendingSync,false);
    d.task.steps[0].done=false;assert.equal(d.task.serverBase.steps[0].done,true);
  }finally{d.dom.window.close();}
});

test('step, note and preference saves retain case history; only confirmed task completion or relinking invalidates it',async()=>{
  const d=fixture();try{
    const cached=d.state.caseProgressById['case-a'];d.state.currentView='cases-view';
    d.task.steps[0].done=true;await d.save();assert.equal(d.state.caseProgressById['case-a'],cached);assert.deepEqual(d.history,[]);
    d.task.note='Supporting information';await d.save();assert.equal(d.state.caseProgressById['case-a'],cached);
    await d.w.queueTest.save(d.task,{favorite:true});assert.equal(d.writes.at(-1).favorite,true);assert.equal(d.state.caseProgressById['case-a'],cached);
    d.task.done=true;await d.save();assert.equal(d.state.caseProgressById['case-a'],undefined);assert.deepEqual(d.history,['case-a']);
    d.state.caseProgressById['case-a']=cached;d.task.caseId='case-b';await d.save();assert.equal(d.state.caseProgressById['case-a'],undefined);assert.equal(d.state.caseProgressById['case-b'],undefined);
  }finally{d.dom.window.close();}
});

test('failed saves retain edits and show Retry instead of staying on Saving, even while typing',async()=>{
  const d=fixture();try{
    d.fail();d.harness.editing=true;d.task.steps[0].done=true;await d.save();await tick();
    assert.equal(d.writes.length,1);assert.equal(d.task.pendingSync,true);assert.equal(d.task.saving,false);assert.equal(d.task.steps[0].done,true);
    const status=d.w.document.querySelector('[data-my-work-save-status]');assert.match(status.textContent,/Changes not saved.*Retry/);assert.doesNotMatch(status.textContent,/Saving/);
    assert.equal(d.history.length,0);assert.equal(d.issues.length,1);
  }finally{d.dom.window.close();}
});

test('a concurrent remote checklist change is reported instead of corrupting the comparison baseline',async()=>{
  const d=fixture();try{
    d.server().version='remote-v2';d.server().steps[0].title='Remote edit';d.task.steps[0].done=true;await d.save();
    assert.equal(d.writes.length,1);assert.ok(d.task.syncConflict);assert.equal(d.task.pendingSync,true);assert.equal(d.task.serverBase.steps[0].title,'Worksheet');
    assert.match(d.w.document.querySelector('[data-my-work-save-status]').textContent,/Review conflict/);assert.equal(d.history.length,0);
  }finally{d.dom.window.close();}
});
