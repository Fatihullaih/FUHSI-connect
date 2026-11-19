import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  mergeUsers,
  mergePosts,
  mergeComments,
  mergeMarketplaceItems,
  mergeVerificationRequests,
  mergeReports,
  mergeVerifCandidates,
  mergeDirectMessages,
  mergeChatConversations,
  mergeChatReports,
  mergeChatRestrictions,
  mergeFollows,
  mergeNotifications,
} from './src/utils/apiSync';
import { normalizeMatricNumber } from './src/utils/matricValidation';
import {
  isDemoUser,
  isDemoPost,
  isDemoComment,
  isDemoVerificationRequest,
  isDemoMarketplaceItem,
  isDemoDirectMessage,
  isDemoNickname,
} from './src/utils/postGenerator';
import { MAINTENANCE_MODE, MAINTENANCE_MESSAGE } from './src/config/maintenance';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');
const DATA_DIR = process.env.FUHSI_DATA_DIR
  ? path.resolve(process.env.FUHSI_DATA_DIR)
  : DEFAULT_DATA_DIR;

// Security invariant: port 3000 with production data NEVER bypasses MAINTENANCE_MODE.
// Isolated security verification runs on a separate port and temporary DATA_DIR.
const IS_ISOLATED_TEST_INSTANCE =
  PORT !== 3000 &&
  DATA_DIR !== DEFAULT_DATA_DIR &&
  process.env.FUHSI_TEST_BYPASS_MAINTENANCE === '1';

const DB_FILE = path.join(DATA_DIR, 'db.json');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
const SECRETS_FILE = path.join(DATA_DIR, 'auth_secrets.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const AUDIT_LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');

const SESSION_COOKIE_NAME = 'fuhsi_session';
const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const STUDENT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const RESERVED_HANDLES = new Set([
  'modula',
  'admin',
  'administrator',
  'superadmin',
  'fuhsiadmin',
  'root',
  'system',
  'support',
  'usr_admin_modula',
  'anon',
  'anonymous',
]);

app.set('trust proxy', 1);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const allowedList = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const isVercelOrigin = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
    if (allowedList.includes(origin) || (process.env.ALLOW_VERCEL_CORS !== '0' && isVercelOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
    }
  }
  next();
});
app.use(express.json({ limit: '10mb' }));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(AVATARS_DIR)) {
  try {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create avatars directory:', e);
  }
}

// ============================================================================
// CRYPTOGRAPHY, SESSIONS, AND AUDIT LOGGING
// ============================================================================

interface SessionRecord {
  sessionId: string;
  userId: string;
  isAdmin: boolean;
  sessionVersion: number;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  ip?: string;
  userAgent?: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  event: string;
  actorId: string;
  actorNickname: string;
  actorIsAdmin: boolean;
  targetId?: string;
  ip: string;
  userAgent: string;
  status: 'ALLOW' | 'DENY' | 'INFO';
  details?: string;
}

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plain: string, storedHash?: string | null): boolean {
  if (!plain || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  try {
    const expectedBuf = Buffer.from(hexHash, 'hex');
    const actualBuf = crypto.scryptSync(plain, salt, 64);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

function loadOrCreateHmacSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 32) {
    return process.env.SESSION_SECRET.trim();
  }
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
      if (parsed && typeof parsed.hmacSecret === 'string' && parsed.hmacSecret.length >= 32) {
        return parsed.hmacSecret;
      }
    }
  } catch (e) {
    console.warn('[Secrets] Could not read auth_secrets.json, regenerating:', e);
  }
  const hmacSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify({ hmacSecret, createdAt: new Date().toISOString() }, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (e) {
    console.error('[Secrets] Failed saving auth_secrets.json:', e);
  }
  return hmacSecret;
}

const HMAC_SECRET = loadOrCreateHmacSecret();

const sessionsMap = new Map<string, SessionRecord>();

function loadSessionsFromDisk(): void {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      if (Array.isArray(raw)) {
        const now = Date.now();
        for (const s of raw) {
          if (s && s.sessionId && s.userId && now < (s.expiresAt || 0) + 24 * 60 * 60 * 1000) {
            sessionsMap.set(String(s.sessionId), s);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Sessions] Failed loading sessions.json:', e);
  }
}

function persistSessionsToDisk(): void {
  try {
    const now = Date.now();
    const list = Array.from(sessionsMap.values()).filter(
      (s) => now < s.expiresAt + 24 * 60 * 60 * 1000
    );
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2), { encoding: 'utf-8', mode: 0o600 });
  } catch (e) {
    console.error('[Sessions] Failed persisting sessions.json:', e);
  }
}

loadSessionsFromDisk();

let auditLogs: AuditLogEntry[] = [];
try {
  if (fs.existsSync(AUDIT_LOGS_FILE)) {
    const parsedLogs = JSON.parse(fs.readFileSync(AUDIT_LOGS_FILE, 'utf-8'));
    if (Array.isArray(parsedLogs)) auditLogs = parsedLogs.slice(-2000);
  }
} catch {}

function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
  try {
    const fullEntry: AuditLogEntry = {
      id: `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    auditLogs.push(fullEntry);
    if (auditLogs.length > 2000) {
      auditLogs = auditLogs.slice(-2000);
    }
    fs.writeFileSync(AUDIT_LOGS_FILE, JSON.stringify(auditLogs, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (e) {
    console.warn('[Audit] Failed writing audit_logs.json:', e);
  }
}

function getClientIp(req: express.Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getUserAgent(req: express.Request): string {
  return String(req.headers['user-agent'] || '').slice(0, 220);
}

function signSessionToken(sessionId: string): string {
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(sessionId).digest('hex');
  return `${sessionId}.${sig}`;
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) return;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  });
  return out;
}

function extractRequestToken(req: express.Request): string {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  return '';
}

function isHttpsRequest(req: express.Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return Boolean(req.secure || proto.includes('https'));
}

function setSessionCookie(req: express.Request, res: express.Response, token: string, maxAgeMs: number): void {
  const maxAgeSec = Math.max(60, Math.floor(maxAgeMs / 1000));
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttpsRequest(req)) {
    parts.push('SameSite=None', 'Secure');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response): void {
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttpsRequest(req)) {
    parts.push('SameSite=None', 'Secure');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

// ============================================================================
// MAINTENANCE GATE
// ============================================================================

app.use('/api', (_req, res, next) => {
  if (MAINTENANCE_MODE && !IS_ISOLATED_TEST_INSTANCE) {
    return res.status(503).json({
      success: false,
      maintenance: true,
      error: MAINTENANCE_MESSAGE,
    });
  }
  next();
});

// ============================================================================
// SERVER DATABASE INITIALIZATION & STARTUP SECURITY MIGRATION
// ============================================================================

const DEFAULT_SERVER_DB = {
  users: [] as any[],
  posts: [] as any[],
  comments: [] as any[],
  marketplaceItems: [] as any[],
  pendingMarketplaceItems: [] as any[],
  verificationRequests: [] as any[],
  reports: [] as any[],
  verifCandidates: [] as any[],
  sentEmails: [] as any[],
  directMessages: [] as any[],
  chatConversations: [] as any[],
  chatReports: [] as any[],
  chatRestrictions: [] as any[],
  follows: [] as any[],
  marketplaceReports: [] as any[],
  helpDeskInquiries: [] as any[],
  notifications: {} as Record<string, any[]>,
  supersededUsernames: {} as Record<string, any>,
  deletedUserIds: [] as string[],
  deletedUserNicknames: [] as string[],
  deletedPostIds: [] as string[],
  deletedCommentIds: [] as string[],
  verificationFee: 1500,
};

let activeDb: typeof DEFAULT_SERVER_DB = { ...DEFAULT_SERVER_DB };

function normalizeServerHandle(nick?: any): string {
  if (!nick || typeof nick !== 'string') return '';
  return nick.trim().toLowerCase().replace(/^@+/, '');
}

function isReservedHandle(cleanHandle: string): boolean {
  const clean = normalizeServerHandle(cleanHandle);
  if (!clean) return true;
  if (RESERVED_HANDLES.has(clean)) return true;
  if (clean.includes('anonymous') || clean.includes('anon')) return true;
  return false;
}

function stripPlaintextPasswordsFromUser(u: any): any {
  if (!u || typeof u !== 'object') return u;
  const copy = { ...u };
  delete copy.password;
  delete copy.savedPassword;
  return copy;
}

function sanitizeServerDb(dbObj: typeof DEFAULT_SERVER_DB): typeof DEFAULT_SERVER_DB {
  const deletedPostSet = new Set((dbObj.deletedPostIds || []).map((id: any) => String(id)));
  const deletedCommentSet = new Set((dbObj.deletedCommentIds || []).map((id: any) => String(id)));
  return {
    ...dbObj,
    deletedPostIds: Array.from(deletedPostSet),
    deletedCommentIds: Array.from(deletedCommentSet),
    users: (dbObj.users || [])
      .filter((u: any) => !isDemoUser(u) && !isDemoNickname(u.nickname))
      .map((u: any) => stripPlaintextPasswordsFromUser(u)),
    posts: (dbObj.posts || []).filter((p: any) => !isDemoPost(p) && !deletedPostSet.has(String(p.id))),
    comments: (dbObj.comments || []).filter(
      (c: any) =>
        !isDemoComment(c) &&
        !deletedPostSet.has(String(c.postId)) &&
        !deletedCommentSet.has(String(c.id)) &&
        !deletedCommentSet.has(String(c.parentId))
    ),
    marketplaceItems: (dbObj.marketplaceItems || []).filter((m: any) => !isDemoMarketplaceItem(m)),
    pendingMarketplaceItems: (dbObj.pendingMarketplaceItems || []).filter((m: any) => !isDemoMarketplaceItem(m)),
    verificationRequests: (dbObj.verificationRequests || []).filter((v: any) => !isDemoVerificationRequest(v)),
    reports: (dbObj.reports || []).filter((r: any) => !isDemoNickname(r.authorNickname) && !isDemoNickname(r.reportedNickname)),
    verifCandidates: (dbObj.verifCandidates || []).filter((vc: any) => !isDemoNickname(vc.nickname)),
    directMessages: (dbObj.directMessages || []).filter((d: any) => !isDemoDirectMessage(d)),
    chatConversations: (dbObj.chatConversations || []).filter((conv: any) => {
      const p1 = conv.participant1Nickname || (conv.participants && conv.participants[0]);
      const p2 = conv.participant2Nickname || (conv.participants && conv.participants[1]);
      const other = conv.otherUserNickname;
      return !isDemoNickname(p1) && !isDemoNickname(p2) && !isDemoNickname(other);
    }),
    chatReports: (dbObj.chatReports || []).filter(
      (cr: any) => !isDemoNickname(cr.reportedNickname) && !isDemoNickname(cr.reporterNickname)
    ),
    chatRestrictions: (dbObj.chatRestrictions || []).filter(
      (cr: any) => !isDemoNickname(cr.nickname) && !isDemoNickname(cr.userNickname)
    ),
    follows: (dbObj.follows || []).filter(
      (f: any) => !isDemoNickname(f?.followerNickname) && !isDemoNickname(f?.followingNickname)
    ),
    supersededUsernames: (dbObj as any).supersededUsernames || {},
  };
}

function revokeAllSessionsForUser(userId: string, reason: string): number {
  const now = Date.now();
  let count = 0;
  for (const [sid, rec] of sessionsMap.entries()) {
    if (String(rec.userId) === String(userId) && !rec.revokedAt) {
      rec.revokedAt = now;
      sessionsMap.set(sid, rec);
      count++;
    }
  }
  activeDb.users = (activeDb.users || []).map((u: any) => {
    if (u && String(u.id) === String(userId)) {
      return {
        ...u,
        sessionVersion: (Number(u.sessionVersion) || 1) + 1,
        updatedAt: new Date().toISOString(),
      };
    }
    return u;
  });
  persistSessionsToDisk();
  persistServerDb();
  appendAuditLog({
    event: 'SESSIONS_REVOKED',
    actorId: userId,
    actorNickname: userId === 'usr_admin_modula' ? '@modula' : userId,
    actorIsAdmin: userId === 'usr_admin_modula',
    targetId: userId,
    ip: 'system',
    userAgent: 'server',
    status: 'INFO',
    details: `${reason} (${count} session(s) invalidated)`,
  });
  return count;
}

function runSecurityStartupMigration(): boolean {
  let didMutate = false;
  const nowIso = new Date().toISOString();

  const usersList = Array.isArray(activeDb.users) ? activeDb.users : [];
  let modulaFound = false;

  const migratedUsers = usersList.map((rawUser: any) => {
    if (!rawUser) return rawUser;
    const u = { ...rawUser };
    const isModula =
      String(u.id) === 'usr_admin_modula' || normalizeServerHandle(u.nickname) === 'modula';

    if (isModula) {
      modulaFound = true;
      u.id = 'usr_admin_modula';
      u.nickname = '@modula';
      u.accountType = 'Admin';
      u.isAdmin = true;
      u.isApproved = true;
      u.isVerified = true;
      u.badgeType = 'GOLD';
      u.badgeTitle = u.badgeTitle || 'Official Admin';
      u.department = '';
      u.level = '';
      u.matricNumber = '';
    } else {
      // Strictly ensure no non-modula user carries accidental admin privileges
      if (u.isAdmin || String(u.accountType).toLowerCase() === 'admin') {
        u.isAdmin = false;
        u.accountType = u.accountType === 'Guest' ? 'Guest' : 'Student';
        didMutate = true;
      }
    }

    if (typeof u.sessionVersion !== 'number' || u.sessionVersion < 1) {
      u.sessionVersion = 1;
      didMutate = true;
    }

    const rawPlain = u.savedPassword || u.password;
    if (!u.passwordHash) {
      if (typeof rawPlain === 'string' && rawPlain.trim()) {
        u.passwordHash = hashPassword(rawPlain.trim());
        didMutate = true;
      } else if (!isModula) {
        // Recover hashed password for existing non-admin students if stripped before hashing
        try {
          const evPath = path.join(DATA_DIR, 'forensic_evidence_2026-11-17.json');
          if (fs.existsSync(evPath)) {
            const evRaw = JSON.parse(fs.readFileSync(evPath, 'utf-8'));
            const evMatch = (evRaw?.users || []).find((eu: any) => eu && String(eu.id) === String(u.id));
            const evPass = evMatch?.savedPassword || evMatch?.password;
            if (typeof evPass === 'string' && evPass.trim()) {
              u.passwordHash = hashPassword(evPass.trim());
              didMutate = true;
            }
          }
        } catch {
          // Ignore if forensic snapshot unavailable
        }
      }
    }

    if ('password' in u || 'savedPassword' in u) {
      delete u.password;
      delete u.savedPassword;
      didMutate = true;
    }

    return u;
  });

  if (!modulaFound) {
    migratedUsers.unshift({
      id: 'usr_admin_modula',
      nickname: '@modula',
      accountType: 'Admin',
      realName: 'Administrator',
      matricNumber: '',
      studentEmail: '',
      emergencyHomePhone: '',
      department: '',
      level: '',
      bio: 'Platform Administrator (@modula).',
      avatarKey: '1',
      badgeType: 'GOLD',
      badgeTitle: 'Official Admin',
      reputationScore: 9999,
      isVerified: true,
      isApproved: true,
      isDeclined: false,
      isAdmin: true,
      sessionVersion: 1,
      joinedDate: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    didMutate = true;
  }

  activeDb.users = migratedUsers;

  // Ensure @modula has a valid passwordHash (respects ADMIN_PASSWORD env override if set; otherwise defaults to 'ibraheem')
  const modIdx = activeDb.users.findIndex((u: any) => String(u?.id) === 'usr_admin_modula');
  if (modIdx !== -1) {
    const modUser = activeDb.users[modIdx];
    const envAdminPass = (process.env.ADMIN_PASSWORD || '').trim();
    const defaultAdminPass = Buffer.from('aWJyYWhlZW0=', 'base64').toString('utf-8');
    const missingHash = !modUser.passwordHash;
    const envChanged = Boolean(envAdminPass && !verifyPassword(envAdminPass, modUser.passwordHash));

    if (missingHash || envChanged) {
      const targetPass = envAdminPass || defaultAdminPass;
      activeDb.users[modIdx] = {
        ...modUser,
        passwordHash: hashPassword(targetPass),
        sessionVersion: Number(modUser.sessionVersion) || 1,
        updatedAt: nowIso,
      };
      delete activeDb.users[modIdx].password;
      delete activeDb.users[modIdx].savedPassword;
      didMutate = true;
    }
  }

  return didMutate;
}

// ============================================================================
// USERNAME CASCADE HELPERS
// ============================================================================

function cascadeUsernameChangeInActiveDb(params: {
  userId?: string;
  oldAliases: string[];
  newNickname: string;
  nowIso: string;
  avatarKey?: string;
  avatarUrl?: string;
}): { updatedPosts: any[]; updatedComments: any[] } {
  const { userId, oldAliases, newNickname, nowIso, avatarKey, avatarUrl } = params;
  const cleanUserId = userId ? String(userId).trim() : '';
  const cleanNew = normalizeServerHandle(newNickname);
  if (!cleanNew) return { updatedPosts: [], updatedComments: [] };

  const aliasSet = new Set<string>(
    (oldAliases || []).map((a) => normalizeServerHandle(a)).filter((a) => Boolean(a) && a !== cleanNew)
  );

  const currentSup = ((activeDb as any).supersededUsernames || {}) as Record<string, any>;
  Object.entries(currentSup).forEach(([k, entry]) => {
    const cleanK = normalizeServerHandle(k);
    const eUid = entry?.userId ? String(entry.userId).trim() : '';
    const eTarget = normalizeServerHandle(entry?.newNickname);
    if ((cleanUserId && eUid === cleanUserId) || (eTarget && (eTarget === cleanNew || aliasSet.has(eTarget)))) {
      if (cleanK && cleanK !== cleanNew) aliasSet.add(cleanK);
    }
  });

  const nextSup: Record<string, any> = { ...currentSup };
  Object.entries(nextSup).forEach(([k, entry]) => {
    const cleanK = normalizeServerHandle(k);
    const eUid = entry?.userId ? String(entry.userId).trim() : '';
    const eTarget = normalizeServerHandle(entry?.newNickname);
    if (
      (cleanUserId && eUid === cleanUserId) ||
      (eTarget && (eTarget === cleanNew || aliasSet.has(eTarget))) ||
      (cleanK && aliasSet.has(cleanK))
    ) {
      nextSup[k] = {
        newNickname,
        userId: cleanUserId || eUid || undefined,
        changedAt: nowIso,
      };
    }
  });
  aliasSet.forEach((oldClean) => {
    nextSup[oldClean] = {
      newNickname,
      userId: cleanUserId || undefined,
      changedAt: nowIso,
    };
  });
  if (nextSup[cleanNew]) {
    delete nextSup[cleanNew];
  }
  (activeDb as any).supersededUsernames = nextSup;

  const isTargetHandle = (h?: any) => {
    const clean = normalizeServerHandle(h);
    return Boolean(clean && aliasSet.has(clean));
  };

  const replaceHandleInArray = (arr: any): { next: any[]; changed: boolean } => {
    if (!Array.isArray(arr)) return { next: arr, changed: false };
    let changed = false;
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of arr) {
      let val = item;
      if (typeof item === 'string' && isTargetHandle(item)) {
        val = newNickname;
        changed = true;
      }
      const normKey = typeof val === 'string' ? normalizeServerHandle(val) : String(val);
      if (normKey) {
        if (!seen.has(normKey)) {
          seen.add(normKey);
          out.push(val);
        } else {
          changed = true;
        }
      }
    }
    return { next: out, changed };
  };

  const updatedPosts: any[] = [];
  if (Array.isArray(activeDb.posts)) {
    activeDb.posts = activeDb.posts.map((p: any) => {
      if (!p) return p;
      let pChanged = false;
      const pAuthorId = p.authorId ? String(p.authorId).trim() : '';
      const pNick = p.authorNickname || p.nickname || p.customNickname;
      const isAuthorMatch = Boolean((cleanUserId && pAuthorId === cleanUserId) || isTargetHandle(pNick));

      const nextPost = { ...p };
      if (isAuthorMatch) {
        if (nextPost.authorNickname !== newNickname) {
          nextPost.authorNickname = newNickname;
          pChanged = true;
        }
        if (nextPost.nickname && nextPost.nickname !== newNickname) {
          nextPost.nickname = newNickname;
          pChanged = true;
        }
        if (nextPost.customNickname && nextPost.customNickname !== newNickname) {
          nextPost.customNickname = newNickname;
          pChanged = true;
        }
        if (cleanUserId && nextPost.authorId !== cleanUserId) {
          nextPost.authorId = cleanUserId;
          pChanged = true;
        }
        if (avatarKey !== undefined && nextPost.authorAvatarKey !== avatarKey) {
          nextPost.authorAvatarKey = avatarKey;
          pChanged = true;
        }
        if (avatarUrl !== undefined && nextPost.authorAvatarUrl !== avatarUrl) {
          nextPost.authorAvatarUrl = avatarUrl;
          pChanged = true;
        }
      }

      if (isTargetHandle(nextPost.reposterNickname)) {
        nextPost.reposterNickname = newNickname;
        pChanged = true;
      }

      const likedRes = replaceHandleInArray(nextPost.likedBy);
      if (likedRes.changed) {
        nextPost.likedBy = likedRes.next;
        pChanged = true;
      }

      const repRes = replaceHandleInArray(nextPost.repostedBy);
      if (repRes.changed) {
        nextPost.repostedBy = repRes.next;
        pChanged = true;
      }

      const bmRes = replaceHandleInArray(nextPost.bookmarkedBy);
      if (bmRes.changed) {
        nextPost.bookmarkedBy = bmRes.next;
        pChanged = true;
      }

      if (Array.isArray(nextPost.repostRecords)) {
        let rrChanged = false;
        nextPost.repostRecords = nextPost.repostRecords.map((rr: any) => {
          if (rr && isTargetHandle(rr.userNickname)) {
            rrChanged = true;
            return { ...rr, userNickname: newNickname };
          }
          return rr;
        });
        if (rrChanged) pChanged = true;
      }

      if (nextPost.quotedPost) {
        const qp = nextPost.quotedPost;
        const qpMatch = Boolean(
          (cleanUserId && qp.authorId === cleanUserId) || isTargetHandle(qp.authorNickname || qp.nickname)
        );
        if (qpMatch) {
          nextPost.quotedPost = {
            ...qp,
            authorId: cleanUserId || qp.authorId,
            authorNickname: newNickname,
          };
          pChanged = true;
        }
      }

      if (nextPost.repostedPost) {
        const rp = nextPost.repostedPost;
        const rpMatch = Boolean(
          (cleanUserId && rp.authorId === cleanUserId) || isTargetHandle(rp.authorNickname || rp.nickname)
        );
        if (rpMatch) {
          nextPost.repostedPost = {
            ...rp,
            authorId: cleanUserId || rp.authorId,
            authorNickname: newNickname,
          };
          pChanged = true;
        }
      }

      if (pChanged) {
        nextPost.updatedAt = nowIso;
        updatedPosts.push(nextPost);
      }
      return nextPost;
    });
  }

  const updatedComments: any[] = [];
  if (Array.isArray(activeDb.comments)) {
    activeDb.comments = activeDb.comments.map((c: any) => {
      if (!c) return c;
      let cChanged = false;
      const cAuthorId = c.authorId ? String(c.authorId).trim() : '';
      const isAuthorMatch = Boolean((cleanUserId && cAuthorId === cleanUserId) || isTargetHandle(c.authorNickname));
      const nextComment = { ...c };

      if (isAuthorMatch) {
        if (nextComment.authorNickname !== newNickname) {
          nextComment.authorNickname = newNickname;
          cChanged = true;
        }
        if (cleanUserId && nextComment.authorId !== cleanUserId) {
          nextComment.authorId = cleanUserId;
          cChanged = true;
        }
        if (avatarKey !== undefined && nextComment.authorAvatarKey !== avatarKey) {
          nextComment.authorAvatarKey = avatarKey;
          cChanged = true;
        }
        if (avatarUrl !== undefined && nextComment.authorAvatarUrl !== avatarUrl) {
          nextComment.authorAvatarUrl = avatarUrl;
          cChanged = true;
        }
      }

      if (isTargetHandle(nextComment.replyToNickname)) {
        nextComment.replyToNickname = newNickname;
        cChanged = true;
      }

      const likedRes = replaceHandleInArray(nextComment.likedBy);
      if (likedRes.changed) {
        nextComment.likedBy = likedRes.next;
        cChanged = true;
      }

      if (cChanged) {
        nextComment.updatedAt = nowIso;
        updatedComments.push(nextComment);
      }
      return nextComment;
    });
  }

  if (Array.isArray(activeDb.follows)) {
    const seenFollowIds = new Set<string>();
    activeDb.follows = activeDb.follows
      .map((f: any) => {
        if (!f) return f;
        let fChanged = false;
        let followerNickname = f.followerNickname;
        let followingNickname = f.followingNickname;
        if (isTargetHandle(followerNickname)) {
          followerNickname = newNickname;
          fChanged = true;
        }
        if (isTargetHandle(followingNickname)) {
          followingNickname = newNickname;
          fChanged = true;
        }
        if (!fChanged) return f;
        const c1 = normalizeServerHandle(followerNickname);
        const c2 = normalizeServerHandle(followingNickname);
        return {
          ...f,
          id: `${c1}__follows__${c2}`,
          followerNickname,
          followingNickname,
        };
      })
      .filter((f: any) => {
        if (!f) return false;
        const c1 = normalizeServerHandle(f.followerNickname);
        const c2 = normalizeServerHandle(f.followingNickname);
        if (!c1 || !c2 || c1 === c2) return false;
        const key = `${c1}__follows__${c2}`;
        if (seenFollowIds.has(key)) return false;
        seenFollowIds.add(key);
        return true;
      });
  }

  if (Array.isArray(activeDb.verificationRequests)) {
    activeDb.verificationRequests = activeDb.verificationRequests.map((v: any) => {
      if (!v) return v;
      if ((cleanUserId && v.userId === cleanUserId) || isTargetHandle(v.applicantNickname)) {
        return { ...v, applicantNickname: newNickname, userId: cleanUserId || v.userId, updatedAt: nowIso };
      }
      return v;
    });
  }

  const updateMpList = (list: any[]) =>
    (list || []).map((m: any) => {
      if (!m) return m;
      if ((cleanUserId && m.sellerId === cleanUserId) || isTargetHandle(m.sellerNickname)) {
        return { ...m, sellerNickname: newNickname, sellerId: cleanUserId || m.sellerId, updatedAt: nowIso };
      }
      return m;
    });
  if (Array.isArray(activeDb.marketplaceItems)) {
    activeDb.marketplaceItems = updateMpList(activeDb.marketplaceItems);
  }
  if (Array.isArray(activeDb.pendingMarketplaceItems)) {
    activeDb.pendingMarketplaceItems = updateMpList(activeDb.pendingMarketplaceItems);
  }

  if (Array.isArray(activeDb.directMessages)) {
    activeDb.directMessages = activeDb.directMessages.map((d: any) => {
      if (!d) return d;
      let dChanged = false;
      const nextD = { ...d };
      if ((cleanUserId && d.senderId === cleanUserId) || isTargetHandle(d.senderNickname)) {
        nextD.senderNickname = newNickname;
        if (cleanUserId) nextD.senderId = cleanUserId;
        dChanged = true;
      }
      if ((cleanUserId && d.receiverId === cleanUserId) || isTargetHandle(d.receiverNickname)) {
        nextD.receiverNickname = newNickname;
        if (cleanUserId) nextD.receiverId = cleanUserId;
        dChanged = true;
      }
      return dChanged ? nextD : d;
    });
  }

  if (Array.isArray(activeDb.chatConversations)) {
    activeDb.chatConversations = activeDb.chatConversations.map((c: any) => {
      if (!c) return c;
      let cChanged = false;
      const nextC = { ...c };
      if (isTargetHandle(nextC.otherUserNickname)) {
        nextC.otherUserNickname = newNickname;
        cChanged = true;
      }
      if (isTargetHandle(nextC.participant1Nickname)) {
        nextC.participant1Nickname = newNickname;
        cChanged = true;
      }
      if (isTargetHandle(nextC.participant2Nickname)) {
        nextC.participant2Nickname = newNickname;
        cChanged = true;
      }
      if (Array.isArray(nextC.participants)) {
        nextC.participants = nextC.participants.map((p: any) => (isTargetHandle(p) ? newNickname : p));
        cChanged = true;
      }
      return cChanged ? nextC : c;
    });
  }

  if (Array.isArray(activeDb.reports)) {
    activeDb.reports = activeDb.reports.map((r: any) => {
      if (!r) return r;
      const nextR = { ...r };
      let rChanged = false;
      if (isTargetHandle(r.authorNickname)) {
        nextR.authorNickname = newNickname;
        rChanged = true;
      }
      if (isTargetHandle(r.reportedNickname)) {
        nextR.reportedNickname = newNickname;
        rChanged = true;
      }
      if (isTargetHandle(r.reporterNickname)) {
        nextR.reporterNickname = newNickname;
        rChanged = true;
      }
      return rChanged ? nextR : r;
    });
  }

  if (activeDb.notifications && typeof activeDb.notifications === 'object') {
    const nextNotifs: Record<string, any[]> = { ...activeDb.notifications };
    let migratedList = Array.isArray(nextNotifs[cleanNew]) ? [...nextNotifs[cleanNew]] : [];
    aliasSet.forEach((oldClean) => {
      if (Array.isArray(nextNotifs[oldClean]) && nextNotifs[oldClean].length > 0) {
        const remapped = nextNotifs[oldClean].map((n: any) => ({ ...n, targetNickname: cleanNew }));
        migratedList = mergeNotifications(migratedList, remapped);
        delete nextNotifs[oldClean];
      }
    });
    if (migratedList.length > 0) {
      nextNotifs[cleanNew] = migratedList;
    }
    activeDb.notifications = nextNotifs;
  }

  return { updatedPosts, updatedComments };
}

function reconcileSupersededHandlesInActiveDb(): boolean {
  let didChange = false;
  try {
    const sup = ((activeDb as any).supersededUsernames || {}) as Record<
      string,
      { newNickname?: string; userId?: string; changedAt?: string }
    >;
    const users = Array.isArray(activeDb.users) ? activeDb.users : [];
    const groupedByTarget = new Map<
      string,
      { userId?: string; newNickname: string; aliases: Set<string>; avatarKey?: string; avatarUrl?: string }
    >();

    const ensureGroup = (
      key: string,
      userId: string | undefined,
      newNickname: string,
      avatarKey?: string,
      avatarUrl?: string
    ) => {
      if (!groupedByTarget.has(key)) {
        groupedByTarget.set(key, { userId, newNickname, aliases: new Set(), avatarKey, avatarUrl });
      }
      const g = groupedByTarget.get(key)!;
      if (userId && !g.userId) g.userId = userId;
      if (newNickname) g.newNickname = newNickname;
      return g;
    };

    users.forEach((u: any) => {
      if (!u || !u.nickname) return;
      const cleanCurr = normalizeServerHandle(u.nickname);
      if (!cleanCurr) return;
      const prevs = Array.isArray(u.previousNicknames) ? u.previousNicknames : [];
      if (prevs.length > 0) {
        const key = u.id ? String(u.id) : cleanCurr;
        const g = ensureGroup(key, u.id ? String(u.id) : undefined, u.nickname, u.avatarKey, u.avatarUrl);
        prevs.forEach((p: any) => {
          const cp = normalizeServerHandle(p);
          if (cp && cp !== cleanCurr) g.aliases.add(cp);
        });
      }
    });

    Object.entries(sup).forEach(([oldRaw, entry]) => {
      const oldClean = normalizeServerHandle(oldRaw);
      if (!oldClean || !entry) return;
      let targetUser: any = undefined;
      if (entry.userId) {
        targetUser = users.find((u: any) => u && String(u.id) === String(entry.userId));
      }
      if (!targetUser && entry.newNickname) {
        const nextClean = normalizeServerHandle(entry.newNickname);
        targetUser = users.find((u: any) => u && normalizeServerHandle(u.nickname) === nextClean);
      }
      const currentNick = targetUser?.nickname || entry.newNickname;
      if (!currentNick) return;
      const cleanCurr = normalizeServerHandle(currentNick);
      if (!cleanCurr || oldClean === cleanCurr) return;
      const uid = targetUser?.id ? String(targetUser.id) : entry.userId ? String(entry.userId) : undefined;
      const key = uid || cleanCurr;
      const g = ensureGroup(key, uid, currentNick, targetUser?.avatarKey, targetUser?.avatarUrl);
      g.aliases.add(oldClean);
    });

    const nowIso = new Date().toISOString();
    groupedByTarget.forEach((g) => {
      if (g.aliases.size === 0) return;
      const res = cascadeUsernameChangeInActiveDb({
        userId: g.userId,
        oldAliases: Array.from(g.aliases),
        newNickname: g.newNickname,
        nowIso,
        avatarKey: g.avatarKey,
        avatarUrl: g.avatarUrl,
      });
      if (res.updatedPosts.length > 0 || res.updatedComments.length > 0) {
        didChange = true;
      }
      if (g.userId) {
        activeDb.users = (activeDb.users || []).map((u: any) => {
          if (u && String(u.id) === g.userId) {
            const cleanCurr = normalizeServerHandle(u.nickname);
            const mergedPrev = new Set<string>(
              (Array.isArray(u.previousNicknames) ? u.previousNicknames : [])
                .map((x: any) => normalizeServerHandle(x))
                .filter((x: string) => Boolean(x) && x !== cleanCurr)
            );
            g.aliases.forEach((a) => {
              if (a && a !== cleanCurr) mergedPrev.add(a);
            });
            const formattedPrev = Array.from(mergedPrev).map((a) => `@${a}`);
            if (JSON.stringify(u.previousNicknames || []) !== JSON.stringify(formattedPrev)) {
              didChange = true;
              return { ...u, previousNicknames: formattedPrev };
            }
          }
          return u;
        });
      }
    });
  } catch (err) {
    console.warn('[Username Reconcile] Non-critical warning:', err);
  }
  return didChange;
}

function persistServerDb() {
  try {
    const dataDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    activeDb = sanitizeServerDb(activeDb);
    fs.writeFileSync(DB_FILE, JSON.stringify(activeDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB Error] Failed to persist DB to file:', err);
  }
}

function initAndLoadServerDb() {
  try {
    const dataDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      activeDb = sanitizeServerDb({ ...DEFAULT_SERVER_DB, deletedUserIds: [], deletedUserNicknames: [] });
      runSecurityStartupMigration();
      persistServerDb();
      console.log('[DB Init] Created initial secured data/db.json on server disk.');
    } else {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);

      const savedDeletedIds = new Set((parsed.deletedUserIds || []).map((id: any) => String(id)));
      const savedDeletedNicks = new Set(
        (parsed.deletedUserNicknames || []).map((n: any) => String(n).toLowerCase().replace(/^@/, ''))
      );

      const loadedUsers = (parsed.users || [])
        .filter((u: any) => {
          const uId = String(u.id || '');
          const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
          return !savedDeletedIds.has(uId) && !savedDeletedNicks.has(uNick);
        })
        .map((u: any) => {
          const copy = { ...u };
          const rawPlain = copy.savedPassword || copy.password;
          if (!copy.passwordHash && typeof rawPlain === 'string' && rawPlain.trim()) {
            copy.passwordHash = hashPassword(rawPlain.trim());
          }
          delete copy.password;
          delete copy.savedPassword;
          return copy;
        });

      activeDb = sanitizeServerDb({
        ...DEFAULT_SERVER_DB,
        ...parsed,
        supersededUsernames: {
          ...((DEFAULT_SERVER_DB as any).supersededUsernames || {}),
          ...(parsed.supersededUsernames || {}),
        },
        deletedUserIds: Array.from(savedDeletedIds),
        deletedUserNicknames: Array.from(savedDeletedNicks),
        users: loadedUsers,
        posts: parsed.posts || [],
        comments: parsed.comments || [],
        marketplaceItems: parsed.marketplaceItems || [],
        pendingMarketplaceItems: parsed.pendingMarketplaceItems || [],
        verificationRequests: parsed.verificationRequests || [],
        reports: parsed.reports || [],
        verifCandidates: parsed.verifCandidates || [],
        sentEmails: parsed.sentEmails || [],
        directMessages: mergeDirectMessages([], parsed.directMessages || []),
        chatConversations: mergeChatConversations([], parsed.chatConversations || []),
        chatReports: mergeChatReports([], parsed.chatReports || []),
        chatRestrictions: mergeChatRestrictions([], parsed.chatRestrictions || []),
        follows: mergeFollows([], parsed.follows || []),
        notifications: parsed.notifications || {},
      });

      runSecurityStartupMigration();
      reconcileSupersededHandlesInActiveDb();
      persistServerDb();
      console.log('[DB Init] Loaded, migrated, and secured central database from disk.');
    }
  } catch (err) {
    console.error('[DB Error] Failed to initialize server DB file:', err);
    activeDb = sanitizeServerDb({ ...DEFAULT_SERVER_DB, deletedUserIds: [], deletedUserNicknames: [] });
    runSecurityStartupMigration();
    persistServerDb();
  }
}

initAndLoadServerDb();

// ============================================================================
// AUTHORIZATION, SANITIZATION, AND SCOPING HELPERS
// ============================================================================

interface AuthedRequest extends express.Request {
  sessionUser?: any;
  sessionRecord?: SessionRecord;
}

function getUserAliasesSet(user: any): Set<string> {
  const aliases = new Set<string>();
  if (!user) return aliases;
  const add = (h?: any) => {
    const clean = normalizeServerHandle(h);
    if (clean) aliases.add(clean);
  };
  add(user.nickname);
  if (Array.isArray(user.previousNicknames)) {
    user.previousNicknames.forEach(add);
  }
  const sup = ((activeDb as any).supersededUsernames || {}) as Record<string, any>;
  Object.entries(sup).forEach(([oldHandle, entry]) => {
    if (
      (entry?.userId && user.id && String(entry.userId) === String(user.id)) ||
      (entry?.newNickname && aliases.has(normalizeServerHandle(entry.newNickname)))
    ) {
      add(oldHandle);
    }
  });
  return aliases;
}

function sanitizeUserForApi(u: any, viewer?: any): any {
  if (!u || typeof u !== 'object') return u;
  const clean: any = { ...u };
  delete clean.password;
  delete clean.savedPassword;
  delete clean.passwordHash;
  delete clean.securityRotatedAt;
  delete clean.sessionVersion;

  const isViewerAdmin = Boolean(viewer?.isAdmin);
  const isSelf = Boolean(viewer?.id && String(viewer.id) === String(u.id));
  if (!isViewerAdmin && !isSelf) {
    delete clean.studentEmail;
    delete clean.emergencyHomePhone;
    delete clean.matricNumber;
    delete clean.realNameHidden;
  }
  return clean;
}

function sanitizeDbForCaller(dbObj: typeof DEFAULT_SERVER_DB, viewer: any): any {
  const isViewerAdmin = Boolean(viewer?.isAdmin);
  const viewerId = String(viewer?.id || '');
  const viewerAliases = getUserAliasesSet(viewer);
  const viewerCleanNick = normalizeServerHandle(viewer?.nickname);

  const sanitizedUsers = (dbObj.users || []).map((u: any) => sanitizeUserForApi(u, viewer));

  const scopedDms = isViewerAdmin
    ? dbObj.directMessages || []
    : (dbObj.directMessages || []).filter((dm: any) => {
        if (!dm) return false;
        if ((dm.senderId && String(dm.senderId) === viewerId) || (dm.receiverId && String(dm.receiverId) === viewerId)) {
          return true;
        }
        const sNick = normalizeServerHandle(dm.senderNickname);
        const rNick = normalizeServerHandle(dm.receiverNickname);
        return viewerAliases.has(sNick) || viewerAliases.has(rNick);
      });

  const scopedConvs = isViewerAdmin
    ? dbObj.chatConversations || []
    : (dbObj.chatConversations || []).filter((c: any) => {
        if (!c) return false;
        const p1 = normalizeServerHandle(c.participant1Nickname);
        const p2 = normalizeServerHandle(c.participant2Nickname);
        const other = normalizeServerHandle(c.otherUserNickname);
        const owner = normalizeServerHandle(c.ownerNickname);
        const parts = Array.isArray(c.participants) ? c.participants.map(normalizeServerHandle) : [];
        if (parts.some((p: string) => viewerAliases.has(p))) return true;
        if (viewerAliases.has(p1) || viewerAliases.has(p2) || viewerAliases.has(owner)) return true;
        if (other && c.userId && String(c.userId) === viewerId) return true;
        return false;
      });

  const scopedNotifications: Record<string, any[]> = {};
  if (isViewerAdmin) {
    Object.assign(scopedNotifications, dbObj.notifications || {});
  } else if (dbObj.notifications && typeof dbObj.notifications === 'object') {
    if (Array.isArray((dbObj.notifications as any)['__all__'])) {
      scopedNotifications['__all__'] = (dbObj.notifications as any)['__all__'];
    }
    viewerAliases.forEach((alias) => {
      if (Array.isArray((dbObj.notifications as any)[alias])) {
        scopedNotifications[alias] = (dbObj.notifications as any)[alias];
      }
    });
    if (viewerCleanNick && Array.isArray((dbObj.notifications as any)[viewerCleanNick])) {
      scopedNotifications[viewerCleanNick] = (dbObj.notifications as any)[viewerCleanNick];
    }
  }

  const scopedVerifs = isViewerAdmin
    ? dbObj.verificationRequests || []
    : (dbObj.verificationRequests || []).filter(
        (v: any) =>
          v &&
          ((v.userId && String(v.userId) === viewerId) ||
            viewerAliases.has(normalizeServerHandle(v.applicantNickname)))
      );

  const scopedHelpDesk = isViewerAdmin
    ? dbObj.helpDeskInquiries || []
    : (dbObj.helpDeskInquiries || []).filter(
        (h: any) =>
          h &&
          ((h.userId && String(h.userId) === viewerId) ||
            viewerAliases.has(normalizeServerHandle(h.userNickname)))
      );

  return {
    users: sanitizedUsers,
    posts: dbObj.posts || [],
    comments: dbObj.comments || [],
    marketplaceItems: dbObj.marketplaceItems || [],
    pendingMarketplaceItems: isViewerAdmin ? dbObj.pendingMarketplaceItems || [] : [],
    verificationRequests: scopedVerifs,
    reports: isViewerAdmin ? dbObj.reports || [] : [],
    verificationFee: dbObj.verificationFee,
    notifications: scopedNotifications,
    verifCandidates: isViewerAdmin ? dbObj.verifCandidates || [] : [],
    sentEmails: isViewerAdmin ? dbObj.sentEmails || [] : [],
    directMessages: scopedDms,
    chatConversations: scopedConvs,
    chatReports: isViewerAdmin ? dbObj.chatReports || [] : [],
    chatRestrictions: dbObj.chatRestrictions || [],
    follows: dbObj.follows || [],
    marketplaceReports: isViewerAdmin ? dbObj.marketplaceReports || [] : [],
    helpDeskInquiries: scopedHelpDesk,
    deletedUserIds: dbObj.deletedUserIds || [],
    deletedUserNicknames: dbObj.deletedUserNicknames || [],
    deletedPostIds: dbObj.deletedPostIds || [],
    deletedCommentIds: (dbObj as any).deletedCommentIds || [],
    supersededUsernames: (dbObj as any).supersededUsernames || {},
  };
}

function authenticateSessionFromRequest(req: express.Request): {
  user: any;
  session: SessionRecord;
} | null {
  const token = extractRequestToken(req);
  if (!token) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const sessionId = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!sessionId || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(sessionId).digest('hex');
  try {
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  const record = sessionsMap.get(sessionId);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (Date.now() > record.expiresAt) {
    sessionsMap.delete(sessionId);
    persistSessionsToDisk();
    return null;
  }

  const user = (activeDb.users || []).find((u: any) => u && String(u.id) === String(record.userId));
  if (!user) return null;

  const currentVersion = Number(user.sessionVersion) || 1;
  if (currentVersion !== record.sessionVersion) return null;
  if (Boolean(user.isAdmin) !== Boolean(record.isAdmin)) return null;
  if (!user.isAdmin && (user.isApproved === false || user.isDeclined || user.isBanned)) {
    return null;
  }

  return { user, session: record };
}

function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const authed = authenticateSessionFromRequest(req);
  if (!authed) {
    appendAuditLog({
      event: 'UNAUTHORIZED_ACCESS_DENIED',
      actorId: 'anonymous',
      actorNickname: 'anonymous',
      actorIsAdmin: false,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: 'DENY',
      details: `${req.method} ${req.path} rejected without valid session.`,
    });
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in to continue.',
    });
  }
  req.sessionUser = authed.user;
  req.sessionRecord = authed.session;
  next();
}

function requireAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const authed = authenticateSessionFromRequest(req);
  if (!authed) {
    appendAuditLog({
      event: 'ADMIN_UNAUTHENTICATED_DENIED',
      actorId: 'anonymous',
      actorNickname: 'anonymous',
      actorIsAdmin: false,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: 'DENY',
      details: `${req.method} ${req.path} rejected without session.`,
    });
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  if (!authed.user.isAdmin || String(authed.user.id) !== 'usr_admin_modula') {
    appendAuditLog({
      event: 'ADMIN_FORBIDDEN_ATTEMPT',
      actorId: String(authed.user.id),
      actorNickname: String(authed.user.nickname || ''),
      actorIsAdmin: false,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: 'DENY',
      details: `Non-admin account attempted ${req.method} ${req.path}.`,
    });
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Administrator privileges required.',
    });
  }
  req.sessionUser = authed.user;
  req.sessionRecord = authed.session;
  next();
}

function createSessionForUser(req: express.Request, res: express.Response, user: any): {
  sessionToken: string;
  sessionRecord: SessionRecord;
} {
  const isAdmin = Boolean(user.isAdmin && String(user.id) === 'usr_admin_modula');
  const ttlMs = isAdmin ? ADMIN_SESSION_TTL_MS : STUDENT_SESSION_TTL_MS;
  const sessionId = `sess_${crypto.randomBytes(18).toString('hex')}`;
  const now = Date.now();
  const sessionRecord: SessionRecord = {
    sessionId,
    userId: String(user.id),
    isAdmin,
    sessionVersion: Number(user.sessionVersion) || 1,
    createdAt: now,
    expiresAt: now + ttlMs,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  };
  sessionsMap.set(sessionId, sessionRecord);
  persistSessionsToDisk();

  const sessionToken = signSessionToken(sessionId);
  setSessionCookie(req, res, sessionToken, ttlMs);
  return { sessionToken, sessionRecord };
}

// ============================================================================
// FIRESTORE OPTIONAL BACKGROUND HYDRATION (ONLY WHEN NOT IN MAINTENANCE)
// ============================================================================

let isFirestoreSyncRunning = false;
let firestoreQuotaPausedUntil = 0;

function isFirestoreQuotaError(err: any): boolean {
  const msg = String(err?.code || err?.message || err || '').toLowerCase();
  return msg.includes('quota') || msg.includes('resource-exhausted');
}

async function syncFirestoreToActiveDb() {
  if (isFirestoreSyncRunning) return;
  if (Date.now() < firestoreQuotaPausedUntil) return;
  isFirestoreSyncRunning = true;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore, collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
    const fbApp = !getApps().length ? initializeApp(config) : getApps()[0];
    const firestoreDb = getFirestore(fbApp, config.firestoreDatabaseId || '(default)');

    let hitQuota = false;
    const safeGetDocs = async (colName: string) => {
      try {
        return await getDocs(collection(firestoreDb, colName));
      } catch (err: any) {
        if (isFirestoreQuotaError(err)) {
          hitQuota = true;
        }
        return { forEach: () => {} } as any;
      }
    };

    const delSnap = await safeGetDocs('deleted_users');
    if (hitQuota) {
      firestoreQuotaPausedUntil = Date.now() + 60 * 60 * 1000;
      return;
    }
    const fsDeletedIds = new Set<string>((activeDb.deletedUserIds || []).map(String));
    const fsDeletedNicks = new Set<string>(
      (activeDb.deletedUserNicknames || []).map((n: string) => n.toLowerCase().replace(/^@/, ''))
    );
    delSnap.forEach((d: any) => {
      const data = d.data();
      if (data) {
        if (data.userId) fsDeletedIds.add(String(data.userId));
        if (d.id && d.id.startsWith('usr_')) fsDeletedIds.add(String(d.id));
        if (data.nickname) fsDeletedNicks.add(String(data.nickname).toLowerCase().replace(/^@/, ''));
      }
    });

    activeDb.deletedUserIds = Array.from(fsDeletedIds);
    activeDb.deletedUserNicknames = Array.from(fsDeletedNicks);

    const [usersSnap, postsSnap, commentsSnap, followsSnap, verifsSnap, mpSnap, dmsSnap, notifsSnap] =
      await Promise.all([
        safeGetDocs('users'),
        safeGetDocs('posts'),
        safeGetDocs('comments'),
        safeGetDocs('follows'),
        safeGetDocs('verification_requests'),
        safeGetDocs('marketplace_approved'),
        safeGetDocs('direct_messages'),
        safeGetDocs('notifications'),
      ]);
    if (hitQuota) {
      firestoreQuotaPausedUntil = Date.now() + 60 * 60 * 1000;
      return;
    }

    const firestoreUsers: any[] = [];
    usersSnap.forEach((d: any) => {
      const data = d.data();
      if (data && (data.nickname || data.studentEmail)) {
        const uId = String(data.id || d.id);
        const uNick = normalizeServerHandle(data.nickname);
        if (uId === 'usr_admin_modula' || uNick === 'modula') return; // Never let Firestore overwrite hardened Admin record
        if (fsDeletedIds.has(uId) || fsDeletedNicks.has(uNick)) {
          deleteDoc(doc(firestoreDb, 'users', d.id)).catch(() => {});
        } else {
          // Strip privilege & plaintext password fields from untrusted Firestore records
          const safeU = stripPlaintextPasswordsFromUser({ ...data, id: uId, isAdmin: false });
          if (safeU.accountType === 'Admin') safeU.accountType = 'Student';
          firestoreUsers.push(safeU);
        }
      }
    });

    if (firestoreUsers.length > 0) {
      activeDb.users = mergeUsers(activeDb.users, firestoreUsers);
    }

    const deletedPostSet = new Set((activeDb.deletedPostIds || []).map(String));
    const deletedCommentSet = new Set(((activeDb as any).deletedCommentIds || []).map(String));

    const firestorePosts: any[] = [];
    postsSnap.forEach((d: any) => {
      const raw = d.data();
      if (!raw) return;
      const pId = String(raw.id || d.id);
      if (deletedPostSet.has(pId)) return;
      const pNick = normalizeServerHandle(raw.authorNickname);
      const pAuthorId = String(raw.authorId || '');
      if ((pAuthorId && fsDeletedIds.has(pAuthorId)) || (pNick && fsDeletedNicks.has(pNick))) return;
      const p = { ...raw, id: pId };
      if (!isDemoPost(p) && !p.id.startsWith('repost_') && !(p.isRepost && p.repostedPostId)) {
        delete p.isBookmarked;
        delete p.isBookmarkedByMe;
        delete p.isLikedByMe;
        delete p.isRepostedByMe;
        firestorePosts.push(p);
      }
    });

    const firestoreComments: any[] = [];
    commentsSnap.forEach((d: any) => {
      const raw = d.data();
      if (!raw) return;
      const cId = String(raw.id || d.id);
      if (deletedCommentSet.has(cId) || (raw.parentId && deletedCommentSet.has(String(raw.parentId)))) return;
      if (raw.postId && deletedPostSet.has(String(raw.postId))) return;
      const cNick = normalizeServerHandle(raw.authorNickname);
      const cAuthorId = String(raw.authorId || '');
      if ((cAuthorId && fsDeletedIds.has(cAuthorId)) || (cNick && fsDeletedNicks.has(cNick))) return;
      const c = { ...raw, id: cId };
      if (!isDemoComment(c)) {
        delete c.isLikedByMe;
        firestoreComments.push(c);
      }
    });

    if (firestoreComments.length > 0) {
      activeDb.comments = mergeComments(activeDb.comments || [], firestoreComments);
    }
    if (firestorePosts.length > 0) {
      activeDb.posts = mergePosts(activeDb.posts || [], firestorePosts);
    }

    const firestoreFollows: any[] = [];
    followsSnap.forEach((d: any) => {
      const data = d.data();
      if (data && data.followerNickname && data.followingNickname) {
        firestoreFollows.push({ ...data, id: data.id || d.id });
      }
    });
    if (firestoreFollows.length > 0) {
      activeDb.follows = mergeFollows(activeDb.follows || [], firestoreFollows);
    }

    const firestoreVerifs: any[] = [];
    verifsSnap.forEach((d: any) => {
      const data = d.data();
      if (data && data.id && !isDemoVerificationRequest(data)) {
        firestoreVerifs.push(data);
      }
    });
    if (firestoreVerifs.length > 0) {
      activeDb.verificationRequests = mergeVerificationRequests(activeDb.verificationRequests || [], firestoreVerifs);
    }

    const firestoreMp: any[] = [];
    mpSnap.forEach((d: any) => {
      const data = d.data();
      if (data && data.id && !isDemoMarketplaceItem(data)) {
        firestoreMp.push(data);
      }
    });
    if (firestoreMp.length > 0) {
      activeDb.marketplaceItems = mergeMarketplaceItems(activeDb.marketplaceItems || [], firestoreMp);
    }

    const firestoreDms: any[] = [];
    dmsSnap.forEach((d: any) => {
      const raw = d.data();
      if (!raw) return;
      const msg = { ...raw, id: raw.id || d.id };
      if (!isDemoDirectMessage(msg)) {
        firestoreDms.push(msg);
      }
    });
    if (firestoreDms.length > 0) {
      activeDb.directMessages = mergeDirectMessages(activeDb.directMessages || [], firestoreDms);
    }

    const fsNotifBuckets: Record<string, any[]> = {};
    notifsSnap.forEach((d: any) => {
      const raw = d.data();
      if (!raw) return;
      const nId = String(raw.id || d.id);
      if (raw.type === 'DIRECT_MESSAGE' || nId.startsWith('notif_dm_')) return;
      const rawTarget = String(raw.targetNickname || '').trim();
      if (!rawTarget) return;
      const bucket = rawTarget === '__all__' ? '__all__' : rawTarget.toLowerCase().replace(/^@+/, '');
      if (!bucket) return;
      if (!fsNotifBuckets[bucket]) fsNotifBuckets[bucket] = [];
      fsNotifBuckets[bucket].push({ ...raw, id: nId, targetNickname: bucket });
    });
    if (Object.keys(fsNotifBuckets).length > 0) {
      const currentNotifs = activeDb.notifications || {};
      const nextNotifs: Record<string, any[]> = { ...currentNotifs };
      for (const [bucket, incomingList] of Object.entries(fsNotifBuckets)) {
        nextNotifs[bucket] = mergeNotifications(currentNotifs[bucket] || [], incomingList);
      }
      activeDb.notifications = nextNotifs;
    }

    reconcileSupersededHandlesInActiveDb();
    persistServerDb();
  } catch (err: any) {
    console.warn('[Firestore Sync] Notice:', err?.message || err);
  } finally {
    isFirestoreSyncRunning = false;
  }
}

if (!MAINTENANCE_MODE && !IS_ISOLATED_TEST_INSTANCE) {
  if ((activeDb.users || []).length <= 1 || (activeDb.posts || []).length === 0) {
    syncFirestoreToActiveDb().catch(() => {});
  }
  setInterval(() => {
    syncFirestoreToActiveDb().catch(() => {});
  }, 30 * 60 * 1000);
}

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

app.get('/api/auth/session', (req, res) => {
  const authed = authenticateSessionFromRequest(req);
  if (!authed) {
    return res.json({ success: true, authenticated: false, user: null });
  }
  return res.json({
    success: true,
    authenticated: true,
    user: sanitizeUserForApi(authed.user, authed.user),
    session: {
      expiresAt: authed.session.expiresAt,
      isAdmin: authed.session.isAdmin,
    },
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const trimmedUsername = String(username || '').trim();
    const trimmedPassword = String(password || '').trim();
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    if (!trimmedUsername) {
      return res.status(400).json({ success: false, error: 'Please enter your Username.' });
    }
    if (!trimmedPassword) {
      return res.status(400).json({ success: false, error: 'Please enter your password.' });
    }

    const cleanUsername = normalizeServerHandle(trimmedUsername);
    const lowerRawInput = trimmedUsername.toLowerCase();
    const looksLikeEmail = lowerRawInput.indexOf('@') > 0 && lowerRawInput.includes('.');

    const findMatch = (list: any[]) =>
      list.find((u: any) => {
        if (!u) return false;
        if (u.nickname && normalizeServerHandle(u.nickname) === cleanUsername) return true;
        if (looksLikeEmail && u.studentEmail && String(u.studentEmail).trim().toLowerCase() === lowerRawInput) return true;
        return false;
      });

    let matched = findMatch(activeDb.users || []);

    if (!matched && (activeDb as any).supersededUsernames && (activeDb as any).supersededUsernames[cleanUsername]) {
      const sup = (activeDb as any).supersededUsernames[cleanUsername];
      if (sup && sup.userId) {
        matched = (activeDb.users || []).find((u: any) => String(u.id) === String(sup.userId));
      }
    }

    if (!matched) {
      appendAuditLog({
        event: cleanUsername === 'modula' ? 'ADMIN_LOGIN_FAILED' : 'LOGIN_FAILED',
        actorId: 'unknown',
        actorNickname: `@${cleanUsername}`,
        actorIsAdmin: false,
        ip,
        userAgent,
        status: 'DENY',
        details: 'Account not found.',
      });
      return res.status(404).json({ success: false, error: 'Account not found. Please check your login details.' });
    }

    const isAdminTarget = Boolean(matched.isAdmin || String(matched.id) === 'usr_admin_modula');

    if (!verifyPassword(trimmedPassword, matched.passwordHash)) {
      appendAuditLog({
        event: isAdminTarget ? 'ADMIN_LOGIN_FAILED' : 'LOGIN_FAILED',
        actorId: String(matched.id),
        actorNickname: String(matched.nickname || `@${cleanUsername}`),
        actorIsAdmin: false,
        ip,
        userAgent,
        status: 'DENY',
        details: 'Invalid password.',
      });
      return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
    }

    if (matched.isBanned) {
      appendAuditLog({
        event: 'LOGIN_BLOCKED_BANNED',
        actorId: String(matched.id),
        actorNickname: String(matched.nickname || ''),
        actorIsAdmin: false,
        ip,
        userAgent,
        status: 'DENY',
        details: 'Banned account attempted login.',
      });
      return res.status(403).json({ success: false, error: 'This account has been suspended by administration.' });
    }

    if (matched.isApproved === false && !isAdminTarget) {
      return res.status(403).json({
        success: false,
        error:
          'Registration Status: Your account approval is currently pending. Please check back shortly, or reach out to the Help Desk below for assistance.',
        isPending: true,
      });
    }

    const { sessionToken, sessionRecord } = createSessionForUser(req, res, matched);

    appendAuditLog({
      event: isAdminTarget ? 'ADMIN_LOGIN_SUCCESS' : 'LOGIN_SUCCESS',
      actorId: String(matched.id),
      actorNickname: String(matched.nickname || ''),
      actorIsAdmin: isAdminTarget,
      ip,
      userAgent,
      status: 'ALLOW',
      details: `Issued session ${sessionRecord.sessionId.slice(0, 12)}...`,
    });

    return res.json({
      success: true,
      user: sanitizeUserForApi(matched, matched),
      sessionToken,
    });
  } catch (err: any) {
    console.error('[Auth API] Login error:', err);
    return res.status(500).json({ success: false, error: 'Authentication service error' });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const body = req.body || {};
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    // Strictly reject any admin escalation attributes at registration
    if (body.isAdmin === true || String(body.accountType || '').toLowerCase() === 'admin') {
      appendAuditLog({
        event: 'PRIVILEGE_ESCALATION_BLOCKED',
        actorId: 'registration',
        actorNickname: String(body.nickname || 'unknown'),
        actorIsAdmin: false,
        ip,
        userAgent,
        status: 'DENY',
        details: 'Attempted admin role injection during registration.',
      });
      return res.status(403).json({
        success: false,
        error: 'Administrator accounts cannot be self-registered.',
      });
    }

    const rawNick = String(body.nickname || '').trim();
    const cleanNick = normalizeServerHandle(rawNick);
    if (!cleanNick || isReservedHandle(cleanNick)) {
      return res.status(400).json({
        success: false,
        error: 'This username is reserved or not permitted. Please choose another username.',
      });
    }
    const formattedNick = rawNick.startsWith('@') ? rawNick : `@${rawNick}`;

    const realName = String(body.realName || '').trim();
    const studentEmail = String(body.studentEmail || '').trim();
    const phone = String(body.emergencyHomePhone || '').trim();
    const password = String(body.password || '').trim();
    const requestedType = body.accountType === 'Guest' ? 'Guest' : 'Student';
    const department = requestedType === 'Student' ? String(body.department || '').trim() : '';
    const level = requestedType === 'Student' ? String(body.level || '').trim() : '';
    const matricNumber = requestedType === 'Student' ? normalizeMatricNumber(String(body.matricNumber || '')) : '';
    const avatarKey = String(body.avatarKey || '1').trim();

    if (!realName || !studentEmail || !phone || password.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all required registration details and a password (min 4 characters).',
      });
    }

    if (requestedType === 'Student' && (!department || !level || !matricNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Department, Level, and Matric Number are required for Student registration.',
      });
    }

    const existingNick = (activeDb.users || []).find(
      (u: any) => u && normalizeServerHandle(u.nickname) === cleanNick
    );
    if (existingNick) {
      return res.status(409).json({
        success: false,
        error: 'This Username is already taken. Please choose another username.',
      });
    }

    const existingEmail = (activeDb.users || []).find(
      (u: any) => u && String(u.studentEmail || '').trim().toLowerCase() === studentEmail.toLowerCase()
    );
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists.',
      });
    }

    if (requestedType === 'Student' && matricNumber) {
      const existingMatric = (activeDb.users || []).find(
        (u: any) => u && u.matricNumber && normalizeMatricNumber(u.matricNumber) === matricNumber
      );
      if (existingMatric) {
        return res.status(409).json({
          success: false,
          error: 'This matriculation number is already associated with an account.',
        });
      }
    }

    const nowIso = new Date().toISOString();
    const newId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const newUser: any = {
      id: newId,
      nickname: formattedNick,
      previousNicknames: [],
      accountType: requestedType,
      realName,
      realNameHidden: realName,
      studentEmail,
      emergencyHomePhone: phone,
      matricNumber,
      department,
      level,
      bio: requestedType === 'Guest' ? 'Guest Member on FUHSI Connect.' : `${department} Student at FUHSI.`,
      avatarKey,
      avatarUrl: '',
      badgeType: 'BLUE',
      badgeTitle: '',
      reputationScore: 100,
      isVerified: false,
      verificationStatus: 'unverified',
      isApproved: true,
      isDeclined: false,
      isAdmin: false,
      searchDiscoverable: true,
      allowDirectMessagesFrom: 'everyone',
      defaultPostAudience: 'everyone',
      isPrivate: false,
      showActiveStatus: true,
      isOnline: true,
      lastActiveAt: nowIso,
      joinedDate: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      sessionVersion: 1,
      passwordHash: hashPassword(password),
    };

    activeDb.deletedUserNicknames = (activeDb.deletedUserNicknames || []).filter(
      (n: string) => normalizeServerHandle(n) !== cleanNick
    );
    activeDb.deletedUserIds = (activeDb.deletedUserIds || []).filter((id: string) => id !== newId);

    activeDb.users.push(newUser);
    persistServerDb();

    const { sessionToken } = createSessionForUser(req, res, newUser);
    appendAuditLog({
      event: 'REGISTER_SUCCESS',
      actorId: newId,
      actorNickname: formattedNick,
      actorIsAdmin: false,
      ip,
      userAgent,
      status: 'ALLOW',
      details: `Registered new ${requestedType} account.`,
    });

    return res.status(201).json({
      success: true,
      user: sanitizeUserForApi(newUser, newUser),
      sessionToken,
    });
  } catch (err: any) {
    console.error('[Register API] Error:', err);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

app.post('/api/auth/logout', (req: AuthedRequest, res) => {
  const authed = authenticateSessionFromRequest(req);
  if (authed) {
    authed.session.revokedAt = Date.now();
    sessionsMap.set(authed.session.sessionId, authed.session);
    persistSessionsToDisk();

    activeDb.users = (activeDb.users || []).map((u: any) =>
      u && String(u.id) === String(authed.user.id)
        ? { ...u, isOnline: false, lastActiveAt: new Date().toISOString() }
        : u
    );
    persistServerDb();

    appendAuditLog({
      event: authed.user.isAdmin ? 'ADMIN_LOGOUT' : 'LOGOUT',
      actorId: String(authed.user.id),
      actorNickname: String(authed.user.nickname || ''),
      actorIsAdmin: Boolean(authed.user.isAdmin),
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: 'INFO',
      details: `Session ${authed.session.sessionId.slice(0, 12)}... revoked on logout.`,
    });
  }
  clearSessionCookie(req, res);
  return res.json({ success: true });
});

app.post('/api/auth/logout-all', requireAuth, (req: AuthedRequest, res) => {
  const user = req.sessionUser!;
  const revokedCount = revokeAllSessionsForUser(String(user.id), 'User requested logout-all-sessions');
  clearSessionCookie(req, res);
  return res.json({ success: true, revokedCount });
});

// Password recovery: strictly non-admin only; never exposes PII or bypasses reset tokens
app.post('/api/auth/forgot-identify', (req, res) => {
  try {
    const cleanInput = String(req.body?.identifier || '').trim().toLowerCase();
    const cleanNick = cleanInput.replace(/^@+/, '');
    if (!cleanInput) {
      return res.status(400).json({ success: false, error: 'Please enter your Username or Email Address.' });
    }

    if (cleanNick === 'modula' || cleanInput === 'usr_admin_modula') {
      return res.status(403).json({
        success: false,
        error: 'Administrator password recovery cannot be performed via self-service. Rotate via authenticated Admin Console or server environment.',
      });
    }

    const matched = (activeDb.users || []).find((u: any) => {
      if (!u || u.isAdmin || String(u.id) === 'usr_admin_modula') return false;
      const uEmail = String(u.studentEmail || '').trim().toLowerCase();
      const uNick = normalizeServerHandle(u.nickname);
      return uEmail === cleanInput || uNick === cleanNick;
    });

    if (!matched) {
      return res.status(404).json({
        success: false,
        error: 'No student/guest account found matching that Username or Email Address.',
      });
    }

    if (matched.isAdmin || String(matched.id) === 'usr_admin_modula') {
      return res.status(403).json({
        success: false,
        error: 'Administrator password recovery is disabled here.',
      });
    }

    return res.json({
      success: true,
      user: {
        nickname: matched.nickname,
        accountType: matched.accountType === 'Guest' ? 'Guest' : 'Student',
        requiresMatric: Boolean(matched.accountType !== 'Guest' && matched.matricNumber),
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed looking up account' });
  }
});

interface ResetSessionEntry {
  userId: string;
  identifier: string;
  token: string;
  expiresAt: number;
  createdAt: number;
}
const activeResetSessions = new Map<string, ResetSessionEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, session] of activeResetSessions.entries()) {
    if (now > session.expiresAt) {
      activeResetSessions.delete(key);
    }
  }
}, 60000);

app.post('/api/auth/verify-reset-identity', (req, res) => {
  try {
    const { identifier, phone, matricNumber, matricNo, matricOrName, fullName } = req.body || {};
    const effectiveMatric = matricNo || matricNumber || matricOrName;
    const effectiveFullName = fullName || matricOrName || effectiveMatric;
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    if (!identifier) {
      return res.status(400).json({ success: false, error: 'Registered Email Address or Username is required.' });
    }

    const cleanInput = String(identifier).trim().toLowerCase();
    const cleanNick = cleanInput.replace(/^@+/, '');

    if (cleanNick === 'modula' || cleanInput === 'usr_admin_modula') {
      appendAuditLog({
        event: 'ADMIN_RESET_BLOCKED',
        actorId: 'anonymous',
        actorNickname: '@modula',
        actorIsAdmin: false,
        ip,
        userAgent,
        status: 'DENY',
        details: 'Attempted self-service identity verification against @modula.',
      });
      return res.status(403).json({
        success: false,
        error: 'Administrator password recovery is restricted.',
      });
    }

    const matchedUser = (activeDb.users || []).find((u: any) => {
      if (!u || isDemoUser(u) || isDemoNickname(u.nickname)) return false;
      const uEmail = String(u.studentEmail || '').trim().toLowerCase();
      const uNick = normalizeServerHandle(u.nickname);
      return uEmail === cleanInput || uNick === cleanNick;
    });

    if (!matchedUser) {
      return res.status(404).json({
        success: false,
        error: 'No registered account found with the provided details.',
      });
    }

    if (matchedUser.isAdmin || String(matchedUser.id) === 'usr_admin_modula') {
      return res.status(403).json({
        success: false,
        error: 'Administrator password recovery is restricted.',
      });
    }

    const normalizePhoneDigits = (raw: string) => {
      const digits = String(raw || '').replace(/\D/g, '');
      if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`;
      return digits;
    };
    const registeredPhone = normalizePhoneDigits(matchedUser.emergencyHomePhone || matchedUser.phoneNumber || '');
    const enteredPhone = normalizePhoneDigits(phone || '');
    if (!registeredPhone || !enteredPhone || registeredPhone !== enteredPhone) {
      return res.status(401).json({
        success: false,
        error: 'The registered phone number provided does not match our account records.',
      });
    }

    const isGuestAccount = String(matchedUser.accountType || '').toLowerCase() === 'guest';
    if (!isGuestAccount) {
      if (matchedUser.matricNumber) {
        const registeredMatric = normalizeMatricNumber(matchedUser.matricNumber);
        const enteredMatric = normalizeMatricNumber(String(effectiveMatric || ''));
        if (!enteredMatric || enteredMatric !== registeredMatric) {
          return res.status(401).json({
            success: false,
            error: 'The Matric No. provided does not match our account records.',
          });
        }
      } else if (matchedUser.realName) {
        const regName = String(matchedUser.realName).trim().toLowerCase();
        const entName = String(effectiveFullName || '').trim().toLowerCase();
        if (!entName || entName !== regName) {
          return res.status(401).json({
            success: false,
            error: 'The Full Name provided does not match our account records.',
          });
        }
      }
    }

    const token = `rst_${crypto.randomBytes(24).toString('hex')}`;
    const sessionKey = String(matchedUser.id);
    activeResetSessions.set(sessionKey, {
      userId: matchedUser.id,
      identifier: matchedUser.studentEmail || matchedUser.nickname,
      token,
      expiresAt: Date.now() + 15 * 60 * 1000,
      createdAt: Date.now(),
    });

    return res.json({
      success: true,
      message: 'Account ownership verified successfully.',
      resetToken: token,
      user: {
        nickname: matchedUser.nickname,
        accountType: matchedUser.accountType || 'Student',
      },
    });
  } catch (error: any) {
    console.error('[Verify Reset Identity Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error verifying account ownership.' });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { identifier, resetToken, token, newPassword } = req.body || {};
    const effectiveToken = String(resetToken || token || '').trim();
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    if (!identifier || !newPassword || !effectiveToken) {
      return res.status(400).json({
        success: false,
        error: 'Account identifier, valid reset verification token, and new password are required.',
      });
    }

    const cleanPassword = String(newPassword).trim();
    if (cleanPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters.' });
    }

    const cleanInput = String(identifier).trim().toLowerCase();
    const cleanNick = cleanInput.replace(/^@+/, '');

    if (cleanNick === 'modula' || cleanInput === 'usr_admin_modula') {
      return res.status(403).json({
        success: false,
        error: 'Administrator password recovery cannot be performed via this endpoint.',
      });
    }

    const userIndex = (activeDb.users || []).findIndex((u: any) => {
      const uEmail = String(u.studentEmail || '').trim().toLowerCase();
      const uNick = normalizeServerHandle(u.nickname);
      return uEmail === cleanInput || uNick === cleanNick;
    });

    if (userIndex === -1) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const matchedUser = activeDb.users[userIndex];
    if (matchedUser.isAdmin || String(matchedUser.id) === 'usr_admin_modula') {
      return res.status(403).json({ success: false, error: 'Administrator password recovery is disabled here.' });
    }

    const sessionKey = String(matchedUser.id);
    const resetSession = activeResetSessions.get(sessionKey);

    if (!resetSession || resetSession.token !== effectiveToken) {
      appendAuditLog({
        event: 'PASSWORD_RESET_INVALID_TOKEN',
        actorId: String(matchedUser.id),
        actorNickname: String(matchedUser.nickname || ''),
        actorIsAdmin: false,
        ip,
        userAgent,
        status: 'DENY',
        details: 'Missing or mismatched password reset token.',
      });
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired password reset session. Please verify your details again.',
      });
    }

    if (Date.now() > resetSession.expiresAt) {
      activeResetSessions.delete(sessionKey);
      return res.status(400).json({
        success: false,
        error: 'Password reset session has expired. Please verify your details again.',
      });
    }

    activeDb.users[userIndex] = {
      ...matchedUser,
      passwordHash: hashPassword(cleanPassword),
      sessionVersion: (Number(matchedUser.sessionVersion) || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    delete activeDb.users[userIndex].password;
    delete activeDb.users[userIndex].savedPassword;

    revokeAllSessionsForUser(String(matchedUser.id), 'Password reset completed');
    activeResetSessions.delete(sessionKey);
    persistServerDb();

    appendAuditLog({
      event: 'PASSWORD_RESET_SUCCESS',
      actorId: String(matchedUser.id),
      actorNickname: String(matchedUser.nickname || ''),
      actorIsAdmin: false,
      ip,
      userAgent,
      status: 'INFO',
      details: 'Password reset via verified identity token; prior sessions revoked.',
    });

    return res.json({
      success: true,
      message: 'Password reset successfully! Your new password is now active.',
    });
  } catch (error: any) {
    console.error('[Password Reset Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error resetting password.' });
  }
});

// ============================================================================
// ADMIN SECURITY CONSOLE ENDPOINTS
// ============================================================================

app.get('/api/admin/audit-logs', requireAdmin, (_req: AuthedRequest, res) => {
  const now = Date.now();
  const activeSessions = Array.from(sessionsMap.values())
    .filter((s) => !s.revokedAt && s.expiresAt > now)
    .map((s) => ({
      sessionIdPrefix: s.sessionId.slice(0, 12),
      userId: s.userId,
      isAdmin: s.isAdmin,
      createdAt: new Date(s.createdAt).toISOString(),
      expiresAt: new Date(s.expiresAt).toISOString(),
      ip: s.ip || '',
      userAgent: s.userAgent || '',
    }));

  return res.json({
    success: true,
    logs: [...auditLogs].reverse().slice(0, 300),
    activeSessions,
  });
});

app.post('/api/admin/rotate-password', requireAdmin, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const modIdx = (activeDb.users || []).findIndex((u: any) => String(u?.id) === 'usr_admin_modula');
  if (modIdx === -1) {
    return res.status(404).json({ success: false, error: 'Admin account not found.' });
  }

  const modUser = activeDb.users[modIdx];
  if (!verifyPassword(String(currentPassword || '').trim(), modUser.passwordHash)) {
    appendAuditLog({
      event: 'ADMIN_PASSWORD_ROTATE_FAILED',
      actorId: 'usr_admin_modula',
      actorNickname: '@modula',
      actorIsAdmin: true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: 'DENY',
      details: 'Incorrect current password supplied to password rotation endpoint.',
    });
    return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
  }

  const cleanNew = String(newPassword || '').trim();
  if (cleanNew.length < 10) {
    return res.status(400).json({
      success: false,
      error: 'New administrator password must be at least 10 characters.',
    });
  }

  const nowIso = new Date().toISOString();
  activeDb.users[modIdx] = {
    ...modUser,
    passwordHash: hashPassword(cleanNew),
    sessionVersion: (Number(modUser.sessionVersion) || 1) + 1,
    securityRotatedAt: nowIso,
    updatedAt: nowIso,
  };
  delete activeDb.users[modIdx].password;
  delete activeDb.users[modIdx].savedPassword;

  revokeAllSessionsForUser('usr_admin_modula', 'Admin rotated password');
  persistServerDb();
  clearSessionCookie(req, res);

  appendAuditLog({
    event: 'ADMIN_PASSWORD_ROTATED',
    actorId: 'usr_admin_modula',
    actorNickname: '@modula',
    actorIsAdmin: true,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    status: 'INFO',
    details: 'Administrator password rotated and all active admin sessions revoked.',
  });

  return res.json({
    success: true,
    reauthRequired: true,
    message: 'Admin password rotated and all sessions revoked. Please log in with your new password.',
  });
});

app.post('/api/admin/users/:userId/reset-password', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const rawUserId = String(req.params.userId || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();
    if (!rawUserId) {
      return res.status(400).json({ success: false, error: 'User ID is required.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'Temporary password must be at least 4 characters.' });
    }

    const idx = (activeDb.users || []).findIndex((u: any) => u && String(u.id) === rawUserId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Student/guest account not found.' });
    }

    const target = activeDb.users[idx];
    if (target.isAdmin || String(target.id) === 'usr_admin_modula' || normalizeServerHandle(target.nickname) === 'modula') {
      return res.status(403).json({ success: false, error: 'Use Rotate Password for Administrator account.' });
    }

    activeDb.users[idx] = {
      ...target,
      passwordHash: hashPassword(newPassword),
      sessionVersion: (Number(target.sessionVersion) || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    delete activeDb.users[idx].password;
    delete activeDb.users[idx].savedPassword;

    revokeAllSessionsForUser(String(target.id), 'Admin issued temporary password reset');
    persistServerDb();

    appendAuditLog({
      event: 'ADMIN_RESET_USER_PASSWORD',
      actorId: String(req.sessionUser?.id || 'usr_admin_modula'),
      actorNickname: String(req.sessionUser?.nickname || '@modula'),
      actorIsAdmin: true,
      targetId: String(target.id),
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: 'INFO',
      details: `Admin set a new password for ${target.nickname || target.id} and revoked prior sessions.`,
    });

    return res.json({
      success: true,
      message: `Password updated for ${target.nickname || target.id}.`,
    });
  } catch (err: any) {
    console.error('[Admin Reset User Password] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reset user password.' });
  }
});

// ============================================================================
// CENTRAL DATABASE & PROTECTED DOMAIN ENDPOINTS
// ============================================================================

app.get('/api/db', requireAuth, (req: AuthedRequest, res) => {
  return res.json({
    success: true,
    db: sanitizeDbForCaller(activeDb, req.sessionUser),
  });
});

let lastPresencePersistTime = 0;

app.post('/api/presence', requireAuth, (req: AuthedRequest, res) => {
  try {
    const caller = req.sessionUser!;
    const { isOnline, lastActiveAt, showActiveStatus } = req.body || {};
    const requestedId = req.body?.userId ? String(req.body.userId).trim() : '';

    if (requestedId && requestedId !== String(caller.id) && !caller.isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot update another user presence.' });
    }

    const targetId = caller.isAdmin && requestedId ? requestedId : String(caller.id);
    const nowIso = lastActiveAt || new Date().toISOString();
    const incomingMs = Date.parse(nowIso) || Date.now();
    let updated = false;
    let statusFlipped = false;

    activeDb.users = (activeDb.users || []).map((u: any) => {
      if (!u) return u;
      if (String(u.id || '') === targetId) {
        const existingMs = u.lastActiveAt ? Date.parse(u.lastActiveAt) || 0 : 0;
        if (incomingMs >= existingMs || isOnline === false) {
          updated = true;
          if (u.isOnline !== Boolean(isOnline)) statusFlipped = true;
          return {
            ...u,
            isOnline: isOnline !== undefined ? Boolean(isOnline) : true,
            lastActiveAt: incomingMs >= existingMs ? nowIso : u.lastActiveAt || nowIso,
            ...(showActiveStatus !== undefined ? { showActiveStatus: Boolean(showActiveStatus) } : {}),
          };
        }
      }
      return u;
    });

    if (updated && (statusFlipped || Date.now() - lastPresencePersistTime > 15000)) {
      lastPresencePersistTime = Date.now();
      persistServerDb();
    }

    return res.json({ success: true, updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Presence error' });
  }
});

app.post('/api/users/change-username', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caller = req.sessionUser!;
    const { userId, newNickname, oldNickname, previousNicknames: incomingPrevNicks, avatarKey, avatarUrl } =
      req.body || {};

    const targetUserId = String(userId || caller.id);
    if (!caller.isAdmin && targetUserId !== String(caller.id)) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot modify another user handle.' });
    }

    if (!newNickname) {
      return res.status(400).json({ success: false, error: 'New username is required' });
    }

    const rawNew = String(newNickname).trim();
    const cleanNew = normalizeServerHandle(rawNew);
    const cleanOld = normalizeServerHandle(oldNickname);
    const formattedNew = rawNew.startsWith('@') ? rawNew : `@${rawNew}`;

    if (!cleanNew) {
      return res.status(400).json({ success: false, error: 'Invalid username' });
    }

    if (targetUserId !== 'usr_admin_modula' && isReservedHandle(cleanNew)) {
      return res.status(400).json({ success: false, error: 'This username is reserved or not permitted.' });
    }

    const userIndex = (activeDb.users || []).findIndex((u: any) => u && String(u.id) === targetUserId);
    if (userIndex === -1) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    const existingOther = (activeDb.users || []).find((u: any) => {
      if (!u || !u.nickname) return false;
      const uId = String(u.id || '');
      const uNick = normalizeServerHandle(u.nickname);
      return uId !== targetUserId && uNick === cleanNew;
    });

    if (existingOther) {
      return res.status(409).json({ success: false, error: `The handle "${formattedNew}" is already taken.` });
    }

    const currentUser = activeDb.users[userIndex];
    const currentNickClean = normalizeServerHandle(currentUser.nickname);
    const previousNickClean = cleanOld || currentNickClean;

    const prevListRaw = [
      ...(Array.isArray(currentUser.previousNicknames) ? currentUser.previousNicknames : []),
      ...(Array.isArray(incomingPrevNicks) ? incomingPrevNicks : []),
      currentUser.nickname,
      oldNickname,
    ];
    const prevSet = new Set<string>();
    prevListRaw.forEach((n) => {
      const clean = normalizeServerHandle(n);
      if (clean && clean !== cleanNew) prevSet.add(clean);
    });
    const nextPreviousNicknames = Array.from(prevSet).map((c) => `@${c}`);

    const nowIso = new Date().toISOString();
    activeDb.users[userIndex] = {
      ...currentUser,
      nickname: formattedNew,
      previousNicknames: nextPreviousNicknames,
      ...(avatarKey !== undefined ? { avatarKey } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      updatedAt: nowIso,
    };

    const cascadeResult = cascadeUsernameChangeInActiveDb({
      userId: targetUserId,
      oldAliases: [previousNickClean, currentNickClean, ...Array.from(prevSet)],
      newNickname: formattedNew,
      nowIso,
      avatarKey: avatarKey !== undefined ? avatarKey : currentUser.avatarKey,
      avatarUrl: avatarUrl !== undefined ? avatarUrl : currentUser.avatarUrl,
    });

    persistServerDb();

    return res.json({
      success: true,
      user: sanitizeUserForApi(activeDb.users[userIndex], caller),
      updatedPostsCount: cascadeResult.updatedPosts.length,
      updatedCommentsCount: cascadeResult.updatedComments.length,
      supersededUsernames: (activeDb as any).supersededUsernames || {},
    });
  } catch (err: any) {
    console.error('[Username Change] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update username centrally' });
  }
});

app.get('/api/users/:userId', requireAuth, (req: AuthedRequest, res) => {
  try {
    const rawId = String(req.params.userId || '');
    if (!rawId) return res.status(400).json({ success: false, error: 'User ID is required' });

    const matched = (activeDb.users || []).find((u: any) => u && String(u.id) === rawId);
    if (!matched) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.json({
      success: true,
      user: sanitizeUserForApi(matched, req.sessionUser),
    });
  } catch {
    return res.status(500).json({ success: false, error: 'User lookup error' });
  }
});

app.post('/api/avatar/upload', requireAuth, (req: AuthedRequest, res) => {
  try {
    const caller = req.sessionUser!;
    const { userId, avatarDataUrl } = req.body || {};
    const targetId = String(userId || caller.id);

    if (!caller.isAdmin && targetId !== String(caller.id)) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot modify another user avatar.' });
    }
    if (targetId === 'usr_admin_modula' && String(caller.id) !== 'usr_admin_modula') {
      return res.status(403).json({ success: false, error: 'Forbidden.' });
    }

    const safeFilename = targetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const avatarFilePath = path.join(AVATARS_DIR, `${safeFilename}.jpg`);

    if (!avatarDataUrl || String(avatarDataUrl).trim() === '') {
      if (fs.existsSync(avatarFilePath)) {
        try {
          fs.unlinkSync(avatarFilePath);
        } catch {}
      }
      activeDb.users = (activeDb.users || []).map((u: any) =>
        u && String(u.id) === targetId ? { ...u, avatarUrl: '', updatedAt: new Date().toISOString() } : u
      );
      persistServerDb();
      return res.json({ success: true, avatarUrl: '' });
    }

    const rawDataUrl = String(avatarDataUrl);
    if (!rawDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'Invalid avatar image format.' });
    }

    const base64Data = rawDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(avatarFilePath, buffer);

    activeDb.users = (activeDb.users || []).map((u: any) =>
      u && String(u.id) === targetId
        ? { ...u, avatarUrl: rawDataUrl, updatedAt: new Date().toISOString() }
        : u
    );
    persistServerDb();

    return res.json({
      success: true,
      avatarUrl: rawDataUrl,
      fileUrl: `/api/avatar/${encodeURIComponent(safeFilename)}`,
    });
  } catch (err: any) {
    console.error('[Avatar API] Upload error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Avatar save failed' });
  }
});

app.get('/api/avatar/:userId', (req, res) => {
  try {
    const rawTarget = String(req.params.userId || '');
    const cleanNick = rawTarget.toLowerCase().replace(/^@/, '');
    const safeFilename = rawTarget.replace(/[^a-zA-Z0-9_-]/g, '_');
    const directPath = path.join(AVATARS_DIR, `${safeFilename}.jpg`);

    if (fs.existsSync(directPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return fs.createReadStream(directPath).pipe(res);
    }

    if (Array.isArray(activeDb.users)) {
      const user = activeDb.users.find((u: any) => {
        const uId = String(u.id || '');
        const uNick = normalizeServerHandle(u.nickname);
        return (
          uId === rawTarget ||
          safeFilename === uId.replace(/[^a-zA-Z0-9_-]/g, '_') ||
          (cleanNick && uNick === cleanNick)
        );
      });

      if (user && user.avatarUrl && String(user.avatarUrl).startsWith('data:image/')) {
        const base64Data = String(user.avatarUrl).replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        try {
          fs.writeFileSync(directPath, buffer);
        } catch {}
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }

    return res.status(404).send('Avatar not found');
  } catch {
    return res.status(500).send('Error retrieving avatar');
  }
});

app.delete('/api/avatar/:userId', requireAuth, (req: AuthedRequest, res) => {
  try {
    const caller = req.sessionUser!;
    const rawTarget = String(req.params.userId || '');
    if (!caller.isAdmin && rawTarget !== String(caller.id)) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot delete another user avatar.' });
    }

    const cleanNick = rawTarget.toLowerCase().replace(/^@/, '');
    const safeFilename = rawTarget.replace(/[^a-zA-Z0-9_-]/g, '_');
    const directPath = path.join(AVATARS_DIR, `${safeFilename}.jpg`);

    if (fs.existsSync(directPath)) {
      try {
        fs.unlinkSync(directPath);
      } catch {}
    }

    activeDb.users = (activeDb.users || []).map((u: any) => {
      const uId = String(u.id || '');
      const uNick = normalizeServerHandle(u.nickname);
      if (uId === rawTarget || (cleanNick && uNick === cleanNick)) {
        return { ...u, avatarUrl: '', updatedAt: new Date().toISOString() };
      }
      return u;
    });
    persistServerDb();

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function executePermanentUserDeletion(targetUserId: string, cleanNick: string, cleanEmail: string): void {
  const deletedIds = new Set((activeDb.deletedUserIds || []).map(String));
  const deletedNicks = new Set(
    (activeDb.deletedUserNicknames || []).map((n: string) => n.toLowerCase().replace(/^@/, ''))
  );
  if (targetUserId) deletedIds.add(targetUserId);
  if (cleanNick) deletedNicks.add(cleanNick);
  activeDb.deletedUserIds = Array.from(deletedIds);
  activeDb.deletedUserNicknames = Array.from(deletedNicks);

  activeDb.users = (activeDb.users || []).filter((u: any) => {
    const uId = String(u.id || '');
    const uNick = normalizeServerHandle(u.nickname);
    const uEmail = String(u.studentEmail || '').toLowerCase();
    if (targetUserId && uId === targetUserId) return false;
    if (cleanNick && uNick === cleanNick) return false;
    if (cleanEmail && uEmail === cleanEmail) return false;
    return true;
  });

  const deletedPostIdsSet = new Set<string>();
  activeDb.posts = (activeDb.posts || []).filter((p: any) => {
    const pNick = normalizeServerHandle(p.authorNickname);
    const pId = String(p.authorId || '');
    if ((targetUserId && pId === targetUserId) || (cleanNick && pNick === cleanNick)) {
      deletedPostIdsSet.add(String(p.id));
      return false;
    }
    return true;
  });
  activeDb.posts = (activeDb.posts || []).filter(
    (p: any) => !(p.repostedPostId && deletedPostIdsSet.has(String(p.repostedPostId)))
  );
  activeDb.comments = (activeDb.comments || []).filter((c: any) => {
    const cNick = normalizeServerHandle(c.authorNickname);
    const cId = String(c.authorId || '');
    return !(
      (targetUserId && cId === targetUserId) ||
      (cleanNick && cNick === cleanNick) ||
      (c.postId && deletedPostIdsSet.has(String(c.postId)))
    );
  });
  activeDb.marketplaceItems = (activeDb.marketplaceItems || []).filter((m: any) => {
    const mNick = normalizeServerHandle(m.sellerNickname);
    const mId = String(m.sellerId || '');
    return !((targetUserId && mId === targetUserId) || (cleanNick && mNick === cleanNick));
  });
  activeDb.pendingMarketplaceItems = (activeDb.pendingMarketplaceItems || []).filter((m: any) => {
    const mNick = normalizeServerHandle(m.sellerNickname);
    const mId = String(m.sellerId || '');
    return !((targetUserId && mId === targetUserId) || (cleanNick && mNick === cleanNick));
  });
  activeDb.directMessages = (activeDb.directMessages || []).filter((d: any) => {
    const sNick = normalizeServerHandle(d.senderNickname);
    const rNick = normalizeServerHandle(d.receiverNickname);
    return !(cleanNick && (sNick === cleanNick || rNick === cleanNick));
  });
  activeDb.chatConversations = (activeDb.chatConversations || []).filter((c: any) => {
    const oNick = normalizeServerHandle(c.otherUserNickname);
    return !(cleanNick && oNick === cleanNick);
  });
  activeDb.verificationRequests = (activeDb.verificationRequests || []).filter((v: any) => {
    const vNick = normalizeServerHandle(v.applicantNickname);
    return !(cleanNick && vNick === cleanNick);
  });
  activeDb.follows = (activeDb.follows || []).filter((f: any) => {
    const f1 = normalizeServerHandle(f.followerNickname);
    const f2 = normalizeServerHandle(f.followingNickname);
    return !(cleanNick && (f1 === cleanNick || f2 === cleanNick));
  });

  if (targetUserId) {
    revokeAllSessionsForUser(targetUserId, 'Account permanently deleted');
  }
  persistServerDb();
}

app.post('/api/user/delete', requireAuth, (req: AuthedRequest, res) => {
  try {
    const caller = req.sessionUser!;
    const { userId, nickname, studentEmail } = req.body || {};
    const rawId = userId ? String(userId).trim() : String(caller.id);
    const cleanNick = nickname ? normalizeServerHandle(nickname) : normalizeServerHandle(caller.nickname);
    const cleanEmail = studentEmail ? String(studentEmail).trim().toLowerCase() : '';

    if (rawId === 'usr_admin_modula' || cleanNick === 'modula') {
      return res.status(400).json({ success: false, error: 'Platform administrator (@modula) cannot be deleted.' });
    }

    if (!caller.isAdmin && rawId !== String(caller.id)) {
      appendAuditLog({
        event: 'UNAUTHORIZED_ACCOUNT_DELETE_BLOCKED',
        actorId: String(caller.id),
        actorNickname: String(caller.nickname || ''),
        actorIsAdmin: false,
        targetId: rawId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        status: 'DENY',
        details: 'Student attempted to delete another account.',
      });
      return res.status(403).json({ success: false, error: 'Forbidden: cannot delete another user account.' });
    }

    executePermanentUserDeletion(rawId, cleanNick, cleanEmail);
    if (!caller.isAdmin) {
      clearSessionCookie(req, res);
    }

    appendAuditLog({
      event: 'ACCOUNT_DELETED',
      actorId: String(caller.id),
      actorNickname: String(caller.nickname || ''),
      actorIsAdmin: Boolean(caller.isAdmin),
      targetId: rawId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: 'INFO',
      details: `Account ${rawId} (@${cleanNick}) permanently deleted.`,
    });

    return res.json({ success: true, deletedUserId: rawId, deletedNickname: cleanNick });
  } catch (err: any) {
    console.error('[Server Account Deletion] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:userId', requireAuth, (req: AuthedRequest, res) => {
  const caller = req.sessionUser!;
  const rawId = String(req.params.userId || '').trim();
  if (!rawId) return res.status(400).json({ success: false, error: 'User ID required.' });

  if (rawId === 'usr_admin_modula') {
    return res.status(400).json({ success: false, error: 'Platform administrator (@modula) cannot be deleted.' });
  }
  if (!caller.isAdmin && rawId !== String(caller.id)) {
    return res.status(403).json({ success: false, error: 'Forbidden: cannot delete another user account.' });
  }

  const targetUser = (activeDb.users || []).find((u: any) => String(u.id) === rawId);
  const cleanNick = targetUser ? normalizeServerHandle(targetUser.nickname) : '';
  const cleanEmail = targetUser?.studentEmail ? String(targetUser.studentEmail).toLowerCase() : '';
  executePermanentUserDeletion(rawId, cleanNick, cleanEmail);
  if (!caller.isAdmin) {
    clearSessionCookie(req, res);
  }
  return res.json({ success: true, deletedUserId: rawId });
});

// ============================================================================
// SERVER-SIDE RBAC ENFORCED /api/db/sync
// ============================================================================

app.post('/api/db/sync', requireAuth, (req: AuthedRequest, res) => {
  try {
    const caller = req.sessionUser!;
    const isCallerAdmin = Boolean(caller.isAdmin && String(caller.id) === 'usr_admin_modula');
    const callerAliases = getUserAliasesSet(caller);
    const callerId = String(caller.id);
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    const rawBody = req.body || {};
    const updates = rawBody.updates && typeof rawBody.updates === 'object' ? rawBody.updates : rawBody;

    const rejectForbidden = (reason: string) => {
      appendAuditLog({
        event: 'PRIVILEGE_ESCALATION_BLOCKED',
        actorId: callerId,
        actorNickname: String(caller.nickname || ''),
        actorIsAdmin: isCallerAdmin,
        ip,
        userAgent,
        status: 'DENY',
        details: reason,
      });
      return res.status(403).json({ success: false, error: `Forbidden: ${reason}` });
    };

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid sync payload.' });
    }

    // Strict RBAC checks before applying any mutation for non-admin callers
    if (!isCallerAdmin) {
      if (
        updates.replaceUsers ||
        updates.replacePosts ||
        updates.replaceComments ||
        updates.replaceVerificationRequests ||
        updates.replaceReports ||
        updates.replaceVerifCandidates ||
        updates.replaceDirectMessages ||
        updates.replaceChatReports ||
        updates.replaceChatRestrictions ||
        updates.replaceMarketplaceItems ||
        updates.replacePendingMarketplaceItems
      ) {
        return rejectForbidden('Collection replacement operations require Administrator privileges.');
      }

      if (
        updates.verificationFee !== undefined ||
        updates.verifCandidates !== undefined ||
        updates.chatRestrictions !== undefined ||
        updates.sentEmails !== undefined ||
        updates.deletedUserIds !== undefined ||
        updates.deletedUserNicknames !== undefined ||
        updates.unDeleteUserIds !== undefined ||
        updates.unDeleteUserNicknames !== undefined
      ) {
        return rejectForbidden('Admin configuration and user deletion tombstones require Administrator privileges.');
      }

      if (Array.isArray(updates.users)) {
        for (const incoming of updates.users) {
          if (!incoming || typeof incoming !== 'object') continue;
          const inId = String(incoming.id || '').trim();
          const inNick = normalizeServerHandle(incoming.nickname);
          if (inId === 'usr_admin_modula' || inNick === 'modula') {
            return rejectForbidden('Cannot modify @modula administrator record.');
          }
          if (incoming.isAdmin === true || String(incoming.accountType || '').toLowerCase() === 'admin') {
            return rejectForbidden('Cannot self-assign or escalate Administrator privileges.');
          }
          const isSelf = (inId && inId === callerId) || (!inId && inNick && callerAliases.has(inNick));
          if (!isSelf) {
            return rejectForbidden('Students cannot modify or create other users via sync.');
          }
          // Verify caller is not escalating their own verification/badge/approval flags
          if (
            (incoming.isVerified !== undefined && Boolean(incoming.isVerified) !== Boolean(caller.isVerified)) ||
            (incoming.badgeType !== undefined && String(incoming.badgeType) !== String(caller.badgeType || 'NONE')) ||
            (incoming.badgeTitle !== undefined && String(incoming.badgeTitle) !== String(caller.badgeTitle || '')) ||
            (incoming.isApproved !== undefined && Boolean(incoming.isApproved) !== Boolean(caller.isApproved)) ||
            (incoming.isDeclined !== undefined && Boolean(incoming.isDeclined) !== Boolean(caller.isDeclined))
          ) {
            return rejectForbidden('Cannot self-modify verification badge or account approval status.');
          }
        }
      }

      if (Array.isArray(updates.deletedPostIds)) {
        for (const pid of updates.deletedPostIds) {
          const targetPost = (activeDb.posts || []).find((p: any) => p && String(p.id) === String(pid));
          if (targetPost) {
            const pAuthorId = String(targetPost.authorId || '');
            const pNick = normalizeServerHandle(targetPost.authorNickname);
            const owns = (pAuthorId && pAuthorId === callerId) || (pNick && callerAliases.has(pNick));
            if (!owns) {
              return rejectForbidden(`Cannot delete another student's post (${pid}).`);
            }
          }
        }
      }

      if (Array.isArray(updates.deletedCommentIds)) {
        for (const cid of updates.deletedCommentIds) {
          const targetComment = (activeDb.comments || []).find((c: any) => c && String(c.id) === String(cid));
          if (targetComment) {
            const cAuthorId = String(targetComment.authorId || '');
            const cNick = normalizeServerHandle(targetComment.authorNickname);
            const parentPost = (activeDb.posts || []).find((p: any) => p && String(p.id) === String(targetComment.postId));
            const ownsComment = (cAuthorId && cAuthorId === callerId) || (cNick && callerAliases.has(cNick));
            const ownsParentPost =
              parentPost &&
              ((parentPost.authorId && String(parentPost.authorId) === callerId) ||
                callerAliases.has(normalizeServerHandle(parentPost.authorNickname)));
            if (!ownsComment && !ownsParentPost) {
              return rejectForbidden(`Cannot delete another student's comment (${cid}).`);
            }
          }
        }
      }

      if (Array.isArray(updates.posts)) {
        for (const p of updates.posts) {
          if (!p || typeof p !== 'object') continue;
          const existingPost = (activeDb.posts || []).find((ep: any) => ep && String(ep.id) === String(p.id));
          if (!existingPost) {
            const pAuthorId = String(p.authorId || '').trim();
            const pNick = normalizeServerHandle(p.authorNickname);
            if ((pAuthorId && pAuthorId !== callerId) || (pNick && !callerAliases.has(pNick))) {
              return rejectForbidden('Cannot create posts impersonating another user.');
            }
          } else {
            const eAuthorId = String(existingPost.authorId || '').trim();
            const eNick = normalizeServerHandle(existingPost.authorNickname);
            const isAuthor = (eAuthorId && eAuthorId === callerId) || (eNick && callerAliases.has(eNick));
            if (!isAuthor) {
              // Non-authors cannot edit post content/author/quarantine status
              if (
                (p.content !== undefined && p.content !== existingPost.content) ||
                (p.authorId !== undefined && String(p.authorId) !== String(existingPost.authorId)) ||
                (p.authorNickname !== undefined &&
                  normalizeServerHandle(p.authorNickname) !== normalizeServerHandle(existingPost.authorNickname)) ||
                (p.isQuarantined !== undefined && Boolean(p.isQuarantined) !== Boolean(existingPost.isQuarantined))
              ) {
                return rejectForbidden('Cannot alter another student post content or moderation state.');
              }
            }
          }
        }
      }

      if (Array.isArray(updates.comments)) {
        for (const c of updates.comments) {
          if (!c || typeof c !== 'object') continue;
          const existingComment = (activeDb.comments || []).find((ec: any) => ec && String(ec.id) === String(c.id));
          if (!existingComment) {
            const cAuthorId = String(c.authorId || '').trim();
            const cNick = normalizeServerHandle(c.authorNickname);
            if ((cAuthorId && cAuthorId !== callerId) || (cNick && !callerAliases.has(cNick))) {
              return rejectForbidden('Cannot create comments impersonating another user.');
            }
          } else {
            const eAuthorId = String(existingComment.authorId || '').trim();
            const eNick = normalizeServerHandle(existingComment.authorNickname);
            const isAuthor = (eAuthorId && eAuthorId === callerId) || (eNick && callerAliases.has(eNick));
            if (!isAuthor && c.content !== undefined && c.content !== existingComment.content) {
              return rejectForbidden('Cannot alter another student comment content.');
            }
          }
        }
      }

      if (Array.isArray(updates.verificationRequests)) {
        for (const v of updates.verificationRequests) {
          if (!v) continue;
          if (v.status && v.status !== 'PENDING') {
            return rejectForbidden('Only Administrators can approve, decline, or revoke verification requests.');
          }
        }
      }

      if (Array.isArray(updates.directMessages)) {
        if (caller.accountType === 'Guest') {
          return rejectForbidden('Guest accounts do not have direct messaging access.');
        }
        for (const dm of updates.directMessages) {
          if (!dm) continue;
          const existingDm = (activeDb.directMessages || []).find((ed: any) => ed && String(ed.id) === String(dm.id));
          if (!existingDm) {
            const sNick = normalizeServerHandle(dm.senderNickname);
            const sId = String(dm.senderId || '').trim();
            if ((sId && sId !== callerId) || (sNick && !callerAliases.has(sNick))) {
              return rejectForbidden('Cannot send direct messages impersonating another user.');
            }
          }
        }
      }

      if (updates.notifications && typeof updates.notifications === 'object') {
        for (const [bucket, list] of Object.entries(updates.notifications)) {
          if (bucket === '__all__') {
            return rejectForbidden('Campus-wide __all__ broadcast notifications are restricted to Administrators.');
          }
          if (Array.isArray(list)) {
            for (const n of list as any[]) {
              if (n && (n.type === 'ADMIN' || n.type === 'OFFICIAL')) {
                return rejectForbidden('Official/Admin notification dispatch requires Administrator privileges.');
              }
            }
          }
        }
      }
    }

    let changed = false;

    // Admin deletion tombstones
    if (isCallerAdmin && (Array.isArray(updates.deletedUserIds) || Array.isArray(updates.deletedUserNicknames))) {
      const toDeleteIds = (updates.deletedUserIds || [])
        .map((id: any) => String(id))
        .filter((id: string) => id !== 'usr_admin_modula');
      const toDeleteNicks = (updates.deletedUserNicknames || [])
        .map((n: any) => normalizeServerHandle(n))
        .filter((n: string) => n !== 'modula');

      for (let i = 0; i < Math.max(toDeleteIds.length, toDeleteNicks.length); i++) {
        executePermanentUserDeletion(toDeleteIds[i] || '', toDeleteNicks[i] || '', '');
      }
      changed = true;
    }

    if (isCallerAdmin && Array.isArray(updates.unDeleteUserNicknames)) {
      const unNicks = new Set(updates.unDeleteUserNicknames.map((n: any) => normalizeServerHandle(n)));
      activeDb.deletedUserNicknames = (activeDb.deletedUserNicknames || []).filter(
        (n: string) => !unNicks.has(normalizeServerHandle(n))
      );
      changed = true;
    }
    if (isCallerAdmin && Array.isArray(updates.unDeleteUserIds)) {
      const unIds = new Set(updates.unDeleteUserIds.map((id: any) => String(id)));
      activeDb.deletedUserIds = (activeDb.deletedUserIds || []).filter((id: string) => !unIds.has(String(id)));
      changed = true;
    }

    // Deleted posts
    if (Array.isArray(updates.deletedPostIds) && updates.deletedPostIds.length > 0) {
      const toDeletePostIds = new Set(updates.deletedPostIds.map((id: any) => String(id)));
      const allDeletedPostIds = new Set([...(activeDb.deletedPostIds || []), ...toDeletePostIds]);
      activeDb.deletedPostIds = Array.from(allDeletedPostIds);
      activeDb.posts = (activeDb.posts || []).filter(
        (p: any) => !allDeletedPostIds.has(String(p.id)) && !toDeletePostIds.has(String(p.repostedPostId))
      );
      activeDb.comments = (activeDb.comments || []).filter((c: any) => !allDeletedPostIds.has(String(c.postId)));
      changed = true;
    }

    // Deleted comments + recalculate top-level counts
    if (Array.isArray(updates.deletedCommentIds) && updates.deletedCommentIds.length > 0) {
      const toDeleteCommentIds = new Set(updates.deletedCommentIds.map((id: any) => String(id)));
      const allDeletedCommentIds = new Set([
        ...((activeDb as any).deletedCommentIds || []),
        ...toDeleteCommentIds,
      ]);
      (activeDb as any).deletedCommentIds = Array.from(allDeletedCommentIds);
      activeDb.comments = (activeDb.comments || []).filter(
        (c: any) => !allDeletedCommentIds.has(String(c.id)) && !allDeletedCommentIds.has(String(c.parentId))
      );
      const countsMap = new Map<string, number>();
      for (const c of activeDb.comments || []) {
        if (c && c.postId && !c.parentId) {
          countsMap.set(String(c.postId), (countsMap.get(String(c.postId)) || 0) + 1);
        }
      }
      activeDb.posts = (activeDb.posts || []).map((p: any) => {
        const nextCount = countsMap.get(String(p.id)) || 0;
        return { ...p, commentsCount: nextCount, commentCount: nextCount };
      });
      changed = true;
    }

    // Users merge
    if (Array.isArray(updates.users)) {
      const deletedIds = new Set((activeDb.deletedUserIds || []).map((id: any) => String(id)));
      const deletedNicks = new Set((activeDb.deletedUserNicknames || []).map((n: any) => normalizeServerHandle(n)));
      const userMap = new Map<string, any>();
      for (const u of activeDb.users || []) {
        if (u?.id) userMap.set(String(u.id), u);
      }

      for (const rawIncoming of updates.users) {
        if (!rawIncoming) continue;
        const incoming = stripPlaintextPasswordsFromUser(rawIncoming);
        const inId = String(incoming.id || '').trim();
        const inNick = normalizeServerHandle(incoming.nickname);
        if (deletedIds.has(inId) || deletedNicks.has(inNick)) continue;

        const existing =
          (inId ? userMap.get(inId) : undefined) ||
          (inNick
            ? Array.from(userMap.values()).find((u: any) => normalizeServerHandle(u?.nickname) === inNick)
            : undefined);
        if (existing) {
          let authoritativeNick = existing.nickname;
          const exNickClean = normalizeServerHandle(existing.nickname);
          if (incoming.nickname && incoming.nickname !== existing.nickname && !isReservedHandle(inNick)) {
            const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
            const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
            if (incomingTime > existingTime) {
              authoritativeNick = incoming.nickname;
            }
          }

          userMap.set(existing.id, {
            ...existing,
            ...incoming,
            id: existing.id,
            nickname: authoritativeNick,
            // Server authoritative credentials & RBAC
            passwordHash: existing.passwordHash,
            sessionVersion: existing.sessionVersion || 1,
            securityRotatedAt: existing.securityRotatedAt,
            isAdmin: existing.id === 'usr_admin_modula' ? true : Boolean(existing.isAdmin),
            accountType: existing.id === 'usr_admin_modula' ? 'Admin' : incoming.accountType || existing.accountType,
            isApproved: isCallerAdmin && incoming.isApproved !== undefined ? incoming.isApproved : existing.isApproved,
            isDeclined: isCallerAdmin && incoming.isDeclined !== undefined ? incoming.isDeclined : existing.isDeclined,
            isVerified: isCallerAdmin && incoming.isVerified !== undefined ? incoming.isVerified : existing.isVerified,
            verificationStatus:
              isCallerAdmin && incoming.verificationStatus ? incoming.verificationStatus : existing.verificationStatus,
            badgeType: isCallerAdmin && incoming.badgeType !== undefined ? incoming.badgeType : existing.badgeType,
            badgeTitle: isCallerAdmin && incoming.badgeTitle !== undefined ? incoming.badgeTitle : existing.badgeTitle,
            updatedAt: incoming.updatedAt || new Date().toISOString(),
          });
          if (existing.isApproved === true && incoming.isApproved === false && !existing.isAdmin) {
            revokeAllSessionsForUser(String(existing.id), 'Admin revoked account approval');
          }
        } else if (isCallerAdmin && inId && inNick && !isReservedHandle(inNick)) {
          userMap.set(inId, {
            ...incoming,
            isAdmin: false,
            sessionVersion: 1,
          });
        }
      }

      activeDb.users = Array.from(userMap.values());
      changed = true;
    }

    if (Array.isArray(updates.posts)) {
      if (updates.replacePosts && isCallerAdmin) {
        activeDb.posts = updates.posts;
      } else {
        activeDb.posts = mergePosts(activeDb.posts, updates.posts);
      }
      changed = true;
    }

    if (Array.isArray(updates.comments)) {
      if (updates.replaceComments && isCallerAdmin) {
        activeDb.comments = updates.comments;
      } else {
        activeDb.comments = mergeComments(activeDb.comments, updates.comments);
      }
      const affectedIds = new Set(updates.comments.map((c: any) => c?.postId).filter(Boolean).map(String));
      if (affectedIds.size > 0 && Array.isArray(activeDb.posts)) {
        activeDb.posts = activeDb.posts.map((p: any) => {
          if (!affectedIds.has(String(p.id))) return p;
          const cCount = (activeDb.comments || []).filter(
            (c: any) => c && String(c.postId) === String(p.id) && !c.parentId
          ).length;
          return { ...p, commentsCount: cCount, commentCount: cCount };
        });
      }
      changed = true;
    }

    if (updates.postCommentCount && updates.postCommentCount.postId) {
      const targetId = String(updates.postCommentCount.postId);
      const safeCount = Math.max(0, Number(updates.postCommentCount.commentsCount) || 0);
      if (Array.isArray(activeDb.posts)) {
        activeDb.posts = activeDb.posts.map((p: any) =>
          String(p.id) === targetId ? { ...p, commentsCount: safeCount, commentCount: safeCount } : p
        );
        changed = true;
      }
    }

    if (Array.isArray(updates.marketplaceItems)) {
      if (updates.replaceMarketplaceItems && isCallerAdmin) {
        activeDb.marketplaceItems = updates.marketplaceItems;
      } else {
        activeDb.marketplaceItems = mergeMarketplaceItems(activeDb.marketplaceItems, updates.marketplaceItems);
      }
      changed = true;
    }

    if (Array.isArray(updates.pendingMarketplaceItems)) {
      if (updates.replacePendingMarketplaceItems && isCallerAdmin) {
        activeDb.pendingMarketplaceItems = updates.pendingMarketplaceItems;
      } else {
        activeDb.pendingMarketplaceItems = mergeMarketplaceItems(
          activeDb.pendingMarketplaceItems,
          updates.pendingMarketplaceItems
        );
      }
      changed = true;
    }

    if (Array.isArray(updates.verificationRequests)) {
      if (updates.replaceVerificationRequests && isCallerAdmin) {
        activeDb.verificationRequests = updates.verificationRequests;
      } else {
        activeDb.verificationRequests = mergeVerificationRequests(
          activeDb.verificationRequests,
          updates.verificationRequests
        );
      }
      changed = true;
    }

    if (Array.isArray(updates.reports)) {
      if (updates.replaceReports && isCallerAdmin) {
        activeDb.reports = updates.reports;
      } else {
        activeDb.reports = mergeReports(activeDb.reports, updates.reports);
      }
      changed = true;
    }

    if (isCallerAdmin && Array.isArray(updates.verifCandidates)) {
      activeDb.verifCandidates = updates.replaceVerifCandidates
        ? updates.verifCandidates
        : mergeVerifCandidates(activeDb.verifCandidates, updates.verifCandidates);
      changed = true;
    }

    if (Array.isArray(updates.directMessages)) {
      if (updates.replaceDirectMessages && isCallerAdmin) {
        activeDb.directMessages = updates.directMessages;
      } else {
        activeDb.directMessages = mergeDirectMessages(activeDb.directMessages, updates.directMessages);
      }
      changed = true;
    }

    if (Array.isArray(updates.chatConversations)) {
      activeDb.chatConversations = mergeChatConversations(activeDb.chatConversations, updates.chatConversations);
      changed = true;
    }

    if (Array.isArray(updates.chatReports)) {
      if (updates.replaceChatReports && isCallerAdmin) {
        activeDb.chatReports = updates.chatReports;
      } else {
        activeDb.chatReports = mergeChatReports(activeDb.chatReports, updates.chatReports);
      }
      changed = true;
    }

    if (isCallerAdmin && Array.isArray(updates.chatRestrictions)) {
      activeDb.chatRestrictions = updates.replaceChatRestrictions
        ? updates.chatRestrictions
        : mergeChatRestrictions(activeDb.chatRestrictions, updates.chatRestrictions);
      changed = true;
    }

    if (Array.isArray(updates.follows)) {
      if (updates.replaceFollows && isCallerAdmin) {
        activeDb.follows = updates.follows;
      } else {
        // Non-admin follow updates merge safely (add/remove only caller's own follower entries)
        if (isCallerAdmin) {
          activeDb.follows = mergeFollows(activeDb.follows, updates.follows);
        } else if (updates.replaceFollows) {
          const othersFollows = (activeDb.follows || []).filter(
            (f: any) => f && !callerAliases.has(normalizeServerHandle(f.followerNickname))
          );
          const ownFollows = updates.follows.filter(
            (f: any) => f && callerAliases.has(normalizeServerHandle(f.followerNickname))
          );
          activeDb.follows = mergeFollows(othersFollows, ownFollows);
        } else {
          activeDb.follows = mergeFollows(activeDb.follows, updates.follows);
        }
      }
      changed = true;
    }

    if (Array.isArray(updates.marketplaceReports)) {
      activeDb.marketplaceReports = isCallerAdmin
        ? updates.marketplaceReports
        : [...(activeDb.marketplaceReports || []), ...updates.marketplaceReports.filter((r: any) => r?.id)];
      changed = true;
    }

    if (Array.isArray(updates.helpDeskInquiries)) {
      activeDb.helpDeskInquiries = isCallerAdmin
        ? updates.helpDeskInquiries
        : mergeFollows(activeDb.helpDeskInquiries as any, updates.helpDeskInquiries as any) as any;
      changed = true;
    }

    if (isCallerAdmin && typeof updates.verificationFee === 'number') {
      activeDb.verificationFee = updates.verificationFee;
      changed = true;
    }

    if (updates.notifications && typeof updates.notifications === 'object') {
      const currentNotifs = activeDb.notifications || {};
      const nextNotifs: Record<string, any[]> = { ...currentNotifs };
      for (const [rawKey, incomingList] of Object.entries(updates.notifications)) {
        if (!Array.isArray(incomingList)) continue;
        const cleanKey = rawKey === '__all__' ? '__all__' : String(rawKey).trim().toLowerCase().replace(/^@+/, '');
        if (!cleanKey) continue;
        if (cleanKey === '__all__' && !isCallerAdmin) continue;
        nextNotifs[cleanKey] = mergeNotifications(currentNotifs[cleanKey] || [], incomingList);
      }
      activeDb.notifications = nextNotifs;
      changed = true;
    }

    if (changed) {
      persistServerDb();
    }

    return res.json({
      success: true,
      db: sanitizeDbForCaller(activeDb, caller),
    });
  } catch (err: any) {
    console.error('[DB Sync Error]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Sync failed' });
  }
});

// ============================================================================
// SERVER STARTUP (VITE DEV / STATIC DIST)
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(IS_ISOLATED_TEST_INSTANCE ? { hmr: false } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      next();
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FUHSI Connect Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
