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

## Free HTTPS deployment with Cloudflare

Use this path when you want a public HTTPS website without paying for a persistent server disk.

1. Push this repository to GitHub.
2. Create a Cloudflare account at https://dash.cloudflare.com.
3. Go to **Workers & Pages**.
4. Create a **D1 database** named `family-tree-builder`.
5. Open the D1 database console and run the SQL in `schema.sql`.
6. Go to **Workers & Pages > Create application > Pages > Connect to Git**.
7. Select this GitHub repository.
8. Build settings:
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `/`
9. After the first deploy, open the Pages project settings.
10. Go to **Settings > Bindings > Add > D1 database bindings**.
11. Set variable name to `DB`.
12. Select the `family-tree-builder` D1 database.
13. Redeploy the Pages project.

Cloudflare will give you a public HTTPS URL ending in `.pages.dev`.

## HTTPS

The server supports HTTPS if `cert.pem` and `key.pem` exist in this folder:

```powershell
python server.py --port 8443
```

On a real public deployment, HTTPS is usually handled by the hosting platform or reverse proxy. For local self-signed HTTPS on Windows, install OpenSSL or use a deployment platform that provides certificates.
