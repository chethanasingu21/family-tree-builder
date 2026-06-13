import { getTree, json, missingDb, readJson, verifyTree } from "../../../_lib.js";

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, params.id);
  if (!row) return json({ error: "Tree not found" }, 404);

  const body = await readJson(request);
  if (!(await verifyTree(row, body.passcode || ""))) {
    return json({ error: "Wrong passcode" }, 403);
  }

  return json({ ok: true });
}
