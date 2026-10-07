import { UserProfile, BadgeType, VerificationRequest } from '../types';
import { INITIAL_USER_PROFILE } from '../data/initialData';
import { pushServerDbSync, mergeUsers } from './apiSync';
import { saveUserToFirestore, saveUsersBatchToFirestore, saveVerificationRequestToFirestore, savePostToFirestore, saveCommentToFirestore, deleteUserFromFirestore } from '../lib/firestoreSync';
import { isDemoUser } from './postGenerator';
import { getUserBadgeInfo, normalizeBadgeColor } from './verificationUtils';

export { getUserBadgeInfo };

export const USER_DB_KEY = 'fuhsi_users_db';
export const DELETED_USERS_KEY = 'fuhsi_deleted_users_db';

export interface DeletedUserEntry {
  id?: string;
  nickname?: string;
  studentEmail?: string;
  matricNumber?: string;
  deletedAt: string;
}

export interface PurgeAccountOptions {
  userId: string;
  nickname?: string;
  studentEmail?: string;
  matricNumber?: string;
}

export interface PurgedDataSummary {
  deletedPostIds: string[];
  deletedCommentIds: string[];
  deletedMarketplaceItemIds: string[];
}

/**
 * Retrieve all permanently deleted user records
 */
export function getDeletedUsersList(): DeletedUserEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const stored = localStorage.getItem(DELETED_USERS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading deleted users list:', err);
    return [];
  }
}

/**
 * Check whether a user or identifier has been permanently deleted.
 * Strict ID-first identity isolation:
 * If targetId is provided, matches strictly on internal account ID.
 * If only nickname is provided, checks if an active non-deleted user exists with that nickname.
 */
export function isUserPermanentlyDeleted(userOrIdentifier?: Partial<UserProfile> | string | null | any): boolean {
  if (!userOrIdentifier) return false;
  const deletedList = getDeletedUsersList();
  if (deletedList.length === 0) return false;

  let targetId = '';
  let targetNick = '';
  let targetEmail = '';
  let targetMatric = '';

  if (typeof userOrIdentifier === 'string') {
    const clean = userOrIdentifier.trim().toLowerCase().replace(/^@/, '');
    targetNick = clean;
    if (userOrIdentifier.startsWith('usr_')) {
      targetId = userOrIdentifier.trim();
    } else if (userOrIdentifier.includes('@')) {
      targetEmail = userOrIdentifier.trim().toLowerCase();
    }
  } else if (typeof userOrIdentifier === 'object') {
    if (userOrIdentifier.id) targetId = String(userOrIdentifier.id).trim();
    if (userOrIdentifier.nickname) targetNick = String(userOrIdentifier.nickname).trim().toLowerCase().replace(/^@/, '');
    if (userOrIdentifier.studentEmail) targetEmail = String(userOrIdentifier.studentEmail).trim().toLowerCase();
    if (userOrIdentifier.matricNumber) targetMatric = String(userOrIdentifier.matricNumber).trim().toUpperCase();
  }

  // 1. Primary check: permanent internal account ID
  if (targetId) {
    return deletedList.some((entry) => entry.id && entry.id === targetId);
  }

  // 2. Nickname check: If an active user exists with this nickname whose ID is not in deletedList, it is a brand new account!
  if (targetNick) {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(USER_DB_KEY);
        if (stored) {
          const users: UserProfile[] = JSON.parse(stored);
          const activeMatch = users.find(
            (u) => (u.nickname || '').trim().toLowerCase().replace(/^@/, '') === targetNick
          );
          if (activeMatch && activeMatch.id && !deletedList.some((e) => e.id === activeMatch.id)) {
            return false;
          }
        }
      }
    } catch {}
    return deletedList.some(
      (entry) => entry.nickname && entry.nickname.trim().toLowerCase().replace(/^@/, '') === targetNick
    );
  }

  if (targetEmail) {
    return deletedList.some(
      (entry) => entry.studentEmail && entry.studentEmail.trim().toLowerCase() === targetEmail
    );
  }

  if (targetMatric) {
    return deletedList.some(
      (entry) => entry.matricNumber && entry.matricNumber.trim().toUpperCase() === targetMatric
    );
  }

  return false;
}

/**
 * Mark a user account as permanently deleted across the device and all storage
 */
export function markUserPermanentlyDeleted(user: { id?: string; nickname?: string; studentEmail?: string; matricNumber?: string }): void {
  if (!user) return;
  try {
    const list = getDeletedUsersList();
    const cleanNick = user.nickname ? user.nickname.trim().toLowerCase().replace(/^@/, '') : '';
    const cleanEmail = user.studentEmail ? user.studentEmail.trim().toLowerCase() : '';
    const cleanMatric = user.matricNumber ? user.matricNumber.trim().toUpperCase() : '';
    const entry: DeletedUserEntry = {
      id: user.id || undefined,
      nickname: cleanNick || undefined,
      studentEmail: cleanEmail || undefined,
      matricNumber: cleanMatric || undefined,
      deletedAt: new Date().toISOString(),
    };
    const updated = [
      entry,
      ...list.filter((e) => {
        const eNick = (e.nickname || '').toLowerCase().replace(/^@/, '');
        const eEmail = (e.studentEmail || '').toLowerCase();
        const eId = e.id || '';
        if (user.id && eId === user.id) return false;
        if (cleanNick && eNick === cleanNick && !e.id) return false;
        if (cleanEmail && eEmail === cleanEmail && !e.id) return false;
        return true;
      }),
    ];
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(updated));

    // Remove from fuhsi_users_db
    const storedUsers = localStorage.getItem(USER_DB_KEY);
    if (storedUsers) {
      const users: UserProfile[] = JSON.parse(storedUsers);
      const filtered = users.filter((u) => {
        const uNick = (u.nickname || '').toLowerCase().replace(/^@/, '');
        const uEmail = (u.studentEmail || '').toLowerCase();
        if (user.id && u.id === user.id) return false;
        if (cleanNick && uNick === cleanNick) return false;
        if (cleanEmail && uEmail === cleanEmail) return false;
        return true;
      });
      localStorage.setItem(USER_DB_KEY, JSON.stringify(filtered));
    }

    // Check active user in local session
    const activeJson = localStorage.getItem('fuhsi_active_user');
    if (activeJson) {
      const activeUser: UserProfile = JSON.parse(activeJson);
      const aNick = (activeUser.nickname || '').toLowerCase().replace(/^@/, '');
      const aEmail = (activeUser.studentEmail || '').toLowerCase();
      if ((user.id && activeUser.id === user.id) || (cleanNick && aNick === cleanNick) || (cleanEmail && aEmail === cleanEmail)) {
        localStorage.removeItem('fuhsi_active_user');
      }
    }
  } catch (err) {
    console.error('Error marking user permanently deleted:', err);
  }
}

/**
 * COMPLETE CASCADE ACCOUNT DELETION
 * Permanently removes ALL platform records owned by or directly associated with this account:
 * - User profile from database, active session, and tombstone
 * - All posts and threads (feed, search, profile, thread detail)
 * - All reposts and quotes of those posts
 * - All comments and replies
 * - Recalculates commentCount on all remaining posts
 * - Removes user's likes/reactions on remaining posts and comments, and recalculates likes
 * - All marketplace listings (approved and pending)
 * - All direct messages and conversation records
 * - All followers and following relationships
 * - All verification requests
 * - Recalculates rankings and points totals from active database records
 * - Purges Firestore central database collections
 * - Pushes deletion to server sync
 * - Dispatches window events for real-time live UI refresh
 */
export function purgeAccountPermanently(options: PurgeAccountOptions): PurgedDataSummary {
  const targetUserId = options.userId ? String(options.userId).trim() : '';
  const cleanNick = options.nickname ? options.nickname.trim().toLowerCase().replace(/^@/, '') : '';
  const cleanEmail = options.studentEmail ? options.studentEmail.trim().toLowerCase() : '';
  const cleanMatric = options.matricNumber ? options.matricNumber.trim().toUpperCase() : '';

  if (targetUserId === 'usr_admin_modula' || cleanNick === 'modula') {
    throw new Error('Platform administrator (@modula) cannot be deleted.');
  }

  // 1. Mark permanently deleted in tombstone
  markUserPermanentlyDeleted({
    id: targetUserId,
    nickname: cleanNick,
    studentEmail: cleanEmail,
    matricNumber: cleanMatric,
  });

  // 2. Remove user from local users DB
  if (typeof localStorage !== 'undefined') {
    try {
      const storedUsersRaw = localStorage.getItem(USER_DB_KEY);
      if (storedUsersRaw) {
        const users: UserProfile[] = JSON.parse(storedUsersRaw);
        const filtered = users.filter((u) => {
          if (targetUserId && u.id === targetUserId) return false;
          const uNick = (u.nickname || '').trim().toLowerCase().replace(/^@/, '');
          if (cleanNick && uNick === cleanNick) return false;
          const uEmail = (u.studentEmail || '').trim().toLowerCase();
          if (cleanEmail && uEmail === cleanEmail) return false;
          return true;
        });
        localStorage.setItem(USER_DB_KEY, JSON.stringify(filtered));
      }
    } catch (e) {
      console.error('Error removing user from fuhsi_users_db:', e);
    }

    // 3. Clear active session if matching
    try {
      const activeRaw = localStorage.getItem('fuhsi_active_user');
      if (activeRaw) {
        const activeUser: UserProfile = JSON.parse(activeRaw);
        const aNick = (activeUser.nickname || '').trim().toLowerCase().replace(/^@/, '');
        const aEmail = (activeUser.studentEmail || '').trim().toLowerCase();
        if (
          (targetUserId && activeUser.id === targetUserId) ||
          (cleanNick && aNick === cleanNick) ||
          (cleanEmail && aEmail === cleanEmail)
        ) {
          localStorage.removeItem('fuhsi_active_user');
        }
      }
    } catch (e) {
      console.error('Error clearing active user:', e);
    }
  }

  const deletedPostIds: string[] = [];
  const deletedCommentIds: string[] = [];
  const deletedMarketplaceItemIds: string[] = [];

  // 4. CASCADE DELETE POSTS AND THREADS
  if (typeof localStorage !== 'undefined') {
    try {
      const postsRaw = localStorage.getItem('fuhsi_posts_db');
      if (postsRaw) {
        const allPosts: any[] = JSON.parse(postsRaw);
        if (Array.isArray(allPosts)) {
          // Identify posts created by this user
          allPosts.forEach((p) => {
            const pNick = (p.authorNickname || '').trim().toLowerCase().replace(/^@/, '');
            const pId = p.authorId || '';
            if ((cleanNick && pNick === cleanNick) || (targetUserId && pId === targetUserId)) {
              deletedPostIds.push(p.id);
            }
          });
          // Also identify reposts of those posts
          allPosts.forEach((p) => {
            if (p.repostedPostId && deletedPostIds.includes(p.repostedPostId)) {
              if (!deletedPostIds.includes(p.id)) deletedPostIds.push(p.id);
            }
          });

          // Remaining posts: strip out deleted posts AND remove this user's likes/reactions
          const remainingPosts = allPosts
            .filter((p) => !deletedPostIds.includes(p.id))
            .map((p) => {
              let updatedLikes = p.likes || 0;
              let likedBy = Array.isArray(p.likedBy) ? [...p.likedBy] : [];
              const hadLike = likedBy.some(
                (l: string) =>
                  (cleanNick && l.toLowerCase().replace(/^@/, '') === cleanNick) || (targetUserId && l === targetUserId)
              );
              if (hadLike) {
                likedBy = likedBy.filter(
                  (l: string) =>
                    (cleanNick && l.toLowerCase().replace(/^@/, '') !== cleanNick) && (!targetUserId || l !== targetUserId)
                );
                updatedLikes = Math.max(0, likedBy.length);
              }
              return {
                ...p,
                likedBy,
                likes: updatedLikes,
                likesCount: updatedLikes,
              };
            });
          localStorage.setItem('fuhsi_posts_db', JSON.stringify(remainingPosts));
        }
      }
    } catch (e) {
      console.error('Error purging posts from fuhsi_posts_db:', e);
    }

    // 5. CASCADE DELETE COMMENTS AND REPLIES
    try {
      const commRaw = localStorage.getItem('fuhsi_comments_db');
      if (commRaw) {
        const allComments: any[] = JSON.parse(commRaw);
        if (Array.isArray(allComments)) {
          allComments.forEach((c) => {
            const cNick = (c.authorNickname || '').trim().toLowerCase().replace(/^@/, '');
            const cId = c.authorId || '';
            if (
              (cleanNick && cNick === cleanNick) ||
              (targetUserId && cId === targetUserId) ||
              (c.postId && deletedPostIds.includes(c.postId))
            ) {
              deletedCommentIds.push(c.id);
            }
          });

          const remainingComments = allComments.filter((c) => !deletedCommentIds.includes(c.id));
          localStorage.setItem('fuhsi_comments_db', JSON.stringify(remainingComments));

          // Recalculate comment count on all remaining posts!
          const postsRaw2 = localStorage.getItem('fuhsi_posts_db');
          if (postsRaw2) {
            const currentPosts: any[] = JSON.parse(postsRaw2);
            if (Array.isArray(currentPosts)) {
              const reconciledPosts = currentPosts.map((p) => {
                const count = remainingComments.filter((c) => c.postId === p.id).length;
                return {
                  ...p,
                  commentCount: count,
                  commentsCount: count,
                };
              });
              localStorage.setItem('fuhsi_posts_db', JSON.stringify(reconciledPosts));
            }
          }
        }
      }
    } catch (e) {
      console.error('Error purging comments from fuhsi_comments_db:', e);
    }

    // 6. CASCADE DELETE MARKETPLACE DATA
    try {
      ['fuhsi_marketplace_approved_db', 'fuhsi_marketplace_db'].forEach((key) => {
        const mRaw = localStorage.getItem(key);
        if (mRaw) {
          const items: any[] = JSON.parse(mRaw);
          if (Array.isArray(items)) {
            items.forEach((m) => {
              const mNick = (m.sellerNickname || '').trim().toLowerCase().replace(/^@/, '');
              const mId = m.sellerId || '';
              if ((cleanNick && mNick === cleanNick) || (targetUserId && mId === targetUserId)) {
                if (!deletedMarketplaceItemIds.includes(m.id)) deletedMarketplaceItemIds.push(m.id);
              }
            });
            const filtered = items.filter((m) => !deletedMarketplaceItemIds.includes(m.id));
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      });
      ['fuhsi_marketplace_pending_db', 'fuhsi_pending_marketplace_db'].forEach((key) => {
        const mRaw = localStorage.getItem(key);
        if (mRaw) {
          const items: any[] = JSON.parse(mRaw);
          if (Array.isArray(items)) {
            items.forEach((m) => {
              const mNick = (m.sellerNickname || '').trim().toLowerCase().replace(/^@/, '');
              const mId = m.sellerId || '';
              if ((cleanNick && mNick === cleanNick) || (targetUserId && mId === targetUserId)) {
                if (!deletedMarketplaceItemIds.includes(m.id)) deletedMarketplaceItemIds.push(m.id);
              }
            });
            const filtered = items.filter((m) => !deletedMarketplaceItemIds.includes(m.id));
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      });
      const dStr = localStorage.getItem('fuhsi_deleted_marketplace_ids');
      const curDel = dStr ? JSON.parse(dStr) : [];
      const nextDel = Array.from(new Set([...curDel, ...deletedMarketplaceItemIds]));
      localStorage.setItem('fuhsi_deleted_marketplace_ids', JSON.stringify(nextDel));
    } catch (e) {
      console.error('Error purging marketplace listings:', e);
    }

    // 7. CASCADE DELETE CHAT MESSAGES AND CONVERSATIONS
    try {
      const dmsRaw = localStorage.getItem('fuhsi_direct_messages_db');
      if (dmsRaw) {
        const msgs: any[] = JSON.parse(dmsRaw);
        if (Array.isArray(msgs)) {
          const filteredMsgs = msgs.filter((m) => {
            const sNick = (m.senderNickname || '').trim().toLowerCase().replace(/^@/, '');
            const rNick = (m.receiverNickname || '').trim().toLowerCase().replace(/^@/, '');
            const sId = m.senderId || '';
            const rId = m.receiverId || '';
            if (cleanNick && (sNick === cleanNick || rNick === cleanNick)) return false;
            if (targetUserId && (sId === targetUserId || rId === targetUserId)) return false;
            return true;
          });
          localStorage.setItem('fuhsi_direct_messages_db', JSON.stringify(filteredMsgs));
        }
      }

      const convsRaw = localStorage.getItem('fuhsi_conversations_db');
      if (convsRaw) {
        const convs: any[] = JSON.parse(convsRaw);
        if (Array.isArray(convs)) {
          const updatedConvs = convs.filter((c) => {
            const other = (c.otherUserNickname || '').trim().toLowerCase().replace(/^@/, '');
            if (cleanNick && other === cleanNick) return false;
            return true;
          });
          localStorage.setItem('fuhsi_conversations_db', JSON.stringify(updatedConvs));
        }
      }
    } catch (e) {
      console.error('Error purging direct messages:', e);
    }

    // 8. CASCADE DELETE FOLLOWS
    try {
      const fRaw = localStorage.getItem('fuhsi_user_follows_v1');
      if (fRaw) {
        const follows: any[] = JSON.parse(fRaw);
        if (Array.isArray(follows)) {
          const filtered = follows.filter((f) => {
            const f1 = (f.followerNickname || '').trim().toLowerCase().replace(/^@/, '');
            const f2 = (f.followingNickname || '').trim().toLowerCase().replace(/^@/, '');
            if (cleanNick && (f1 === cleanNick || f2 === cleanNick)) return false;
            return true;
          });
          localStorage.setItem('fuhsi_user_follows_v1', JSON.stringify(filtered));
        }
      }
    } catch (e) {
      console.error('Error purging follows:', e);
    }

    // 9. CASCADE DELETE VERIFICATION REQUESTS
    try {
      const vRaw = localStorage.getItem('fuhsi_verifications_db');
      if (vRaw) {
        const verifs: any[] = JSON.parse(vRaw);
        if (Array.isArray(verifs)) {
          const filtered = verifs.filter((v) => {
            const vNick = (v.applicantNickname || '').trim().toLowerCase().replace(/^@/, '');
            if (cleanNick && vNick === cleanNick) return false;
            return true;
          });
          localStorage.setItem('fuhsi_verifications_db', JSON.stringify(filtered));
        }
      }
    } catch (e) {
      console.error('Error purging verifications:', e);
    }

    // 10. CASCADE DELETE BOOKMARKS
    try {
      const bRaw = localStorage.getItem('fuhsi_user_bookmarks_db');
      if (bRaw) {
        const bMap: Record<string, string[]> = JSON.parse(bRaw);
        if (cleanNick && bMap[cleanNick]) {
          delete bMap[cleanNick];
        }
        Object.keys(bMap).forEach((userKey) => {
          bMap[userKey] = bMap[userKey].filter((postId) => !deletedPostIds.includes(postId));
        });
        localStorage.setItem('fuhsi_user_bookmarks_db', JSON.stringify(bMap));
      }
    } catch (e) {
      console.error('Error purging bookmarks:', e);
    }

    // 11. Clear user notifications
    try {
      if (cleanNick) {
        localStorage.removeItem(`fuhsi_notifications_v1_${cleanNick}`);
        localStorage.removeItem(`fuhsi_notifications_read_${cleanNick}`);
      }
    } catch (e) {}
  }

  // 12. ASYNCHRONOUSLY PURGE FIRESTORE
  deleteUserFromFirestore(targetUserId, cleanNick, cleanEmail).catch((err) =>
    console.error('Error purging Firestore during permanent account deletion:', err)
  );

  // 13. PUSH DELETION TO SERVER SYNC
  pushServerDbSync({
    deletedUserIds: targetUserId ? [targetUserId] : [],
    deletedUserNicknames: cleanNick ? [cleanNick] : [],
    deletedPostIds,
    deletedCommentIds,
    deletedMarketplaceItemIds,
  } as any).catch((err) => console.error('Error syncing deletion to server:', err));

  // 14. DISPATCH CUSTOM EVENTS FOR INSTANT LIVE UI REACTION
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fuhsi_account_purged', {
        detail: {
          userId: targetUserId,
          nickname: cleanNick,
          deletedPostIds,
          deletedCommentIds,
          deletedMarketplaceItemIds,
        },
      })
    );
    window.dispatchEvent(new CustomEvent('fuhsi_posts_updated'));
    window.dispatchEvent(new CustomEvent('fuhsi_comments_updated'));
    window.dispatchEvent(new CustomEvent('fuhsi_marketplace_updated'));
    window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated'));
    window.dispatchEvent(new CustomEvent('fuhsi_user_updated'));
  }

  return {
    deletedPostIds,
    deletedCommentIds,
    deletedMarketplaceItemIds,
  };
}

/**
 * Remove a user or identifier from the permanently deleted tombstone (e.g. if user is registering afresh)
 */
export function unmarkUserPermanentlyDeleted(user: { id?: string; nickname?: string; studentEmail?: string; matricNumber?: string }): void {
  if (!user) return;
  try {
    const list = getDeletedUsersList();
    const cleanNick = user.nickname ? user.nickname.trim().toLowerCase().replace(/^@/, '') : '';
    const cleanEmail = user.studentEmail ? user.studentEmail.trim().toLowerCase() : '';
    const cleanMatric = user.matricNumber ? user.matricNumber.trim().toUpperCase() : '';

    const updated = list.filter((e) => {
      const eNick = (e.nickname || '').toLowerCase().replace(/^@/, '');
      const eEmail = (e.studentEmail || '').toLowerCase();
      const eMatric = (e.matricNumber || '').toUpperCase();
      const eId = e.id || '';

      if (user.id && eId === user.id) return false;
      if (cleanNick && eNick === cleanNick) return false;
      if (cleanEmail && eEmail === cleanEmail) return false;
      if (cleanMatric && eMatric === cleanMatric) return false;
      return true;
    });

    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error unmarking deleted user:', err);
  }
}

/**
 * Remove a user identity from the deleted tombstone (e.g. when creating a brand new account afresh)
 */
export function removeUserFromDeletedTombstone(nicknameOrEmail?: string): void {
  if (!nicknameOrEmail) return;
  try {
    const list = getDeletedUsersList();
    const clean = nicknameOrEmail.trim().toLowerCase().replace(/^@/, '');
    const updated = list.filter((e) => {
      const eNick = (e.nickname || '').toLowerCase().replace(/^@/, '');
      const eEmail = (e.studentEmail || '').toLowerCase();
      return eNick !== clean && eEmail !== clean && eEmail !== nicknameOrEmail.trim().toLowerCase();
    });
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error removing user from deleted tombstone:', err);
  }
}

/**
 * Check if a user or user handle is the @modula Admin account
 */
export function isModulaAccount(userOrNickname?: Partial<UserProfile> | string | null | any): boolean {
  if (!userOrNickname) return false;
  if (typeof userOrNickname === 'string') {
    const clean = userOrNickname.trim().toLowerCase().replace(/^@/, '');
    return clean === 'modula' || clean === 'usr_admin_modula';
  }
  if (typeof userOrNickname === 'object') {
    if (userOrNickname.id === 'usr_admin_modula') return true;
    const nick = (userOrNickname.nickname || '').trim().toLowerCase().replace(/^@/, '');
    if (nick === 'modula') return true;
    if ((userOrNickname as any).authorNickname) {
      const aNick = (userOrNickname as any).authorNickname.trim().toLowerCase().replace(/^@/, '');
      if (aNick === 'modula') return true;
    }
  }
  return false;
}

/**
 * Sanitize a user object so that:
 * 1. @modula never contains academic classification
 * 2. Guest accounts never contain student/academic information (department, level, matricNumber)
 */
export function sanitizeUserProfile<T extends Partial<UserProfile>>(user: T): T {
  if (!user) return user;
  if (isModulaAccount(user)) {
    return {
      ...user,
      department: '',
      level: '',
      accountType: 'Admin',
      matricNumber: '',
      isAdmin: true,
      reputationScore: 0,
      searchDiscoverable: false,
      allowDirectMessagesFrom: 'followers',
      isPrivate: true,
    };
  }
  const cleanNick = (user.nickname || '').trim().toLowerCase().replace(/^@/, '');
  const isGuest =
    user.accountType === 'Guest' ||
    user.badgeTitle === 'Guest' ||
    (cleanNick.startsWith('guest_') && user.accountType !== 'Student' && !user.isAdmin);

  if (isGuest) {
    return {
      ...user,
      accountType: 'Guest',
      matricNumber: '',
      department: '',
      level: '',
      badgeTitle: user.badgeTitle === 'FUHSI Student' ? 'Guest' : (user.badgeTitle || 'Guest'),
    };
  }
  return user;
}

export function sanitizeModulaProfile<T extends Partial<UserProfile>>(user: T): T {
  return sanitizeUserProfile(user);
}

/**
 * Filter out internal platform control account (@modula) from any user-facing list
 */
export function filterOutModula<T extends Partial<UserProfile> | { nickname?: string; authorNickname?: string; sellerNickname?: string; id?: string }>(list: T[]): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => {
    if (!item) return false;
    if (isModulaAccount(item)) return false;
    const nick = (item as any).nickname || (item as any).authorNickname || (item as any).sellerNickname || '';
    if (isModulaAccount(nick)) return false;
    const clean = typeof nick === 'string' ? nick.trim().toLowerCase().replace(/^@/, '') : '';
    if (clean === 'modula') return false;
    const id = (item as any).id || '';
    if (id === 'usr_admin_modula') return false;
    return true;
  });
}

/**
 * Format the user's join date accurately based on their joinedDate, creation timestamp in id (usr_<timestamp>), or current date.
 */
export function formatJoinDate(user?: Partial<UserProfile> | null): string {
  const now = new Date();
  const fallbackDate = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(now);

  if (!user) {
    return fallbackDate;
  }

  // Pre-existing administrator account
  if (user.id === 'usr_admin_modula' || user.nickname === '@modula' || user.nickname === 'modula') {
    return 'Sep 2024';
  }

  // 1. Check createdAt first if available and valid
  if ((user as any).createdAt) {
    const d = new Date((user as any).createdAt);
    if (!isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86400000) {
      return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
    }
  }

  // 2. If user has a valid joinedDate that isn't empty, placeholder, or invalid future date
  if (user.joinedDate && typeof user.joinedDate === 'string') {
    const trimmed = user.joinedDate.trim();
    if (
      trimmed &&
      trimmed !== 'Jul 2026' &&
      !trimmed.includes('2026') &&
      !trimmed.toLowerCase().includes('undefined') &&
      !trimmed.toLowerCase().includes('null')
    ) {
      return trimmed;
    }
  }

  // 3. If user.id contains a numeric timestamp (e.g. usr_17...)
  if (user.id && user.id.startsWith('usr_')) {
    const rawTs = user.id.replace('usr_', '');
    const ts = parseInt(rawTs, 10);
    if (!isNaN(ts) && ts > 1600000000000 && ts <= now.getTime() + 86400000) {
      return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(ts));
    }
  }

  // 4. Fallback to valid current month and year
  return fallbackDate;
}

export const DEFAULT_USERS_LIST: UserProfile[] = [
  {
    id: 'usr_admin_modula',
    nickname: '@modula',
    accountType: 'Admin',
    realName: 'Administrator',
    matricNumber: '',
    studentEmail: 'fuhsiconnectsupport@gmail.com',
    emergencyHomePhone: '08000000000',
    department: '',
    level: '',
    bio: 'Internal Platform Control Account (@modula).',
    avatarKey: '1',
    badgeType: 'GOLD',
    badgeTitle: 'Official Admin',
    reputationScore: 0,
    isVerified: true,
    isApproved: true,
    isDeclined: false,
    isAdmin: true,
    searchDiscoverable: false,
    allowDirectMessagesFrom: 'followers',
    isPrivate: true,
    savedPassword: 'ibraheem',
    password: 'ibraheem',
    joinedDate: 'Sep 2024',
    createdAt: '2024-09-01T00:00:00.000Z',
  },
  {
    id: 'usr_student_adedeji_ayo_24prt007',
    nickname: '@Deji',
    accountType: 'Student',
    realName: 'Adedeji Ayo',
    matricNumber: '24/PRT/007',
    studentEmail: 'faithlucas.co@gmail.com',
    emergencyHomePhone: '091562232018',
    department: 'Prosthetics and Orthotics',
    level: '200L',
    bio: '',
    savedPassword: 'password123',
    password: 'password123',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1785421590000',
    nickname: '@fatih',
    accountType: 'Student',
    realName: 'Adepoju Fatih',
    matricNumber: '2022/MED/001',
    studentEmail: 'fatihadepoju8@gmail.com',
    emergencyHomePhone: '08031234567',
    department: 'Medicine & Surgery',
    level: '300 Level',
    bio: '',
    savedPassword: 'password123',
    password: 'password123',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1787333690153',
    nickname: '@Fadlullah',
    accountType: 'Student',
    realName: 'bello fadlullah',
    matricNumber: '24/AUD/098',
    studentEmail: 'bellofadlullah507@gmail.com',
    emergencyHomePhone: '09138203259',
    department: 'Audiology',
    level: '300L',
    bio: '',
    savedPassword: '1234',
    password: '1234',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1787938187966',
    nickname: '@kunle',
    accountType: 'Student',
    realName: 'Olakunle Ayo',
    matricNumber: '25/NSC/100',
    studentEmail: 'adepojufatih33@gmail.com',
    emergencyHomePhone: '08012345678',
    department: 'Nursing Science',
    level: '100L',
    bio: '',
    savedPassword: '1234',
    password: '1234',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1788014361344',
    nickname: '@idera',
    accountType: 'Guest',
    realName: 'idera oluwa',
    matricNumber: '',
    studentEmail: 'faithdavid.co@gmail.com',
    emergencyHomePhone: '08037471294',
    department: 'Medicine and Surgery (MBBS)',
    level: '300L',
    bio: '',
    savedPassword: '0800',
    password: '0800',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1788966315443',
    nickname: '@fuhsibro',
    accountType: 'Student',
    realName: 'Ifeoluwa Olamide',
    matricNumber: '23/NSC/045',
    studentEmail: 'fuhsibroofficial@gmail.com',
    emergencyHomePhone: '09161517756',
    department: 'Nursing Science',
    level: '300L',
    bio: '',
    savedPassword: '1234567890',
    password: '1234567890',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1788968181651',
    nickname: '@tigress',
    accountType: 'Student',
    realName: 'Tigress',
    matricNumber: '25/PHM/012',
    studentEmail: 'togress@gmail.com',
    emergencyHomePhone: '07012345678',
    department: 'Pharmacology',
    level: '100L',
    bio: '',
    savedPassword: '1234567890',
    password: '1234567890',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1788969442703',
    nickname: '@guest1',
    accountType: 'Guest',
    realName: 'Gust',
    matricNumber: '',
    studentEmail: 'guest@gmail.com',
    emergencyHomePhone: '08145611236',
    department: '',
    level: '',
    bio: '',
    savedPassword: '0987654321',
    password: '0987654321',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1789032260674',
    nickname: '@Maleeqq',
    accountType: 'Student',
    realName: 'Balogun Abdulmalik',
    matricNumber: '24/PRT/019',
    studentEmail: 'ayodejibalogun66@gmail.com',
    emergencyHomePhone: '08149006536',
    department: 'Prosthetics and Orthotics',
    level: '200L',
    bio: '',
    savedPassword: 'Ayodeji1976.',
    password: 'Ayodeji1976.',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1789222162096',
    nickname: '@Ibraheem',
    accountType: 'Student',
    realName: 'Ibraheem kunle',
    matricNumber: '25/PHM/011',
    studentEmail: 'fatihadepoju88@gmail.com',
    emergencyHomePhone: '09156232018',
    department: 'Pharmacology',
    level: '100L',
    bio: '',
    savedPassword: '1234',
    password: '1234',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1789291362767',
    nickname: '@Bello',
    accountType: 'Guest',
    realName: 'Bello',
    matricNumber: '',
    studentEmail: 'bellofadlullah9@gmail.com',
    emergencyHomePhone: '09138203259',
    department: '',
    level: '',
    bio: '',
    savedPassword: '1234',
    password: '1234',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1789668651638',
    nickname: '@Pop',
    accountType: 'Guest',
    realName: 'Adam Popoola',
    matricNumber: '',
    studentEmail: 'olagokerodiat036@gmail.com',
    emergencyHomePhone: '08123456789',
    department: 'Medicine and Surgery (MBBS)',
    level: '300L',
    bio: '',
    savedPassword: '1234',
    password: '1234',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_guest_1789804676390',
    nickname: '@Guest_798',
    accountType: 'Guest',
    realName: 'Campus Guest',
    matricNumber: '',
    studentEmail: '',
    emergencyHomePhone: '08000000000',
    department: 'General Campus',
    level: 'Guest',
    bio: '',
    savedPassword: 'password123',
    password: 'password123',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1790088695337',
    nickname: '@Shola',
    accountType: 'Student',
    realName: 'Apo',
    matricNumber: '23/BCH/011',
    studentEmail: 'fatihadepoju888@gmail.com',
    emergencyHomePhone: '07054915494',
    department: 'Biochemistry',
    level: 'Graduated',
    bio: '',
    savedPassword: '0900',
    password: '0900',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1790199069264',
    nickname: '@Dele',
    accountType: 'Student',
    realName: 'Dele',
    matricNumber: '25/MBS/001',
    studentEmail: 'dele@gmail.com',
    emergencyHomePhone: '07032165498',
    department: 'Medicine and Surgery',
    level: '100L',
    bio: '',
    savedPassword: '1111',
    password: '1111',
    isApproved: true,
    isAdmin: false,
  },
  {
    id: 'usr_1791355677408',
    nickname: '@ADEOLA',
    accountType: 'Student',
    realName: 'FAVOUR PRAISE',
    matricNumber: '25/BCH/2024',
    studentEmail: 'adebisisaheed250@gmail.com',
    emergencyHomePhone: '08086062200',
    department: 'Biochemistry',
    level: '200L',
    bio: '',
    savedPassword: 'Priscilla@2026',
    password: 'Priscilla@2026',
    isApproved: true,
    isAdmin: false,
  },
];

/**
 * Get all users stored in the database. If none exists, initializes default list.
 */
export function getStoredUsers(): UserProfile[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(USER_DB_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Automatically filter out any demo/mock accounts and permanently deleted users, and sanitize @modula
          const realUsers = parsed
            .filter((u) => !isDemoUser(u) && !isUserPermanentlyDeleted(u))
            .map((u) => sanitizeModulaProfile(u));
          const filteredDefaults = DEFAULT_USERS_LIST
            .filter((u) => !isUserPermanentlyDeleted(u))
            .map((u) => sanitizeModulaProfile(u));
          const withDefaults = mergeUsers(filteredDefaults, realUsers).map((u) => sanitizeModulaProfile(u));
          return withDefaults.filter((u) => !isUserPermanentlyDeleted(u));
        }
      }
    }
  } catch (err) {
    console.error('Error reading user database:', err);
  }

  // Fallback / First-time initialization
  const initialDefaults = DEFAULT_USERS_LIST
    .filter((u) => !isUserPermanentlyDeleted(u))
    .map((u) => sanitizeModulaProfile(u));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USER_DB_KEY, JSON.stringify(initialDefaults));
    }
  } catch (e) {
    console.error('Error initializing user database:', e);
  }
  return initialDefaults;
}

/**
 * Save user list to database and sync across devices via Firestore and server API
 */
export function saveStoredUsers(users: UserProfile[]): void {
  const realOnly = users
    .map((u) => sanitizeModulaProfile(u))
    .filter((u) => !isDemoUser(u) && !isUserPermanentlyDeleted(u));
  const filteredDefaults = DEFAULT_USERS_LIST
    .filter((u) => !isUserPermanentlyDeleted(u))
    .map((u) => sanitizeModulaProfile(u));
  const cleaned = mergeUsers(realOnly.length > 0 ? realOnly : filteredDefaults, [])
    .map((u) => sanitizeModulaProfile(u))
    .filter((u) => !isUserPermanentlyDeleted(u));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USER_DB_KEY, JSON.stringify(cleaned));
    }
  } catch (e) {
    console.error('Error saving user database:', e);
  }
  // Sync to Firestore cloud database
  saveUsersBatchToFirestore(cleaned).catch((err) => {
    console.error('Error batch saving users to Firestore:', err);
  });
  // Sync to central server database asynchronously
  pushServerDbSync({ users: cleaned } as any).catch((err) => {
    console.error('Error syncing users to server:', err);
  });
}


/**
 * Find user by nickname (safe, non-recursive, excludes deleted accounts)
 */
export function findUserByNickname(nickname: string): UserProfile | undefined {
  if (!nickname) return undefined;
  const clean = nickname.trim().toLowerCase().replace(/^@/, '');
  try {
    if (typeof localStorage !== 'undefined') {
      const activeStr = localStorage.getItem('fuhsi_active_user');
      if (activeStr) {
        const activeUser = JSON.parse(activeStr);
        if ((activeUser?.nickname || '').trim().toLowerCase().replace(/^@/, '') === clean) {
          if (!isUserPermanentlyDeleted(activeUser)) {
            return sanitizeUserProfile(activeUser);
          }
        }
      }
      const stored = localStorage.getItem(USER_DB_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const found = parsed.find((u) => (u?.nickname || '').trim().toLowerCase().replace(/^@/, '') === clean);
          if (found && !isUserPermanentlyDeleted(found)) {
            return sanitizeUserProfile(found);
          }
        }
      }
    }
  } catch (e) {}
  const fallback = DEFAULT_USERS_LIST.find((u) => (u?.nickname || '').trim().toLowerCase().replace(/^@/, '') === clean);
  return fallback && !isUserPermanentlyDeleted(fallback) ? sanitizeUserProfile(fallback) : undefined;
}

/**
 * Check if a user or user handle is a Guest account (pure, non-recursive)
 */
export function isGuestAccount(userOrNickname?: Partial<UserProfile> | string | null | any): boolean {
  if (!userOrNickname) return false;
  if (isModulaAccount(userOrNickname)) return false;
  if (typeof userOrNickname === 'object') {
    if (userOrNickname.isAdmin) return false;
    if (userOrNickname.accountType === 'Admin') return false;
    if (userOrNickname.accountType === 'Guest') return true;
    if (userOrNickname.accountType === 'Student') return false;
    if (userOrNickname.badgeTitle === 'Guest') return true;
    const cleanNick = (userOrNickname.nickname || '').toLowerCase().replace(/^@/, '');
    if (cleanNick.startsWith('guest_') || cleanNick.startsWith('guest')) {
      return userOrNickname.accountType === 'Guest' || userOrNickname.badgeTitle === 'Guest';
    }
    return false;
  }
  const cleanNick = (userOrNickname || '').toLowerCase().replace(/^@/, '');
  if (cleanNick === 'modula') return false;
  try {
    if (typeof localStorage !== 'undefined') {
      const activeStr = localStorage.getItem('fuhsi_active_user');
      if (activeStr) {
        const activeUser = JSON.parse(activeStr);
        if ((activeUser?.nickname || '').trim().toLowerCase().replace(/^@/, '') === cleanNick) {
          return activeUser.accountType === 'Guest' || activeUser.badgeTitle === 'Guest';
        }
      }
      const stored = localStorage.getItem(USER_DB_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const found = parsed.find((u) => (u?.nickname || '').trim().toLowerCase().replace(/^@/, '') === cleanNick);
          if (found) {
            return found.accountType === 'Guest' || found.badgeTitle === 'Guest';
          }
        }
      }
    }
  } catch (e) {}
  return false;
}

/**
 * Get account category: 'Admin' | 'Student' | 'Guest'
 */
export function getUserAccountType(userOrNickname?: Partial<UserProfile> | string | null | any): 'Admin' | 'Student' | 'Guest' {
  if (isModulaAccount(userOrNickname)) return 'Admin';
  return isGuestAccount(userOrNickname) ? 'Guest' : 'Student';
}

/**
 * Return appropriate subtitle string for any user identity:
 * - For Admin (@modula): '' (No academic classification)
 * - For Guest: 'Guest' (Strictly Guest, never department or academic info)
 * - For Student: 'Department • Level' (or department/FUHSI Student)
 */
export function getUserIdentitySubtitle(
  userOrNickname?: Partial<UserProfile> | string | null | any,
  fallbackDept?: string,
  fallbackLevel?: string
): string {
  if (isModulaAccount(userOrNickname)) {
    return '';
  }
  if (isGuestAccount(userOrNickname)) {
    return 'Guest';
  }
  if (typeof userOrNickname === 'object' && userOrNickname) {
    if (isModulaAccount(userOrNickname)) return '';
    if (userOrNickname.accountType === 'Guest') return 'Guest';
    if (userOrNickname.nickname) {
      const dbUser = findUserByNickname(userOrNickname.nickname);
      if (dbUser?.accountType === 'Guest') return 'Guest';
    }
    if (userOrNickname.department && userOrNickname.level) {
      return `${userOrNickname.department} • ${userOrNickname.level}`;
    }
    if (userOrNickname.department) return userOrNickname.department;
  } else if (typeof userOrNickname === 'string') {
    const dbUser = findUserByNickname(userOrNickname);
    if (dbUser) {
      if (isModulaAccount(dbUser)) return '';
      if (dbUser.accountType === 'Guest') return 'Guest';
      if (dbUser.department && dbUser.level) {
        return `${dbUser.department} • ${dbUser.level}`;
      }
      if (dbUser.department) return dbUser.department;
    }
  }
  if (fallbackDept && !isGuestAccount(fallbackDept)) {
    if (fallbackLevel) return `${fallbackDept} • ${fallbackLevel}`;
    return fallbackDept;
  }
  return 'Student';
}

/**
 * Calculate the total count of approved, active community members (excluding platform control account @modula)
 */
export function getApprovedMembersCount(): number {
  const users = getStoredUsers();
  const approved = users.filter((u) => u.isApproved === true && !u.isDeclined && !isModulaAccount(u) && !u.isAdmin);
  return approved.length;
}

/**
 * Add or update a user in the database
 */
export function upsertUser(user: UserProfile): UserProfile[] {
  const users = getStoredUsers();
  const normNick = (user.nickname || '').trim().toLowerCase().replace(/^@/, '');
  const normEmail = (user.studentEmail || '').trim().toLowerCase();

  const index = users.findIndex((u) => {
    if (u.id && user.id) return u.id === user.id;
    if (normNick && (u.nickname || '').trim().toLowerCase().replace(/^@/, '') === normNick) return true;
    if (normEmail && normEmail !== 'admin@fuhsi.edu.ng' && (u.studentEmail || '').trim().toLowerCase() === normEmail) return true;
    return false;
  });

  const nowIso = new Date().toISOString();
  let updatedUser: UserProfile = sanitizeModulaProfile({
    ...user,
    updatedAt: user.updatedAt || nowIso,
  });
  if (index >= 0) {
    const existing = users[index];
    const existingPassword = (existing as any).savedPassword || (existing as any).password;
    const incomingPassword = (user as any).savedPassword || (user as any).password;
    const finalPassword = incomingPassword || existingPassword;
    users[index] = sanitizeModulaProfile({ 
      ...existing, 
      ...user,
      savedPassword: finalPassword,
      password: finalPassword,
      updatedAt: user.updatedAt || nowIso,
    });
    updatedUser = users[index];
  } else {
    users.push(updatedUser);
  }

  // Save single user to Firestore & server immediately
  saveUserToFirestore(updatedUser).catch((err) => {
    console.error('Error saving single user to Firestore:', err);
  });
  pushServerDbSync({ users: [updatedUser] } as any).catch((err) => {
    console.error('Error saving single user to server DB:', err);
  });

  saveStoredUsers(users);
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_users_updated', { detail: updatedUser }));
      window.dispatchEvent(new CustomEvent('fuhsi_profile_updated', { detail: updatedUser }));
    }
  } catch (e) {}
  return users;
}

/**
 * Permanently update password for a specific user and sync to Firestore, server DB, and localStorage
 */
export function updateUserPassword(identifierOrEmail: string, newPassword: string): boolean {
  if (!identifierOrEmail || !newPassword) return false;
  const cleanId = identifierOrEmail.trim().toLowerCase().replace(/^@/, '');
  const users = getStoredUsers();

  const index = users.findIndex((u) => {
    if (u.id && u.id.toLowerCase() === cleanId) return true;
    if (u.nickname && u.nickname.trim().toLowerCase().replace(/^@/, '') === cleanId) return true;
    if (u.studentEmail && u.studentEmail.trim().toLowerCase() === cleanId) return true;
    return false;
  });

  if (index >= 0) {
    users[index] = {
      ...users[index],
      savedPassword: newPassword.trim(),
      password: newPassword.trim(),
    };

    saveUserToFirestore(users[index]).catch((err) => console.error('Error updating user password in Firestore:', err));
    saveStoredUsers(users);

    // Update active user profile in localStorage if matching
    try {
      const activeUserJson = localStorage.getItem('fuhsi_active_user');
      if (activeUserJson) {
        const active = JSON.parse(activeUserJson);
        const matchActive = (active.id === users[index].id) ||
          (active.nickname && active.nickname.toLowerCase().replace(/^@/, '') === cleanId) ||
          (active.studentEmail && active.studentEmail.toLowerCase() === cleanId);
        if (matchActive) {
          localStorage.setItem('fuhsi_active_user', JSON.stringify({
            ...active,
            savedPassword: newPassword.trim(),
            password: newPassword.trim(),
          }));
        }
      }
    } catch (e) {
      console.error('Error updating active user password:', e);
    }

    return true;
  }
  return false;
}

/**
 * Universally updates or reassigns verification badge color and custom title for any student or user.
 * Syncs instantly across fuhsi_users_db, active user, fuhsi_verifications_db, fuhsi_posts_db, fuhsi_comments_db,
 * Firestore, server DB, and fires 'fuhsi_badge_updated' event for instant real-time reactivity.
 */
export function updateUserBadgeAndVerification(
  targetNicknameOrId: string,
  badgeType: BadgeType = 'BLUE',
  badgeTitle: string = '',
  isVerified: boolean = true
): { success: boolean; user?: UserProfile } {
  if (!targetNicknameOrId) return { success: false };

  const cleanTarget = targetNicknameOrId.trim().toLowerCase().replace(/^@/, '');
  const cleanTitle = (badgeTitle || '').trim();
  const effectiveBadgeType: BadgeType = isVerified ? normalizeBadgeColor(badgeType || 'BLUE') : 'NONE';
  const nowIso = new Date().toISOString();

  // 1. Update user in fuhsi_users_db
  const users = getStoredUsers();
  let updatedUser: UserProfile | undefined = undefined;

  const targetIdx = users.findIndex((u) => {
    const uNick = (u.nickname || '').trim().toLowerCase().replace(/^@/, '');
    const uId = (u.id || '').trim().toLowerCase();
    const uEmail = (u.studentEmail || '').trim().toLowerCase();
    return uNick === cleanTarget || uId === cleanTarget || uEmail === cleanTarget;
  });

  if (targetIdx !== -1) {
    const u = users[targetIdx];
    updatedUser = {
      ...u,
      isVerified,
      verificationStatus: isVerified ? 'approved' : 'unverified',
      badgeType: effectiveBadgeType,
      badgeTitle: isVerified ? cleanTitle : '',
      updatedAt: nowIso,
    };
    users[targetIdx] = updatedUser;
    saveUserToFirestore(updatedUser).catch((err) => console.error('Error saving updated badge to Firestore:', err));
    saveStoredUsers(users);
  } else {
    // If not found in users list, check active user or construct record
    let baseUser: any = null;
    try {
      const activeStr = localStorage.getItem('fuhsi_active_user');
      if (activeStr) {
        const active = JSON.parse(activeStr);
        if ((active.nickname || '').trim().toLowerCase().replace(/^@/, '') === cleanTarget) {
          baseUser = active;
        }
      }
    } catch {}

    const createdUser: UserProfile = {
      ...(baseUser || {}),
      id: baseUser?.id || `usr_${cleanTarget}`,
      nickname: baseUser?.nickname || (targetNicknameOrId.startsWith('@') ? targetNicknameOrId : `@${cleanTarget}`),
      department: baseUser?.department || 'FUHSI',
      level: baseUser?.level || '100L',
      bio: baseUser?.bio || '',
      isVerified,
      verificationStatus: isVerified ? 'approved' : 'unverified',
      badgeType: effectiveBadgeType,
      badgeTitle: isVerified ? cleanTitle : '',
      updatedAt: nowIso,
    };
    updatedUser = createdUser;
    users.push(createdUser);
    saveUserToFirestore(createdUser).catch((err) => console.error('Error saving updated badge to Firestore:', err));
    saveStoredUsers(users);
  }

  // 2. Update active user profile in localStorage if matching
  try {
    const activeStr = localStorage.getItem('fuhsi_active_user');
    if (activeStr) {
      const active = JSON.parse(activeStr);
      const aNick = (active.nickname || '').trim().toLowerCase().replace(/^@/, '');
      const aId = (active.id || '').trim().toLowerCase();
      if (aNick === cleanTarget || aId === cleanTarget) {
        const updatedActive = {
          ...active,
          isVerified,
          verificationStatus: isVerified ? 'approved' : 'unverified',
          badgeType: effectiveBadgeType,
          badgeTitle: isVerified ? cleanTitle : '',
          updatedAt: nowIso,
        };
        localStorage.setItem('fuhsi_active_user', JSON.stringify(updatedActive));
      }
    }
  } catch (e) {
    console.error('Error updating active user badge:', e);
  }

  // 3. Update or create verification request record in fuhsi_verifications_db
  try {
    const vStr = localStorage.getItem('fuhsi_verifications_db');
    let vList: VerificationRequest[] = vStr ? JSON.parse(vStr) : [];
    let matchedVerif = false;

    vList = vList.map((req) => {
      const reqNick = (req.applicantNickname || '').trim().toLowerCase().replace(/^@/, '');
      const reqId = (req.id || '').trim().toLowerCase();
      if (reqNick === cleanTarget || reqId === cleanTarget) {
        matchedVerif = true;
        const updatedReq: VerificationRequest = {
          ...req,
          status: isVerified ? 'APPROVED' : 'REVOKED',
          assignedBadgeType: effectiveBadgeType,
          assignedBadgeTitle: isVerified ? cleanTitle : '',
          timestamp: nowIso,
        };
        saveVerificationRequestToFirestore(updatedReq).catch((err) => console.error(err));
        return updatedReq;
      }
      return req;
    });

    if (!matchedVerif && isVerified && updatedUser) {
      // Create an approved verification dossier record
      const targetUser: UserProfile = updatedUser;
      const newReq: VerificationRequest = {
        id: `verif_admin_${Date.now()}_${cleanTarget}`,
        applicantNickname: targetUser.nickname || `@${cleanTarget}`,
        applicantFullName: targetUser.realNameHidden || targetUser.realName || cleanTarget,
        realName: targetUser.realNameHidden || targetUser.realName || cleanTarget,
        applicantEmail: targetUser.studentEmail || `${cleanTarget}@fuhsi.edu.ng`,
        accountType: isGuestAccount(targetUser) ? 'Guest' : 'Student',
        category: 'Official Admin Verification & Honor Badge',
        department: targetUser.department || 'FUHSI',
        level: targetUser.level || '300L',
        matricNumber: targetUser.matricNumber || '',
        positionTitle: cleanTitle,
        statement: 'Admin directly assigned and verified identity credentials.',
        timestamp: nowIso,
        status: 'APPROVED',
        assignedBadgeType: effectiveBadgeType,
        assignedBadgeTitle: cleanTitle,
      };
      vList.unshift(newReq);
      saveVerificationRequestToFirestore(newReq).catch((err) => console.error(err));
    }

    localStorage.setItem('fuhsi_verifications_db', JSON.stringify(vList));
    pushServerDbSync({ users, verificationRequests: vList });
  } catch (e) {
    console.error('Error syncing verifications db with new badge:', e);
  }

  // 4. Update posts author badges in fuhsi_posts_db and Firestore
  let updatedPList: any[] = [];
  try {
    const pStr = localStorage.getItem('fuhsi_posts_db');
    if (pStr) {
      const pList: any[] = JSON.parse(pStr);
      let postsChanged = false;
      updatedPList = pList.map((p) => {
        const pNick = (p.authorNickname || '').trim().toLowerCase().replace(/^@/, '');
        if (pNick === cleanTarget) {
          postsChanged = true;
          const updatedPost = {
            ...p,
            isVerified,
            authorIsVerified: isVerified,
            authorBadgeType: effectiveBadgeType,
            authorBadgeTitle: isVerified ? cleanTitle : '',
          };
          savePostToFirestore(updatedPost).catch(() => {});
          return updatedPost;
        }
        return p;
      });
      if (postsChanged) {
        localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPList));
      }
    }
  } catch (e) {}

  // 5. Update comments author badges in fuhsi_comments_db and Firestore
  let updatedCList: any[] = [];
  try {
    const cStr = localStorage.getItem('fuhsi_comments_db');
    if (cStr) {
      const cList: any[] = JSON.parse(cStr);
      let commentsChanged = false;
      updatedCList = cList.map((c) => {
        const cNick = (c.authorNickname || '').trim().toLowerCase().replace(/^@/, '');
        if (cNick === cleanTarget) {
          commentsChanged = true;
          const updatedComment = {
            ...c,
            isVerified,
            authorIsVerified: isVerified,
            authorBadgeType: effectiveBadgeType,
            authorBadgeTitle: isVerified ? cleanTitle : '',
          };
          saveCommentToFirestore(updatedComment).catch(() => {});
          return updatedComment;
        }
        return c;
      });
      if (commentsChanged) {
        localStorage.setItem('fuhsi_comments_db', JSON.stringify(updatedCList));
      }
    }
  } catch (e) {}

  // 6. Deliver instant in-app notification to the target user
  try {
    const notifKey = `fuhsi_user_notifications_${cleanTarget}`;
    const actionTitle = isVerified
      ? (cleanTitle ? `🎉 Badge Assigned: ${cleanTitle}` : `🎉 Verification Badge Updated (${effectiveBadgeType})`)
      : 'Account Verification Revoked';
    const actionMsg = isVerified
      ? `Congratulations! Platform Admin has verified your credentials and assigned you the ${effectiveBadgeType} badge${cleanTitle ? ` with the official title "${cleanTitle}"` : ''}. Your badge is now visible throughout FUHSI Connect!`
      : `Your verification badge has been revoked by administration.`;
    const badgeNotif = {
      id: `badge_upd_${Date.now()}`,
      type: 'VERIFICATION',
      title: actionTitle,
      message: actionMsg,
      timestamp: 'Just now',
      isRead: false,
    };
    let existingNotifs: any[] = [];
    const storedNotifs = localStorage.getItem(notifKey);
    if (storedNotifs) existingNotifs = JSON.parse(storedNotifs);
    localStorage.setItem(notifKey, JSON.stringify([badgeNotif, ...existingNotifs]));
  } catch (e) {}

  // 7. Dispatch custom event for real-time reactivity across active views
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fuhsi_badge_updated', {
        detail: {
          targetNickname: cleanTarget,
          badgeType: effectiveBadgeType,
          badgeTitle: isVerified ? cleanTitle : '',
          isVerified,
          user: updatedUser,
        },
      })
    );
  }

  return { success: true, user: updatedUser };
}
