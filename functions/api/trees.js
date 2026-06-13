import { createId, createSalt, json, missingDb, nowMs, parseTree, passcodeHash, readJson, validatePasscode } from "../_lib.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return missingDb();

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
}

export async function onRequestPost({ request, env }) {
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

  await env.DB.prepare(
    "INSERT INTO trees (id, name, salt, passcode_hash, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, treeName, salt, await passcodeHash(passcode, salt), JSON.stringify(data), timestamp, timestamp)
    .run();

  return json({
    tree: {
      id,
      name: treeName,
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  }, 201);
}
