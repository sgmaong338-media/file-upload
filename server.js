import 'dotenv/config';

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';
import { google } from 'googleapis';
import helmet from 'helmet';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 50);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
let CONFIG_PATH = process.env.CONFIG_PATH
  ? path.resolve(process.env.CONFIG_PATH)
  : path.join(DATA_DIR, 'config.json');
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const ENV_PATH = path.join(__dirname, '.env');
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'drive-uploader');
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

await fs.mkdir(UPLOAD_TMP_DIR, { recursive: true });
await ensureWritableConfigDir();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/e/:eventId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const upload = multer({
  dest: UPLOAD_TMP_DIR,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1
  }
});

function assertAdmin(req, res, next) {
  const token = req.get('x-admin-token') || '';

  if (!ADMIN_TOKEN) {
    return res.status(500).json({
      error: 'ADMIN_TOKEN is not configured on the server.'
    });
  }

  const expected = Buffer.from(ADMIN_TOKEN);
  const actual = Buffer.from(token);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return res.status(401).json({ error: 'Invalid admin token.' });
  }

  return next();
}

function assertAdminQuery(req, res, next) {
  req.headers['x-admin-token'] = String(req.query.token || '');
  return assertAdmin(req, res, next);
}

async function readConfig() {
  await ensureConfigFile();
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  return normalizeConfig(JSON.parse(raw));
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

async function ensureWritableConfigDir() {
  const configDir = path.dirname(CONFIG_PATH);

  try {
    await fs.mkdir(configDir, { recursive: true });
    return;
  } catch (error) {
    if (!['EACCES', 'EROFS', 'EPERM'].includes(error.code)) {
      throw error;
    }
  }

  const fallbackPath = path.join(__dirname, 'data', 'config.json');
  console.warn(
    `Cannot write to ${configDir}. Falling back to ${fallbackPath}. ` +
      'On Render, add a persistent disk mounted at /var/data to keep admin changes after redeploy.'
  );
  CONFIG_PATH = fallbackPath;
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
}

async function ensureConfigFile() {
  try {
    await fs.access(CONFIG_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    const defaultConfig = await fs.readFile(DEFAULT_CONFIG_PATH, 'utf8');
    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await fs.writeFile(CONFIG_PATH, defaultConfig);
  }
}

function sanitizeFolder(folder) {
  return {
    name: String(folder.name || '').trim(),
    folderId: String(folder.folderId || '').trim(),
    description: String(folder.description || '').trim()
  };
}

function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `event-${crypto.randomBytes(3).toString('hex')}`;
}

function sanitizeEvent(event, index = 0) {
  const title = sanitizeEventTitle(event.title || event.eventTitle || `Event ${index + 1}`);
  const folderId = String(event.folderId || event.activeFolderId || '').trim();
  const id = slugify(event.id || event.slug || title);

  validateFolderId(folderId);

  return {
    id,
    title,
    folderId,
    description: String(event.description || '').trim(),
    enabled: event.enabled !== false
  };
}

function normalizeConfig(config) {
  if (Array.isArray(config.events)) {
    const events = config.events
      .map((event, index) => {
        try {
          return sanitizeEvent(event, index);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return {
      ...config,
      activeEventId: config.activeEventId || events[0]?.id || '',
      events
    };
  }

  const legacyFolderId = String(config.activeFolderId || '').trim();
  const events = legacyFolderId
    ? [
        {
          id: slugify(config.eventTitle || 'upload-portal'),
          title: config.eventTitle || 'Upload Portal',
          folderId: legacyFolderId,
          description: 'Primary upload link',
          enabled: true
        }
      ]
    : [];

  return {
    ...config,
    activeEventId: events[0]?.id || '',
    events
  };
}

function findEvent(config, eventId = '') {
  const id = String(eventId || config.activeEventId || '').trim();
  const event = config.events.find((item) => item.id === id) || config.events[0];

  if (!event || event.enabled === false) {
    throw new Error('Event upload link is not available.');
  }

  return event;
}

function sanitizeEventTitle(value) {
  const eventTitle = String(value || '').trim();
  if (!eventTitle || eventTitle.length > 120) {
    throw new Error('Event title is required and must be 120 characters or less.');
  }

  return eventTitle;
}

function validateFolderId(folderId) {
  if (!folderId || !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
    throw new Error('A valid Google Drive folder ID is required.');
  }
}

function normalizeUploadName(name) {
  const fallback = 'upload';
  const original = String(name || '').trim();

  if (!original) {
    return fallback;
  }

  const decoded = Buffer.from(original, 'latin1').toString('utf8');
  const looksMojibake = /[ÃÂÆÐÑåæçèéäöü]/.test(original) || original.includes('�');

  return looksMojibake && decoded ? decoded : original;
}

async function readOAuthClientConfig() {
  const clientFile = process.env.GOOGLE_OAUTH_CLIENT_FILE;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (clientFile) {
    const clientPath = path.resolve(__dirname, clientFile);
    const raw = await fs.readFile(clientPath, 'utf8');
    const credentials = JSON.parse(raw);
    const client = credentials.web || credentials.installed;

    if (!client?.client_id || !client?.client_secret) {
      throw new Error('OAuth client file is missing client_id or client_secret.');
    }

    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
      redirectUri:
        process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        client.redirect_uris?.[0] ||
        `http://localhost:${PORT}/api/auth/google/callback`
    };
  }

  if (clientId && clientSecret) {
    return {
      clientId,
      clientSecret,
      redirectUri:
        process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        `http://localhost:${PORT}/api/auth/google/callback`
    };
  }

  return null;
}

async function createOAuthClient() {
  const clientConfig = await readOAuthClientConfig();

  if (!clientConfig) {
    return null;
  }

  return new google.auth.OAuth2(
    clientConfig.clientId,
    clientConfig.clientSecret,
    clientConfig.redirectUri
  );
}

async function setEnvValue(key, value) {
  let raw = '';

  try {
    raw = await fs.readFile(ENV_PATH, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const lines = raw.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  const nextLine = `${key}=${value}`;

  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    lines.push(nextLine);
  }

  await fs.writeFile(ENV_PATH, `${lines.filter(Boolean).join('\n')}\n`);
  process.env[key] = value;
}

async function getAuthClient() {
  const oauthClient = await createOAuthClient();

  if (oauthClient) {
    if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
      throw new Error(
        `Google Drive OAuth is not connected. Open /api/auth/google/start?token=${ADMIN_TOKEN} to authorize this app.`
      );
    }

    oauthClient.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    });

    return oauthClient;
  }

  const scopes = [DRIVE_SCOPE];

  if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    );
    return new google.auth.GoogleAuth({ credentials, scopes });
  }

  return new google.auth.GoogleAuth({ scopes });
}

async function getDriveClient() {
  const authProvider = await getAuthClient();
  const auth = typeof authProvider.getClient === 'function' ? await authProvider.getClient() : authProvider;
  return google.drive({ version: 'v3', auth });
}

app.get('/api/auth/google/start', assertAdminQuery, async (req, res, next) => {
  try {
    const oauthClient = await createOAuthClient();

    if (!oauthClient) {
      return res.status(500).send('GOOGLE_OAUTH_CLIENT_FILE is not configured.');
    }

    const url = oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE]
    });

    return res.redirect(url);
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/google/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');

    if (!code) {
      return res.status(400).send('Missing authorization code.');
    }

    const oauthClient = await createOAuthClient();

    if (!oauthClient) {
      return res.status(500).send('GOOGLE_OAUTH_CLIENT_FILE is not configured.');
    }

    const { tokens } = await oauthClient.getToken(code);

    if (!tokens.refresh_token) {
      return res
        .status(400)
        .send('Google did not return a refresh token. Try the authorization link again.');
    }

    await setEnvValue('GOOGLE_OAUTH_REFRESH_TOKEN', tokens.refresh_token).catch((error) => {
      console.warn(`Could not write GOOGLE_OAUTH_REFRESH_TOKEN to .env: ${error.message}`);
    });

    return res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Google Drive connected</title>
          <style>
            body { font-family: system-ui, sans-serif; line-height: 1.5; padding: 32px; max-width: 900px; }
            textarea { box-sizing: border-box; font: 14px/1.5 ui-monospace, monospace; min-height: 120px; width: 100%; }
            code { background: #f2f4f7; border-radius: 4px; padding: 2px 5px; }
          </style>
        </head>
        <body>
          <h1>Google Drive connected</h1>
          <p>Copy this refresh token into Render as <code>GOOGLE_OAUTH_REFRESH_TOKEN</code>, then redeploy.</p>
          <textarea readonly>${tokens.refresh_token}</textarea>
          <p><a href="/">Back to upload page</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

app.get('/api/public-config', async (req, res, next) => {
  try {
    const config = await readConfig();
    const event = findEvent(config);

    res.json({
      eventId: event.id,
      eventTitle: event.title,
      activeTargetName: event.description || event.id
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/events/:eventId/public', async (req, res, next) => {
  try {
    const config = await readConfig();
    const event = findEvent(config, req.params.eventId);

    res.json({
      eventId: event.id,
      eventTitle: event.title,
      activeTargetName: event.description || event.id
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/config', assertAdmin, async (req, res, next) => {
  try {
    const config = await readConfig();
    res.json({
      activeEventId: config.activeEventId || '',
      events: config.events || []
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/config', assertAdmin, async (req, res, next) => {
  try {
    const incomingEvents = Array.isArray(req.body.events) ? req.body.events : [];
    const events = incomingEvents.map((event, index) => sanitizeEvent(event, index));
    const ids = new Set();

    for (const event of events) {
      let nextId = event.id;
      let suffix = 2;

      while (ids.has(nextId)) {
        nextId = `${event.id}-${suffix}`;
        suffix += 1;
      }

      event.id = nextId;
      ids.add(nextId);
    }

    if (!events.length) {
      throw new Error('At least one event is required.');
    }

    const requestedActive = String(req.body.activeEventId || '').trim();
    const activeEventId = events.some((event) => event.id === requestedActive)
      ? requestedActive
      : events[0].id;

    const nextConfig = {
      activeEventId,
      events
    };

    await writeConfig(nextConfig);
    res.json(nextConfig);
  } catch (error) {
    next(error);
  }
});

app.post('/api/upload', upload.single('file'), async (req, res, next) => {
  req.params.eventId = '';
  return uploadToEvent(req, res, next);
});

app.post('/api/events/:eventId/upload', upload.single('file'), uploadToEvent);

async function uploadToEvent(req, res, next) {
  let tempPath;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a file to upload.' });
    }

    tempPath = req.file.path;

    const config = await readConfig();
    const event = findEvent(config, req.params.eventId);
    const eventTitle = event.title;
    const folderId = String(event.folderId || '').trim();
    validateFolderId(folderId);

    const drive = await getDriveClient();
    const originalName = normalizeUploadName(req.file.originalname);

    const result = await drive.files.create({
      requestBody: {
        name: originalName,
        parents: [folderId],
        description: `Uploaded from ${eventTitle}`
      },
      media: {
        mimeType: req.file.mimetype || 'application/octet-stream',
        body: createReadStream(tempPath)
      },
      fields: 'id,name,webViewLink,parents,createdTime'
    });

    res.status(201).json({
      id: result.data.id,
      name: result.data.name,
      webViewLink: result.data.webViewLink,
      folderId,
      eventId: event.id,
      createdTime: result.data.createdTime
    });
  } catch (error) {
    next(error);
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => {});
    }
  }
}

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || error.code || 500;
  const message = error.message || 'Something went wrong.';

  res.status(Number(status) >= 400 && Number(status) < 600 ? Number(status) : 500).json({
    error: message
  });
});

app.listen(PORT, () => {
  console.log(`Google Drive uploader is running at http://localhost:${PORT}`);
});
