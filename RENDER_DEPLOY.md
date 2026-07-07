# Deploy smmc-file-upload to Render

Render can run this project as a Node web service. The official Render Express guide uses a Web Service with a build command and start command; for this app use:

```text
Build Command: npm install
Start Command: npm start
```

## 1. Push to GitHub

Do not commit these files:

```text
.env
oauth-client.json
service-account.json
```

They are ignored by `.gitignore`.

## 2. Create Render Web Service

In Render:

1. New -> Web Service
2. Connect the GitHub repo
3. Runtime: Node
4. Build Command: `npm install`
5. Start Command: `npm start`

You can also use `render.yaml` as a Blueprint.

## 3. Add environment variables

Set these in Render:

```env
ADMIN_TOKEN=use-a-long-secret
MAX_UPLOAD_MB=50
DATA_DIR=/var/data
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REFRESH_TOKEN=your-refresh-token
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR-RENDER-APP.onrender.com/api/auth/google/callback
```

You can get `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` from `oauth-client.json`.

## 4. Google OAuth redirect URI

In Google Cloud Console, add this authorized redirect URI to your OAuth client:

```text
https://YOUR-RENDER-APP.onrender.com/api/auth/google/callback
```

Keep the local one too:

```text
http://localhost:3000/api/auth/google/callback
```

## 5. Refresh token

If your local `.env` already has `GOOGLE_OAUTH_REFRESH_TOKEN`, copy that value into Render.

If not, run locally and open:

```text
http://localhost:3000/api/auth/google/start?token=admin12345
```

After Google authorization, the local `.env` will get `GOOGLE_OAUTH_REFRESH_TOKEN`.

## 6. Persistent event config

The app writes event settings to `DATA_DIR/config.json`.

On Render, `DATA_DIR=/var/data` should be backed by a persistent disk. Without a persistent disk, changes made in the admin panel can be lost after redeploy/restart because Render's normal filesystem is ephemeral.

