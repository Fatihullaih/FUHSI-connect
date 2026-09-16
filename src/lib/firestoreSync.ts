import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, Post, Comment, MarketplaceItem, VerificationRequest, Report, DirectMessage, HelpDeskInquiry, FollowRecord, ChatGroup } from '../types';
import { isDemoUser, isDemoPost, isDemoNickname, isDemoComment, isDemoVerificationRequest, isDemoMarketplaceItem, isDemoDirectMessage } from '../utils/postGenerator';
import { isModulaAccount, sanitizeModulaProfile } from '../utils/userDbUtils';
import { mergeUsers } from '../utils/apiSync';

// Collection references
const USERS_COL = 'users';
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
              const uId = u.id;
              const uNick = (u.nickname || '').toLowerCase().replace(/^@/, '');
              const uEmail = (u.studentEmail || '').toLowerCase();
              const isDel = deleted.some((d: any) => {
                const dId = d.id ? String(d.id).trim() : '';
                const dNick = d.nickname ? String(d.nickname).trim().toLowerCase().replace(/^@/, '') : '';
                const dEmail = d.studentEmail ? String(d.studentEmail).trim().toLowerCase() : '';
                return (uId && dId && uId === dId) || (uNick && dNick && uNick === dNick) || (uEmail && dEmail && uEmail === dEmail);
              });
              if (isDel) return;
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
export async function saveUserToFirestore(user: UserProfile): Promise<void> {
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
    const snap = await getDocs(collection(db, USERS_COL));
    const list: UserProfile[] = [];
    snap.forEach((docSnap) => {
      const u = docSnap.data() as UserProfile;
      if (u && (u.id || u.nickname) && !isDemoUser(u) && !isDemoNickname(u.nickname)) {
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

    if (userId) {
      await deleteDoc(doc(db, USERS_COL, userId)).catch(() => {});
    }
    if (nickname) {
      const docId = nickname.toLowerCase().replace(/[^a-z0-9_]/g, '');
      await deleteDoc(doc(db, USERS_COL, docId)).catch(() => {});
    }
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

    // 1. Purge verification requests
    const verifSnap = await getDocs(collection(db, VERIFICATIONS_COL));
    verifSnap.forEach((vDoc) => {
      const vData = vDoc.data() as any;
      const vNick = (vData.applicantNickname || '').toLowerCase().replace(/^@/, '');
      if (cleanNick && vNick === cleanNick) {
        promises.push(deleteDoc(vDoc.ref).catch(() => {}));
      }
    });

    // 2. Purge user posts
    const postSnap = await getDocs(collection(db, POSTS_COL));
    postSnap.forEach((pDoc) => {
      const pData = pDoc.data() as any;
      const pNick = (pData.authorNickname || '').toLowerCase().replace(/^@/, '');
      const pId = pData.authorId || '';
      if ((cleanNick && pNick === cleanNick) || (userId && pId === userId)) {
        promises.push(deleteDoc(pDoc.ref).catch(() => {}));
      }
    });

    // 3. Purge user comments
    const commentSnap = await getDocs(collection(db, COMMENTS_COL));
    commentSnap.forEach((cDoc) => {
      const cData = cDoc.data() as any;
      const cNick = (cData.authorNickname || '').toLowerCase().replace(/^@/, '');
      const cId = cData.authorId || '';
      if ((cleanNick && cNick === cleanNick) || (userId && cId === userId)) {
        promises.push(deleteDoc(cDoc.ref).catch(() => {}));
      }
    });

    // 4. Purge marketplace listings
    const mPendingSnap = await getDocs(collection(db, MARKETPLACE_PENDING_COL));
    mPendingSnap.forEach((mDoc) => {
      const mData = mDoc.data() as any;
      const mNick = (mData.sellerNickname || '').toLowerCase().replace(/^@/, '');
      if (cleanNick && mNick === cleanNick) {
        promises.push(deleteDoc(mDoc.ref).catch(() => {}));
      }
    });

    const mApprovedSnap = await getDocs(collection(db, MARKETPLACE_APPROVED_COL));
    mApprovedSnap.forEach((mDoc) => {
      const mData = mDoc.data() as any;
      const mNick = (mData.sellerNickname || '').toLowerCase().replace(/^@/, '');
      if (cleanNick && mNick === cleanNick) {
        promises.push(deleteDoc(mDoc.ref).catch(() => {}));
      }
    });

    // 5. Purge user helpdesk inquiries
    const helpdeskSnap = await getDocs(collection(db, HELPDESK_COL));
    helpdeskSnap.forEach((hDoc) => {
      const hData = hDoc.data() as any;
      const hNick = (hData.userNickname || '').toLowerCase().replace(/^@/, '');
      if (cleanNick && hNick === cleanNick) {
        promises.push(deleteDoc(hDoc.ref).catch(() => {}));
      }
    });

    // 6. Purge user follows
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
      const p = docSnap.data() as Post;
      if (!isDemoPost(p)) {
        list.push(p);
      }
    });
    // Sort descending by createdAt
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    onUpdate(list);
  }, (err) => {
    console.warn('Firestore posts subscription fallback/warning:', err?.message || err);
  });
}

/**
 * Save single post to Firestore
 */
export async function savePostToFirestore(post: Post): Promise<void> {
  if (!post || !post.id || isDemoPost(post)) return;
  try {
    await setDoc(doc(db, POSTS_COL, post.id), sanitizeForFirestore(post), { merge: true });
  } catch (err) {
    console.error('Error saving post to Firestore:', err);
  }
}

/**
 * Delete post from Firestore
 */
export async function deletePostFromFirestore(postId: string): Promise<void> {
  if (!postId) return;
  try {
    await deleteDoc(doc(db, POSTS_COL, postId));
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
      const c = docSnap.data() as Comment;
      if (!isDemoComment(c)) {
        list.push(c);
      }
    });
    onUpdate(list);
  }, (err) => {
    console.warn('Firestore comments subscription fallback/warning:', err?.message || err);
  });
}

/**
 * Save comment to Firestore
 */
export async function saveCommentToFirestore(comment: Comment): Promise<void> {
  if (!comment || !comment.id || isDemoComment(comment)) return;
  try {
    await setDoc(doc(db, COMMENTS_COL, comment.id), sanitizeForFirestore(comment), { merge: true });
  } catch (err) {
    console.error('Error saving comment to Firestore:', err);
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

/**
 * Initial seed check: if Firestore is empty, seed initial users & posts into Firestore
 */
export async function seedFirestoreInitialDataIfNeeded(initialUsers: UserProfile[], initialPosts: Post[]) {
  try {
    const validUsers = (initialUsers || []).filter((u) => !isDemoUser(u) && !isDemoNickname(u.nickname));
    const usersSnap = await getDocs(collection(db, USERS_COL));
    if (usersSnap.empty && validUsers.length > 0) {
      console.log('Seeding initial non-demo users to Firestore...');
      await saveUsersBatchToFirestore(validUsers);
    }

    const validPosts = (initialPosts || []).filter((p) => !isDemoPost(p));
    const postsSnap = await getDocs(collection(db, POSTS_COL));
    if (postsSnap.empty && validPosts.length > 0) {
      console.log('Seeding initial non-demo posts to Firestore...');
      for (const p of validPosts) {
        await savePostToFirestore(p);
      }
    }
  } catch (err) {
    console.error('Error seeding initial Firestore data:', err);
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
          const msg = docSnap.data() as DirectMessage;
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
        console.error(`Firestore error subscribing to direct messages for ${conversationId}:`, err);
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
export async function saveDirectMessageToFirestore(msg: DirectMessage): Promise<void> {
  if (!msg || !msg.id || isDemoDirectMessage(msg)) return;
  try {
    await setDoc(doc(db, DIRECT_MESSAGES_COL, msg.id), sanitizeForFirestore(msg), { merge: true });
  } catch (err) {
    console.error('Error saving direct message to Firestore:', err);
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
        const msg = docSnap.data() as DirectMessage;
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
          const group = docSnap.data() as ChatGroup;
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
export async function saveChatGroupToFirestore(group: ChatGroup): Promise<void> {
  if (!group || !group.id) return;
  try {
    await setDoc(doc(db, CHAT_GROUPS_COL, group.id), sanitizeForFirestore(group), { merge: true });
  } catch (err) {
    console.error('Error saving chat group to Firestore:', err);
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






