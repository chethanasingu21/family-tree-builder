import { getTree, json, missingDb, nowMs, parseTree, readJson, verifyTree } from "../../_lib.js";

export async function onRequestGet({ env, params }) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, params.id);
  if (!row) return json({ error: "Tree not found" }, 404);

  return json({ tree: parseTree(row) });
}

export async function onRequestPut({ request, env, params }) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, params.id);
  if (!row) return json({ error: "Tree not found" }, 404);

  const body = await readJson(request);
  if (!(await verifyTree(row, body.passcode || ""))) {
    return json({ error: "Wrong passcode" }, 403);
  }

  const incoming = body.data || {};
  const name = String(incoming.treeName || row.name).trim() || row.name;
  const data = {
    treeName: name,
    people: Array.isArray(incoming.people) ? incoming.people : [],
    parentLinks: Array.isArray(incoming.parentLinks) ? incoming.parentLinks : [],
    partnerLinks: Array.isArray(incoming.partnerLinks) ? incoming.partnerLinks : [],
    siblingLinks: Array.isArray(incoming.siblingLinks) ? incoming.siblingLinks : [],
    selectedId: incoming.selectedId || null,
  };
  const timestamp = nowMs();

  await env.DB.prepare("UPDATE trees SET name = ?, data = ?, updated_at = ? WHERE id = ?")
    .bind(name, JSON.stringify(data), timestamp, params.id)
    .run();

  return json({
    tree: {
      id: params.id,
      name,
      ...data,
      createdAt: row.created_at,
      updatedAt: timestamp,
    },
  });
}

export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, params.id);
  if (!row) return json({ error: "Tree not found" }, 404);

  const body = await readJson(request);
  if (!(await verifyTree(row, body.passcode || ""))) {
    return json({ error: "Wrong passcode" }, 403);
  }

  await env.DB.prepare("DELETE FROM trees WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
