(() => {
  "use strict";
  const PAGE = Object.freeze({ width:215.9, height:355.6, top:10, left:10, right:10, bottom:40 });
  const ink = [32,50,59], muted = [93,111,119], green = [8,111,121];
  let resources;

  function loadResources() {
    if (!resources) resources = (async () => {
      if (!window.jspdf?.jsPDF) await new Promise((resolve,reject) => {
        const script = document.createElement("script");
        const timer = window.setTimeout?.(() => { script.remove(); reject(new Error("The PDF engine took too long to load. Please retry.")); },20000);
        script.src = new URL("vendor/jspdf.umd.min.js",document.baseURI).href;
        script.onload = () => { window.clearTimeout?.(timer); script.remove(); resolve(); };
        script.onerror = () => { window.clearTimeout?.(timer); script.remove(); reject(new Error("The PDF engine could not be loaded. Please retry.")); };
        document.head.append(script);
      });
      if (!window.jspdf?.jsPDF) throw new Error("The PDF engine is unavailable.");
      const response = await fetch(new URL("fonts/NotoSans-Regular.ttf",document.baseURI),{cache:"force-cache",signal:window.AbortSignal?.timeout?.(20000)});
      if (!response.ok) throw new Error("The PDF font could not be loaded. Please retry.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      return { jsPDF:window.jspdf.jsPDF, font:btoa(binary) };
    })().catch(error => { resources = null; throw error; });
    return resources;
  }

  function createPdf(snapshot,jsPDF,font) {
    if (!snapshot.rows?.length) throw new Error("No clients match the current Allocation filters.");
    const pdf = new jsPDF({orientation:"portrait",unit:"mm",format:"legal",compress:true,putOnlyUsedFonts:true});
    pdf.addFileToVFS("NotoSans-Regular.ttf",font);
    pdf.addFont("NotoSans-Regular.ttf","NotoSans","normal"); pdf.setFont("NotoSans","normal");
    pdf.setProperties({title:`Allocation ${snapshot.year}${snapshot.pending ? " - Draft preview" : ""}`,author:"Tax Dashboard",subject:"Filtered PIC allocation snapshot"});
    const width = PAGE.width-PAGE.left-PAGE.right, bottom = PAGE.height-PAGE.bottom-7;
    let y = PAGE.top;
    const text = (value,x,top,size=8,color=ink,align="left") => {
      pdf.setFontSize(size); pdf.setTextColor(...color);
      pdf.text(String(value),x,top,{baseline:"top",align});
    };
    const wrap = (value,available,size=8) => { pdf.setFontSize(size); return pdf.splitTextToSize(String(value ?? ""),available); };
    const lines = (values,x,top,size=8,color=ink,step=3.5) => values.forEach((value,i) => text(value,x,top+i*step,size,color));
    const fill = (x,top,w,h,color) => { pdf.setFillColor(...color); pdf.rect(x,top,w,h,"F"); };
    const nextPage = () => {
      pdf.addPage("legal","portrait"); y = PAGE.top;
      text(`Allocation / ${snapshot.year}`,PAGE.left,y,11,green);
      text(snapshot.pending ? "DRAFT - not applied" : "Saved assignments",PAGE.width-PAGE.right,y,8,muted,"right"); y += 9;
    };
    text("LMATS CONSULTING / TAX DASHBOARD",PAGE.left,y,8,green); y += 6;
    text("Client PIC Allocation",PAGE.left,y,17); y += 10;
    text(`Allocation year ${snapshot.year}  |  ${snapshot.rows.length} clients  |  ${snapshot.pending} pending changes`,PAGE.left,y,9); y += 6;
    const created = new Date(snapshot.generatedAt).toLocaleString("en-GB",{timeZone:"Asia/Makassar",dateStyle:"medium",timeStyle:"short"});
    const meta = wrap(`Prepared by ${snapshot.preparedBy || "-"} / ${created} WITA`,width,8);
    lines(meta,PAGE.left,y,8,muted); y += meta.length*3.5+3;
    const scope = wrap(`Scope: ${snapshot.filters.join(" / ") || "All visible clients"}`,width,8);
    for (const line of scope) { if (y+4>bottom) nextPage(); text(line,PAGE.left,y,8,muted); y += 3.5; }
    y += 3;
    const notice = wrap(snapshot.pending ? "DRAFT PREVIEW: proposed PICs are unsaved. Printing does not apply these changes." : "Saved assignments at preview generation. Printing does not change Client Master.",width-6,8);
    if (y+notice.length*3.5+6>bottom) nextPage();
    fill(PAGE.left,y,width,notice.length*3.5+6,snapshot.pending ? [253,241,218] : [231,244,243]);
    lines(notice,PAGE.left+3,y+3,8); y += notice.length*3.5+11;

    const groups = snapshot.summary || [], gap = 6, groupWidth = (width-gap)/2;
    const summaryHeaders = () => {
      groups.forEach((group,index) => {
        const x = PAGE.left+index*(groupWidth+gap);
        text(group.title,x,y,10,green); text("Saved / Proposed",x+groupWidth,y+1,7,muted,"right");
      }); y += 7;
    };
    if (groups.length) {
      if (y+17>bottom) nextPage(); summaryHeaders();
      for (let i=0;i<Math.max(...groups.map(group=>group.items.length));i++) {
        const names = groups.map(group=>wrap(group.items[i]?.pic || "No PIC",groupWidth-32,8));
        const height = Math.max(...names.map(name=>name.length))*3.5+3;
        if (y+height>bottom) { nextPage(); summaryHeaders(); }
        groups.forEach((group,index) => {
          const item = group.items[i]; if (!item) return;
          const x = PAGE.left+index*(groupWidth+gap);
          if (i%2===0) fill(x,y,groupWidth,height,[243,247,245]);
          lines(names[index],x+1.5,y+1.5,8);
          text(`${item.clients} / ${item.proposed}`,x+groupWidth-2,y+1.5,8,ink,"right");
        }); y += height;
      }
      y += 9;
    }

    const columns = [
      {key:"number",title:"No.",width:10}, {key:"code",title:"Code",width:18},
      {key:"form",title:"Form",width:17}, {key:"name",title:"Client name",width:47},
      {key:"currentAcc",title:"Current ACC",width:26}, {key:"nextAcc",title:"Next ACC",width:26},
      {key:"currentTax",title:"Current Tax",width:26}, {key:"nextTax",title:"Next Tax",width:width-170}
    ];
    // Row heights and pagination use the same wrapped lines that are drawn.
    const tableHeader = () => {
      let x = PAGE.left;
      columns.forEach(column => { fill(x,y,column.width,10,[232,240,237]); lines(wrap(column.title,column.width-3,7),x+1.5,y+2,7,green,3); x += column.width; });
      y += 10;
    };
    if (y+20>bottom) nextPage(); tableHeader();
    snapshot.rows.forEach((row,index) => {
      const cells = columns.map(column=>wrap(row[column.key],column.width-3,7.5));
      const count = Math.max(...cells.map(cell=>cell.length));
      let offset = 0;
      while (offset<count) {
        let capacity = Math.floor((bottom-y-3)/3.5);
        if (capacity<1) { nextPage(); tableHeader(); capacity = Math.floor((bottom-y-3)/3.5); }
        const take = Math.min(count-offset,capacity), height = take*3.5+3;
        let x = PAGE.left;
        columns.forEach((column,c) => {
          const changed = column.key==="nextAcc" && row.nextAcc!==row.currentAcc || column.key==="nextTax" && row.nextTax!==row.currentTax;
          fill(x,y,column.width,height,changed ? [253,241,218] : index%2 ? [247,249,248] : [255,255,255]);
          pdf.setDrawColor(211,222,220); pdf.setLineWidth(0.15); pdf.rect(x,y,column.width,height,"S");
          lines(cells[c].slice(offset,offset+take),x+1.5,y+1.5,7.5,ink);
          x += column.width;
        });
        offset += take; y += height;
      }
    });
    const total = pdf.getNumberOfPages();
    for (let page=1;page<=total;page++) {
      pdf.setPage(page);
      text(`Allocation ${snapshot.year} / ${snapshot.pending ? "Draft preview" : "Saved snapshot"}`,PAGE.left,PAGE.height-PAGE.bottom-3.5,7,muted);
      text(`Page ${page} / ${total}`,PAGE.width-PAGE.right,PAGE.height-PAGE.bottom-3.5,7,muted,"right");
    }
    return pdf;
  }

  async function preview(snapshot) {
    const popup = window.open("","_blank","width=1100,height=850");
    if (!popup) throw new Error("Allow pop-ups to open the Allocation PDF preview.");
    popup.opener = null;
    popup.document.title = "Preparing Allocation PDF";
    const status = popup.document.createElement("p");
    status.textContent = "Preparing Legal PDF preview. You can print or download from the PDF viewer when ready.";
    status.style.cssText = "font:14px Segoe UI,sans-serif;padding:24px;color:#20323b";
    popup.document.body.append(status);
    try {
      const {jsPDF,font} = await loadResources();
      if (popup.closed) return;
      const pdf = createPdf(snapshot,jsPDF,font), url = URL.createObjectURL(pdf.output("blob"));
      let timer;
      const release = () => { URL.revokeObjectURL(url); window.clearInterval(timer); window.removeEventListener("pagehide",release); };
      try { popup.location.replace(url); }
      catch (error) { release(); throw error; }
      timer = window.setInterval(() => { if (popup.closed) release(); },30000);
      window.addEventListener("pagehide",release,{once:true});
      popup.focus();
    } catch (error) {
      if (!popup.closed) { popup.document.title = "Allocation PDF unavailable"; status.textContent = error.message; }
      throw error;
    }
  }
  window.AllocationReports = {PAGE,createPdf,preview};
})();
