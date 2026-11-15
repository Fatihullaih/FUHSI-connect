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

function normalizeServerHandle(nick?: any): string {
  if (!nick || typeof nick !== 'string') return '';
  return nick.trim().toLowerCase().replace(/^@+/, '');
}

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

  // Pull in any pre-existing aliases that already point to this userId or any alias in aliasSet
  const currentSup = ((activeDb as any).supersededUsernames || {}) as Record<string, any>;
  Object.entries(currentSup).forEach(([k, entry]) => {
    const cleanK = normalizeServerHandle(k);
    const eUid = entry?.userId ? String(entry.userId).trim() : '';
    const eTarget = normalizeServerHandle(entry?.newNickname);
    if (
      (cleanUserId && eUid === cleanUserId) ||
      (eTarget && (eTarget === cleanNew || aliasSet.has(eTarget)))
    ) {
      if (cleanK && cleanK !== cleanNew) aliasSet.add(cleanK);
    }
  });

  // 1. Update supersededUsernames registry and re-point chained entries
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
  // If user switched back to a previously superseded name, remove it from superseded map
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

      let nextPost = { ...p };
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
        const qpMatch = Boolean((cleanUserId && qp.authorId === cleanUserId) || isTargetHandle(qp.authorNickname || qp.nickname));
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
        const rpMatch = Boolean((cleanUserId && rp.authorId === cleanUserId) || isTargetHandle(rp.authorNickname || rp.nickname));
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
      let nextComment = { ...c };

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

  // Cascade across follows
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

  // Cascade across verification requests
  if (Array.isArray(activeDb.verificationRequests)) {
    activeDb.verificationRequests = activeDb.verificationRequests.map((v: any) => {
      if (!v) return v;
      if ((cleanUserId && v.userId === cleanUserId) || isTargetHandle(v.applicantNickname)) {
        return { ...v, applicantNickname: newNickname, userId: cleanUserId || v.userId, updatedAt: nowIso };
      }
      return v;
    });
  }

  // Cascade across marketplace listings
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

  // Cascade across directMessages & chatConversations
  if (Array.isArray(activeDb.directMessages)) {
    activeDb.directMessages = activeDb.directMessages.map((d: any) => {
      if (!d) return d;
      let dChanged = false;
      let nextD = { ...d };
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

  // Cascade across reports
  if (Array.isArray(activeDb.reports)) {
    activeDb.reports = activeDb.reports.map((r: any) => {
      if (!r) return r;
      let nextR = { ...r };
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

  // Migrate user notifications under superseded handle keys to new clean handle key
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
    const sup = ((activeDb as any).supersededUsernames || {}) as Record<string, { newNickname?: string; userId?: string; changedAt?: string }>;
    const users = Array.isArray(activeDb.users) ? activeDb.users : [];
    const groupedByTarget = new Map<string, { userId?: string; newNickname: string; aliases: Set<string>; avatarKey?: string; avatarUrl?: string }>();

    const ensureGroup = (key: string, userId: string | undefined, newNickname: string, avatarKey?: string, avatarUrl?: string) => {
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
      const uid = targetUser?.id ? String(targetUser.id) : (entry.userId ? String(entry.userId) : undefined);
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
      reconcileSupersededHandlesInActiveDb();
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
    const app = !getApps().length ? initializeApp(config) : getApps()[0];
    const firestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');

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

    // 1. Fetch tombstones from deleted_users in Firestore
    const delSnap = await safeGetDocs('deleted_users');
    if (hitQuota) {
      firestoreQuotaPausedUntil = Date.now() + 60 * 60 * 1000;
      console.warn('[Firestore Sync] Daily Firestore read quota reached. Pausing server-side Firestore polling for 60 minutes and serving from local central DB.');
      return;
    }
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

    // 2. Fetch users, posts, comments, follows, verifications, marketplace items, direct messages, and notifications in parallel
    const [usersSnap, postsSnap, commentsSnap, followsSnap, verifsSnap, mpSnap, dmsSnap, notifsSnap] = await Promise.all([
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
      console.warn('[Firestore Sync] Daily Firestore read quota reached. Pausing server-side Firestore polling for 60 minutes and serving from local central DB.');
      return;
    }

    const firestoreUsers: any[] = [];
    usersSnap.forEach((d: any) => {
      const data = d.data();
      if (data && (data.nickname || data.studentEmail)) {
        const uId = String(data.id || d.id);
        const uNick = String(data.nickname || '').toLowerCase().replace(/^@/, '');
        if (fsDeletedIds.has(uId) || fsDeletedNicks.has(uNick)) {
          deleteDoc(doc(firestoreDb, 'users', d.id)).catch(() => {});
        } else {
          firestoreUsers.push({ ...data, id: uId });
        }
      }
    });

    activeDb.users = (activeDb.users || []).filter((u: any) => {
      const uId = String(u.id || '');
      const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '');
      return !fsDeletedIds.has(uId) && !fsDeletedNicks.has(uNick);
    });

    if (firestoreUsers.length > 0) {
      activeDb.users = mergeUsers(activeDb.users, firestoreUsers);
    }

    const deletedPostSet = new Set((activeDb.deletedPostIds || []).map(String));
    const deletedCommentSet = new Set((activeDb.deletedCommentIds || []).map(String));

    const firestorePosts: any[] = [];
    postsSnap.forEach((d: any) => {
      const raw = d.data();
      if (!raw) return;
      const pId = String(raw.id || d.id);
      if (deletedPostSet.has(pId)) return;
      const pNick = String(raw.authorNickname || '').toLowerCase().replace(/^@/, '');
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
      const cNick = String(raw.authorNickname || '').toLowerCase().replace(/^@/, '');
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

    // Reconcile top-level commentsCount on active posts from merged comments
    if (Array.isArray(activeDb.posts) && Array.isArray(activeDb.comments)) {
      const commentCountsByPost = new Map<string, number>();
      for (const c of activeDb.comments) {
        if (c && c.postId && !c.parentId) {
          commentCountsByPost.set(String(c.postId), (commentCountsByPost.get(String(c.postId)) || 0) + 1);
        }
      }
      activeDb.posts = activeDb.posts.map((p: any) => {
        const count = commentCountsByPost.get(String(p.id)) || 0;
        if (count > 0 || (p.commentsCount || 0) !== count) {
          return { ...p, commentsCount: Math.max(count, 0), commentCount: Math.max(count, 0) };
        }
        return p;
      });
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
        const sNick = String(msg.senderNickname || '').toLowerCase().replace(/^@/, '');
        const rNick = String(msg.receiverNickname || '').toLowerCase().replace(/^@/, '');
        if ((msg.senderId && fsDeletedIds.has(String(msg.senderId))) || (msg.receiverId && fsDeletedIds.has(String(msg.receiverId)))) return;
        if ((sNick && fsDeletedNicks.has(sNick)) || (rNick && fsDeletedNicks.has(rNick))) return;
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
    console.log(
      `[Firestore Sync] Synced ${activeDb.users.length} users, ${(activeDb.posts || []).length} posts, ${(activeDb.comments || []).length} comments, ${(activeDb.directMessages || []).length} DMs into server DB.`
    );
  } catch (err: any) {
    console.warn('[Firestore Sync] Non-critical Firestore sync notice:', err?.message || err);
  } finally {
    isFirestoreSyncRunning = false;
  }
}

// Only hydrate from Firestore on cold startup when local DB lacks users/posts, and avoid aggressive background polling that burns daily Firestore read quotas
if ((activeDb.users || []).length <= 1 || (activeDb.posts || []).length === 0) {
  syncFirestoreToActiveDb().catch(() => {});
}
setInterval(() => {
  syncFirestoreToActiveDb().catch(() => {});
}, 30 * 60 * 1000);

// Central DB API Endpoints
app.get('/api/db', (req, res) => {
  return res.json({ success: true, db: activeDb });
});

let lastPresencePersistTime = 0;

// Lightweight cross-device presence heartbeat endpoint (syncs online/active status via server DB even when Firestore is quota-limited)
app.post('/api/presence', (req, res) => {
  try {
    const { userId, nickname, isOnline, lastActiveAt, showActiveStatus } = req.body || {};
    const rawId = userId ? String(userId).trim() : '';
    const cleanNick = nickname ? String(nickname).toLowerCase().replace(/^@+/, '').trim() : '';
    if (!rawId && !cleanNick) {
      return res.status(400).json({ success: false, error: 'User identifier required' });
    }

    const nowIso = lastActiveAt || new Date().toISOString();
    const incomingMs = Date.parse(nowIso) || Date.now();
    let updated = false;
    let statusFlipped = false;

    activeDb.users = (activeDb.users || []).map((u: any) => {
      if (!u) return u;
      const uId = String(u.id || '').trim();
      const uNick = String(u.nickname || '').toLowerCase().replace(/^@+/, '').trim();
      if ((rawId && uId === rawId) || (cleanNick && uNick === cleanNick)) {
        const existingMs = u.lastActiveAt ? Date.parse(u.lastActiveAt) || 0 : 0;
        if (incomingMs >= existingMs || isOnline === false) {
          updated = true;
          if (u.isOnline !== Boolean(isOnline)) statusFlipped = true;
          return {
            ...u,
            isOnline: isOnline !== undefined ? Boolean(isOnline) : true,
            lastActiveAt: incomingMs >= existingMs ? nowIso : (u.lastActiveAt || nowIso),
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
    const { userId, newNickname, oldNickname, previousNicknames: incomingPrevNicks, avatarKey, avatarUrl } = req.body || {};
    if (!userId || !newNickname) {
      return res.status(400).json({ success: false, error: 'User ID and new username are required' });
    }

    const rawNew = String(newNickname).trim();
    const cleanNew = normalizeServerHandle(rawNew);
    const cleanOld = normalizeServerHandle(oldNickname);
    const formattedNew = rawNew.startsWith('@') ? rawNew : `@${rawNew}`;

    if (!cleanNew) {
      return res.status(400).json({ success: false, error: 'Invalid username' });
    }

    if (cleanNew.includes('anonymous') || cleanNew.includes('anon')) {
      return res.status(400).json({ success: false, error: 'Username cannot contain anonymous or anon' });
    }

    // Ensure central DB has synced from Firestore if user is missing in memory
    let userIndex = (activeDb.users || []).findIndex((u: any) => u && String(u.id) === String(userId));
    if (userIndex === -1) {
      await syncFirestoreToActiveDb().catch(() => {});
      userIndex = (activeDb.users || []).findIndex((u: any) => u && String(u.id) === String(userId));
    }

    if (userIndex === -1) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    // Check if new username is already actively used by any other user
    const existingOther = (activeDb.users || []).find((u: any) => {
      if (!u || !u.nickname) return false;
      const uId = String(u.id || '');
      const uNick = normalizeServerHandle(u.nickname);
      return uId !== String(userId) && uNick === cleanNew;
    });

    if (existingOther) {
      return res.status(409).json({ success: false, error: `The handle "${formattedNew}" is already taken.` });
    }

    const currentUser = activeDb.users[userIndex];
    const currentNickClean = normalizeServerHandle(currentUser.nickname);
    const previousNickClean = cleanOld || currentNickClean;

    // Collect all historical handle aliases belonging strictly to this user
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

    // Cascade username change across ALL posts, comments, follows, verifications, marketplace, DMs & notifications
    const cascadeResult = cascadeUsernameChangeInActiveDb({
      userId: String(userId),
      oldAliases: [previousNickClean, currentNickClean, ...Array.from(prevSet)],
      newNickname: formattedNew,
      nowIso,
      avatarKey: avatarKey !== undefined ? avatarKey : currentUser.avatarKey,
      avatarUrl: avatarUrl !== undefined ? avatarUrl : currentUser.avatarUrl,
    });

    persistServerDb();

    // Sync user and cascaded posts/comments to Firestore
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const { initializeApp, getApps } = await import('firebase/app');
        const { getFirestore, doc, setDoc, deleteDoc, collection, getDocs } = await import('firebase/firestore');
        const app = !getApps().length ? initializeApp(config) : getApps()[0];
        const firestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');

        await setDoc(doc(firestoreDb, 'users', String(userId)), {
          nickname: formattedNew,
          previousNicknames: nextPreviousNicknames,
          updatedAt: nowIso,
        }, { merge: true });

        if (previousNickClean) {
          await deleteDoc(doc(firestoreDb, 'users', previousNickClean)).catch(() => {});
        }

        // Update cascaded posts in Firestore
        const postUpdates = cascadeResult.updatedPosts || [];
        if (postUpdates.length > 0) {
          await Promise.all(
            postUpdates.map((p: any) =>
              setDoc(
                doc(firestoreDb, 'posts', String(p.id)),
                {
                  authorId: p.authorId || String(userId),
                  authorNickname: p.authorNickname,
                  ...(p.nickname ? { nickname: p.nickname } : {}),
                  ...(p.likedBy ? { likedBy: p.likedBy } : {}),
                  ...(p.repostedBy ? { repostedBy: p.repostedBy } : {}),
                  ...(p.repostRecords ? { repostRecords: p.repostRecords } : {}),
                  ...(p.bookmarkedBy ? { bookmarkedBy: p.bookmarkedBy } : {}),
                  ...(p.quotedPost ? { quotedPost: p.quotedPost } : {}),
                  ...(p.repostedPost ? { repostedPost: p.repostedPost } : {}),
                  updatedAt: nowIso,
                },
                { merge: true }
              ).catch(() => {})
            )
          );
        } else {
          // Also scan Firestore posts directly in case any former post wasn't in activeDb yet
          const fsPostsSnap = await getDocs(collection(firestoreDb, 'posts')).catch(() => null);
          if (fsPostsSnap) {
            const aliasCheckSet = new Set([previousNickClean, currentNickClean, ...Array.from(prevSet)].filter(Boolean));
            const extraPromises: Promise<any>[] = [];
            fsPostsSnap.forEach((d: any) => {
              const pData = d.data();
              if (!pData) return;
              const pNick = normalizeServerHandle(pData.authorNickname || pData.nickname);
              if (String(pData.authorId || '') === String(userId) || aliasCheckSet.has(pNick)) {
                extraPromises.push(
                  setDoc(
                    doc(firestoreDb, 'posts', d.id),
                    { authorId: String(userId), authorNickname: formattedNew, updatedAt: nowIso },
                    { merge: true }
                  ).catch(() => {})
                );
              }
            });
            if (extraPromises.length > 0) await Promise.all(extraPromises);
          }
        }

        // Update cascaded comments in Firestore
        const commentUpdates = cascadeResult.updatedComments || [];
        if (commentUpdates.length > 0) {
          await Promise.all(
            commentUpdates.map((c: any) =>
              setDoc(
                doc(firestoreDb, 'comments', String(c.id)),
                {
                  authorId: c.authorId || String(userId),
                  authorNickname: c.authorNickname,
                  ...(c.replyToNickname ? { replyToNickname: c.replyToNickname } : {}),
                  ...(c.likedBy ? { likedBy: c.likedBy } : {}),
                  updatedAt: nowIso,
                },
                { merge: true }
              ).catch(() => {})
            )
          );
        }
      }
    } catch (fsErr) {
      console.warn('[Username Change] Firestore sync warning:', fsErr);
    }

    console.log(
      `[Username Change] Central account ${userId} changed: @${previousNickClean} -> ${formattedNew} (cascaded ${cascadeResult.updatedPosts.length} posts, ${cascadeResult.updatedComments.length} comments)`
    );
    return res.json({
      success: true,
      user: activeDb.users[userIndex],
      updatedPostsCount: cascadeResult.updatedPosts.length,
      updatedCommentsCount: cascadeResult.updatedComments.length,
      supersededUsernames: (activeDb as any).supersededUsernames || {},
    });
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

        const pendingUsernameCascades: Array<{
          userId?: string;
          oldAliases: string[];
          newNickname: string;
          nowIso: string;
          avatarKey?: string;
          avatarUrl?: string;
        }> = [];

        for (const incoming of filteredIncoming) {
          const inId = String(incoming.id || '');
          const inNick = normalizeServerHandle(incoming.nickname);
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
              const exNick = normalizeServerHandle(existing.nickname);
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
            const inNickClean = normalizeServerHandle(incoming.nickname);
            const exNickClean = normalizeServerHandle(existing.nickname);

            // If incoming has a nickname that is superseded (old), discard it and keep existing!
            if ((activeDb as any).supersededUsernames && (activeDb as any).supersededUsernames[inNickClean]) {
              authoritativeNick = existing.nickname;
            } else if (incoming.nickname && incoming.nickname !== existing.nickname) {
              const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
              const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
              if (incomingTime > existingTime) {
                authoritativeNick = incoming.nickname;
                if (exNickClean && exNickClean !== inNickClean) {
                  const changeIso = incoming.updatedAt || new Date().toISOString();
                  pendingUsernameCascades.push({
                    userId: String(existing.id || incoming.id || ''),
                    oldAliases: [
                      exNickClean,
                      ...(Array.isArray(existing.previousNicknames) ? existing.previousNicknames : []),
                      ...(Array.isArray(incoming.previousNicknames) ? incoming.previousNicknames : []),
                    ],
                    newNickname: incoming.nickname,
                    nowIso: changeIso,
                    avatarKey: incoming.avatarKey || existing.avatarKey,
                    avatarUrl: incoming.avatarUrl !== undefined ? incoming.avatarUrl : existing.avatarUrl,
                  });
                }
              }
            }

            const authClean = normalizeServerHandle(authoritativeNick);
            const mergedPrevSet = new Set<string>();
            [
              ...(Array.isArray(existing.previousNicknames) ? existing.previousNicknames : []),
              ...(Array.isArray(incoming.previousNicknames) ? incoming.previousNicknames : []),
              exNickClean !== authClean ? existing.nickname : '',
              inNickClean !== authClean ? incoming.nickname : '',
            ].forEach((n) => {
              const c = normalizeServerHandle(n);
              if (c && c !== authClean) mergedPrevSet.add(c);
            });
            const mergedPreviousNicknames = Array.from(mergedPrevSet).map((c) => `@${c}`);

            userMap.set(matchedKey, {
              ...existing,
              ...incoming,
              id: existing.id || incoming.id,
              nickname: authoritativeNick,
              previousNicknames: mergedPreviousNicknames,
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
              lastActiveAt: (() => {
                const exMs = existing.lastActiveAt ? Date.parse(existing.lastActiveAt) || 0 : 0;
                const inMs = incoming.lastActiveAt ? Date.parse(incoming.lastActiveAt) || 0 : 0;
                return inMs >= exMs ? (incoming.lastActiveAt || existing.lastActiveAt) : existing.lastActiveAt;
              })(),
              isOnline: (() => {
                const exMs = existing.lastActiveAt ? Date.parse(existing.lastActiveAt) || 0 : 0;
                const inMs = incoming.lastActiveAt ? Date.parse(incoming.lastActiveAt) || 0 : 0;
                if (inMs > exMs) return incoming.isOnline;
                if (exMs > inMs) return existing.isOnline;
                return incoming.isOnline !== undefined ? incoming.isOnline : existing.isOnline;
              })(),
              updatedAt: incoming.updatedAt || new Date().toISOString(),
            });
          } else {
            const newKey = inId || inNick || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            userMap.set(newKey, incoming);
          }
        }

        activeDb.users = Array.from(userMap.values()).filter((u: any) => {
          const uId = String(u.id || '');
          const uNick = normalizeServerHandle(u.nickname);
          return !deletedIds.has(uId) && !deletedNicks.has(uNick);
        });

        for (const casc of pendingUsernameCascades) {
          cascadeUsernameChangeInActiveDb(casc);
        }
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
        // Reconcile commentsCount on affected posts in activeDb without clobbering likedBy
        const affectedIds = new Set(updates.comments.map((c: any) => c?.postId).filter(Boolean).map(String));
        if (affectedIds.size > 0 && Array.isArray(activeDb.posts)) {
          activeDb.posts = activeDb.posts.map((p: any) => {
            if (!affectedIds.has(String(p.id))) return p;
            const cCount = (activeDb.comments || []).filter((c: any) => c && String(c.postId) === String(p.id) && !c.parentId).length;
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
        const currentNotifs = activeDb.notifications || {};
        const nextNotifs: Record<string, any[]> = { ...currentNotifs };
        for (const [rawKey, incomingList] of Object.entries(updates.notifications)) {
          if (!Array.isArray(incomingList)) continue;
          const cleanKey = rawKey === '__all__' ? '__all__' : String(rawKey).trim().toLowerCase().replace(/^@+/, '');
          if (!cleanKey) continue;
          nextNotifs[cleanKey] = mergeNotifications(currentNotifs[cleanKey] || [], incomingList);
        }
        activeDb.notifications = nextNotifs;
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

// In-Memory Authoritative Store for Active Password Reset Sessions
interface ResetSessionEntry {
  userId: string;
  identifier: string;
  token: string;
  expiresAt: number;
  createdAt: number;
}

const activeResetSessions = new Map<string, ResetSessionEntry>();

// Clean up expired reset sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of activeResetSessions.entries()) {
    if (now > session.expiresAt) {
      activeResetSessions.delete(key);
    }
  }
}, 60000);

// 1. POST /api/auth/verify-reset-identity
// Verifies registered account ownership without requiring external email OTP dispatch
app.post('/api/auth/verify-reset-identity', (req, res) => {
  try {
    const { identifier, phone, matricNumber, matricNo, matricOrName } = req.body || {};
    const effectiveMatric = matricNo || matricNumber || matricOrName;

    if (!identifier) {
      return res.status(400).json({ success: false, error: 'Registered Email Address is required.' });
    }

    const cleanInput = String(identifier).trim().toLowerCase();
    const cleanNick = cleanInput.replace(/^@+/, '');

    // Locate the user in active database
    const matchedUser = (activeDb.users || []).find((u: any) => {
      if (!u || isDemoUser(u) || isDemoNickname(u.nickname)) return false;
      const uEmail = String(u.studentEmail || '').trim().toLowerCase();
      const uNick = String(u.nickname || '').trim().toLowerCase().replace(/^@+/, '');
      const uId = String(u.id || '').trim().toLowerCase();
      return uEmail === cleanInput || uNick === cleanNick || uId === cleanInput;
    });

    if (!matchedUser) {
      return res.status(404).json({
        success: false,
        error: 'No registered account found with the provided email address.',
      });
    }

    // Verify authorized ownership against registered records
    const registeredPhone = String(matchedUser.emergencyHomePhone || '').replace(/\D/g, '');
    const enteredPhone = String(phone || '').replace(/\D/g, '');

    if (!enteredPhone || registeredPhone !== enteredPhone) {
      return res.status(401).json({
        success: false,
        error: 'The registered phone number provided does not match our account records.',
      });
    }

    // If account has a registered matric number, check it strictly
    if (matchedUser.matricNumber) {
      const registeredMatric = normalizeMatricNumber(matchedUser.matricNumber);
      const enteredMatric = normalizeMatricNumber(String(effectiveMatric || ''));
      if (!enteredMatric || enteredMatric !== registeredMatric) {
        return res.status(401).json({
          success: false,
          error: 'The Matric No. provided does not match our account records.',
        });
      }
    }

    // Identity verified! Issue a secure one-time session token valid for 15 minutes
    const token = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
    const sessionKey = String(matchedUser.id || cleanNick);

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
        id: matchedUser.id,
        nickname: matchedUser.nickname,
        realName: matchedUser.realName,
        studentEmail: matchedUser.studentEmail,
        accountType: matchedUser.accountType || 'Student',
      },
    });
  } catch (error: any) {
    console.error('[Verify Reset Identity Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error verifying account ownership.' });
  }
});

// 2. POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { identifier, resetToken, token, newPassword } = req.body || {};
    const effectiveToken = resetToken || token;

    if (!identifier || !newPassword) {
      return res.status(400).json({ success: false, error: 'Account identifier and new password are required.' });
    }

    const cleanPassword = String(newPassword).trim();
    if (cleanPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters.' });
    }

    const cleanInput = String(identifier).trim().toLowerCase();
    const cleanNick = cleanInput.replace(/^@+/, '');

    // Locate the user in active database
    const userIndex = (activeDb.users || []).findIndex((u: any) => {
      const uEmail = String(u.studentEmail || '').trim().toLowerCase();
      const uNick = String(u.nickname || '').trim().toLowerCase().replace(/^@+/, '');
      const uId = String(u.id || '').trim().toLowerCase();
      return uEmail === cleanInput || uNick === cleanNick || uId === cleanInput;
    });

    if (userIndex === -1) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const matchedUser = activeDb.users[userIndex];
    const sessionKey = String(matchedUser.id || cleanNick);
    const session = activeResetSessions.get(sessionKey);

    // If a reset token was provided or session was opened, verify it
    if (effectiveToken) {
      if (!session || session.token !== effectiveToken) {
        return res.status(403).json({
          success: false,
          error: 'Invalid or expired password reset session. Please verify your details again.',
        });
      }
      if (Date.now() > session.expiresAt) {
        activeResetSessions.delete(sessionKey);
        return res.status(400).json({
          success: false,
          error: 'Password reset session has expired. Please verify your details again.',
        });
      }
    }

    // Update password securely in central server DB
    activeDb.users[userIndex].password = cleanPassword;
    activeDb.users[userIndex].savedPassword = cleanPassword;
    activeDb.users[userIndex].updatedAt = new Date().toISOString();
    persistServerDb();

    // Invalidate reset session so it cannot be reused
    activeResetSessions.delete(sessionKey);

    console.log(`[Password Reset Success] Password updated for user: ${matchedUser.nickname || matchedUser.id}`);
    return res.json({
      success: true,
      message: 'Password reset successfully! Your new password is now active.',
      user: {
        id: matchedUser.id,
        nickname: matchedUser.nickname,
        studentEmail: matchedUser.studentEmail,
      },
    });
  } catch (error: any) {
    console.error('[Password Reset Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error resetting password.' });
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
