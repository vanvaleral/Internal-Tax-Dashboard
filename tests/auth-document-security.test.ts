import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as security from "../lib/auth-document-security.ts";
import * as features from "../lib/feature-access.ts";
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("auth policies use fresh unpredictable nonces, replace spoofed headers and leave dashboard/static paths alone",()=>{
  const incoming=new Headers({"x-nonce":"attacker-selected","Content-Security-Policy":"script-src *","x-workspace-user":"current-user"});
  const first=security.authDocumentSecurity("/login",incoming)!,second=security.authDocumentSecurity("/login",incoming)!;
  assert.notEqual(first.requestHeaders.get("x-nonce"),second.requestHeaders.get("x-nonce"));
  assert.match(first.requestHeaders.get("x-nonce")!,/^[A-Za-z0-9+/]{24}$/);assert.equal(first.requestHeaders.get("Content-Security-Policy"),first.policy);
  assert.equal(first.requestHeaders.get("x-workspace-user"),"current-user");assert.equal(incoming.get("x-nonce"),"attacker-selected");
  assert.match(first.policy,/'strict-dynamic'/);assert.match(first.policy,/script-src-attr 'none'/);assert.doesNotMatch(first.policy.match(/(?:^|; )script-src ([^;]+)/)![1],/unsafe-inline|unsafe-eval|attacker-selected/);
  assert.match(first.policy,/connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);
  assert.match(first.policy,/style-src 'self' 'unsafe-inline'/,"existing template styles remain supported without allowing inline scripts");
  for(const path of ["/","/dashboard","/demo.html","/api/auth/register","/login/extra","/onboarding.json","/workspace-assets.js"])assert.equal(security.authDocumentSecurity(path,incoming),null);
  assert.ok(security.authDocumentSecurity("/onboarding",incoming));
  assert.match(security.authDocumentSecurity("/login",incoming,true)!.policy,/'unsafe-eval'/,"Next dev debugging is separate from production policy");
  assert.match(security.authDocumentSecurity("/login",incoming,true)!.policy,/ws:\/\/localhost:\*/);assert.doesNotMatch(first.policy,/ws:\/\//);
  for(const nonce of ["","'unsafe-inline'","abc\nnonce","<script>"])assert.throws(()=>security.authDocumentPolicy(nonce),/Invalid CSP nonce/);
});

test("middleware forwards the nonce to Next without losing refreshed Supabase cookies or adding profile reads",async()=>{
  let reads=0,profiles=0;
  const context={exports:{} as any,URL,console,process:{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://fixture.invalid",NEXT_PUBLIC_SUPABASE_ANON_KEY:"fixture"}},require(name:string){
    if(name==="./lib/auth-document-security")return security;
    if(name==="./lib/public-ui-assets")return {isPublicUiAsset:()=>false};
    if(name==="./lib/feature-access")return features;
    if(name==="next/server")return {NextResponse:{next:(options:any)=>({status:200,headers:new Headers(),requestHeaders:options?.request?.headers,cookies:{values:[] as any[],set(...args:any[]){this.values.push(args);}}}),redirect:()=>({status:307}),json:()=>({status:401})}};
    if(name==="@supabase/ssr")return {createServerClient(_url:any,_key:any,options:any){return {auth:{async getUser(){reads++;options.cookies.setAll([{name:"sb-fixture",value:"refreshed",options:{path:"/",httpOnly:true}}]);return {data:{user:null}};}},from(){profiles++;throw Error("No profile query is needed on sign-in");}};}};
    throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(read("middleware.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  for(const path of ["/login","/onboarding"]){
    const result=await context.exports.middleware({method:"GET",url:`https://fixture.invalid${path}`,nextUrl:new URL(`https://fixture.invalid${path}`),headers:new Headers({"x-nonce":"spoof"}),cookies:{getAll:()=>[]}});
    assert.equal(result.status,200);assert.equal(result.headers.get("Content-Security-Policy"),result.requestHeaders.get("Content-Security-Policy"));assert.match(result.headers.get("Cache-Control"),/private, no-store/);
    assert.equal(result.cookies.values[0][0],"sb-fixture");assert.equal(result.cookies.values[0][1],"refreshed");
  }
  assert.equal(reads,2);assert.equal(profiles,0);
  const root=await context.exports.middleware({method:"GET",url:"https://fixture.invalid/",nextUrl:new URL("https://fixture.invalid/"),headers:new Headers(),cookies:{getAll:()=>[]}});
  assert.equal(root.status,200);assert.equal(root.requestHeaders,undefined);assert.equal(reads,2,"static dashboard still adds no auth round trip");
  for(const file of ["app/page.tsx","app/dashboard/page.tsx","app/layout.tsx"])assert.doesNotMatch(read(file),/force-dynamic|await headers\(|await connection\(/);
  for(const file of ["app/login/page.tsx","app/onboarding/page.tsx"])assert.match(read(file),/dynamic = "force-dynamic"/);
});
