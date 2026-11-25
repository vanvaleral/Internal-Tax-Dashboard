import { NextResponse } from "next/server";
import { currentActor, type CurrentActor } from "@/lib/access";
import { canEditSharedAllocation, canManageAccess, readFeatureSettings } from "@/lib/feature-access";
import { readAllPages } from "@/lib/read-all-pages";

const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, {status,headers});
const key = (name: string) => name.trim().replace(/\s+/g," ").toLocaleLowerCase("id-ID");
const fields = [["nextAccPic","nextAccPicId","Accounting Team"],["nextTaxPic","nextTaxPicId","Tax Team"]] as const;
const isYear = (value: number) => Number.isInteger(value) && value >= 2000 && value <= 2200;
const isId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

function latest(actor: CurrentActor, year: number, since?: number) {
  let query = actor.admin.from("allocation_draft_revisions")
    .select("version, changes, published_at, published_by_name").eq("allocation_year",year);
  if (since !== undefined) query = query.gt("version",since);
  return query.order("version",{ascending:false}).limit(1).maybeSingle();
}

const allowed = async (actor: CurrentActor) => canManageAccess(actor.profile.role) ||
  canEditSharedAllocation(actor.profile, (await readFeatureSettings(actor.admin)).policy);
const directory = (actor: CurrentActor) => readAllPages((from,to) => actor.admin.from("staff_profiles")
  .select("id, display_name, full_name, team_division",{count:"exact"}).eq("directory_active",true).order("id").range(from,to));

export async function GET(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return json({error:actor.error},actor.status);
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year"));
  if (!isYear(year)) return json({error:"Choose a valid allocation year."},400);
  try {
    if (!await allowed(actor)) return json({error:"Shared Allocation draft access is not enabled for your account."},403);
    if (params.get("grid") === "1") {
      const [result, clients, staff] = await Promise.all([
        latest(actor,year),
        readAllPages((from,to) => actor.admin.from("client_master")
          .select("id, client_code, legal_name, accounting_pic_name, tax_pic_name",{count:"exact"})
          .eq("status","Active").order("legal_name").order("id").range(from,to)),
        directory(actor)
      ]);
      if (result.error) throw result.error;
      const visibleClients = clients.map(({id,client_code,legal_name,accounting_pic_name,tax_pic_name}) => ({
        id,client_code,legal_name,accounting_pic_name,tax_pic_name
      }));
      return json({year,draft:result.data,clients:visibleClients,options:Object.fromEntries(fields.map(([field,,division]) => [
        field, [...new Set(staff.filter(person => person.team_division === division)
          .map(person => person.display_name || person.full_name).filter(Boolean))].sort((a,b) => a.localeCompare(b))
      ]))});
    }
    const since = params.has("since") ? Number(params.get("since")) : undefined;
    if (since !== undefined && (!Number.isInteger(since) || since < 0 || since >= 2147483647)) return json({error:"Invalid draft version."},400);
    const result = await latest(actor,year,since);
    if (result.error) throw result.error;
    return json({year,draft:result.data, ...(since !== undefined && !result.data ? {unchanged:true} : {})});
  } catch {
    return json({error:"The shared draft is unavailable. Retry or ask leadership to check database setup."},503);
  }
}

export async function PATCH(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return json({error:actor.error},actor.status);
  const body = await request.json().catch(() => null);
  const year = Number(body?.year), clientId = body?.clientId;
  const cell = fields.find(([field]) => field === body?.field);
  const validValue = (value: unknown) => value === null || (typeof value === "string" && value.length <= 160);
  if (!isYear(year) || !isId(clientId) || !cell || !validValue(body.value) || !validValue(body.expected)) {
    return json({error:"Choose a valid year, active client and Next PIC cell."},400);
  }
  const [field,idField,division] = cell;
  try {
    if (!await allowed(actor)) return json({error:"Shared Allocation draft access is not enabled for your account."},403);
    const client = await actor.admin.from("client_master").select("id, client_code, legal_name")
      .eq("id",clientId).eq("status","Active").maybeSingle();
    if (client.error) throw client.error;
    if (!client.data) return json({error:"This client is no longer active. Refresh the shared draft."},422);
    const lookup = typeof body.value === "string" ? key(body.value) : "";
    const matches = lookup ? (await directory(actor)).filter(person => person.team_division === division &&
      [person.display_name,person.full_name].some(label => typeof label === "string" && key(label) === lookup)) : [];
    if (lookup && matches.length !== 1) return json({error:`Choose one active ${division} PIC.`},422);
    const value = body.value === null ? null : (matches[0]?.display_name || matches[0]?.full_name || "");
    for (let attempt = 0; attempt < 3; attempt++) {
      const prior = await latest(actor,year);
      if (prior.error) throw prior.error;
      const changes: Record<string,string|null>[] = prior.data?.changes ?? [];
      const old = changes.find(row => row.clientId === clientId);
      if ((old?.[field] ?? null) !== body.expected) {
        return json({error:"Someone changed this cell. Review the latest value before editing it again.",draft:prior.data},409);
      }
      if ((old?.[field] ?? null) === value) return json({year,draft:prior.data});
      const next = {...old,clientId,clientCode:client.data.client_code,clientName:client.data.legal_name};
      const row: Record<string,string|null> = next;
      if (value === null) { delete row[field]; delete row[idField]; }
      else { row[field] = value; row[idField] = matches[0]?.id || null; }
      const merged = changes.filter(item => item.clientId !== clientId);
      if (fields.some(([name]) => Object.hasOwn(row,name))) merged.push(row);
      if (merged.length > 1000) return json({error:"The shared draft allows up to 1,000 changed client rows."},422);
      // A competing revision can be retried only after rechecking this cell.
      const saved = await actor.admin.from("allocation_draft_revisions").insert({
        allocation_year:year,version:(prior.data?.version ?? 0)+1,changes:merged,
        published_by:actor.profile.id,published_by_name:actor.profile.display_name || actor.profile.full_name
      }).select("version, changes, published_at, published_by_name").single();
      if (saved.error?.code === "23505") continue;
      if (saved.error || !saved.data) throw saved.error;
      return json({year,draft:saved.data},201);
    }
    return json({error:"The draft is busy. Refresh and try again."},409);
  } catch {
    return json({error:"The shared draft edit could not be confirmed. Current PICs were not changed."},503);
  }
}

export async function POST(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return json({error:actor.error},actor.status);
  if (!canManageAccess(actor.profile.role)) return json({error:"Only supervisors and partners can publish a shared draft."},403);
  const body = await request.json().catch(() => null);
  const year = Number(body?.year), version = body?.expectedVersion;
  const changes = body?.changes;
  if (!isYear(year) || !Number.isInteger(version) || version < 0 || version >= 2147483647 ||
      !Array.isArray(changes) || changes.length > 1000) return json({error:"Choose a valid year and up to 1,000 draft changes."},400);
  const ids = new Set<string>();
  for (const change of changes) {
    if (!change || !isId(change.clientId) || ids.has(change.clientId) ||
        !fields.some(([field]) => Object.hasOwn(change,field)) ||
        fields.some(([field]) => Object.hasOwn(change,field) && (typeof change[field] !== "string" || change[field].length > 160))) {
      return json({error:"Each active client must have one distinct row and a valid Next PIC or an explicit blank."},400);
    }
    ids.add(change.clientId);
  }
  try {
    const prior = await latest(actor,year);
    if (prior.error) throw prior.error;
    if ((prior.data?.version ?? 0) !== version) return json({error:"Someone published a newer draft. Refresh and review it before replacing it."},409);
    const clients = new Map<string, {client_code:string; legal_name:string}>();
    const allIds = [...ids];
    for (let index = 0; index < allIds.length; index += 100) {
      const result = await actor.admin.from("client_master").select("id, client_code, legal_name").eq("status","Active")
        .in("id",allIds.slice(index,index+100));
      if (result.error) throw result.error;
      for (const row of result.data || []) clients.set(row.id,row);
    }
    if (clients.size !== ids.size) return json({error:"One or more draft clients are no longer active. Refresh Allocation before publishing."},422);
    const staff = changes.length ? await directory(actor) : [];
    const normalized = [];
    for (const change of changes) {
      const client = clients.get(change.clientId)!;
      const row: Record<string,string|null> = {clientId:change.clientId,clientCode:client.client_code,clientName:client.legal_name};
      for (const [field,profileField,division] of fields) {
        if (!Object.hasOwn(change,field)) continue;
        const name = key(change[field]);
        const matches = name ? staff.filter(person => person.team_division === division &&
          [person.display_name,person.full_name].some(label => typeof label === "string" && key(label) === name)) : [];
        if (name && matches.length !== 1) return json({error:`${client.client_code}: choose one active ${division} PIC before publishing.`},422);
        row[field] = matches[0]?.display_name || matches[0]?.full_name || "";
        row[profileField] = matches[0]?.id || null;
      }
      normalized.push(row);
    }
    const saved = await actor.admin.from("allocation_draft_revisions").insert({
      allocation_year:year, version:version+1, changes:normalized,
      published_by:actor.profile.id, published_by_name:actor.profile.display_name || actor.profile.full_name
    }).select("version, changes, published_at, published_by_name").single();
    if (saved.error?.code === "23505") return json({error:"Someone published a newer draft. Refresh before replacing it."},409);
    if (saved.error || !saved.data) throw saved.error;
    return json({year,draft:saved.data},201);
  } catch {
    return json({error:"The draft could not be published. No Current PICs were changed."},503);
  }
}
