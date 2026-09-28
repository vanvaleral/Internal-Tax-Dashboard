import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as voice from '../lib/office-voice.ts';
const sessionId='11111111-1111-4111-8111-111111111111';
const recipient='22222222-2222-4222-8222-222222222222';
function setup(results:any[], denied=false){
 const calls:any[]=[];
 const admin={from(table:string){const call:any={table,filters:[]};calls.push(call);const q:any={};for(const method of ['select','eq','gt','lt','neq','order','limit','insert','update','delete'])q[method]=(...args:any[])=>{call.filters.push([method,...args]);return q;};q.maybeSingle=()=>Promise.resolve(results.shift());q.then=(resolve:any)=>Promise.resolve(results.shift()).then(resolve);return q;}};
 const exports:any={};
 const code=ts.transpileModule(readFileSync(new URL('../app/api/office/voice/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,URL,Date,process:{env:{}},require(name:string){if(name==='next/server')return {NextResponse:{json:(body:any,opts:any)=>({body,status:opts.status})}};if(name==='@/lib/access')return {currentActor:async()=>denied?{error:'Forbidden',status:403}:{profile:{id:'owner'},admin}};if(name==='@/lib/office-voice')return voice;throw Error(name);}});
 return {route:exports,calls};
}
const req=(body:any)=>({url:'https://test/office',json:async()=>body});
test('voice rejects inactive staff before accessing database',async()=>{const {route,calls}=setup([],true);assert.equal((await route.POST(req({action:'join',sessionId,room:'office'}))).status,403);assert.equal(calls.length,0);});
test('voice binds sender session to authenticated staff and rejects missing ownership',async()=>{const {route,calls}=setup([{data:null,error:null}]);assert.equal((await route.POST(req({action:'signal',sessionId,recipient,kind:'offer',payload:{type:'offer',sdp:'v=0\r\n'}}))).status,410);assert.ok(calls[0].filters.some((f:any)=>f[0]==='eq'&&f[1]==='staff_profile_id'&&f[2]==='owner'));assert.equal(calls.length,1);});
test('voice refuses recipients outside the sender room',async()=>{const {route,calls}=setup([{data:{session_id:sessionId,room:'office'},error:null},{data:null,error:null}]);assert.equal((await route.POST(req({action:'signal',sessionId,recipient,kind:'offer',payload:{type:'offer',sdp:'v=0\r\n'}}))).status,404);assert.ok(calls[1].filters.some((f:any)=>f[0]==='eq'&&f[1]==='room'&&f[2]==='office'));assert.ok(!calls.some(c=>c.filters.some((f:any)=>f[0]==='insert')));});
test('voice leave is scoped to the caller even for another session ID',async()=>{const {route,calls}=setup([{error:null}]);assert.equal((await route.DELETE(req({sessionId}))).status,200);assert.ok(calls[0].filters.some((f:any)=>f[0]==='eq'&&f[1]==='staff_profile_id'&&f[2]==='owner'));});
