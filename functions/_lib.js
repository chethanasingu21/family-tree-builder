export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function validatePasscode(passcode) {
  return typeof passcode === "string" && /^\d{4}$/.test(passcode);
}

export function nowMs() {
  return Date.now();
}

export function createId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function passcodeHash(passcode, salt) {
  const input = new TextEncoder().encode(`${salt}:${passcode}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyTree(tree, passcode) {
  return validatePasscode(passcode) && (await passcodeHash(passcode, tree.salt)) === tree.passcode_hash;
}

export function parseTree(row) {
  if (!row) return null;
  const data = JSON.parse(row.data || "{}");
  return {
    id: row.id,
    name: row.name,
    treeName: data.treeName || row.name,
    people: Array.isArray(data.people) ? data.people : [],
    parentLinks: Array.isArray(data.parentLinks) ? data.parentLinks : [],
    partnerLinks: Array.isArray(data.partnerLinks) ? data.partnerLinks : [],
    siblingLinks: Array.isArray(data.siblingLinks) ? data.siblingLinks : [],
    selectedId: data.selectedId || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getTree(env, id) {
  return await env.DB.prepare("SELECT * FROM trees WHERE id = ?").bind(id).first();
}

export function missingDb() {
  return json({ error: "Cloudflare D1 binding DB is not configured yet." }, 500);
}
