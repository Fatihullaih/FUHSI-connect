import express from 'express';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_SERVER_DB } from './src/data/serverDefaults';
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

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Central Server Database Persistence File
const DB_FILE = path.join(process.cwd(), 'data', 'db.json');
const AVATARS_DIR = path.join(process.cwd(), 'data', 'avatars');

if (!fs.existsSync(AVATARS_DIR)) {
  try {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create avatars directory:', e);
  }
}

let activeDb: typeof DEFAULT_SERVER_DB = { ...DEFAULT_SERVER_DB };

function sanitizeServerDb(dbObj: typeof DEFAULT_SERVER_DB): typeof DEFAULT_SERVER_DB {
  const deletedPostSet = new Set((dbObj.deletedPostIds || []).map((id: any) => String(id)));
  const deletedCommentSet = new Set((dbObj.deletedCommentIds || []).map((id: any) => String(id)));
  return {
    ...dbObj,
    deletedPostIds: Array.from(deletedPostSet),
    deletedCommentIds: Array.from(deletedCommentSet),
    users: (dbObj.users || []).filter((u: any) => !isDemoUser(u) && !isDemoNickname(u.nickname)),
    posts: (dbObj.posts || []).filter((p: any) => !isDemoPost(p) && !deletedPostSet.has(String(p.id))),
    comments: (dbObj.comments || []).filter((c: any) => !isDemoComment(c) && !deletedPostSet.has(String(c.postId)) && !deletedCommentSet.has(String(c.id)) && !deletedCommentSet.has(String(c.parentId))),
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
    chatReports: (dbObj.chatReports || []).filter((cr: any) => !isDemoNickname(cr.reportedNickname) && !isDemoNickname(cr.reporterNickname)),
    chatRestrictions: (dbObj.chatRestrictions || []).filter((cr: any) => !isDemoNickname(cr.nickname) && !isDemoNickname(cr.userNickname)),
    follows: (dbObj.follows || []).filter((f: any) => !isDemoNickname(f?.followerNickname) && !isDemoNickname(f?.followingNickname)),
    supersededUsernames: (dbObj as any).supersededUsernames || {},
  };
}

function initAndLoadServerDb() {
  try {
    const dataDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      activeDb = sanitizeServerDb({ ...DEFAULT_SERVER_DB, deletedUserIds: [], deletedUserNicknames: [] });
      persistServerDb();
      console.log('[DB Init] Created initial data/db.json on server disk.');
    } else {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);

      const savedDeletedIds = new Set((parsed.deletedUserIds || []).map((id: any) => String(id)));
      const savedDeletedNicks = new Set((parsed.deletedUserNicknames || []).map((n: any) => String(n).toLowerCase().replace(/^@/, '')));

      const nonDeletedDefaultUsers = DEFAULT_SERVER_DB.users.filter((u: any) => {
        const uId = String(u.id || '');
        const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
        return !savedDeletedIds.has(uId) && !savedDeletedNicks.has(uNick);
      });

      const loadedUsers = (parsed.users || []).filter((u: any) => {
        const uId = String(u.id || '');
        const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
        return !savedDeletedIds.has(uId) && !savedDeletedNicks.has(uNick);
      });

      activeDb = sanitizeServerDb({
        ...DEFAULT_SERVER_DB,
        ...parsed,
        supersededUsernames: { ...((DEFAULT_SERVER_DB as any).supersededUsernames || {}), ...(parsed.supersededUsernames || {}) },
        deletedUserIds: Array.from(savedDeletedIds),
        deletedUserNicknames: Array.from(savedDeletedNicks),
        users: mergeUsers(nonDeletedDefaultUsers, loadedUsers),
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
      persistServerDb();
      console.log('[DB Init] Loaded and sanitized central database from data/db.json on server disk.');
    }
  } catch (err) {
    console.error('[DB Error] Failed to initialize server DB file:', err);
    activeDb = sanitizeServerDb({ ...DEFAULT_SERVER_DB, deletedUserIds: [], deletedUserNicknames: [] });
    persistServerDb();
  }
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

// Load DB on startup
initAndLoadServerDb();

async function syncFirestoreToActiveDb() {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore, collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
    const app = !getApps().length ? initializeApp(config) : getApps()[0];
    const firestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');

    // 1. Fetch tombstones from deleted_users in Firestore
    const delSnap = await getDocs(collection(firestoreDb, 'deleted_users')).catch(() => ({ forEach: () => {} }));
    const fsDeletedIds = new Set<string>((activeDb.deletedUserIds || []).map(String));
    const fsDeletedNicks = new Set<string>((activeDb.deletedUserNicknames || []).map((n: string) => n.toLowerCase().replace(/^@/, '')));
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

    // 2. Fetch users and filter against tombstones
    const snap = await getDocs(collection(firestoreDb, 'users'));
    const firestoreUsers: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data && (data.nickname || data.studentEmail)) {
        const uId = String(data.id || d.id);
        const uNick = String(data.nickname || '').toLowerCase().replace(/^@/, '');
        if (fsDeletedIds.has(uId) || fsDeletedNicks.has(uNick)) {
          // Stale user in Firestore! Clean it up permanently
          deleteDoc(doc(firestoreDb, 'users', d.id)).catch(() => {});
        } else {
          firestoreUsers.push({ ...data, id: uId });
        }
      }
    });

    // Filter server DB against tombstones as well
    activeDb.users = (activeDb.users || []).filter((u: any) => {
      const uId = String(u.id || '');
      const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
      return !fsDeletedIds.has(uId) && !fsDeletedNicks.has(uNick);
    });

    if (firestoreUsers.length > 0) {
      activeDb.users = mergeUsers(activeDb.users, firestoreUsers);
    }
    persistServerDb();
    console.log(`[Firestore Sync] Synced ${activeDb.users.length} active users into server DB (filtered ${fsDeletedIds.size} deleted tombstones).`);
  } catch (err: any) {
    console.warn('[Firestore Sync] Non-critical Firestore sync notice:', err?.message || err);
  }
}

// Kick off background Firestore sync
syncFirestoreToActiveDb().catch(() => {});

// Central DB API Endpoints
app.get('/api/db', (req, res) => {
  return res.json({ success: true, db: activeDb });
});

function isUsernameSuperseded(cleanUsername: string): boolean {
  if (!(activeDb as any).supersededUsernames || !(activeDb as any).supersededUsernames[cleanUsername]) {
    return false;
  }
  // Check if any user in activeDb currently has cleanUsername as their active nickname
  const currentUserWithThisNick = (activeDb.users || []).find((u: any) => {
    if (!u || !u.nickname) return false;
    const uNick = String(u.nickname).toLowerCase().replace(/^@+/, '').trim();
    return uNick === cleanUsername;
  });
  if (currentUserWithThisNick) {
    delete (activeDb as any).supersededUsernames[cleanUsername];
    persistServerDb();
    return false;
  }
  return true;
}

// Centralized Authentication Endpoint - strictly validates against the current authoritative central record
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const trimmedUsername = String(username || '').trim();
    const trimmedPassword = String(password || '').trim();

    if (!trimmedUsername) {
      return res.status(400).json({ success: false, error: 'Please enter your Username.' });
    }
    if (!trimmedPassword) {
      return res.status(400).json({ success: false, error: 'Please enter your password.' });
    }

    const cleanUsername = trimmedUsername.toLowerCase().replace(/^@+/, '').trim();

    // Executive Admin account handle (@modula) with password (ibraheem)
    if (cleanUsername === 'modula') {
      if (trimmedPassword === 'ibraheem') {
        const modulaAdmin = {
          id: 'usr_admin_modula',
          nickname: '@modula',
          accountType: 'Admin',
          realName: 'Administrator',
          matricNumber: '',
          department: '',
          level: '',
          bio: 'Platform Administrator (@modula).',
          avatarKey: '1',
          badgeType: 'GOLD',
          badgeTitle: 'Official Admin',
          reputationScore: 9999,
          isVerified: true,
          isApproved: true,
          isAdmin: true,
        };
        return res.json({ success: true, user: modulaAdmin });
      } else {
        return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
      }
    }

    const findMatch = (list: any[]) => {
      const lowerInput = trimmedUsername.toLowerCase();
      const cleanNick = lowerInput.replace(/^@+/, '').trim();

      return list.find((u: any) => {
        if (!u || !u.nickname) return false;
        const uNick = String(u.nickname).toLowerCase().replace(/^@+/, '').trim();
        return uNick === cleanNick;
      });
    };

    // Look up user across active database
    let matched = findMatch(activeDb.users || []);

    // Also check superseded usernames (e.g. if username was updated, match by previous username)
    if (!matched && (activeDb as any).supersededUsernames && (activeDb as any).supersededUsernames[cleanUsername]) {
      const sup = (activeDb as any).supersededUsernames[cleanUsername];
      if (sup && sup.userId) {
        matched = (activeDb.users || []).find((u: any) => u.id === sup.userId);
      }
    }

    // If not found in memory activeDb, try fresh Firestore sync to ensure recent updates are caught
    if (!matched) {
      await syncFirestoreToActiveDb().catch(() => {});
      matched = findMatch(activeDb.users || []);
      if (!matched && (activeDb as any).supersededUsernames && (activeDb as any).supersededUsernames[cleanUsername]) {
        const sup = (activeDb as any).supersededUsernames[cleanUsername];
        if (sup && sup.userId) {
          matched = (activeDb.users || []).find((u: any) => u.id === sup.userId);
        }
      }
    }

    if (!matched) {
      return res.status(404).json({ success: false, error: 'Account not found. Please check your login details.' });
    }

    // Verify password strictly
    const expectedPassword = matched.savedPassword || matched.password || 'password123';
    if (trimmedPassword !== expectedPassword) {
      return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
    }

    if (matched.isApproved === false && !matched.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Registration Status: Your account approval is currently pending. Please check back shortly, or reach out to the Help Desk below for assistance.',
        isPending: true,
      });
    }

    return res.json({ success: true, user: matched });
  } catch (err: any) {
    console.error('[Auth API] Login error:', err);
    return res.status(500).json({ success: false, error: 'Authentication service error' });
  }
});

// Dedicated Central Username Change Endpoint - ensures authoritative central synchronization across all devices
app.post('/api/users/change-username', async (req, res) => {
  try {
    const { userId, newNickname, oldNickname } = req.body || {};
    if (!userId || !newNickname) {
      return res.status(400).json({ success: false, error: 'User ID and new username are required' });
    }

    const rawNew = String(newNickname).trim();
    const cleanNew = rawNew.toLowerCase().replace(/^@/, '');
    const cleanOld = oldNickname ? String(oldNickname).trim().toLowerCase().replace(/^@/, '') : '';
    const formattedNew = rawNew.startsWith('@') ? rawNew : `@${rawNew}`;

    if (!cleanNew) {
      return res.status(400).json({ success: false, error: 'Invalid username' });
    }

    if (cleanNew.includes('anonymous') || cleanNew.includes('anon')) {
      return res.status(400).json({ success: false, error: 'Username cannot contain anonymous or anon' });
    }

    // Check if new username is already taken by any other user
    const existingOther = (activeDb.users || []).find((u: any) => {
      if (!u || !u.nickname) return false;
      const uId = String(u.id || '');
      const uNick = String(u.nickname).toLowerCase().replace(/^@/, '');
      return uId !== String(userId) && uNick === cleanNew;
    });

    if (existingOther) {
      return res.status(409).json({ success: false, error: `The handle "${formattedNew}" is already taken.` });
    }

    // Find user by permanent internal ID in activeDb.users
    const userIndex = (activeDb.users || []).findIndex((u: any) => u && String(u.id) === String(userId));
    if (userIndex === -1) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    const currentUser = activeDb.users[userIndex];
    const previousNickClean = cleanOld || String(currentUser.nickname || '').toLowerCase().replace(/^@/, '');

    // Update username centrally
    const nowIso = new Date().toISOString();
    activeDb.users[userIndex] = {
      ...currentUser,
      nickname: formattedNew,
      updatedAt: nowIso,
    };

    // Invalidate old username centrally so it can NEVER be used to log in on any device
    if (previousNickClean && previousNickClean !== cleanNew) {
      if (!(activeDb as any).supersededUsernames) (activeDb as any).supersededUsernames = {};
      (activeDb as any).supersededUsernames[previousNickClean] = {
        newNickname: formattedNew,
        userId: String(userId),
        changedAt: nowIso,
      };
    }

    persistServerDb();

    // Sync to Firestore
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const { initializeApp, getApps } = await import('firebase/app');
        const { getFirestore, doc, setDoc, deleteDoc } = await import('firebase/firestore');
        const app = !getApps().length ? initializeApp(config) : getApps()[0];
        const firestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');
        
        await setDoc(doc(firestoreDb, 'users', String(userId)), {
          nickname: formattedNew,
          updatedAt: nowIso,
        }, { merge: true });

        if (previousNickClean) {
          await deleteDoc(doc(firestoreDb, 'users', previousNickClean)).catch(() => {});
        }
      }
    } catch (fsErr) {
      console.warn('[Username Change] Firestore sync warning:', fsErr);
    }

    console.log(`[Username Change] Central account ${userId} changed: @${previousNickClean} -> ${formattedNew}`);
    return res.json({ success: true, user: activeDb.users[userIndex] });
  } catch (err: any) {
    console.error('[Username Change] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update username centrally' });
  }
});

// Retrieve current authoritative user account by internal ID
app.get('/api/users/:userId', async (req, res) => {
  try {
    const rawId = req.params.userId || '';
    if (!rawId) return res.status(400).json({ success: false, error: 'User ID is required' });

    let matched = (activeDb.users || []).find((u: any) => u && String(u.id) === String(rawId));
    if (!matched) {
      await syncFirestoreToActiveDb().catch(() => {});
      matched = (activeDb.users || []).find((u: any) => u && String(u.id) === String(rawId));
    }

    if (!matched) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.json({ success: true, user: matched });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'User lookup error' });
  }
});

// Central Avatar Management Endpoints (Permanent Cloud/Server Storage)
app.post('/api/avatar/upload', (req, res) => {
  try {
    const { userId, nickname, avatarDataUrl } = req.body || {};
    if (!userId && !nickname) {
      return res.status(400).json({ success: false, error: 'User ID or nickname is required' });
    }

    const cleanNick = String(nickname || '').toLowerCase().replace(/^@/, '');
    const cleanUserId = String(userId || cleanNick);
    const safeFilename = cleanUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const avatarFilePath = path.join(AVATARS_DIR, `${safeFilename}.jpg`);

    if (!avatarDataUrl || avatarDataUrl.trim() === '') {
      // User requested deliberate removal of profile picture
      if (fs.existsSync(avatarFilePath)) {
        try {
          fs.unlinkSync(avatarFilePath);
        } catch (e) {}
      }

      if (Array.isArray(activeDb.users)) {
        activeDb.users = activeDb.users.map((u: any) => {
          const uId = String(u.id || '');
          const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
          if ((userId && uId === String(userId)) || (cleanNick && uNick === cleanNick)) {
            return { ...u, avatarUrl: '', updatedAt: new Date().toISOString() };
          }
          return u;
        });
        persistServerDb();
      }

      return res.json({ success: true, avatarUrl: '' });
    }

    // Process and write the Base64 image directly to permanent storage on server disk
    const base64Data = avatarDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(avatarFilePath, buffer);

    // Save avatar permanently in activeDb
    if (Array.isArray(activeDb.users)) {
      let matched = false;
      activeDb.users = activeDb.users.map((u: any) => {
        const uId = String(u.id || '');
        const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
        if ((userId && uId === String(userId)) || (cleanNick && uNick === cleanNick)) {
          matched = true;
          return {
            ...u,
            avatarUrl: avatarDataUrl,
            updatedAt: new Date().toISOString(),
          };
        }
        return u;
      });

      if (!matched && (userId || nickname)) {
        activeDb.users.push({
          id: userId || `usr_${Date.now()}`,
          nickname: nickname || '@Student',
          avatarUrl: avatarDataUrl,
          updatedAt: new Date().toISOString(),
        } as any);
      }

      persistServerDb();
    }

    return res.json({
      success: true,
      avatarUrl: avatarDataUrl,
      fileUrl: `/api/avatar/${encodeURIComponent(safeFilename)}`,
    });
  } catch (err: any) {
    console.error('[Avatar API] Upload error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Avatar save failed' });
  }
});

app.get('/api/avatar/:userId', (req, res) => {
  try {
    const rawTarget = req.params.userId || '';
    const cleanNick = rawTarget.toLowerCase().replace(/^@/, '');
    const safeFilename = rawTarget.replace(/[^a-zA-Z0-9_-]/g, '_');
    const directPath = path.join(AVATARS_DIR, `${safeFilename}.jpg`);

    if (fs.existsSync(directPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return fs.createReadStream(directPath).pipe(res);
    }

    // Try finding by nickname in activeDb
    if (Array.isArray(activeDb.users)) {
      const user = activeDb.users.find((u: any) => {
        const uId = String(u.id || '');
        const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
        return uId === rawTarget || safeFilename === uId.replace(/[^a-zA-Z0-9_-]/g, '_') || (cleanNick && uNick === cleanNick);
      });

      if (user && user.avatarUrl && user.avatarUrl.startsWith('data:image/')) {
        const base64Data = user.avatarUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        try {
          fs.writeFileSync(directPath, buffer);
        } catch (e) {}
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }

    return res.status(404).send('Avatar not found');
  } catch (err) {
    return res.status(500).send('Error retrieving avatar');
  }
});

app.delete('/api/avatar/:userId', (req, res) => {
  try {
    const rawTarget = req.params.userId || '';
    const cleanNick = rawTarget.toLowerCase().replace(/^@/, '');
    const safeFilename = rawTarget.replace(/[^a-zA-Z0-9_-]/g, '_');
    const directPath = path.join(AVATARS_DIR, `${safeFilename}.jpg`);

    if (fs.existsSync(directPath)) {
      try {
        fs.unlinkSync(directPath);
      } catch (e) {}
    }

    if (Array.isArray(activeDb.users)) {
      activeDb.users = activeDb.users.map((u: any) => {
        const uId = String(u.id || '');
        const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
        if (uId === rawTarget || (cleanNick && uNick === cleanNick)) {
          return { ...u, avatarUrl: '', updatedAt: new Date().toISOString() };
        }
        return u;
      });
      persistServerDb();
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Dedicated Permanent Account Deletion Endpoint - guarantees cross-device permanent eradication
app.post('/api/user/delete', async (req, res) => {
  try {
    const { userId, nickname, studentEmail, matricNumber } = req.body || {};
    const rawId = userId ? String(userId).trim() : '';
    const cleanNick = nickname ? String(nickname).trim().toLowerCase().replace(/^@/, '') : '';
    const cleanEmail = studentEmail ? String(studentEmail).trim().toLowerCase() : '';
    const cleanMatric = matricNumber ? String(matricNumber).trim().toUpperCase() : '';

    if (rawId === 'usr_admin_modula' || cleanNick === 'modula') {
      return res.status(400).json({ success: false, error: 'Platform administrator (@modula) cannot be deleted.' });
    }

    if (!rawId && !cleanNick && !cleanEmail) {
      return res.status(400).json({ success: false, error: 'User identifier required for deletion.' });
    }

    // 1. Add to server-side deleted tombstones
    const deletedIds = new Set((activeDb.deletedUserIds || []).map(String));
    const deletedNicks = new Set((activeDb.deletedUserNicknames || []).map((n: string) => n.toLowerCase().replace(/^@/, '')));
    if (rawId) deletedIds.add(rawId);
    if (cleanNick) deletedNicks.add(cleanNick);
    activeDb.deletedUserIds = Array.from(deletedIds);
    activeDb.deletedUserNicknames = Array.from(deletedNicks);

    // 2. Cascade delete from activeDb users
    activeDb.users = (activeDb.users || []).filter((u: any) => {
      const uId = String(u.id || '');
      const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
      const uEmail = String(u.studentEmail || '').toLowerCase();
      if (rawId && uId === rawId) return false;
      if (cleanNick && uNick === cleanNick) return false;
      if (cleanEmail && uEmail === cleanEmail) return false;
      return true;
    });

    // Cascade delete posts, comments, marketplace, dms, etc.
    const deletedPostIdsSet = new Set<string>();
    activeDb.posts = (activeDb.posts || []).filter((p: any) => {
      const pNick = String(p.authorNickname || '').toLowerCase().replace(/^@/, '');
      const pId = String(p.authorId || '');
      if ((rawId && pId === rawId) || (cleanNick && pNick === cleanNick)) {
        deletedPostIdsSet.add(String(p.id));
        return false;
      }
      return true;
    });
    activeDb.posts = (activeDb.posts || []).filter((p: any) => {
      if (p.repostedPostId && deletedPostIdsSet.has(String(p.repostedPostId))) return false;
      return true;
    });
    activeDb.comments = (activeDb.comments || []).filter((c: any) => {
      const cNick = String(c.authorNickname || '').toLowerCase().replace(/^@/, '');
      const cId = String(c.authorId || '');
      if ((rawId && cId === rawId) || (cleanNick && cNick === cleanNick) || (c.postId && deletedPostIdsSet.has(String(c.postId)))) {
        return false;
      }
      return true;
    });
    activeDb.marketplaceItems = (activeDb.marketplaceItems || []).filter((m: any) => {
      const mNick = String(m.sellerNickname || '').toLowerCase().replace(/^@/, '');
      const mId = String(m.sellerId || '');
      return !((rawId && mId === rawId) || (cleanNick && mNick === cleanNick));
    });
    activeDb.pendingMarketplaceItems = (activeDb.pendingMarketplaceItems || []).filter((m: any) => {
      const mNick = String(m.sellerNickname || '').toLowerCase().replace(/^@/, '');
      const mId = String(m.sellerId || '');
      return !((rawId && mId === rawId) || (cleanNick && mNick === cleanNick));
    });
    activeDb.directMessages = (activeDb.directMessages || []).filter((d: any) => {
      const sNick = String(d.senderNickname || '').toLowerCase().replace(/^@/, '');
      const rNick = String(d.receiverNickname || '').toLowerCase().replace(/^@/, '');
      return !(cleanNick && (sNick === cleanNick || rNick === cleanNick));
    });
    activeDb.chatConversations = (activeDb.chatConversations || []).filter((c: any) => {
      const oNick = String(c.otherUserNickname || '').toLowerCase().replace(/^@/, '');
      return !(cleanNick && oNick === cleanNick);
    });
    activeDb.verificationRequests = (activeDb.verificationRequests || []).filter((v: any) => {
      const vNick = String(v.applicantNickname || '').toLowerCase().replace(/^@/, '');
      return !(cleanNick && vNick === cleanNick);
    });
    activeDb.follows = (activeDb.follows || []).filter((f: any) => {
      const f1 = String(f.followerNickname || '').toLowerCase().replace(/^@/, '');
      const f2 = String(f.followingNickname || '').toLowerCase().replace(/^@/, '');
      return !(cleanNick && (f1 === cleanNick || f2 === cleanNick));
    });

    persistServerDb();

    // 3. Delete from Firestore asynchronously server-side (guaranteed cloud cleanup)
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const { initializeApp, getApps } = await import('firebase/app');
        const { getFirestore, collection, getDocs, deleteDoc, doc, setDoc } = await import('firebase/firestore');
        const app = !getApps().length ? initializeApp(config) : getApps()[0];
        const firestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');

        const tombstoneData = {
          userId: rawId || null,
          nickname: cleanNick || null,
          studentEmail: cleanEmail || null,
          matricNumber: cleanMatric || null,
          deletedAt: new Date().toISOString(),
        };

        // Write tombstone to Firestore
        if (rawId) {
          await setDoc(doc(firestoreDb, 'deleted_users', rawId), tombstoneData).catch(() => {});
          await deleteDoc(doc(firestoreDb, 'users', rawId)).catch(() => {});
        }
        if (cleanNick) {
          await setDoc(doc(firestoreDb, 'deleted_users', cleanNick), tombstoneData).catch(() => {});
          const nickDocId = cleanNick.replace(/[^a-z0-9_]/g, '');
          if (nickDocId) {
            await deleteDoc(doc(firestoreDb, 'users', nickDocId)).catch(() => {});
          }
        }

        // Query Firestore users to remove any remaining document matching this account
        const userDocsSnap = await getDocs(collection(firestoreDb, 'users')).catch(() => ({ forEach: () => {} }));
        userDocsSnap.forEach((d: any) => {
          const u = d.data();
          const dId = String(u.id || d.id);
          const dNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
          const dEmail = String(u.studentEmail || '').toLowerCase();
          if ((rawId && dId === rawId) || (cleanNick && dNick === cleanNick) || (cleanEmail && dEmail === cleanEmail)) {
            deleteDoc(doc(firestoreDb, 'users', d.id)).catch(() => {});
          }
        });
      }
    } catch (fsErr) {
      console.warn('[Server Account Deletion] Non-critical Firestore purge error:', fsErr);
    }

    return res.json({ success: true, deletedUserId: rawId, deletedNickname: cleanNick });
  } catch (err: any) {
    console.error('[Server Account Deletion] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:userId', async (req, res) => {
  req.body = { ...req.body, userId: req.params.userId };
  const { userId, nickname, studentEmail, matricNumber } = req.body || {};
  const rawId = userId ? String(userId).trim() : '';
  const cleanNick = nickname ? String(nickname).trim().toLowerCase().replace(/^@/, '') : '';

  if (rawId === 'usr_admin_modula' || cleanNick === 'modula') {
    return res.status(400).json({ success: false, error: 'Platform administrator (@modula) cannot be deleted.' });
  }

  // Delegate to deletion logic
  try {
    const deletedIds = new Set((activeDb.deletedUserIds || []).map(String));
    if (rawId) deletedIds.add(rawId);
    activeDb.deletedUserIds = Array.from(deletedIds);
    activeDb.users = (activeDb.users || []).filter((u: any) => String(u.id || '') !== rawId);
    persistServerDb();
    return res.json({ success: true, deletedUserId: rawId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/db/sync', (req, res) => {
  try {
    const rawBody = req.body || {};
    const updates = (rawBody.updates && typeof rawBody.updates === 'object') ? rawBody.updates : rawBody;
    if (updates && typeof updates === 'object') {
      let changed = false;

      // Handle explicitly deleted users first
      if (Array.isArray(updates.deletedUserIds) || Array.isArray(updates.deletedUserNicknames)) {
        const toDeleteIds = (updates.deletedUserIds || []).map((id: any) => String(id));
        const toDeleteNicks = (updates.deletedUserNicknames || []).map((n: any) => String(n).toLowerCase().replace(/^@/, ''));

        const allDeletedIds = new Set([...(activeDb.deletedUserIds || []), ...toDeleteIds]);
        const allDeletedNicks = new Set([...(activeDb.deletedUserNicknames || []), ...toDeleteNicks]);

        activeDb.deletedUserIds = Array.from(allDeletedIds);
        activeDb.deletedUserNicknames = Array.from(allDeletedNicks);

        activeDb.users = (activeDb.users || []).filter((u: any) => {
          const uId = String(u.id || '');
          const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
          return !allDeletedIds.has(uId) && !allDeletedNicks.has(uNick);
        });

        // Cascade delete posts owned by deleted users
        const deletedPostIdsSet = new Set<string>();
        activeDb.posts = (activeDb.posts || []).filter((p: any) => {
          const pNick = String(p.authorNickname || '').toLowerCase().replace(/^@/, '');
          const pId = String(p.authorId || '');
          if (allDeletedIds.has(pId) || allDeletedNicks.has(pNick)) {
            deletedPostIdsSet.add(String(p.id));
            return false;
          }
          return true;
        });

        // Cascade delete reposts of those posts
        activeDb.posts = (activeDb.posts || []).filter((p: any) => {
          if (p.repostedPostId && deletedPostIdsSet.has(String(p.repostedPostId))) {
            deletedPostIdsSet.add(String(p.id));
            return false;
          }
          return true;
        });

        // Remove deleted user's likes on remaining posts and recalculate like counts
        activeDb.posts = (activeDb.posts || []).map((p: any) => {
          if (Array.isArray(p.likedBy)) {
            const nextLiked = p.likedBy.filter((l: string) => {
              const cleanL = String(l).toLowerCase().replace(/^@/, '');
              return !allDeletedNicks.has(cleanL) && !allDeletedIds.has(String(l));
            });
            const newLikes = Math.max(0, nextLiked.length);
            return { ...p, likedBy: nextLiked, likes: newLikes, likesCount: newLikes };
          }
          return p;
        });

        // Cascade delete comments owned by deleted users or on deleted posts
        activeDb.comments = (activeDb.comments || []).filter((c: any) => {
          const cNick = String(c.authorNickname || '').toLowerCase().replace(/^@/, '');
          const cId = String(c.authorId || '');
          if (allDeletedIds.has(cId) || allDeletedNicks.has(cNick) || (c.postId && deletedPostIdsSet.has(String(c.postId)))) {
            return false;
          }
          return true;
        });

        // Recalculate comment count on all remaining posts
        activeDb.posts = (activeDb.posts || []).map((p: any) => {
          const cCount = (activeDb.comments || []).filter((c: any) => String(c.postId) === String(p.id)).length;
          return { ...p, commentCount: cCount, commentsCount: cCount };
        });

        // Cascade delete marketplace items
        activeDb.marketplaceItems = (activeDb.marketplaceItems || []).filter((m: any) => {
          const mNick = String(m.sellerNickname || '').toLowerCase().replace(/^@/, '');
          const mId = String(m.sellerId || '');
          return !allDeletedIds.has(mId) && !allDeletedNicks.has(mNick);
        });
        activeDb.pendingMarketplaceItems = (activeDb.pendingMarketplaceItems || []).filter((m: any) => {
          const mNick = String(m.sellerNickname || '').toLowerCase().replace(/^@/, '');
          const mId = String(m.sellerId || '');
          return !allDeletedIds.has(mId) && !allDeletedNicks.has(mNick);
        });

        // Cascade delete direct messages
        activeDb.directMessages = (activeDb.directMessages || []).filter((d: any) => {
          const sNick = String(d.senderNickname || '').toLowerCase().replace(/^@/, '');
          const rNick = String(d.receiverNickname || '').toLowerCase().replace(/^@/, '');
          const sId = String(d.senderId || '');
          const rId = String(d.receiverId || '');
          return !allDeletedIds.has(sId) && !allDeletedIds.has(rId) && !allDeletedNicks.has(sNick) && !allDeletedNicks.has(rNick);
        });

        // Cascade delete chat conversations
        activeDb.chatConversations = (activeDb.chatConversations || []).filter((c: any) => {
          const oNick = String(c.otherUserNickname || '').toLowerCase().replace(/^@/, '');
          return !allDeletedNicks.has(oNick);
        });

        // Cascade delete verification requests
        activeDb.verificationRequests = (activeDb.verificationRequests || []).filter((v: any) => {
          const vNick = String(v.applicantNickname || '').toLowerCase().replace(/^@/, '');
          return !allDeletedNicks.has(vNick);
        });

        // Cascade delete follows
        activeDb.follows = (activeDb.follows || []).filter((f: any) => {
          const f1 = String(f.followerNickname || '').toLowerCase().replace(/^@/, '');
          const f2 = String(f.followingNickname || '').toLowerCase().replace(/^@/, '');
          return !allDeletedNicks.has(f1) && !allDeletedNicks.has(f2);
        });

        changed = true;
      }

      // Handle un-deletion / new account creation
      if (Array.isArray(updates.unDeleteUserNicknames)) {
        const unNicks = new Set(updates.unDeleteUserNicknames.map((n: any) => String(n).toLowerCase().replace(/^@/, '')));
        activeDb.deletedUserNicknames = (activeDb.deletedUserNicknames || []).filter((n: string) => !unNicks.has(n.toLowerCase().replace(/^@/, '')));
        changed = true;
      }
      if (Array.isArray(updates.unDeleteUserIds)) {
        const unIds = new Set(updates.unDeleteUserIds.map((id: any) => String(id)));
        activeDb.deletedUserIds = (activeDb.deletedUserIds || []).filter((id: string) => !unIds.has(String(id)));
        changed = true;
      }

      // Handle globally deleted posts
      if (Array.isArray(updates.deletedPostIds) && updates.deletedPostIds.length > 0) {
        const toDeletePostIds = new Set(updates.deletedPostIds.map((id: any) => String(id)));
        const allDeletedPostIds = new Set([...(activeDb.deletedPostIds || []), ...toDeletePostIds]);
        activeDb.deletedPostIds = Array.from(allDeletedPostIds);
        activeDb.posts = (activeDb.posts || []).filter((p: any) => !allDeletedPostIds.has(String(p.id)));
        activeDb.comments = (activeDb.comments || []).filter((c: any) => !allDeletedPostIds.has(String(c.postId)));
        changed = true;
      }

      // Handle globally deleted comments and replies
      if (Array.isArray(updates.deletedCommentIds) && updates.deletedCommentIds.length > 0) {
        const toDeleteCommentIds = new Set(updates.deletedCommentIds.map((id: any) => String(id)));
        const allDeletedCommentIds = new Set([...(activeDb.deletedCommentIds || []), ...toDeleteCommentIds]);
        activeDb.deletedCommentIds = Array.from(allDeletedCommentIds);
        activeDb.comments = (activeDb.comments || []).filter((c: any) => !allDeletedCommentIds.has(String(c.id)) && !allDeletedCommentIds.has(String(c.parentId)));
        changed = true;
      }

      if (Array.isArray(updates.users)) {
        const deletedIds = new Set((activeDb.deletedUserIds || []).map((id: any) => String(id)));
        const deletedNicks = new Set((activeDb.deletedUserNicknames || []).map((n: any) => String(n).toLowerCase().replace(/^@/, '')));

        const filteredIncoming = updates.users.filter((u: any) => {
          const uId = String(u.id || '');
          const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
          return !deletedIds.has(uId) && !deletedNicks.has(uNick);
        });

        // Always safely merge incoming user updates so existing users are never accidentally wiped
        const userMap = new Map<string, any>();
        for (const u of (activeDb.users || [])) {
          const key = u.id || (u.nickname ? u.nickname.toLowerCase().replace(/^@/, '') : '');
          if (key) userMap.set(key, u);
        }

        for (const incoming of filteredIncoming) {
          const inId = String(incoming.id || '');
          const inNick = incoming.nickname ? String(incoming.nickname).toLowerCase().replace(/^@/, '') : '';
          const inEmail = incoming.studentEmail ? String(incoming.studentEmail).toLowerCase().trim() : '';

          // Match existing account by permanent ID (primary), email (secondary), or previous nickname
          let matchedKey: string | null = null;
          if (inId && userMap.has(inId)) {
            matchedKey = inId;
          } else {
            for (const [key, existing] of userMap.entries()) {
              if (inId && existing.id === inId) {
                matchedKey = key;
                break;
              }
              const exNick = existing.nickname ? String(existing.nickname).toLowerCase().replace(/^@/, '') : '';
              if (inNick && exNick && inNick === exNick) {
                matchedKey = key;
                break;
              }
              const exEmail = existing.studentEmail ? String(existing.studentEmail).toLowerCase().trim() : '';
              if (inEmail && exEmail && inEmail === exEmail && !inEmail.includes('admin@fuhsi.edu.ng')) {
                matchedKey = key;
                break;
              }
            }
          }

          if (matchedKey) {
            const existing = userMap.get(matchedKey);

            // REQUIREMENT 3, 4, 7: Protect central username from being regressed by stale client devices!
            let authoritativeNick = existing.nickname;
            const inNickClean = incoming.nickname ? String(incoming.nickname).toLowerCase().replace(/^@/, '') : '';
            const exNickClean = existing.nickname ? String(existing.nickname).toLowerCase().replace(/^@/, '') : '';

            // If incoming has a nickname that is superseded (old), discard it and keep existing!
            if ((activeDb as any).supersededUsernames && (activeDb as any).supersededUsernames[inNickClean]) {
              authoritativeNick = existing.nickname;
            } else if (incoming.nickname && incoming.nickname !== existing.nickname) {
              const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
              const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
              if (incomingTime > existingTime) {
                authoritativeNick = incoming.nickname;
                if (exNickClean && exNickClean !== inNickClean) {
                  if (!(activeDb as any).supersededUsernames) (activeDb as any).supersededUsernames = {};
                  (activeDb as any).supersededUsernames[exNickClean] = {
                    newNickname: incoming.nickname,
                    userId: String(existing.id || incoming.id),
                    changedAt: incoming.updatedAt || new Date().toISOString(),
                  };
                }
              }
            }

            userMap.set(matchedKey, {
              ...existing,
              ...incoming,
              id: existing.id || incoming.id,
              nickname: authoritativeNick,
              emergencyHomePhone: incoming.emergencyHomePhone !== undefined ? incoming.emergencyHomePhone : existing.emergencyHomePhone,
              realName: incoming.realName !== undefined ? incoming.realName : existing.realName,
              studentEmail: incoming.studentEmail !== undefined ? incoming.studentEmail : existing.studentEmail,
              level: incoming.level !== undefined ? incoming.level : existing.level,
              department: incoming.department !== undefined ? incoming.department : existing.department,
              matricNumber: (incoming.matricNumber && incoming.matricNumber.trim()) 
                ? incoming.matricNumber 
                : (existing.matricNumber || incoming.matricNumber || ''),
              bio: incoming.bio !== undefined ? incoming.bio : existing.bio,
              avatarUrl: incoming.avatarUrl !== undefined ? incoming.avatarUrl : existing.avatarUrl,
              avatarKey: incoming.avatarKey || existing.avatarKey,
              savedPassword: incoming.savedPassword || (incoming as any).password || existing.savedPassword || (existing as any).password,
              password: incoming.password || incoming.savedPassword || existing.password || existing.savedPassword,
              isApproved: incoming.isApproved !== undefined ? incoming.isApproved : existing.isApproved,
              isDeclined: incoming.isDeclined !== undefined ? incoming.isDeclined : existing.isDeclined,
              isVerified: incoming.isVerified !== undefined ? incoming.isVerified : existing.isVerified,
              verificationStatus: incoming.verificationStatus || existing.verificationStatus,
              badgeType: incoming.badgeType !== undefined ? incoming.badgeType : existing.badgeType,
              badgeTitle: incoming.badgeTitle !== undefined ? incoming.badgeTitle : existing.badgeTitle,
              reputationScore: incoming.reputationScore !== undefined ? incoming.reputationScore : existing.reputationScore,
              updatedAt: incoming.updatedAt || new Date().toISOString(),
            });
          } else {
            const newKey = inId || inNick || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            userMap.set(newKey, incoming);
          }
        }

        activeDb.users = Array.from(userMap.values()).filter((u: any) => {
          const uId = String(u.id || '');
          const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
          return !deletedIds.has(uId) && !deletedNicks.has(uNick);
        });
        changed = true;
      }
      if (Array.isArray(updates.posts)) {
        if (updates.replacePosts) {
          activeDb.posts = updates.posts;
        } else {
          activeDb.posts = mergePosts(activeDb.posts, updates.posts);
        }
        changed = true;
      }
      if (Array.isArray(updates.comments)) {
        if (updates.replaceComments) {
          activeDb.comments = updates.comments;
        } else {
          activeDb.comments = mergeComments(activeDb.comments, updates.comments);
        }
        changed = true;
      }
      if (Array.isArray(updates.marketplaceItems)) {
        if (updates.replaceMarketplaceItems) {
          activeDb.marketplaceItems = updates.marketplaceItems;
        } else {
          activeDb.marketplaceItems = mergeMarketplaceItems(activeDb.marketplaceItems, updates.marketplaceItems);
        }
        changed = true;
      }
      if (Array.isArray(updates.pendingMarketplaceItems)) {
        if (updates.replacePendingMarketplaceItems) {
          activeDb.pendingMarketplaceItems = updates.pendingMarketplaceItems;
        } else {
          activeDb.pendingMarketplaceItems = mergeMarketplaceItems(activeDb.pendingMarketplaceItems, updates.pendingMarketplaceItems);
        }
        changed = true;
      }
      if (Array.isArray(updates.verificationRequests)) {
        if (updates.replaceVerificationRequests) {
          activeDb.verificationRequests = updates.verificationRequests;
        } else {
          activeDb.verificationRequests = mergeVerificationRequests(activeDb.verificationRequests, updates.verificationRequests);
        }
        changed = true;
      }
      if (Array.isArray(updates.reports)) {
        if (updates.replaceReports) {
          activeDb.reports = updates.reports;
        } else {
          activeDb.reports = mergeReports(activeDb.reports, updates.reports);
        }
        changed = true;
      }
      if (Array.isArray(updates.verifCandidates)) {
        if (updates.replaceVerifCandidates) {
          activeDb.verifCandidates = updates.verifCandidates;
        } else {
          activeDb.verifCandidates = mergeVerifCandidates(activeDb.verifCandidates, updates.verifCandidates);
        }
        changed = true;
      }
      if (Array.isArray(updates.directMessages)) {
        if (updates.replaceDirectMessages) {
          activeDb.directMessages = updates.directMessages;
        } else {
          activeDb.directMessages = mergeDirectMessages(activeDb.directMessages, updates.directMessages);
        }
        changed = true;
      }
      if (Array.isArray(updates.chatConversations)) {
        if (updates.replaceChatConversations) {
          activeDb.chatConversations = updates.chatConversations;
        } else {
          activeDb.chatConversations = mergeChatConversations(activeDb.chatConversations, updates.chatConversations);
        }
        changed = true;
      }
      if (Array.isArray(updates.chatReports)) {
        if (updates.replaceChatReports) {
          activeDb.chatReports = updates.chatReports;
        } else {
          activeDb.chatReports = mergeChatReports(activeDb.chatReports, updates.chatReports);
        }
        changed = true;
      }
      if (Array.isArray(updates.chatRestrictions)) {
        if (updates.replaceChatRestrictions) {
          activeDb.chatRestrictions = updates.chatRestrictions;
        } else {
          activeDb.chatRestrictions = mergeChatRestrictions(activeDb.chatRestrictions, updates.chatRestrictions);
        }
        changed = true;
      }
      if (Array.isArray(updates.follows)) {
        if (updates.replaceFollows) {
          activeDb.follows = updates.follows;
        } else {
          activeDb.follows = mergeFollows(activeDb.follows, updates.follows);
        }
        changed = true;
      }
      if (Array.isArray(updates.marketplaceReports)) {
        activeDb.marketplaceReports = updates.marketplaceReports;
        changed = true;
      }
      if (Array.isArray(updates.helpDeskInquiries)) {
        activeDb.helpDeskInquiries = updates.helpDeskInquiries;
        changed = true;
      }
      if (typeof updates.verificationFee === 'number') {
        activeDb.verificationFee = updates.verificationFee;
        changed = true;
      }
      if (updates.notifications && typeof updates.notifications === 'object') {
        activeDb.notifications = { ...(activeDb.notifications || {}), ...updates.notifications };
        changed = true;
      }

      if (changed) {
        persistServerDb();
      }
    }
    return res.json({ success: true, db: activeDb });
  } catch (err: any) {
    console.error('[DB Sync Error]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Sync failed' });
  }
});

// Configure Transporter with official FUHSI Connect support email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.SMTP_USER || 'fuhsiconnectsupport@gmail.com',
    pass: process.env.SMTP_PASS || 'FUHSI-Connect1',
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// API endpoint to send automatic OTP verification email
app.post('/api/send-otp', async (req, res) => {
  try {
    const { to, otp, purpose, recipientName } = req.body;

    if (!to || !otp) {
      return res.status(400).json({ success: false, error: 'Recipient email and OTP code are required.' });
    }

    const mailOptions = {
      from: '"FUHSI Connect" <fuhsiconnectsupport@gmail.com>',
      to: to.trim(),
      subject: `[FUHSI Connect] Your ${purpose || 'Verification'} OTP Code: ${otp}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #0f766e, #042f2e); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">FUHSI Connect</h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; color: #99f6e4;">Federal University of Health Sciences, Ila-Orangun</p>
          </div>
          
          <div style="padding: 28px 24px; color: #1e293b;">
            <p style="font-size: 15px; margin-top: 0; font-weight: 600;">Hello ${recipientName || 'FUHSI Student'},</p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Connect and share updates with other students within the campus. Your One-Time Password (OTP) for <strong>${purpose || 'Account Verification'}</strong> is:
            </p>
            
            <div style="text-align: center; margin: 28px 0;">
              <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #0f766e; background-color: #f0fdf4; padding: 14px 32px; border-radius: 12px; border: 2px solid #99f6e4; display: inline-block;">
                ${otp}
              </span>
            </div>
            
            <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 0;">
              Please enter this 6-digit verification code in the app to proceed. For your security, do not share this code with anyone.
            </p>
          </div>
          
          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b;">
            <p style="margin: 0 0 4px 0;">Official Support: <a href="mailto:fuhsiconnectsupport@gmail.com" style="color: #0f766e; font-weight: bold; text-decoration: none;">fuhsiconnectsupport@gmail.com</a></p>
            <p style="margin: 0;">© FUHSI Connect • Student Social Network</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP Success] OTP email sent to ${to}: ${info.messageId}`);
    return res.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error('[SMTP Error] Failed to send email via Gmail transporter:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'SMTP Email dispatch failed',
      details: 'Ensure Gmail account allows app password authentication if required by Google.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
