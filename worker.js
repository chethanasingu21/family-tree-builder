import {
  createId,
  createSalt,
  getTree,
  json,
  missingDb,
  nowMs,
  parseTree,
  passcodeHash,
  readJson,
  validatePasscode,
  verifyTree,
} from "./functions/_lib.js";

async function listTrees(env) {
  if (!env.DB) return missingDb();

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, data, created_at, updated_at FROM trees ORDER BY updated_at DESC"
    ).all();

    return json({
      trees: results.map((row) => {
        const tree = parseTree(row);
        return {
          id: tree.id,
          name: tree.name,
          peopleCount: tree.people.length,
          updatedAt: tree.updatedAt,
        };
      }),
    });
  } catch (error) {
    return json({ error: `D1 database error: ${error.message}` }, 500);
  }
}

async function createTree(request, env) {
  if (!env.DB) return missingDb();

  const body = await readJson(request);
  const treeName = String(body.treeName || "My family tree").trim() || "My family tree";
  const passcode = body.passcode || "";

  if (!validatePasscode(passcode)) {
    return json({ error: "Passcode must be exactly 4 digits" }, 400);
  }

  const id = createId();
  const salt = createSalt();
  const timestamp = nowMs();
  const data = {
    treeName,
    people: [],
    parentLinks: [],
    partnerLinks: [],
    siblingLinks: [],
    selectedId: null,
  };

  try {
    await env.DB.prepare(
      "INSERT INTO trees (id, name, salt, passcode_hash, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(id, treeName, salt, await passcodeHash(passcode, salt), JSON.stringify(data), timestamp, timestamp)
      .run();
  } catch (error) {
    return json({ error: `D1 database error: ${error.message}` }, 500);
  }

  return json({ tree: { id, name: treeName, ...data, createdAt: timestamp, updatedAt: timestamp } }, 201);
}

async function loadTree(env, id) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, id);
  if (!row) return json({ error: "Tree not found" }, 404);

  return json({ tree: parseTree(row) });
}

async function updateTree(request, env, id) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, id);
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

  try {
    await env.DB.prepare("UPDATE trees SET name = ?, data = ?, updated_at = ? WHERE id = ?")
      .bind(name, JSON.stringify(data), timestamp, id)
      .run();
  } catch (error) {
    return json({ error: `D1 database error: ${error.message}` }, 500);
  }

  return json({ tree: { id, name, ...data, createdAt: row.created_at, updatedAt: timestamp } });
}

async function deleteTree(request, env, id) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, id);
  if (!row) return json({ error: "Tree not found" }, 404);

  const body = await readJson(request);
  if (!(await verifyTree(row, body.passcode || ""))) {
    return json({ error: "Wrong passcode" }, 403);
  }

  await env.DB.prepare("DELETE FROM trees WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function verifyPasscode(request, env, id) {
  if (!env.DB) return missingDb();

  const row = await getTree(env, id);
  if (!row) return json({ error: "Tree not found" }, 404);

  const body = await readJson(request);
  if (!(await verifyTree(row, body.passcode || ""))) {
    return json({ error: "Wrong passcode" }, 403);
  }

  return json({ ok: true });
}

async function handleApi(request, env, pathname) {
  if (pathname === "/api/health" && request.method === "GET") return json({ ok: true });
  if (pathname === "/api/trees" && request.method === "GET") return listTrees(env);
  if (pathname === "/api/trees" && request.method === "POST") return createTree(request, env);

  const treeMatch = pathname.match(/^\/api\/trees\/([^/]+)$/);
  if (treeMatch && request.method === "GET") return loadTree(env, treeMatch[1]);
  if (treeMatch && request.method === "PUT") return updateTree(request, env, treeMatch[1]);
  if (treeMatch && request.method === "DELETE") return deleteTree(request, env, treeMatch[1]);

  const verifyMatch = pathname.match(/^\/api\/trees\/([^/]+)\/verify$/);
  if (verifyMatch && request.method === "POST") return verifyPasscode(request, env, verifyMatch[1]);

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }

    if (!env.ASSETS) {
      return new Response("Static assets binding is missing.", { status: 500 });
    }

    return env.ASSETS.fetch(request);
  },
};
