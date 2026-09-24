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
    const { getFirestore, collection, getDocs } = await import('firebase/firestore');
    const app = !getApps().length ? initializeApp(config) : getApps()[0];
    const firestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');
    const snap = await getDocs(collection(firestoreDb, 'users'));
    const firestoreUsers: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data && (data.nickname || data.studentEmail)) {
        firestoreUsers.push({ ...data, id: data.id || d.id });
      }
    });
    if (firestoreUsers.length > 0) {
      activeDb.users = mergeUsers(activeDb.users, firestoreUsers);
      persistServerDb();
      console.log(`[Firestore Sync] Synced ${firestoreUsers.length} users into server DB.`);
    }
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

app.post('/api/db/sync', (req, res) => {
  try {
    const updates = req.body;
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
        changed = true;
      }

      // Handle un-deletion / new account creation
      if (Array.isArray(updates.unDeleteUserNicknames)) {
        const unNicks = new Set(updates.unDeleteUserNicknames.map((n: any) => String(n).toLowerCase().replace(/^@/, '')));
        activeDb.deletedUserNicknames = (activeDb.deletedUserNicknames || []).filter((n: string) => !unNicks.has(n.toLowerCase().replace(/^@/, '')));
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

        // Always merge users to preserve all registered accounts across devices, safely excluding deleted accounts
        const merged = mergeUsers(activeDb.users, filteredIncoming);
        activeDb.users = merged.filter((u: any) => {
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FUHSI Connect Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
