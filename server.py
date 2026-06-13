from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import argparse
import hashlib
import json
import os
import secrets
import ssl
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("FAMILY_TREE_DATA_DIR", ROOT / "data"))
DB_PATH = DATA_DIR / "trees.json"


def now_ms():
    return int(time.time() * 1000)


def ensure_db():
    DATA_DIR.mkdir(exist_ok=True)
    if not DB_PATH.exists():
        DB_PATH.write_text(json.dumps({"trees": []}, indent=2), encoding="utf-8")


def load_db():
    ensure_db()
    try:
        return json.loads(DB_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"trees": []}


def save_db(db):
    ensure_db()
    DB_PATH.write_text(json.dumps(db, indent=2), encoding="utf-8")


def passcode_hash(passcode, salt):
    return hashlib.sha256(f"{salt}:{passcode}".encode("utf-8")).hexdigest()


def public_tree(tree):
    data = tree.get("data", {})
    return {
        "id": tree["id"],
        "name": tree["name"],
        "treeName": data.get("treeName", tree["name"]),
        "people": data.get("people", []),
        "parentLinks": data.get("parentLinks", []),
        "partnerLinks": data.get("partnerLinks", []),
        "siblingLinks": data.get("siblingLinks", []),
        "selectedId": data.get("selectedId"),
        "createdAt": tree.get("createdAt"),
        "updatedAt": tree.get("updatedAt"),
    }


def validate_passcode(passcode):
    return isinstance(passcode, str) and passcode.isdigit() and len(passcode) == 4


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def find_tree(self, db, tree_id):
        return next((tree for tree in db["trees"] if tree["id"] == tree_id), None)

    def verify(self, tree, passcode):
        return validate_passcode(passcode) and passcode_hash(passcode, tree["salt"]) == tree["passcodeHash"]

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json(200, {"ok": True})

        if path == "/api/trees":
            db = load_db()
            trees = [
                {
                    "id": tree["id"],
                    "name": tree["name"],
                    "peopleCount": len(tree.get("data", {}).get("people", [])),
                    "updatedAt": tree.get("updatedAt"),
                }
                for tree in sorted(db["trees"], key=lambda item: item.get("updatedAt", 0), reverse=True)
            ]
            return self.send_json(200, {"trees": trees})

        if path.startswith("/api/trees/"):
            tree_id = path.split("/")[-1]
            tree = self.find_tree(load_db(), tree_id)
            if not tree:
                return self.send_json(404, {"error": "Tree not found"})
            return self.send_json(200, {"tree": public_tree(tree)})

        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self.read_json()
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "Invalid JSON"})

        if path == "/api/trees":
            tree_name = (body.get("treeName") or "My family tree").strip()
            passcode = body.get("passcode", "")
            if not validate_passcode(passcode):
                return self.send_json(400, {"error": "Passcode must be exactly 4 digits"})

            salt = secrets.token_hex(16)
            tree_id = secrets.token_urlsafe(8)
            tree = {
                "id": tree_id,
                "name": tree_name,
                "salt": salt,
                "passcodeHash": passcode_hash(passcode, salt),
                "createdAt": now_ms(),
                "updatedAt": now_ms(),
                "data": {
                    "treeName": tree_name,
                    "people": [],
                    "parentLinks": [],
                    "partnerLinks": [],
                    "siblingLinks": [],
                    "selectedId": None,
                },
            }
            db = load_db()
            db["trees"].append(tree)
            save_db(db)
            return self.send_json(201, {"tree": public_tree(tree)})

        if path.startswith("/api/trees/") and path.endswith("/verify"):
            tree_id = path.split("/")[-2]
            tree = self.find_tree(load_db(), tree_id)
            if not tree:
                return self.send_json(404, {"error": "Tree not found"})
            if not self.verify(tree, body.get("passcode", "")):
                return self.send_json(403, {"error": "Wrong passcode"})
            return self.send_json(200, {"ok": True})

        return self.send_json(404, {"error": "Not found"})

    def do_PUT(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/trees/"):
            return self.send_json(404, {"error": "Not found"})

        try:
            body = self.read_json()
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "Invalid JSON"})

        tree_id = path.split("/")[-1]
        db = load_db()
        tree = self.find_tree(db, tree_id)
        if not tree:
            return self.send_json(404, {"error": "Tree not found"})
        if not self.verify(tree, body.get("passcode", "")):
            return self.send_json(403, {"error": "Wrong passcode"})

        data = body.get("data") or {}
        tree["name"] = (data.get("treeName") or tree["name"]).strip()
        tree["data"] = {
            "treeName": tree["name"],
            "people": data.get("people", []),
            "parentLinks": data.get("parentLinks", []),
            "partnerLinks": data.get("partnerLinks", []),
            "siblingLinks": data.get("siblingLinks", []),
            "selectedId": data.get("selectedId"),
        }
        tree["updatedAt"] = now_ms()
        save_db(db)
        return self.send_json(200, {"tree": public_tree(tree)})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/trees/"):
            return self.send_json(404, {"error": "Not found"})

        try:
            body = self.read_json()
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "Invalid JSON"})

        tree_id = path.split("/")[-1]
        db = load_db()
        tree = self.find_tree(db, tree_id)
        if not tree:
            return self.send_json(404, {"error": "Tree not found"})
        if not self.verify(tree, body.get("passcode", "")):
            return self.send_json(403, {"error": "Wrong passcode"})

        db["trees"] = [item for item in db["trees"] if item["id"] != tree_id]
        save_db(db)
        return self.send_json(200, {"ok": True})


def main():
    parser = argparse.ArgumentParser(description="Family Tree backend server")
    default_port = int(os.environ.get("PORT", "8443"))
    default_host = os.environ.get("HOST", "127.0.0.1")
    parser.add_argument("--host", default=default_host)
    parser.add_argument("--port", type=int, default=default_port)
    parser.add_argument("--cert", default="cert.pem")
    parser.add_argument("--key", default="key.pem")
    parser.add_argument("--http", action="store_true", help="Run HTTP instead of HTTPS")
    args = parser.parse_args()

    ensure_db()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    cert_path = ROOT / args.cert
    key_path = ROOT / args.key
    using_https = not args.http and cert_path.exists() and key_path.exists()

    if using_https:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert_path, key_path)
        server.socket = context.wrap_socket(server.socket, server_side=True)

    scheme = "https" if using_https else "http"
    print(f"Serving Family Tree at {scheme}://{args.host}:{args.port}/")
    if not using_https:
        print("HTTPS cert/key not found. Running HTTP for local development.")
    server.serve_forever()


if __name__ == "__main__":
    main()
