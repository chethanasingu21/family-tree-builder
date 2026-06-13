# Family Tree Builder

A backend-backed family tree website with passcode-protected editing.

## Run locally

```powershell
python server.py --http --port 8000
```

Open:

```text
http://127.0.0.1:8000/
```

The backend stores trees in `data/trees.json`. Visitors can view trees, but creating, updating, deleting, importing, or resetting a tree requires its 4-digit passcode.

## HTTPS

The server supports HTTPS if `cert.pem` and `key.pem` exist in this folder:

```powershell
python server.py --port 8443
```

On a real public deployment, HTTPS is usually handled by the hosting platform or reverse proxy. For local self-signed HTTPS on Windows, install OpenSSL or use a deployment platform that provides certificates.
