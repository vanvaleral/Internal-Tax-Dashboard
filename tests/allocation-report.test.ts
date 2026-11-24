import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { jsPDF } from "jspdf";
import { JSDOM } from "jsdom";

const font=readFileSync(new URL("../public/fonts/NotoSans-Regular.ttf",import.meta.url)).toString("base64");
const source=readFileSync(new URL("../public/allocation-report.js",import.meta.url),"utf8");
function report(context:any={}) {
  const window=context.window||{};
  vm.runInNewContext(source,{window,URL,Uint8Array,fetch:()=>{throw Error("Unexpected network read");},...context});
  return window.AllocationReports;
}
function snapshot(count=3):any {
  return {year:2026,generatedAt:"2026-11-17T08:00:00Z",preparedBy:"Supervisor",pending:count,filters:["ACC: All PICs","Tax: All PICs","Engagement: Contract"],summary:[
    {title:"Accounting PIC",items:[{pic:"Ivan",clients:count,proposed:0},{pic:"Dina",clients:0,proposed:count},{pic:"",clients:0,proposed:0}]},
    {title:"Tax PIC",items:[{pic:"Bagus",clients:count,proposed:count},{pic:"",clients:0,proposed:0}]}
  ],rows:Array.from({length:count},(_,i)=>({number:i+1,code:`CL-${i+1}`,form:"PT",name:`Klien ${i+1} Élan & Rekan`,currentAcc:"Ivan",nextAcc:"Dina",currentTax:"Bagus",nextTax:"Bagus"}))};
}

class TrackedPdf extends jsPDF {
  marks:any[]=[];
  constructor(options:any) {
    super(options);
    const text=this.text.bind(this),rect=this.rect.bind(this);
    this.text=((value:any,x:any,y:any,options:any)=>{
      const width=this.getTextWidth(String(value)),height=this.getFontSize()/this.internal.scaleFactor;
      this.marks.push({type:"text",value,x:options?.align==="right"?x-width:x,y,width,height,page:this.getCurrentPageInfo().pageNumber});
      return text(value,x,y,options);
    }) as typeof this.text;
    this.rect=((x:any,y:any,width:any,height:any,style:any)=>{
      this.marks.push({type:"rect",x,y,width,height,page:this.getCurrentPageInfo().pageNumber});return rect(x,y,width,height,style);
    }) as typeof this.rect;
  }
}

test("Allocation PDF uses real Legal pages with 1cm top/left/right and 4cm bottom margins",()=>{
  const api=report(),data=snapshot(180),before=JSON.stringify(data);
  const pdf=api.createPdf(data,TrackedPdf,font) as TrackedPdf;
  assert.equal(JSON.stringify(data),before);assert.ok(pdf.getNumberOfPages()>1);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth()-215.9)<.01);assert.ok(Math.abs(pdf.internal.pageSize.getHeight()-355.6)<.01);
  assert.match(pdf.output(),/\/MediaBox \[0 0 612\. 1008\.\]/);
  for(const mark of pdf.marks){
    assert.ok(mark.x>=10-.05,`${mark.type} left ${mark.x}`);
    assert.ok(mark.x+mark.width<=205.9+.05,`${mark.type} right ${mark.x+mark.width}: ${mark.value}`);
    assert.ok(mark.y>=10-.05,`${mark.type} top ${mark.y}`);
    assert.ok(mark.y+mark.height<=315.6+.05,`${mark.type} bottom ${mark.y+mark.height}: ${mark.value}`);
  }
  assert.ok(pdf.marks.some(mark=>mark.value?.includes("DRAFT PREVIEW")));
  assert.equal(pdf.marks.filter(mark=>/^Page \d+ \/ /.test(mark.value||"")).length,pdf.getNumberOfPages());
  assert.ok(pdf.marks.filter(mark=>/^Page \d+ \/ /.test(mark.value||"")).every(mark=>mark.y<=312.1+.01),"allow embedded-font descenders above the 40mm blank margin");
  assert.equal(pdf.marks.filter(mark=>mark.value==="Current ACC").length,pdf.getNumberOfPages());
  assert.ok(pdf.marks.some(mark=>mark.value?.includes("Élan")));
  assert.ok(pdf.marks.some(mark=>mark.value==="180"),"three-digit row numbers must not wrap");
  assert.ok(pdf.marks.some(mark=>mark.value==="No."),"number header stays on one line");
});

test("Allocation PDF wraps long client names across pages instead of clipping or dropping rows",()=>{
  const data=snapshot(2);data.rows[0].name="Very long legal client name ".repeat(400);data.pending=0;
  const api=report(),pdf=api.createPdf(data,TrackedPdf,font) as TrackedPdf;
  assert.ok(pdf.getNumberOfPages()>2);assert.ok(pdf.marks.some(mark=>mark.value==="CL-2"));
  assert.ok(pdf.marks.some(mark=>mark.value?.includes("Saved assignments at preview")));
  assert.ok(pdf.marks.filter(mark=>mark.type==="rect").every(mark=>mark.y+mark.height<=308.6+.05));
  assert.throws(()=>api.createPdf(snapshot(0),jsPDF,font),/No clients/);
});

test("the vendored browser PDF engine creates the same Legal PDF with its embedded font",()=>{
  const dom=new JSDOM("<!doctype html><html><head></head><body></body></html>",{url:"https://dashboard.test/demo.html",runScripts:"outside-only"});
  try {
    const w=dom.window as any;w.eval(readFileSync(new URL("../public/vendor/jspdf.umd.min.js",import.meta.url),"utf8"));w.eval(source);
    const pdf=w.AllocationReports.createPdf(snapshot(),w.jspdf.jsPDF,font);
    assert.equal(pdf.output("blob").type,"application/pdf");assert.equal(pdf.getNumberOfPages(),1);
    assert.ok(Math.abs(pdf.internal.pageSize.getWidth()-215.9)<.01);
    assert.ok(pdf.output().includes("/FontFile2"),"font is embedded, not a missing printer dependency");
  }finally{dom.window.close();}
});

test("Allocation PDF resources load only on Preview, reuse once, and open without auto-printing",async()=>{
  let reads=0,scripts=0,printed=0,opened=0,blob:any,timer:()=>void=()=>{};
  const locations:string[]=[],revoked:string[]=[],events=new Map();
  const status:any={style:{}};
  const popup:any={closed:false,opener:{},document:{title:"",documentElement:{},body:{append(){}},createElement:()=>status},location:{replace:(url:string)=>locations.push(url)},focus(){},print(){printed++;}};
  const window:any={open:()=>{opened++;return popup;},setInterval:(fn:()=>void)=>{timer=fn;return 1;},clearInterval(){},addEventListener:(name:string,fn:any)=>events.set(name,fn),removeEventListener:(name:string)=>events.delete(name)};
  const document:any={baseURI:"https://dashboard.test/demo.html",createElement:()=>({remove(){}}),head:{append:(script:any)=>{scripts++;assert.equal(script.src,"https://dashboard.test/vendor/jspdf.umd.min.js");window.jspdf={jsPDF};script.onload();}}};
  class PreviewUrl extends URL {static createObjectURL(value:any){blob=value;return "blob:test-preview";} static revokeObjectURL(value:string){revoked.push(value);}}
  const api=report({window,document,URL:PreviewUrl,btoa:(value:string)=>Buffer.from(value,"binary").toString("base64"),fetch:async(url:any)=>{reads++;assert.equal(String(url),"https://dashboard.test/fonts/NotoSans-Regular.ttf");return {ok:true,arrayBuffer:async()=>Uint8Array.from(Buffer.from(font,"base64")).buffer};}});
  assert.equal(reads,0);assert.equal(scripts,0);
  const preparing=api.preview(snapshot());assert.equal(opened,1,"reserve the tab synchronously, before resource loading");await preparing;
  assert.equal(reads,1);assert.equal(scripts,1);assert.equal(blob.type,"application/pdf");assert.equal(printed,0);assert.equal(popup.opener,null);
  assert.deepEqual(locations,["blob:test-preview"]);
  await api.preview(snapshot());assert.equal(reads,1);assert.equal(scripts,1);assert.equal(printed,0);
  popup.closed=true;timer();assert.deepEqual(revoked,["blob:test-preview"]);
});

test("blocked popups never load PDF resources, and failed resource reads can be retried",async()=>{
  const blocked=report({window:{open:()=>null}});await assert.rejects(blocked.preview(snapshot()),/Allow pop-ups/);
  let attempt=0;const status:any={style:{}};
  const popup:any={closed:false,document:{documentElement:{},body:{append(){}},createElement:()=>status},location:{replace(){}},focus(){}};
  const window:any={jspdf:{jsPDF},open:()=>popup,setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}};
  const api=report({window,document:{baseURI:"https://dashboard.test/demo.html"},btoa:(value:string)=>Buffer.from(value,"binary").toString("base64"),URL:class extends URL {static createObjectURL(){return "blob:ready";}},fetch:async()=>({ok:++attempt>1,arrayBuffer:async()=>Uint8Array.from(Buffer.from(font,"base64")).buffer})});
  await assert.rejects(api.preview(snapshot()),/font could not be loaded/);assert.match(status.textContent,/font/);
  await api.preview(snapshot());assert.equal(attempt,2);
});

test("Indonesian Allocation PDF translates headings and keeps client names and Legal margins",()=>{
  const dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"https://dashboard.test/demo.html",runScripts:"outside-only"});
  try {
    const w=dom.window as any;
    w.localStorage.setItem("tax-dashboard:language","id");
    w.eval(readFileSync(new URL("../public/workspace-language.js",import.meta.url),"utf8"));
    const data=snapshot(180), before=JSON.stringify(data);
    const pdf=report({window:w}).createPdf(data,TrackedPdf,font) as TrackedPdf;
    assert.ok(pdf.marks.some(mark=>mark.value==="Alokasi PIC Klien"));
    assert.ok(pdf.marks.some(mark=>mark.value==="Nama Klien"));
    assert.ok(pdf.marks.some(mark=>mark.value?.includes("Élan")));
    for (const mark of pdf.marks) {
      assert.ok(mark.x>=9.95 && mark.x+mark.width<=205.95);
      assert.ok(mark.y>=9.95 && mark.y+mark.height<=315.65);
    }
    assert.equal(JSON.stringify(data),before);
  } finally {dom.window.close();}
});
