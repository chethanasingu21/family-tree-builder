import { json } from "../_lib.js";

export function onRequestGet() {
  return json({ ok: true });
}
