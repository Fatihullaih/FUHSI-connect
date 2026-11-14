import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  where,
  runTransaction,
  arrayUnion,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, Post, Comment, MarketplaceItem, VerificationRequest, Report, DirectMessage, HelpDeskInquiry, FollowRecord, ChatGroup, CampusNotification } from '../types';
import { isDemoUser, isDemoPost, isDemoNickname, isDemoComment, isDemoVerificationRequest, isDemoMarketplaceItem, isDemoDirectMessage } from '../utils/postGenerator';
import { isModulaAccount, sanitizeModulaProfile } from '../utils/userDbUtils';
import { mergeUsers, isPostDeletedLocally, isCommentDeletedLocally } from '../utils/apiSync';

// Collection references
const USERS_COL = 'users';
const DELETED_USERS_COL = 'deleted_users';
const POSTS_COL = 'posts';
const COMMENTS_COL = 'comments';
const MARKETPLACE_APPROVED_COL = 'marketplace_approved';
const MARKETPLACE_PENDING_COL = 'marketplace_pending';
const VERIFICATIONS_COL = 'verification_requests';
const REPORTS_COL = 'reports';
const HELPDESK_COL = 'helpdesk_inquiries';
const VERIF_CANDIDATES_COL = 'verif_candidates';
const DIRECT_MESSAGES_COL = 'direct_messages';
const CHAT_GROUPS_COL = 'chat_groups';
const NOTIFICATIONS_COL = 'notifications';
const FOLLOWS_COL = 'follows';
const SETTINGS_COL = 'settings';
const VERIFICATION_SETTINGS_DOC = 'verification_settings';

/**
 * Subscribe to all users in Firestore in real-time
 */
export function subscribeUsers(onUpdate: (users: UserProfile[]) => void) {
  return onSnapshot(collection(db, USERS_COL), (snapshot) => {
    const list: UserProfile[] = [];
    snapshot.forEach((docSnap) => {
      const rawData = docSnap.data() as UserProfile;
      if (!isDemoUser(rawData) && !isDemoNickname(rawData.nickname)) {
        const u: UserProfile = {
          ...rawData,
          id: rawData.id || docSnap.id,
        };
        try {
          const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('fuhsi_deleted_users_db') : null;
          if (raw) {
            const deleted = JSON.parse(raw);
            if (Array.isArray(deleted) && deleted.length > 0) {
              const uId = u.id ? String(u.id).trim() : '';
              const uNick = u.nickname ? String(u.nickname).trim().toLowerCase().replace(/^@/, '') : '';
              const uEmail = u.studentEmail ? String(u.studentEmail).trim().toLowerCase() : '';
              if (uId !== 'usr_admin_modula' && uNick !== 'modula') {
                const isDel = deleted.some((d: any) => {
                  if (uId && d.id && String(d.id).trim() === uId) return true;
                  if (uNick && d.nickname && String(d.nickname).trim().toLowerCase().replace(/^@/, '') === uNick) return true;
                  if (uEmail && d.studentEmail && String(d.studentEmail).trim().toLowerCase() === uEmail) return true;
                  return false;
                });
                if (isDel) return;
              }
            }
          }
        } catch {}
        const finalUser = isModulaAccount(u) ? sanitizeModulaProfile(u) : u;
        list.push(finalUser);
      }
    });
    const deduplicated = mergeUsers([], list);
    onUpdate(deduplicated);
  }, (err) => {
    console.warn('Firestore users subscription fallback/warning:', err?.message || err);
  });
}

/**
 * Real-time listener for permanently deleted users across all devices
 */
export function subscribeDeletedUsers(onUpdate: (deletedList: { id?: string; nickname?: string; studentEmail?: string }[]) => void) {
  return onSnapshot(collection(db, DELETED_USERS_COL), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data) {
        list.push({
          id: data.userId || docSnap.id,
          nickname: data.nickname,
          studentEmail: data.studentEmail,
        });
      }
    });
    onUpdate(list);
  }, (err) => {
    console.warn('Firestore deleted_users subscription warning:', err?.message || err);
  });
}

/**
 * Clean objects for Firestore (Firestore throws error if field value is undefined)
 */
function sanitizeForFirestore<T>(data: T): T {
  if (!data) return data;
  return JSON.parse(JSON.stringify(data));
}

/**
 * Permanently purge any stale department/level on the @modula document in Firestore
 */
export async function cleanupModulaFirestoreDoc(): Promise<void> {
  try {
    const cleanAdminData = {
      department: '',
      level: '',
      accountType: 'Admin',
      matricNumber: '',
      isAdmin: true,
    };
    await setDoc(doc(db, USERS_COL, 'usr_admin_modula'), cleanAdminData, { merge: true });
    await setDoc(doc(db, USERS_COL, 'modula'), cleanAdminData, { merge: true });
  } catch (err) {
    console.error('Error cleaning up modula in Firestore:', err);
  }
}

/**
 * Save single user to Firestore
 */
export async function saveUserToFirestore(user: UserProfile, oldNickname?: string): Promise<void> {
  if (!user || (!user.id && !user.nickname) || isDemoUser(user) || isDemoNickname(user.nickname)) return;
  const isMod = isModulaAccount(user);
  const targetUser = isMod ? sanitizeModulaProfile(user) : user;
  const docId = targetUser.id || targetUser.nickname.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const cleanUser = sanitizeForFirestore({ 
    ...targetUser, 
    id: targetUser.id || docId,
    updatedAt: targetUser.updatedAt || new Date().toISOString(),
  });
  try {
    await setDoc(doc(db, USERS_COL, docId), cleanUser, { merge: true });
    // Clean up any stale duplicate nickname-named document if distinct to avoid duplicate records
    const nickDocId = (targetUser.nickname || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (nickDocId && nickDocId !== docId) {
      await deleteDoc(doc(db, USERS_COL, nickDocId)).catch(() => {});
    }
    if (oldNickname) {
      const oldNickDocId = oldNickname.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (oldNickDocId && oldNickDocId !== docId) {
        await deleteDoc(doc(db, USERS_COL, oldNickDocId)).catch(() => {});
      }
    }
    if (isMod) {
      await cleanupModulaFirestoreDoc().catch(() => {});
    }
  } catch (err) {
    console.error('Error saving user to Firestore:', err);
  }
}

/**
 * Save multiple users to Firestore
 */
export async function saveUsersBatchToFirestore(users: UserProfile[]): Promise<void> {
  const nonDemoUsers = (users || []).filter((u) => !isDemoUser(u) && !isDemoNickname(u.nickname));
  if (!nonDemoUsers || nonDemoUsers.length === 0) return;
  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    nonDemoUsers.forEach((rawUser) => {
      const user = isModulaAccount(rawUser) ? sanitizeModulaProfile(rawUser) : rawUser;
      const docId = user.id || user.nickname.toLowerCase().replace(/[^a-z0-9_]/g, '');
      const cleanUser = sanitizeForFirestore({ 
        ...user, 
        id: user.id || docId,
        updatedAt: user.updatedAt || nowIso,
      });
      batch.set(doc(db, USERS_COL, docId), cleanUser, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Error saving batch users to Firestore:', err);
  }
}

/**
 * Fetch all registered users from Firestore database
 */
export async function fetchUsersFromFirestore(): Promise<UserProfile[]> {
  try {
    const [snap, delSnap] = await Promise.all([
      getDocs(collection(db, USERS_COL)),
      getDocs(collection(db, DELETED_USERS_COL)).catch(() => ({ forEach: () => {} } as any)),
    ]);

    const deletedIds = new Set<string>();
    const deletedNicks = new Set<string>();
    const deletedEmails = new Set<string>();

    delSnap.forEach((docSnap: any) => {
      const data = docSnap.data();
      if (data) {
        if (data.userId) deletedIds.add(String(data.userId).trim());
        if (docSnap.id && docSnap.id.startsWith('usr_')) deletedIds.add(String(docSnap.id).trim());
        if (data.nickname) deletedNicks.add(String(data.nickname).toLowerCase().replace(/^@/, '').trim());
        if (data.studentEmail) deletedEmails.add(String(data.studentEmail).toLowerCase().trim());
      }
    });

    const list: UserProfile[] = [];
    snap.forEach((docSnap) => {
      const u = docSnap.data() as UserProfile;
      if (u && (u.id || u.nickname) && !isDemoUser(u) && !isDemoNickname(u.nickname)) {
        const uId = String(u.id || docSnap.id).trim();
        const uNick = String(u.nickname || '').toLowerCase().replace(/^@/, '').trim();
        const uEmail = String(u.studentEmail || '').toLowerCase().trim();

        if (deletedIds.has(uId) || deletedNicks.has(uNick) || (uEmail && deletedEmails.has(uEmail))) {
          return;
        }

        const userObj = { ...u, id: u.id || docSnap.id };
        list.push(isModulaAccount(userObj) ? sanitizeModulaProfile(userObj) : userObj);
      }
    });
    return mergeUsers([], list);
  } catch (err) {
    console.error('Error fetching users from Firestore:', err);
    return [];
  }
}

/**
 * Fetch a single user by id, nickname, or email from Firestore
 */
export async function fetchUserFromFirestore(searchKey: string): Promise<UserProfile | null> {
  if (!searchKey || !searchKey.trim()) return null;
  try {
    const cleanKey = searchKey.trim().toLowerCase().replace(/^@/, '');
    const users = await fetchUsersFromFirestore();
    const found = users.find((u) => {
      const uId = String(u.id || '').toLowerCase();
      const uNick = (u.nickname || '').toLowerCase().replace(/^@/, '');
      const uEmail = (u.studentEmail || '').toLowerCase().trim();
      return uId === cleanKey || uNick === cleanKey || uEmail === cleanKey;
    });
    return found || null;
  } catch (err) {
    console.error('Error fetching single user from Firestore:', err);
    return null;
  }
}

/**
 * Delete single user completely from Firestore
 */
export async function deleteUserFromFirestore(userId: string, nickname?: string, studentEmail?: string): Promise<void> {
  try {
    const cleanNick = nickname ? nickname.toLowerCase().replace(/^@/, '') : '';
    const cleanEmail = studentEmail ? studentEmail.toLowerCase().trim() : '';

    const tombstoneData = {
      userId: userId || null,
      nickname: cleanNick || null,
      studentEmail: cleanEmail || null,
      deletedAt: new Date().toISOString(),
    };

    // 0. Record central tombstone in Firestore IMMEDIATELY under both ID and nickname so all devices detect it at once
    const tombstonePromises: Promise<any>[] = [];
    if (userId) {
      tombstonePromises.push(setDoc(doc(db, DELETED_USERS_COL, userId), tombstoneData).catch(() => {}));
    }
    if (cleanNick) {
      tombstonePromises.push(setDoc(doc(db, DELETED_USERS_COL, cleanNick), tombstoneData).catch(() => {}));
    }
    if (cleanEmail) {
      tombstonePromises.push(setDoc(doc(db, DELETED_USERS_COL, cleanEmail.replace(/[^a-z0-9]/g, '_')), tombstoneData).catch(() => {}));
    }
    await Promise.all(tombstonePromises);

    // 1. Immediately delete direct user documents from USERS_COL
    const directDeletePromises: Promise<any>[] = [];
    if (userId) {
      directDeletePromises.push(deleteDoc(doc(db, USERS_COL, userId)).catch(() => {}));
    }
    if (nickname) {
      const docId = nickname.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (docId) {
        directDeletePromises.push(deleteDoc(doc(db, USERS_COL, docId)).catch(() => {}));
      }
    }
    await Promise.all(directDeletePromises);

    // 2. Query and delete any matching user docs in USERS_COL
    const snap = await getDocs(collection(db, USERS_COL));
    const promises: Promise<any>[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      const dNick = (data.nickname || '').toLowerCase().replace(/^@/, '');
      const dEmail = (data.studentEmail || '').toLowerCase().trim();
      const dId = data.id || docSnap.id;
      if (
        (userId && (dId === userId || docSnap.id === userId)) ||
        (cleanNick && dNick === cleanNick) ||
        (cleanEmail && dEmail && dEmail === cleanEmail)
      ) {
        promises.push(deleteDoc(docSnap.ref).catch(() => {}));
      }
    });

    // 3. Purge verification requests
    const verifSnap = await getDocs(collection(db, VERIFICATIONS_COL));
    verifSnap.forEach((vDoc) => {
      const vData = vDoc.data() as any;
      const vNick = (vData.applicantNickname || '').toLowerCase().replace(/^@/, '');
      if (cleanNick && vNick === cleanNick) {
        promises.push(deleteDoc(vDoc.ref).catch(() => {}));
      }
    });

    // 2. Purge user posts and track deleted post IDs
    const deletedPostDocIds: string[] = [];
    const postSnap = await getDocs(collection(db, POSTS_COL));
    postSnap.forEach((pDoc) => {
      const pData = pDoc.data() as any;
      const pNick = (pData.authorNickname || '').toLowerCase().replace(/^@/, '');
      const pId = pData.authorId || '';
      if ((cleanNick && pNick === cleanNick) || (userId && pId === userId) || (userId && pDoc.id === userId)) {
        deletedPostDocIds.push(pDoc.id);
        promises.push(deleteDoc(pDoc.ref).catch(() => {}));
      }
    });

    // 2b. Purge any reposts of those deleted posts
    postSnap.forEach((pDoc) => {
      const pData = pDoc.data() as any;
      if (pData.repostedPostId && deletedPostDocIds.includes(pData.repostedPostId)) {
        promises.push(deleteDoc(pDoc.ref).catch(() => {}));
      }
    });

    // 2c. Remove deleted user's likes on remaining posts and recalculate like counts
    postSnap.forEach((pDoc) => {
      if (deletedPostDocIds.includes(pDoc.id)) return;
      const pData = pDoc.data() as any;
      if (pData.likedBy && Array.isArray(pData.likedBy)) {
        const hadLike = pData.likedBy.some(
          (l: string) => (cleanNick && l.toLowerCase().replace(/^@/, '') === cleanNick) || (userId && l === userId)
        );
        if (hadLike) {
          const nextLikedBy = pData.likedBy.filter(
            (l: string) => (cleanNick && l.toLowerCase().replace(/^@/, '') !== cleanNick) && (!userId || l !== userId)
          );
          const newLikes = Math.max(0, nextLikedBy.length);
          promises.push(
            setDoc(pDoc.ref, { likedBy: nextLikedBy, likes: newLikes, likesCount: newLikes }, { merge: true }).catch(() => {})
          );
        }
      }
    });

    // 3. Purge user comments and recalculate commentCount on affected posts
    const affectedPostIds = new Set<string>();
    const commentSnap = await getDocs(collection(db, COMMENTS_COL));
    commentSnap.forEach((cDoc) => {
      const cData = cDoc.data() as any;
      const cNick = (cData.authorNickname || '').toLowerCase().replace(/^@/, '');
      const cId = cData.authorId || '';
      if ((cleanNick && cNick === cleanNick) || (userId && cId === userId) || (cData.postId && deletedPostDocIds.includes(cData.postId))) {
        if (cData.postId && !deletedPostDocIds.includes(cData.postId)) {
          affectedPostIds.add(cData.postId);
        }
        promises.push(deleteDoc(cDoc.ref).catch(() => {}));
      }
    });

    // Reconcile comment counts on affected active posts
    affectedPostIds.forEach((postId) => {
      let remainingCount = 0;
      commentSnap.forEach((cDoc) => {
        const cData = cDoc.data() as any;
        const cNick = (cData.authorNickname || '').toLowerCase().replace(/^@/, '');
        const cId = cData.authorId || '';
        const isDeleted = (cleanNick && cNick === cleanNick) || (userId && cId === userId);
        if (cData.postId === postId && !isDeleted) {
          remainingCount += 1;
        }
      });
      promises.push(
        setDoc(doc(db, POSTS_COL, postId), { commentCount: remainingCount, commentsCount: remainingCount }, { merge: true }).catch(() => {})
      );
    });

    // 4. Purge marketplace listings
    const mPendingSnap = await getDocs(collection(db, MARKETPLACE_PENDING_COL));
    mPendingSnap.forEach((mDoc) => {
      const mData = mDoc.data() as any;
      const mNick = (mData.sellerNickname || '').toLowerCase().replace(/^@/, '');
      const mId = mData.sellerId || '';
      if ((cleanNick && mNick === cleanNick) || (userId && mId === userId)) {
        promises.push(deleteDoc(mDoc.ref).catch(() => {}));
      }
    });

    const mApprovedSnap = await getDocs(collection(db, MARKETPLACE_APPROVED_COL));
    mApprovedSnap.forEach((mDoc) => {
      const mData = mDoc.data() as any;
      const mNick = (mData.sellerNickname || '').toLowerCase().replace(/^@/, '');
      const mId = mData.sellerId || '';
      if ((cleanNick && mNick === cleanNick) || (userId && mId === userId)) {
        promises.push(deleteDoc(mDoc.ref).catch(() => {}));
      }
    });

    // 5. Purge user direct messages (both sent and received)
    const dmsSnap = await getDocs(collection(db, DIRECT_MESSAGES_COL));
    dmsSnap.forEach((dDoc) => {
      const dData = dDoc.data() as any;
      const sNick = (dData.senderNickname || '').toLowerCase().replace(/^@/, '');
      const rNick = (dData.receiverNickname || '').toLowerCase().replace(/^@/, '');
      const sId = dData.senderId || '';
      const rId = dData.receiverId || '';
      if (
        (cleanNick && (sNick === cleanNick || rNick === cleanNick)) ||
        (userId && (sId === userId || rId === userId))
      ) {
        promises.push(deleteDoc(dDoc.ref).catch(() => {}));
      }
    });

    // 6. Purge user helpdesk inquiries
    const helpdeskSnap = await getDocs(collection(db, HELPDESK_COL));
    helpdeskSnap.forEach((hDoc) => {
      const hData = hDoc.data() as any;
      const hNick = (hData.userNickname || '').toLowerCase().replace(/^@/, '');
      if (cleanNick && hNick === cleanNick) {
        promises.push(deleteDoc(hDoc.ref).catch(() => {}));
      }
    });

    // 7. Purge user follows
    const followsSnap = await getDocs(collection(db, FOLLOWS_COL));
    followsSnap.forEach((fDoc) => {
      const fData = fDoc.data() as any;
      const fFollower = (fData.followerNickname || '').toLowerCase().replace(/^@/, '');
      const fFollowing = (fData.followingNickname || '').toLowerCase().replace(/^@/, '');
      if ((cleanNick && fFollower === cleanNick) || (cleanNick && fFollowing === cleanNick)) {
        promises.push(deleteDoc(fDoc.ref).catch(() => {}));
      }
    });

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    // Notify server to ensure central database and disk storage are also pruned synchronously
    try {
      await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, nickname: cleanNick, studentEmail: cleanEmail }),
      });
    } catch {}
  } catch (err) {
    console.error('Error deleting user from Firestore:', err);
  }
}

/**
 * Delete comment from Firestore
 */
export async function deleteCommentFromFirestore(commentId: string): Promise<void> {
  if (!commentId) return;
  try {
    await deleteDoc(doc(db, COMMENTS_COL, commentId));
  } catch (err) {
    console.error('Error deleting comment from Firestore:', err);
  }
}

/**
 * Delete direct message from Firestore
 */
export async function deleteDirectMessageFromFirestore(messageId: string): Promise<void> {
  if (!messageId) return;
  try {
    await deleteDoc(doc(db, DIRECT_MESSAGES_COL, messageId));
  } catch (err) {
    console.error('Error deleting direct message from Firestore:', err);
  }
}

/**
 * Delete report from Firestore
 */
export async function deleteReportFromFirestore(reportId: string): Promise<void> {
  if (!reportId) return;
  try {
    await deleteDoc(doc(db, REPORTS_COL, reportId));
  } catch (err) {
    console.error('Error deleting report from Firestore:', err);
  }
}

/**
 * Subscribe to Posts in Firestore in real-time
 */
export function subscribePosts(onUpdate: (posts: Post[]) => void) {
  return onSnapshot(collection(db, POSTS_COL), (snapshot) => {
    const list: Post[] = [];
    snapshot.forEach((docSnap) => {
      const raw = docSnap.data() as Post;
      const p: Post = { ...raw, id: raw?.id || docSnap.id };
      if (!isDemoPost(p) && !isPostDeletedLocally(p.id)) {
        // Strip any legacy global personal flags from previous sessions
        delete p.isBookmarked;
        delete p.isBookmarkedByMe;
        delete p.isLikedByMe;
        delete p.isRepostedByMe;
        if (Array.isArray(p.likedBy)) {
          p.likes = p.likedBy.length;
          p.likesCount = p.likedBy.length;
        }
        list.push(p);
      }
    });
    // Sort descending by createdAt / timestamp
    list.sort((a, b) => new Date(b.createdAt || b.timestamp || 0).getTime() - new Date(a.createdAt || a.timestamp || 0).getTime());
    onUpdate(list);
  }, (err) => {
    console.warn('Firestore posts subscription fallback/warning:', err?.message || err);
  });
}

/**
 * Fetch single post from Firestore by ID (deep-linking & sharing)
 */
export async function getPostFromFirestore(postId: string): Promise<Post | null> {
  if (!postId || isPostDeletedLocally(postId)) return null;
  try {
    const snap = await getDoc(doc(db, POSTS_COL, postId));
    if (snap.exists()) {
      const raw = snap.data() as Post;
      const p: Post = { ...raw, id: raw?.id || snap.id };
      if (!isDemoPost(p) && !isPostDeletedLocally(p.id)) {
        delete p.isBookmarked;
        delete p.isBookmarkedByMe;
        delete p.isLikedByMe;
        delete p.isRepostedByMe;
        return p;
      }
    }
  } catch (err) {
    console.error('Error fetching post from Firestore:', err);
  }
  return null;
}

/**
 * Save single post to Firestore
 */
export async function savePostToFirestore(post: Post): Promise<boolean> {
  if (!post || !post.id || isDemoPost(post) || isPostDeletedLocally(post.id)) return false;
  try {
    const cleanPost: any = sanitizeForFirestore(post);
    // CRITICAL: Personal per-user flags must never be persisted to Firestore on shared documents
    delete cleanPost.isBookmarkedByMe;
    delete cleanPost.isBookmarked;
    delete cleanPost.isLikedByMe;
    delete cleanPost.isRepostedByMe;
    // Strip oversized base64 authorAvatarUrl to stay well within Firestore 1MB doc limit
    if (cleanPost.authorAvatarUrl && String(cleanPost.authorAvatarUrl).length > 150000) {
      delete cleanPost.authorAvatarUrl;
    }
    if (!cleanPost.updatedAt) {
      cleanPost.updatedAt = cleanPost.timestamp || cleanPost.createdAt || new Date().toISOString();
    }
    await setDoc(doc(db, POSTS_COL, post.id), cleanPost, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving post to Firestore:', err);
    return false;
  }
}

/**
 * Update only a post's commentsCount in Firestore without overwriting concurrent likes/reposts
 */
export async function updatePostCommentsCountInFirestore(postId: string, commentsCount: number): Promise<void> {
  if (!postId || isPostDeletedLocally(postId)) return;
  try {
    const safeCount = Math.max(0, Number(commentsCount) || 0);
    await setDoc(
      doc(db, POSTS_COL, postId),
      { commentsCount: safeCount, commentCount: safeCount },
      { merge: true }
    );
  } catch (err) {
    console.error('Error updating post commentsCount in Firestore:', err);
  }
}

/**
 * Normalize a user like key (matches reactionUtils.normalizeUserKey)
 */
function normalizeLikeKey(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase().replace(/^@/, '').trim();
}

/**
 * Atomically toggle a user's like on a Post document in Firestore using a transaction
 * so concurrent likes from different devices/accounts never overwrite each other.
 */
export async function togglePostLikeInFirestore(
  postId: string,
  userKey: string,
  userAliases: string[] = [],
  fallbackLikedBy?: string[]
): Promise<{ likedBy: string[]; likesCount: number; updatedAt: string } | null> {
  const cleanKey = normalizeLikeKey(userKey);
  if (!postId || !cleanKey || isPostDeletedLocally(postId)) return null;

  const aliasSet = new Set<string>([cleanKey]);
  userAliases.forEach((a) => {
    const norm = normalizeLikeKey(a);
    if (norm) aliasSet.add(norm);
  });

  try {
    const postRef = doc(db, POSTS_COL, postId);
    const nowIso = new Date().toISOString();
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(postRef);
      const data = snap.exists() ? (snap.data() as any) : null;
      const rawLikedBy: string[] = Array.isArray(data?.likedBy)
        ? data.likedBy
        : Array.isArray(fallbackLikedBy)
        ? fallbackLikedBy
        : [];

      const deduped: string[] = [];
      const seen = new Set<string>();
      for (const item of rawLikedBy) {
        const norm = normalizeLikeKey(item);
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          deduped.push(norm);
        }
      }

      const alreadyLiked = deduped.some((k) => aliasSet.has(k));
      const nextLikedBy = alreadyLiked
        ? deduped.filter((k) => !aliasSet.has(k))
        : [...deduped, cleanKey];
      const nextCount = nextLikedBy.length;

      transaction.set(
        postRef,
        {
          likedBy: nextLikedBy,
          likesCount: nextCount,
          likes: nextCount,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      return { likedBy: nextLikedBy, likesCount: nextCount, updatedAt: nowIso };
    });
    return result;
  } catch (err) {
    console.error('Error toggling post like in Firestore transaction:', err);
    return null;
  }
}

/**
 * Atomically toggle a user's like on a Comment document in Firestore using a transaction
 */
export async function toggleCommentLikeInFirestore(
  commentId: string,
  userKey: string,
  userAliases: string[] = [],
  fallbackLikedBy?: string[]
): Promise<{ likedBy: string[]; likesCount: number; updatedAt: string } | null> {
  const cleanKey = normalizeLikeKey(userKey);
  if (!commentId || !cleanKey || isCommentDeletedLocally(commentId)) return null;

  const aliasSet = new Set<string>([cleanKey]);
  userAliases.forEach((a) => {
    const norm = normalizeLikeKey(a);
    if (norm) aliasSet.add(norm);
  });

  try {
    const commentRef = doc(db, COMMENTS_COL, commentId);
    const nowIso = new Date().toISOString();
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(commentRef);
      const data = snap.exists() ? (snap.data() as any) : null;
      const rawLikedBy: string[] = Array.isArray(data?.likedBy)
        ? data.likedBy
        : Array.isArray(fallbackLikedBy)
        ? fallbackLikedBy
        : [];

      const deduped: string[] = [];
      const seen = new Set<string>();
      for (const item of rawLikedBy) {
        const norm = normalizeLikeKey(item);
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          deduped.push(norm);
        }
      }

      const alreadyLiked = deduped.some((k) => aliasSet.has(k));
      const nextLikedBy = alreadyLiked
        ? deduped.filter((k) => !aliasSet.has(k))
        : [...deduped, cleanKey];
      const nextCount = nextLikedBy.length;

      transaction.set(
        commentRef,
        {
          likedBy: nextLikedBy,
          likesCount: nextCount,
          likes: nextCount,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      return { likedBy: nextLikedBy, likesCount: nextCount, updatedAt: nowIso };
    });
    return result;
  } catch (err) {
    console.error('Error toggling comment like in Firestore transaction:', err);
    return null;
  }
}

/**
 * Fetch all posts from Firestore (one-shot fallback/hydration)
 */
export async function fetchPostsFromFirestore(): Promise<Post[]> {
  try {
    const snap = await getDocs(collection(db, POSTS_COL));
    const list: Post[] = [];
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Post;
      const p: Post = { ...raw, id: raw?.id || docSnap.id };
      if (!isDemoPost(p) && !isPostDeletedLocally(p.id)) {
        delete p.isBookmarked;
        delete p.isBookmarkedByMe;
        delete p.isLikedByMe;
        delete p.isRepostedByMe;
        list.push(p);
      }
    });
    return list;
  } catch (err) {
    console.error('Error fetching posts from Firestore:', err);
    return [];
  }
}

/**
 * Fetch all comments from Firestore (one-shot fallback/hydration)
 */
export async function fetchCommentsFromFirestore(): Promise<Comment[]> {
  try {
    const snap = await getDocs(collection(db, COMMENTS_COL));
    const list: Comment[] = [];
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Comment;
      const c: Comment = { ...raw, id: raw?.id || docSnap.id };
      if (!isDemoComment(c) && !isCommentDeletedLocally(c.id)) {
        delete c.isLikedByMe;
        list.push(c);
      }
    });
    return list;
  } catch (err) {
    console.error('Error fetching comments from Firestore:', err);
    return [];
  }
}

/**
 * Delete post from Firestore
 */
export async function deletePostFromFirestore(postId: string): Promise<void> {
  if (!postId) return;
  try {
    await deleteDoc(doc(db, POSTS_COL, postId));
    // Also delete any comments associated with this post in Firestore
    const commentSnap = await getDocs(query(collection(db, COMMENTS_COL), where('postId', '==', postId)));
    if (!commentSnap.empty) {
      const batch = writeBatch(db);
      commentSnap.forEach((cDoc) => {
        batch.delete(cDoc.ref);
      });
      await batch.commit().catch(() => {});
    }
  } catch (err) {
    console.error('Error deleting post from Firestore:', err);
  }
}

/**
 * Subscribe to Comments in Firestore
 */
export function subscribeComments(onUpdate: (comments: Comment[]) => void) {
  return onSnapshot(collection(db, COMMENTS_COL), (snapshot) => {
    const list: Comment[] = [];
    snapshot.forEach((docSnap) => {
      const raw = docSnap.data() as Comment;
      const c: Comment = { ...raw, id: raw?.id || docSnap.id };
      if (!isDemoComment(c) && !isCommentDeletedLocally(c.id)) {
        delete c.isLikedByMe;
        if (Array.isArray(c.likedBy)) {
          c.likes = c.likedBy.length;
          c.likesCount = c.likedBy.length;
        }
        list.push(c);
      }
    });
    list.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
    onUpdate(list);
  }, (err) => {
    console.warn('Firestore comments subscription fallback/warning:', err?.message || err);
  });
}

/**
 * Save comment to Firestore
 */
export async function saveCommentToFirestore(comment: Comment): Promise<boolean> {
  if (!comment || !comment.id || isDemoComment(comment) || isCommentDeletedLocally(comment.id)) return false;
  try {
    const cleanComment: any = sanitizeForFirestore(comment);
    delete cleanComment.isLikedByMe;
    if (!cleanComment.authorNickname) {
      cleanComment.authorNickname = '@FUHSI_Student';
    }
    if (!cleanComment.updatedAt) {
      cleanComment.updatedAt = cleanComment.timestamp || new Date().toISOString();
    }
    // Strip oversized base64 authorAvatarUrl so comment docs stay well under Firestore 1MB limit
    if (cleanComment.authorAvatarUrl && String(cleanComment.authorAvatarUrl).length > 150000) {
      delete cleanComment.authorAvatarUrl;
    }
    await setDoc(doc(db, COMMENTS_COL, comment.id), cleanComment, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving comment to Firestore:', err);
    return false;
  }
}

/**
 * Subscribe to Marketplace Approved Items
 */
export function subscribeMarketplaceApproved(onUpdate: (items: MarketplaceItem[]) => void) {
  return onSnapshot(
    collection(db, MARKETPLACE_APPROVED_COL),
    (snapshot) => {
      const list: MarketplaceItem[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data() as MarketplaceItem;
        if (!isDemoMarketplaceItem(item)) {
          list.push(item);
        }
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Firestore marketplace subscription fallback/warning:', err?.message || err);
    }
  );
}

export async function saveMarketplaceApprovedToFirestore(item: MarketplaceItem): Promise<void> {
  if (!item || !item.id || isDemoMarketplaceItem(item)) return;
  try {
    await setDoc(doc(db, MARKETPLACE_APPROVED_COL, item.id), sanitizeForFirestore(item), { merge: true });
  } catch (err) {
    console.error('Error saving marketplace item to Firestore:', err);
  }
}

export async function deleteMarketplaceApprovedFromFirestore(itemId: string): Promise<void> {
  if (!itemId) return;
  try {
    await deleteDoc(doc(db, MARKETPLACE_APPROVED_COL, itemId));
    await deleteDoc(doc(db, MARKETPLACE_PENDING_COL, itemId));
  } catch (err) {
    console.error('Error deleting marketplace item from Firestore:', err);
  }
}

/**
 * Subscribe to Verification Requests
 */
export function subscribeVerificationRequests(onUpdate: (reqs: VerificationRequest[]) => void) {
  return onSnapshot(
    collection(db, VERIFICATIONS_COL),
    (snapshot) => {
      const list: VerificationRequest[] = [];
      snapshot.forEach((docSnap) => {
        const r = docSnap.data() as VerificationRequest;
        if (!isDemoVerificationRequest(r)) {
          list.push(r);
        }
      });
      // Sort descending by timestamp / creation time
      list.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime() || 0;
        const timeB = new Date(b.timestamp || 0).getTime() || 0;
        return timeB - timeA;
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Firestore verifications subscription fallback/warning:', err?.message || err);
    }
  );
}

export async function saveVerificationRequestToFirestore(req: VerificationRequest): Promise<void> {
  if (!req || !req.id) return;
  try {
    await setDoc(doc(db, VERIFICATIONS_COL, req.id), sanitizeForFirestore(req), { merge: true });
  } catch (err) {
    console.error('Error saving verification request to Firestore:', err);
  }
}

export async function saveVerificationRequestsBatchToFirestore(reqs: VerificationRequest[]): Promise<void> {
  if (!reqs || reqs.length === 0) return;
  try {
    const batch = writeBatch(db);
    reqs.forEach((r) => {
      if (r && r.id) {
        batch.set(doc(db, VERIFICATIONS_COL, r.id), sanitizeForFirestore(r), { merge: true });
      }
    });
    await batch.commit();
  } catch (err) {
    console.error('Error batch saving verification requests to Firestore:', err);
  }
}

export async function deleteVerificationRequestFromFirestore(requestId: string): Promise<void> {
  if (!requestId) return;
  try {
    await deleteDoc(doc(db, VERIFICATIONS_COL, requestId));
  } catch (err) {
    console.error('Error deleting verification request from Firestore:', err);
  }
}

export async function fetchPostByIdFromFirestore(postId: string): Promise<Post | null> {
  if (!postId) return null;
  try {
    const postRef = doc(db, POSTS_COL, postId);
    const snap = await getDoc(postRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && !isDemoPost(data) && (!data.status || data.status !== 'DELETED')) {
        return data as Post;
      }
    }
  } catch (err) {
    console.error('Error fetching post by ID from Firestore:', err);
  }
  return null;
}

function isFirestoreQuotaError(err: any): boolean {
  const msg = String(err?.code || err?.message || err || '').toLowerCase();
  return msg.includes('quota') || msg.includes('resource-exhausted');
}

let firestoreSeedCheckedThisSession = false;

/**
 * Initial seed check: if Firestore is empty, seed initial users & posts into Firestore
 */
export async function seedFirestoreInitialDataIfNeeded(initialUsers: UserProfile[], initialPosts: Post[]) {
  if (firestoreSeedCheckedThisSession) return;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('fuhsi_firestore_seeded_v1') === 'true') {
      firestoreSeedCheckedThisSession = true;
      return;
    }
  } catch {}
  firestoreSeedCheckedThisSession = true;

  try {
    const validUsers = (initialUsers || []).filter((u) => !isDemoUser(u) && !isDemoNickname(u.nickname));
    const usersSnap = await getDocs(query(collection(db, USERS_COL), limit(1)));
    if (usersSnap.empty && validUsers.length > 0) {
      console.log('Seeding initial non-demo users to Firestore...');
      await saveUsersBatchToFirestore(validUsers);
    }

    const validPosts = (initialPosts || []).filter((p) => !isDemoPost(p));
    const postsSnap = await getDocs(query(collection(db, POSTS_COL), limit(1)));
    if (postsSnap.empty && validPosts.length > 0) {
      console.log('Seeding initial non-demo posts to Firestore...');
      for (const p of validPosts) {
        await savePostToFirestore(p);
      }
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fuhsi_firestore_seeded_v1', 'true');
      }
    } catch {}
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      console.warn('Firestore daily read quota exceeded; continuing with central server fallback:', err?.message || err);
    } else {
      console.warn('Initial Firestore seed check notice:', err?.message || err);
    }
  }
}

/**
 * Purge all non-admin users and all posts/content from Firestore
 */
export async function purgeAllExceptAdminFromFirestore(): Promise<void> {
  try {
    const usersSnap = await getDocs(collection(db, USERS_COL));
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      if (!data.isAdmin && data.nickname !== '@modula') {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    const postsSnap = await getDocs(collection(db, POSTS_COL));
    postsSnap.forEach((docSnap) => deleteDoc(docSnap.ref).catch((err) => console.error(err)));

    const commentsSnap = await getDocs(collection(db, COMMENTS_COL));
    commentsSnap.forEach((docSnap) => deleteDoc(docSnap.ref).catch((err) => console.error(err)));

    const mpApprovedSnap = await getDocs(collection(db, MARKETPLACE_APPROVED_COL));
    mpApprovedSnap.forEach((docSnap) => deleteDoc(docSnap.ref).catch((err) => console.error(err)));

    const mpPendingSnap = await getDocs(collection(db, MARKETPLACE_PENDING_COL));
    mpPendingSnap.forEach((docSnap) => deleteDoc(docSnap.ref).catch((err) => console.error(err)));

    const verifsSnap = await getDocs(collection(db, VERIFICATIONS_COL));
    verifsSnap.forEach((docSnap) => deleteDoc(docSnap.ref).catch((err) => console.error(err)));

    const reportsSnap = await getDocs(collection(db, REPORTS_COL));
    reportsSnap.forEach((docSnap) => deleteDoc(docSnap.ref).catch((err) => console.error(err)));

    console.log('Successfully purged all non-admin data and posts from Firestore.');
  } catch (err) {
    console.error('Error purging Firestore database:', err);
  }
}

/**
 * Purge all demo accounts and demo content from Firestore
 */
export async function purgeDemoAccountsFromFirestore(): Promise<void> {
  try {
    const usersSnap = await getDocs(collection(db, USERS_COL));
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      if (isDemoUser(data) || isDemoNickname(data.nickname) || isDemoNickname(data.realName)) {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    const postsSnap = await getDocs(collection(db, POSTS_COL));
    postsSnap.forEach((docSnap) => {
      const data = docSnap.data() as Post;
      if (isDemoPost(data) || isDemoNickname(data.authorNickname) || isDemoNickname(data.nickname)) {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    const commentsSnap = await getDocs(collection(db, COMMENTS_COL));
    commentsSnap.forEach((docSnap) => {
      const data = docSnap.data() as Comment;
      if (isDemoComment(data) || isDemoNickname(data.authorNickname) || isDemoNickname(data.replyToNickname)) {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    const mpApprovedSnap = await getDocs(collection(db, MARKETPLACE_APPROVED_COL));
    mpApprovedSnap.forEach((docSnap) => {
      const data = docSnap.data() as MarketplaceItem;
      if (isDemoMarketplaceItem(data) || isDemoNickname(data.sellerNickname)) {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    const mpPendingSnap = await getDocs(collection(db, MARKETPLACE_PENDING_COL));
    mpPendingSnap.forEach((docSnap) => {
      const data = docSnap.data() as MarketplaceItem;
      if (isDemoMarketplaceItem(data) || isDemoNickname(data.sellerNickname)) {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    const verifsSnap = await getDocs(collection(db, VERIFICATIONS_COL));
    verifsSnap.forEach((docSnap) => {
      const data = docSnap.data() as VerificationRequest;
      if (isDemoVerificationRequest(data) || isDemoNickname(data.applicantNickname)) {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    const dmsSnap = await getDocs(collection(db, DIRECT_MESSAGES_COL));
    dmsSnap.forEach((docSnap) => {
      const data = docSnap.data() as DirectMessage;
      if (isDemoDirectMessage(data) || isDemoNickname(data.senderNickname) || isDemoNickname(data.receiverNickname)) {
        deleteDoc(docSnap.ref).catch((err) => console.error(err));
      }
    });

    console.log('Successfully completed Firestore cleanup of demo accounts and content.');
  } catch (err) {
    console.error('Error cleaning demo accounts from Firestore:', err);
  }
}

/**
 * Subscribe to Direct Messages filtered by conversation ID in Firestore
 */
export function subscribeDirectMessagesByConversation(
  conversationId: string,
  onUpdate: (messages: DirectMessage[]) => void,
  onError?: (err: any) => void
) {
  if (!conversationId) {
    onUpdate([]);
    return () => {};
  }

  try {
    const q = query(
      collection(db, DIRECT_MESSAGES_COL),
      where('conversationId', '==', conversationId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: DirectMessage[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as DirectMessage;
          const msg: DirectMessage = { ...raw, id: raw?.id || docSnap.id };
          if (!isDemoDirectMessage(msg)) {
            list.push(msg);
          }
        });
        // Sort chronologically by timestamp, falling back to ID
        list.sort((a, b) => {
          const tA = new Date(a.timestamp || 0).getTime() || 0;
          const tB = new Date(b.timestamp || 0).getTime() || 0;
          if (tA !== tB) return tA - tB;
          return (a.id || '').localeCompare(b.id || '');
        });
        onUpdate(list);
      },
      (err) => {
        console.warn(`Firestore direct messages subscription fallback for ${conversationId}:`, err?.message || err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.error('Failed to create direct messages subscription:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Save single direct message to Firestore
 */
export async function saveDirectMessageToFirestore(msg: DirectMessage): Promise<boolean> {
  if (!msg || !msg.id || isDemoDirectMessage(msg)) return false;
  try {
    const cleanMsg: any = sanitizeForFirestore(msg);
    if (cleanMsg.senderAvatarUrl && String(cleanMsg.senderAvatarUrl).length > 150000) {
      delete cleanMsg.senderAvatarUrl;
    }
    await setDoc(doc(db, DIRECT_MESSAGES_COL, msg.id), cleanMsg, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving direct message to Firestore:', err);
    return false;
  }
}

/**
 * Subscribe to Verification Fee from Firestore
 */
export function subscribeVerificationFee(onUpdate: (fee: number) => void) {
  return onSnapshot(
    doc(db, SETTINGS_COL, VERIFICATION_SETTINGS_DOC),
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data?.verificationFee === 'number' && !isNaN(data.verificationFee)) {
          onUpdate(data.verificationFee);
        }
      }
    },
    (err) => {
      console.warn('Firestore verification fee subscription warning:', err?.message || err);
    }
  );
}

/**
 * Save Verification Fee to Firestore
 */
export async function saveVerificationFeeToFirestore(fee: number): Promise<void> {
  if (typeof fee !== 'number' || isNaN(fee)) return;
  try {
    await setDoc(
      doc(db, SETTINGS_COL, VERIFICATION_SETTINGS_DOC),
      { verificationFee: fee, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (err) {
    console.error('Error saving verification fee to Firestore:', err);
  }
}

/**
 * Subscribe to all direct messages
 */
export function subscribeAllDirectMessages(onUpdate: (messages: DirectMessage[]) => void) {
  return onSnapshot(
    collection(db, DIRECT_MESSAGES_COL),
    (snapshot) => {
      const list: DirectMessage[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as DirectMessage;
        const msg: DirectMessage = { ...raw, id: raw?.id || docSnap.id };
        if (!isDemoDirectMessage(msg)) {
          list.push(msg);
        }
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Firestore all direct messages subscription fallback/warning:', err?.message || err);
    }
  );
}

/**
 * Subscribe to Help Desk Inquiries & Appeals from Firestore
 */
export function subscribeHelpDeskInquiries(onUpdate: (inquiries: HelpDeskInquiry[]) => void) {
  return onSnapshot(
    collection(db, HELPDESK_COL),
    (snapshot) => {
      const list: HelpDeskInquiry[] = [];
      snapshot.forEach((docSnap) => {
        const inq = docSnap.data() as HelpDeskInquiry;
        if (inq && inq.id) {
          list.push(inq);
        }
      });
      // Sort descending by createdAt
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      onUpdate(list);
    },
    (err) => {
      console.warn('Firestore help desk inquiries subscription fallback/warning:', err?.message || err);
    }
  );
}

/**
 * Save Help Desk inquiry or appeal to Firestore
 */
export async function saveHelpDeskInquiryToFirestore(inquiry: HelpDeskInquiry): Promise<void> {
  if (!inquiry || !inquiry.id) return;
  try {
    await setDoc(doc(db, HELPDESK_COL, inquiry.id), sanitizeForFirestore(inquiry), { merge: true });
  } catch (err) {
    console.error('Error saving Help Desk inquiry to Firestore:', err);
  }
}

/**
 * Update Help Desk inquiry status in Firestore
 */
export async function updateHelpDeskInquiryStatus(inquiryId: string, status: 'PENDING' | 'RESOLVED' | 'UNDER_REVIEW', adminNotes?: string): Promise<void> {
  if (!inquiryId) return;
  try {
    await setDoc(
      doc(db, HELPDESK_COL, inquiryId),
      sanitizeForFirestore({
        status,
        ...(adminNotes ? { adminNotes } : {}),
        resolvedAt: status === 'RESOLVED' ? new Date().toISOString() : undefined,
      }),
      { merge: true }
    );
  } catch (err) {
    console.error('Error updating Help Desk inquiry status:', err);
  }
}

/**
 * Subscribe to all follow relationships in real-time
 */
export function subscribeFollows(onUpdate: (follows: FollowRecord[]) => void) {
  return onSnapshot(
    collection(db, FOLLOWS_COL),
    (snapshot) => {
      const list: FollowRecord[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data() as FollowRecord;
        if (
          item &&
          item.followerNickname &&
          item.followingNickname &&
          !isDemoNickname(item.followerNickname) &&
          !isDemoNickname(item.followingNickname)
        ) {
          list.push(item);
        }
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Firestore follows subscription fallback/warning:', err?.message || err);
    }
  );
}

/**
 * Save single follow relationship to Firestore
 */
export async function saveFollowToFirestore(follow: FollowRecord): Promise<void> {
  if (!follow || !follow.id || !follow.followerNickname || !follow.followingNickname) return;
  if (isDemoNickname(follow.followerNickname) || isDemoNickname(follow.followingNickname)) return;
  try {
    await setDoc(doc(db, FOLLOWS_COL, follow.id), sanitizeForFirestore(follow), { merge: true });
  } catch (err) {
    console.error('Error saving follow relationship to Firestore:', err);
  }
}

/**
 * Delete a follow relationship from Firestore
 */
export async function deleteFollowFromFirestore(docId: string): Promise<void> {
  if (!docId) return;
  try {
    await deleteDoc(doc(db, FOLLOWS_COL, docId));
  } catch (err) {
    console.error('Error deleting follow relationship from Firestore:', err);
  }
}

/**
 * Subscribe to all chat groups from Firestore in real-time
 */
export function subscribeChatGroups(onUpdate: (groups: ChatGroup[]) => void) {
  try {
    return onSnapshot(
      collection(db, CHAT_GROUPS_COL),
      (snapshot) => {
        const list: ChatGroup[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as ChatGroup;
          const group: ChatGroup = { ...raw, id: raw?.id || docSnap.id };
          if (group && group.id && !group.isDeleted) {
            list.push(group);
          }
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('Firestore chat groups subscription warning:', err?.message || err);
      }
    );
  } catch (err) {
    console.error('Failed to subscribe to chat groups:', err);
    return () => {};
  }
}

/**
 * Save single chat group to Firestore
 */
export async function saveChatGroupToFirestore(group: ChatGroup): Promise<boolean> {
  if (!group || !group.id) return false;
  try {
    const cleanGroup: any = sanitizeForFirestore(group);
    if (cleanGroup.avatarUrl && String(cleanGroup.avatarUrl).length > 150000) {
      delete cleanGroup.avatarUrl;
    }
    await setDoc(doc(db, CHAT_GROUPS_COL, group.id), cleanGroup, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving chat group to Firestore:', err);
    return false;
  }
}

/**
 * Delete chat group from Firestore
 */
export async function deleteChatGroupFromFirestore(groupId: string): Promise<void> {
  if (!groupId) return;
  try {
    await deleteDoc(doc(db, CHAT_GROUPS_COL, groupId));
  } catch (err) {
    console.error('Error deleting chat group from Firestore:', err);
  }
}

/**
 * Normalize notification target handle ('__all__' preserved, user handles lowercased without '@')
 */
function normalizeNotifTarget(target: string): string {
  const raw = (target || '').trim();
  if (raw === '__all__') return '__all__';
  return raw.toLowerCase().replace(/^@+/, '');
}

/**
 * Save a platform notification to Firestore for cross-device delivery
 */
export async function saveNotificationToFirestore(
  targetNicknameOrAll: string,
  notif: CampusNotification
): Promise<boolean> {
  if (!targetNicknameOrAll || !notif || !notif.id) return false;
  if (notif.type === 'DIRECT_MESSAGE' || notif.id.startsWith('notif_dm_')) return false;
  const cleanTarget = normalizeNotifTarget(targetNicknameOrAll);
  if (!cleanTarget) return false;

  try {
    const nowIso = new Date().toISOString();
    const validIso =
      notif.createdAt ||
      (notif.timestamp && !isNaN(Date.parse(notif.timestamp)) ? notif.timestamp : nowIso);
    const cleanNotif = sanitizeForFirestore({
      ...notif,
      id: notif.id,
      targetNickname: cleanTarget,
      timestamp: validIso,
      createdAt: validIso,
      updatedAt: notif.updatedAt || nowIso,
      readByUsers: Array.isArray(notif.readByUsers) ? notif.readByUsers : [],
    });
    await setDoc(doc(db, NOTIFICATIONS_COL, notif.id), cleanNotif, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving notification to Firestore:', err);
    return false;
  }
}

/**
 * Subscribe in real-time to all notifications for a user (including campus-wide __all__ broadcasts)
 */
export function subscribeUserNotifications(
  userNickname: string,
  onUpdate: (notifications: CampusNotification[]) => void
) {
  const cleanNick = normalizeNotifTarget(userNickname);
  if (!cleanNick || cleanNick === '__all__') {
    return () => {};
  }

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COL),
      where('targetNickname', 'in', [cleanNick, '__all__'])
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const list: CampusNotification[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as CampusNotification;
          if (!raw) return;
          if (raw.type === 'DIRECT_MESSAGE' || (raw.id && raw.id.startsWith('notif_dm_'))) return;
          const readUsers = Array.isArray(raw.readByUsers)
            ? raw.readByUsers.map((u) => String(u).toLowerCase().replace(/^@/, '').trim())
            : [];
          const isBroadcast = raw.targetNickname === '__all__';
          const perUserIsRead = isBroadcast
            ? readUsers.includes(cleanNick)
            : Boolean(raw.isRead || readUsers.includes(cleanNick));
          list.push({
            ...raw,
            id: raw.id || docSnap.id,
            isRead: perUserIsRead,
          });
        });
        list.sort((a, b) => {
          const tA = Date.parse(a.updatedAt || a.createdAt || a.timestamp || '') || 0;
          const tB = Date.parse(b.updatedAt || b.createdAt || b.timestamp || '') || 0;
          return tB - tA;
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('Firestore user notifications subscription warning:', err?.message || err);
      }
    );
  } catch (err) {
    console.error('Failed to subscribe to user notifications:', err);
    return () => {};
  }
}

/**
 * Mark a notification as read in Firestore for a specific user (safe for both targeted and __all__ broadcasts)
 */
export async function markNotificationReadInFirestore(
  notifId: string,
  userNickname: string
): Promise<void> {
  const cleanNick = normalizeNotifTarget(userNickname);
  if (!notifId || !cleanNick || cleanNick === '__all__') return;
  try {
    const ref = doc(db, NOTIFICATIONS_COL, notifId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as CampusNotification;
    const patch: Record<string, any> = {
      readByUsers: arrayUnion(cleanNick),
      updatedAt: new Date().toISOString(),
    };
    if (data?.targetNickname !== '__all__') {
      patch.isRead = true;
    }
    await setDoc(ref, patch, { merge: true });
  } catch (err) {
    console.warn('Could not mark notification read in Firestore:', err);
  }
}

/**
 * Mark multiple notifications as read in Firestore for a specific user
 */
export async function markAllNotificationsReadInFirestore(
  notifIds: string[],
  userNickname: string
): Promise<void> {
  const cleanNick = normalizeNotifTarget(userNickname);
  if (!cleanNick || cleanNick === '__all__' || !Array.isArray(notifIds) || notifIds.length === 0) return;
  const uniqueIds = Array.from(new Set(notifIds.filter(Boolean)));
  try {
    await Promise.all(
      uniqueIds.map((id) => markNotificationReadInFirestore(id, cleanNick))
    );
  } catch (err) {
    console.warn('Could not mark all notifications read in Firestore:', err);
  }
}






