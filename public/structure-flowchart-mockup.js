(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const graph = byId("graph"), cards = byId("cards"), links = byId("links");
  const viewport = graph.closest(".viewport");
  const roster = byId("pic-roster"), topLevel = byId("top-level");
  const labels = {partner:"Partner",lead:"Team / Lead",staff:"Team member"};
  const roleLabels = {partner:"Partner",admin:"Admin",supervisor:"Supervisor",leader:"Leader",staff:"Associate"};
  const kindFor = role => role === "partner" ? "partner" : role === "staff" ? "staff" : "lead";
  const sample = [
    {id:"1",name:"Dewa",role:"Managing Partner",kind:"partner",parent:""},
    {id:"2",name:"Nadia",role:"Accounting Team Lead",kind:"lead",parent:"1"},
    {id:"3",name:"Bima",role:"Tax Team Lead",kind:"lead",parent:"1"},
    {id:"4",name:"Maya",role:"Accounting PIC",kind:"staff",parent:"2"},
    {id:"5",name:"Rafi",role:"Accounting PIC",kind:"staff",parent:"2"},
    {id:"6",name:"Ari",role:"Tax PIC",kind:"staff",parent:"3"},
    {id:"7",name:"Putri",role:"Tax PIC",kind:"staff",parent:"3"}
  ];
  const directory = [
    ...sample.map(node => ({
      id:`pic-${node.id}`,display_name:node.name,
      role:node.kind === "lead" ? "leader" : node.kind,directory_active:true
    })),
    {id:"pic-sari",display_name:"Sari",role:"staff",directory_active:true},
    {id:"pic-rina",display_name:"Rina",role:"supervisor",directory_active:true},
    {id:"pic-arman",display_name:"Arman",role:"partner",directory_active:true},
    {id:"pic-archived",display_name:"Archived example",role:"staff",directory_active:false}
  ];
  const people = new Map(directory.filter(person => person.directory_active !== false).map(person => [person.id,person]));
  let nodes, selected, connecting = "", placingPic = "", drag = null, nextId;
  const list = id => nodes.filter(node => node.parent === id);
  const find = id => nodes.find(node => node.id === id);
  const say = message => { byId("status").textContent = message; };
  const element = (tag, name, text) => {
    const node = document.createElement(tag);
    if (name) node.className = name;
    if (text) node.textContent = text;
    return node;
  };
  const canConnect = (id, parent) => {
    for (let current = parent; current; current = find(current)?.parent) {
      if (id === current) return false;
    }
    return !parent || Boolean(find(parent));
  };
  const available = id => people.has(id) && !nodes.some(node => node.picId === id);

  function drawRoster() {
    roster.replaceChildren();
    for (const [id,person] of people) {
      if (!available(id)) continue;
      const item = element("li");
      const button = element("button","pic-pick");
      button.type = "button";
      button.dataset.pic = id;
      button.setAttribute("aria-pressed",String(placingPic === id));
      button.append(element("strong","",person.display_name),element("small","",roleLabels[person.role]));
      item.append(button);
      roster.append(item);
    }
    if (!roster.children.length) roster.append(element("li","","Everyone is already on the chart."));
    topLevel.setAttribute("aria-disabled",String(!placingPic && !connecting));
  }

  function placePic(id, parent) {
    if (!available(id) || (parent && !find(parent))) return false;
    if (nodes.length >= 28) { say("This mockup supports up to 28 positions."); return false; }
    const person = people.get(id), nodeId = String(nextId++);
    nodes.push({id:nodeId,picId:id,name:person.display_name,role:roleLabels[person.role],kind:kindFor(person.role),parent});
    activate(nodeId);
    say(parent ? `${person.display_name} added under ${find(parent).name}.` : `${person.display_name} added at the top level.`);
    return true;
  }

  function reconnect(id, parent) {
    const node = find(id);
    if (!node || !canConnect(id,parent)) {
      say("That connection would make a reporting loop. Choose a different manager.");
      return false;
    }
    node.parent = parent;
    selected = id;
    connecting = "";
    placingPic = "";
    draw();
    edit();
    say(parent ? `${node.name} now reports to ${find(parent).name}.` : `${node.name} is now at the top level.`);
    return true;
  }

  function draw() {
    const width = 170, height = 88, space = 28, rail = 136;
    const positions = new Map();
    let right = 0, bottom = 0;
    function place(node, depth) {
      const children = list(node.id);
      let x;
      if (children.length) {
        const columns = children.map(child => place(child, depth+1));
        x = (columns[0] + columns.at(-1))/2;
      } else {
        x = right;
        right += width+space;
      }
      const y = depth*rail+25;
      bottom = Math.max(bottom,y+height);
      positions.set(node.id,{x:x+22,y});
      return x;
    }
    list("").forEach(root => place(root,0));
    const chartWidth = Math.max(215,right-space+44), chartHeight = Math.max(120,bottom+28);
    graph.style.setProperty("--chart-w",`${chartWidth}px`);
    graph.style.setProperty("--chart-h",`${chartHeight}px`);
    graph.style.setProperty("--print-scale",Math.min(1,980/chartWidth,560/chartHeight));
    byId("count").textContent = `${nodes.length} position${nodes.length === 1 ? "" : "s"}`;
    drawRoster();
    links.replaceChildren();
    cards.replaceChildren();
    for (const node of nodes) {
      const {x,y} = positions.get(node.id);
      if (node.parent) {
        const parent = positions.get(node.parent);
        const path = document.createElementNS("http://www.w3.org/2000/svg","path");
        const startX = parent.x+width/2, endX = x+width/2, middle = (parent.y+height+y)/2;
        path.setAttribute("d",`M ${startX} ${parent.y+height} V ${middle} H ${endX} V ${y}`);
        path.setAttribute("class","wire");
        links.append(path);
      }
      const card = element("article","card");
      card.dataset.id = node.id;
      card.dataset.kind = node.kind;
      card.classList.toggle("active",node.id===selected);
      card.classList.toggle("invalid",Boolean(connecting) && !canConnect(connecting,node.id));
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      const select = element("button","card-main");
      select.type = "button";
      select.setAttribute("aria-label",`${node.name}, ${node.role}, ${node.parent ? "reports to " + find(node.parent).name : "top level"}`);
      select.append(element("span","eyebrow",labels[node.kind]),element("strong","",node.name),element("small","",node.role));
      const grip = element("button","grip");
      grip.type = "button";
      grip.title = "Drag onto a manager, or click to connect";
      grip.setAttribute("aria-label",`Move or connect ${node.name}`);
      grip.innerHTML = '<svg viewBox="0 0 14 21" aria-hidden="true"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10.5" r="1.6"/><circle cx="10" cy="10.5" r="1.6"/><circle cx="4" cy="17" r="1.6"/><circle cx="10" cy="17" r="1.6"/></svg>';
      card.append(select,grip);
      cards.append(card);
    }
  }

  function edit() {
    const node = find(selected);
    byId("editor-title").textContent = node ? "Edit card" : "Add a card";
    byId("person").value = node?.name || "";
    byId("person").readOnly = Boolean(node?.picId);
    byId("position").value = node?.role || "";
    byId("kind").value = node?.kind || "staff";
    byId("manager").replaceChildren(new Option("Top level",""), ...nodes.filter(item => canConnect(selected,item.id))
      .map(item => new Option(item.name,item.id)));
    byId("manager").value = node?.parent || "";
    byId("save").textContent = node ? "Save card" : "Add to chart";
    byId("remove").hidden = !node;
    byId("connect").hidden = !node;
  }

  function activate(id, focus = false) {
    selected = id;
    connecting = "";
    placingPic = "";
    draw();
    edit();
    if (focus) byId("person").focus();
  }

  function startConnect(id) {
    selected = id;
    placingPic = "";
    connecting = id;
    draw();
    edit();
    say(`Choose who ${find(id).name} reports to. Press Escape to cancel.`);
    const firstManager = cards.querySelector(".card:not(.invalid) .card-main");
    (firstManager || topLevel).focus();
  }

  cards.addEventListener("click", event => {
    const card = event.target.closest(".card");
    if (!card) return;
    if (placingPic) {
      if (placePic(placingPic,card.dataset.id)) cards.querySelector(".card.active .card-main")?.focus();
    } else if (event.target.closest(".grip")) startConnect(card.dataset.id);
    else if (connecting) {
      if (reconnect(connecting,card.dataset.id)) cards.querySelector(".card.active .card-main")?.focus();
    } else activate(card.dataset.id,true);
  });

  roster.addEventListener("click",event => {
    const id = event.target.closest("[data-pic]")?.dataset.pic;
    if (!id || !available(id)) return;
    placingPic = id;
    connecting = "";
    draw();
    say(`Choose a manager for ${people.get(id).display_name}, or choose the top-level drop zone. Press Escape to cancel.`);
    topLevel.focus();
  });
  topLevel.addEventListener("click",() => {
    const moved = placingPic ? placePic(placingPic,"") : connecting ? reconnect(connecting,"") : false;
    if (moved) cards.querySelector(".card.active .card-main")?.focus();
  });

  cards.addEventListener("pointerdown", event => {
    const handle = event.target.closest(".grip");
    if (!handle || !event.isPrimary || event.button !== 0) return;
    drag = {id:handle.closest(".card").dataset.id,surface:cards,pointer:event.pointerId,x:event.clientX,y:event.clientY};
  });
  roster.addEventListener("pointerdown",event => {
    const button = event.target.closest("[data-pic]");
    if (!button || !event.isPrimary || event.button !== 0 || !available(button.dataset.pic)) return;
    drag = {id:button.dataset.pic,pic:true,surface:roster,pointer:event.pointerId,x:event.clientX,y:event.clientY};
  });

  function updateDrag(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX-drag.x,event.clientY-drag.y) < 6) return;
      connecting = "";
      placingPic = "";
      drag.ghost = element("div","ghost",drag.pic ? people.get(drag.id).display_name : find(drag.id).name);
      drag.ghost.setAttribute("aria-hidden","true");
      document.body.append(drag.ghost);
      drag.surface.setPointerCapture?.(event.pointerId);
      cards.querySelector(`[data-id="${drag.id}"]`)?.classList.add("source");
    }
    drag.ghost.style.left = `${event.clientX+12}px`;
    drag.ghost.style.top = `${event.clientY+12}px`;
    const target = document.elementFromPoint(event.clientX,event.clientY)?.closest(".card, #top-level");
    const validCard = target && cards.contains(target) && (drag.pic || canConnect(drag.id,target.dataset.id));
    const next = target === topLevel || validCard ? target : null;
    if (next === drag.target) return;
    drag.target?.classList.remove("target");
    drag.target = next;
    next?.classList.add("target");
  }
  function stopDrag(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const {id,ghost,target,pic} = drag;
    drag = null;
    if (!ghost) return;
    ghost.remove();
    target?.classList.remove("target");
    cards.querySelector(`[data-id="${id}"]`)?.classList.remove("source");
    if (event.type !== "pointercancel" && target) {
      const parent = target.dataset.id || "";
      if (pic) placePic(id,parent);
      else reconnect(id,parent);
    } else {
      drawRoster();
      say("No change. Drop onto a manager or into the top-level drop zone.");
    }
  }
  document.addEventListener("pointermove",updateDrag);
  document.addEventListener("pointerup",stopDrag);
  document.addEventListener("pointercancel",stopDrag);
  document.addEventListener("keydown",event => {
    if (event.key === "Escape" && placingPic) {
      const id = placingPic;
      placingPic = "";
      drawRoster();
      roster.querySelector(`[data-pic="${id}"]`)?.focus();
      say("Placement canceled.");
    } else if (event.key === "Escape" && connecting) {
      activate(connecting);
      byId("connect").focus();
      say("Connection canceled.");
    }
  });
  byId("editor").addEventListener("submit",event => {
    event.preventDefault();
    const name = byId("person").value.trim(), role = byId("position").value.trim(), kind = byId("kind").value;
    const parent = byId("manager").value;
    if (!name || !role) { say("Enter a name and role."); return; }
    const node = find(selected);
    if (node && !canConnect(node.id,parent)) { say("This reporting line would make a loop."); return; }
    if (node) Object.assign(node,{name:node.picId ? people.get(node.picId).display_name : name,role,kind,parent});
    else if (nodes.length < 28) { selected = String(nextId++); nodes.push({id:selected,name,role,kind,parent}); }
    else { say("This mockup supports up to 28 positions."); return; }
    activate(selected);
    byId("save").focus();
    say(`${name} saved in this mockup.`);
  });
  byId("add").addEventListener("click",() => activate("",true));
  byId("connect").addEventListener("click",() => { if (selected) startConnect(selected); });
  byId("remove").addEventListener("click",() => {
    const node = find(selected);
    if (!node || !window.confirm(`Remove ${node.name}? Their direct reports will move up one level.`)) return;
    list(node.id).forEach(child => { child.parent = node.parent; });
    nodes = nodes.filter(item => item.id !== node.id);
    activate(node.parent || nodes[0]?.id || "");
    byId("add").focus();
    say(`${node.name} removed from the mockup.`);
  });
  function reset() {
    nodes = sample.map(node => ({...node,picId:`pic-${node.id}`}));
    nextId = sample.length+1;
    activate("1");
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    say("Sample data only. Nothing is saved to the dashboard.");
  }
  byId("reset").addEventListener("click",() => {
    if (window.confirm("Discard this mockup's changes and restore the sample chart?")) reset();
  });
  byId("print").addEventListener("click",() => window.print());
  reset();
})();
