import { UserProfile, Post, Comment, MarketplaceItem, VerificationRequest, Report, DirectMessage, ChatConversation, ChatReport, FollowRecord, CampusNotification } from '../types';
import { normalizeMatricNumber } from './matricValidation';
import { normalizeBadgeColor } from './verificationUtils';
import {
  isDemoUser,
  isDemoPost,
  isDemoComment,
  isDemoVerificationRequest,
  isDemoMarketplaceItem,
  isDemoDirectMessage,
  isDemoNickname,
} from './postGenerator';

export interface ServerDbState {
  users: UserProfile[];
  posts: Post[];
  comments: Comment[];
  marketplaceItems: MarketplaceItem[];
  pendingMarketplaceItems: MarketplaceItem[];
  verificationRequests: VerificationRequest[];
  reports: Report[];
  verificationFee: number;
  notifications: Record<string, any[]>;
  verifCandidates: any[];
  sentEmails: any[];
  tradeDeskTransactions?: any[];
  directMessages?: DirectMessage[];
  chatConversations?: ChatConversation[];
  chatReports?: ChatReport[];
  chatRestrictions?: any[];
  chatViolations?: any[];
  follows?: FollowRecord[];
  marketplaceReports?: any[];
  helpDeskInquiries?: any[];
  replaceUsers?: boolean;
  replacePosts?: boolean;
  replaceComments?: boolean;
  replaceMarketplaceItems?: boolean;
  replacePendingMarketplaceItems?: boolean;
  replaceVerificationRequests?: boolean;
  replaceReports?: boolean;
  replaceFollows?: boolean;
  deletedUserIds?: string[];
  deletedUserNicknames?: string[];
  deletedPostIds?: string[];
  deletedCommentIds?: string[];
}

export function isCommentDeletedLocally(commentId?: string | null): boolean {
  if (!commentId) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem('fuhsi_deleted_comment_ids');
    if (!raw) return false;
    const deleted: string[] = JSON.parse(raw);
    return Array.isArray(deleted) && deleted.includes(String(commentId).trim());
  } catch {
    return false;
  }
}

export function markCommentPermanentlyDeleted(commentId?: string | null): void {
  if (!commentId) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const cleanId = String(commentId).trim();
    const raw = localStorage.getItem('fuhsi_deleted_comment_ids');
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(cleanId)) {
      list.push(cleanId);
      localStorage.setItem('fuhsi_deleted_comment_ids', JSON.stringify(list));
    }
  } catch (e) {
    console.error('Error marking comment permanently deleted:', e);
  }
}

export function isPostDeletedLocally(postId?: string | null): boolean {
  if (!postId) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem('fuhsi_deleted_post_ids');
    if (!raw) return false;
    const deleted: string[] = JSON.parse(raw);
    return Array.isArray(deleted) && deleted.includes(String(postId).trim());
  } catch {
    return false;
  }
}

export function markPostPermanentlyDeleted(postId?: string | null): void {
  if (!postId) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const cleanId = String(postId).trim();
    const raw = localStorage.getItem('fuhsi_deleted_post_ids');
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(cleanId)) {
      list.push(cleanId);
      localStorage.setItem('fuhsi_deleted_post_ids', JSON.stringify(list));
    }
  } catch (e) {
    console.error('Error marking post permanently deleted:', e);
  }
}

export function mergeUsers(a: UserProfile[] = [], b: UserProfile[] = []): UserProfile[] {
  const mergedList: UserProfile[] = [];

  const isDeletedLocally = (u: UserProfile): boolean => {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem('fuhsi_deleted_users_db');
      if (!raw) return false;
      const deleted: any[] = JSON.parse(raw);
      if (!Array.isArray(deleted) || deleted.length === 0) return false;
      const uId = u.id ? String(u.id).trim() : '';
      const uNick = u.nickname ? String(u.nickname).trim().toLowerCase().replace(/^@/, '') : '';
      const uEmail = u.studentEmail ? String(u.studentEmail).trim().toLowerCase() : '';
      if (uId === 'usr_admin_modula' || uNick === 'modula') return false;

      return deleted.some((d) => {
        if (uId && d.id && String(d.id).trim() === uId) return true;
        if (uNick && d.nickname && String(d.nickname).trim().toLowerCase().replace(/^@/, '') === uNick) return true;
        if (uEmail && d.studentEmail && String(d.studentEmail).trim().toLowerCase() === uEmail) return true;
        const uMatric = u.matricNumber ? String(u.matricNumber).trim().toUpperCase() : '';
        if (uMatric && d.matricNumber && String(d.matricNumber).trim().toUpperCase() === uMatric) return true;
        return false;
      });
    } catch {
      return false;
    }
  };

  const processUser = (u: UserProfile) => {
    if (!u || isDemoUser(u) || isDemoNickname(u.nickname) || isDeletedLocally(u)) return;

    const uId = u.id ? String(u.id).trim() : '';
    const uNick = u.nickname ? String(u.nickname).trim().toLowerCase().replace(/^@/, '') : '';

    // Requirement 10, 11, 12: Internal account ID must be the primary identity.
    // Two accounts with different IDs must NEVER be merged based on username, email, or similar details!
    const existingIndex = mergedList.findIndex((ex) => {
      const exId = ex.id ? String(ex.id).trim() : '';
      if (uId && exId && uId === exId) return true;
      // Fallback only if neither record has an internal ID
      if (!uId && !exId && uNick) {
        const exNick = ex.nickname ? String(ex.nickname).trim().toLowerCase().replace(/^@/, '') : '';
        return uNick === exNick;
      }
      return false;
    });

    if (existingIndex === -1) {
      mergedList.push({ ...u, badgeTitle: u.badgeTitle ? u.badgeTitle.trim() : '' });
    } else {
      const existing = mergedList[existingIndex];
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const incomingTime = u.updatedAt ? new Date(u.updatedAt).getTime() : 0;
      // Prefer newer record; if equal or older, or if incoming is from central update, accept incoming
      const useIncoming = !existing.updatedAt || incomingTime >= existingTime;

      const primary = useIncoming ? u : existing;
      const secondary = useIncoming ? existing : u;
      let authoritativeNick = (useIncoming ? u.nickname : existing.nickname) || u.nickname || existing.nickname;

      // Check superseded / old nicknames from localStorage if present
      try {
        if (typeof localStorage !== 'undefined') {
          const rawSup = localStorage.getItem('fuhsi_superseded_usernames');
          if (rawSup) {
            const superseded = JSON.parse(rawSup);
            const exClean = (existing.nickname || '').toLowerCase().replace(/^@/, '');
            const inClean = (u.nickname || '').toLowerCase().replace(/^@/, '');
            if (superseded[exClean] && !superseded[inClean]) {
              authoritativeNick = u.nickname;
            } else if (superseded[inClean] && !superseded[exClean]) {
              authoritativeNick = existing.nickname;
            }
          }
        }
      } catch {}

      let isDeclined = false;
      if (primary.isDeclined !== undefined) {
        isDeclined = Boolean(primary.isDeclined);
      } else if (secondary.isDeclined !== undefined) {
        isDeclined = Boolean(secondary.isDeclined);
      }

      let isApproved = false;
      if (isDeclined) {
        isApproved = false;
      } else if (primary.isApproved !== undefined) {
        isApproved = Boolean(primary.isApproved);
      } else if (secondary.isApproved !== undefined) {
        isApproved = Boolean(secondary.isApproved);
      } else {
        isApproved = true;
      }

      let badgeTitle = primary.badgeTitle !== undefined ? primary.badgeTitle : (secondary.badgeTitle || '');
      if (badgeTitle.toLowerCase().includes('decline') || badgeTitle.toLowerCase().includes('pending')) {
        badgeTitle = '';
      }

      const targetNick = (primary.nickname || secondary.nickname || '').toLowerCase().replace(/^@/, '');
      const isMod = targetNick === 'modula';

      const merged: UserProfile = {
        ...secondary,
        ...primary,
        id: primary.id || secondary.id,
        nickname: authoritativeNick,
        realName: primary.realName || secondary.realName,
        realNameHidden: primary.realNameHidden || secondary.realNameHidden || primary.realName || secondary.realName,
        studentEmail: primary.studentEmail || secondary.studentEmail,
        emergencyHomePhone: primary.emergencyHomePhone || secondary.emergencyHomePhone,
        department: (primary.department && primary.department.trim()) ? primary.department : (secondary.department || primary.department || ''),
        matricNumber: (primary.matricNumber && primary.matricNumber.trim()) ? primary.matricNumber : (secondary.matricNumber || primary.matricNumber || ''),
        level: (primary.level && primary.level.trim()) ? primary.level : (secondary.level || primary.level || ''),
        bio: primary.bio !== undefined ? primary.bio : (secondary.bio || ''),
        avatarKey: primary.avatarKey || secondary.avatarKey || 'caduceus',
        avatarUrl: primary.avatarUrl !== undefined ? primary.avatarUrl : secondary.avatarUrl,
        isApproved,
        isDeclined,
        isVerified: (() => {
          if (isMod) return true;
          // Check explicit revocation first
          if (primary.isVerified === false || primary.verificationStatus === 'rejected' || (primary.badgeType as any) === 'NONE') {
            if (secondary.isVerified === true && secondary.badgeType && (secondary.badgeType as any) !== 'NONE' && incomingTime < existingTime) {
              // Primary is existing and unverified
              return false;
            }
            if (useIncoming && (primary.isVerified === false || primary.verificationStatus === 'rejected' || (primary.badgeType as any) === 'NONE')) {
              return false;
            }
          }
          if (primary.isVerified === true && primary.badgeType && (primary.badgeType as any) !== 'NONE') return true;
          if (secondary.isVerified === true && secondary.badgeType && (secondary.badgeType as any) !== 'NONE') return true;
          return Boolean(primary.isVerified || secondary.isVerified);
        })(),
        verificationStatus: (() => {
          if (isMod) return 'approved';
          if (primary.isVerified === false || primary.verificationStatus === 'rejected' || (primary.badgeType as any) === 'NONE') return 'rejected';
          if (primary.verificationStatus === 'approved' || primary.isVerified) return 'approved';
          if (secondary.isVerified === false || secondary.verificationStatus === 'rejected' || (secondary.badgeType as any) === 'NONE') return 'rejected';
          if (secondary.verificationStatus === 'approved' || secondary.isVerified) return 'approved';
          return primary.verificationStatus || secondary.verificationStatus || 'unverified';
        })(),
        isAdmin: Boolean(primary.isAdmin || secondary.isAdmin),
        reputationScore: Math.max(primary.reputationScore || 0, secondary.reputationScore || 0),
        badgeType: (() => {
          if (isMod) {
            return (primary.badgeType && (primary.badgeType as any) !== 'NONE')
              ? normalizeBadgeColor(primary.badgeType)
              : (secondary.badgeType && (secondary.badgeType as any) !== 'NONE')
              ? normalizeBadgeColor(secondary.badgeType)
              : 'BLUE';
          }
          // If primary has explicit revocation
          if (primary.isVerified === false || primary.verificationStatus === 'rejected' || (primary.badgeType as any) === 'NONE') return 'NONE';
          if (primary.isVerified === true && primary.badgeType && (primary.badgeType as any) !== 'NONE') {
            return normalizeBadgeColor(primary.badgeType);
          }
          if (secondary.isVerified === false || secondary.verificationStatus === 'rejected' || (secondary.badgeType as any) === 'NONE') return 'NONE';
          if (secondary.isVerified === true && secondary.badgeType && (secondary.badgeType as any) !== 'NONE') {
            return normalizeBadgeColor(secondary.badgeType);
          }
          return 'NONE';
        })(),
        badgeTitle: (() => {
          if (isMod) {
            return (primary.badgeTitle !== undefined && primary.badgeTitle.trim())
              ? primary.badgeTitle.trim()
              : (secondary.badgeTitle || '').trim();
          }
          // If revoked, clear title
          if (primary.isVerified === false || primary.verificationStatus === 'rejected' || (primary.badgeType as any) === 'NONE') return '';
          const primaryTitle = (primary.badgeTitle || '').trim();
          const secondaryTitle = (secondary.badgeTitle || '').trim();
          const cleanP = primaryTitle.toLowerCase();
          const isPBad = cleanP.includes('decline') || cleanP.includes('pending') || cleanP.includes('reject');
          const cleanS = secondaryTitle.toLowerCase();
          const isSBad = cleanS.includes('decline') || cleanS.includes('pending') || cleanS.includes('reject');

          if (primaryTitle && !isPBad) return primaryTitle;
          if (secondaryTitle && !isSBad && secondary.isVerified !== false && (secondary.badgeType as any) !== 'NONE') return secondaryTitle;
          return '';
        })(),
        savedPassword: (primary as any).savedPassword || (primary as any).password || (secondary as any).savedPassword || (secondary as any).password,
        password: (primary as any).savedPassword || (primary as any).password || (secondary as any).savedPassword || (secondary as any).password,
        updatedAt: primary.updatedAt || secondary.updatedAt || new Date().toISOString(),
      };
      mergedList[existingIndex] = merged;
    }
  };

  a.forEach(processUser);
  b.forEach(processUser);

  return mergedList.filter((u) => !isDemoUser(u) && !isDemoNickname(u.nickname));
}

function deduplicateLikedBy(list: any): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'string') continue;
    const norm = item.toLowerCase().replace(/^@/, '').trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    result.push(norm);
  }
  return result;
}

export function mergePosts(a: Post[] = [], b: Post[] = []): Post[] {
  const map = new Map<string, Post>();

  const processPost = (p: Post) => {
    if (!p || !p.id || isDemoPost(p) || isPostDeletedLocally(p.id)) return;
    
    // Ignore legacy duplicate post entities for reposts
    if (p.id.startsWith('repost_') || (p.isRepost && p.repostedPostId)) {
      if (p.repostedPostId && p.reposterNickname) {
        const base = map.get(p.repostedPostId);
        if (base) {
          const list = Array.isArray(base.repostedBy) ? [...base.repostedBy] : [];
          if (!list.includes(p.reposterNickname)) {
            list.push(p.reposterNickname);
            base.repostedBy = list;
            base.repostsCount = list.length;
            base.shareCount = Math.max(base.shareCount || 0, list.length);
          }
        }
      }
      return;
    }

    const existing = map.get(p.id);
    if (!existing) {
      const likedBy = deduplicateLikedBy(p.likedBy);
      const likesCount = Array.isArray(p.likedBy) ? likedBy.length : (p.likesCount ?? p.likes ?? 0);
      const cleaned: Post = {
        ...p,
        likedBy,
        likesCount,
        likes: likesCount,
      };
      delete cleaned.isBookmarked;
      delete cleaned.isBookmarkedByMe;
      delete cleaned.isLikedByMe;
      map.set(p.id, cleaned);
    } else {
      // Determine which version has newer edits / content / reaction updates
      const existingUpdatedMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const pUpdatedMs = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
      const isPNewer = pUpdatedMs > existingUpdatedMs || (pUpdatedMs === existingUpdatedMs && Array.isArray(p.likedBy) && (!Array.isArray(existing.likedBy) || p.likedBy.length >= existing.likedBy.length));

      const primary = isPNewer ? p : existing;
      const secondary = isPNewer ? existing : p;

      // Handle likedBy list - strictly prefer authoritative likedBy array from the newer update
      let mergedLikedBy: string[] = [];
      let hasLikedByArray = false;
      if (Array.isArray(primary.likedBy)) {
        mergedLikedBy = deduplicateLikedBy(primary.likedBy);
        hasLikedByArray = true;
      } else if (Array.isArray(secondary.likedBy)) {
        mergedLikedBy = deduplicateLikedBy(secondary.likedBy);
        hasLikedByArray = true;
      }

      const likesCount = hasLikedByArray
        ? mergedLikedBy.length
        : (primary.likesCount !== undefined ? primary.likesCount : (secondary.likesCount ?? 0));

      // Handle repostedBy list
      let mergedRepostedBy: string[] = [];
      if (Array.isArray(primary.repostedBy) && (primary.repostedBy.length > 0 || isPNewer)) {
        mergedRepostedBy = primary.repostedBy;
      } else if (Array.isArray(secondary.repostedBy)) {
        mergedRepostedBy = secondary.repostedBy;
      }

      const repostsCount = mergedRepostedBy.length > 0
        ? mergedRepostedBy.length
        : (primary.repostsCount !== undefined
            ? primary.repostsCount
            : (secondary.repostsCount ?? primary.shareCount ?? secondary.shareCount ?? 0));

      // Handle bookmarkedBy list (per-user bookmark records)
      let mergedBookmarkedBy: string[] = [];
      const exBookmarked = Array.isArray(existing.bookmarkedBy) ? existing.bookmarkedBy : [];
      const pBookmarked = Array.isArray(p.bookmarkedBy) ? p.bookmarkedBy : [];
      mergedBookmarkedBy = Array.from(new Set([...exBookmarked, ...pBookmarked]));

      const bookmarks = mergedBookmarkedBy.length > 0 ? mergedBookmarkedBy.length : Math.max(existing.bookmarks || 0, p.bookmarks || 0);
      const commentsCount = Math.max(existing.commentsCount || 0, p.commentsCount || 0);

      const existingRecords = Array.isArray(existing.repostRecords) ? existing.repostRecords : [];
      const pRecords = Array.isArray(p.repostRecords) ? p.repostRecords : [];
      const recordsMap = new Map<string, { userNickname: string; timestamp: string }>();
      [...existingRecords, ...pRecords].forEach((r) => {
        if (r && r.userNickname) {
          const k = (r.userNickname || '').toLowerCase().replace(/^@/, '').trim();
          recordsMap.set(k, r);
        }
      });
      const mergedRepostRecords = Array.from(recordsMap.values());

      const mergedPost: Post = {
        ...secondary,
        ...primary,
        likedBy: mergedLikedBy,
        likes: likesCount,
        likesCount,
        repostedBy: mergedRepostedBy,
        repostRecords: mergedRepostRecords,
        repostsCount,
        shareCount: repostsCount,
        bookmarkedBy: mergedBookmarkedBy,
        bookmarks,
        commentsCount,
      };
      delete mergedPost.isBookmarked;
      delete mergedPost.isBookmarkedByMe;
      delete mergedPost.isLikedByMe;
      map.set(p.id, mergedPost);
    }
  };

  a.forEach(processPost);
  b.forEach(processPost);

  return Array.from(map.values())
    .filter((p) => !isDemoPost(p))
    .sort((x, y) => {
      const valX = x.createdAt || x.timestamp || 0;
      const valY = y.createdAt || y.timestamp || 0;
      const tX = isNaN(new Date(valX).getTime()) ? 0 : new Date(valX).getTime();
      const tY = isNaN(new Date(valY).getTime()) ? 0 : new Date(valY).getTime();
      return tY - tX;
    });
}

export function mergeComments(a: Comment[] = [], b: Comment[] = []): Comment[] {
  const map = new Map<string, Comment>();
  const processComment = (c: Comment) => {
    if (!c || !c.id || isDemoComment(c) || isCommentDeletedLocally(c.id)) return;
    const existing = map.get(c.id);
    if (!existing) {
      const likedBy = deduplicateLikedBy(c.likedBy);
      const likesCount = Array.isArray(c.likedBy) ? likedBy.length : (c.likesCount ?? c.likes ?? 0);
      const cleaned: Comment = { ...c, likedBy, likes: likesCount, likesCount };
      delete cleaned.isLikedByMe;
      map.set(c.id, cleaned);
    } else {
      const existingUpdatedMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const cUpdatedMs = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      const isCNewer =
        cUpdatedMs > existingUpdatedMs ||
        (cUpdatedMs === existingUpdatedMs &&
          Array.isArray(c.likedBy) &&
          (!Array.isArray(existing.likedBy) || c.likedBy.length >= existing.likedBy.length));

      const primary = isCNewer ? c : existing;
      const secondary = isCNewer ? existing : c;

      let mergedLikedBy: string[] = [];
      let hasLikedByArray = false;
      if (Array.isArray(primary.likedBy)) {
        mergedLikedBy = deduplicateLikedBy(primary.likedBy);
        hasLikedByArray = true;
      } else if (Array.isArray(secondary.likedBy)) {
        mergedLikedBy = deduplicateLikedBy(secondary.likedBy);
        hasLikedByArray = true;
      }

      const likesCount = hasLikedByArray
        ? mergedLikedBy.length
        : (primary.likesCount !== undefined ? primary.likesCount : (secondary.likesCount ?? 0));

      const mergedComment: Comment = {
        ...secondary,
        ...primary,
        likedBy: mergedLikedBy,
        likes: likesCount,
        likesCount,
        updatedAt: primary.updatedAt || secondary.updatedAt,
      };
      delete mergedComment.isLikedByMe;
      map.set(c.id, mergedComment);
    }
  };
  a.forEach(processComment);
  b.forEach(processComment);
  return Array.from(map.values())
    .filter((c) => !isDemoComment(c))
    .sort((x, y) => {
      const tX = isNaN(new Date(x.timestamp || 0).getTime()) ? 0 : new Date(x.timestamp || 0).getTime();
      const tY = isNaN(new Date(y.timestamp || 0).getTime()) ? 0 : new Date(y.timestamp || 0).getTime();
      return tX - tY;
    });
}

export function mergeMarketplaceItems(a: MarketplaceItem[] = [], b: MarketplaceItem[] = []): MarketplaceItem[] {
  const map = new Map<string, MarketplaceItem>();
  const processItem = (item: MarketplaceItem) => {
    if (!item || !item.id || isDemoMarketplaceItem(item)) return;
    map.set(item.id, { ...(map.get(item.id) || {}), ...item });
  };
  a.forEach(processItem);
  b.forEach(processItem);
  return Array.from(map.values()).filter((m) => !isDemoMarketplaceItem(m));
}

export function mergeVerificationRequests(a: VerificationRequest[] = [], b: VerificationRequest[] = []): VerificationRequest[] {
  const map = new Map<string, VerificationRequest>();
  const processReq = (r: VerificationRequest) => {
    if (!r || !r.id || isDemoVerificationRequest(r)) return;
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, { ...r });
    } else {
      let status = r.status;
      if (r.status === 'REJECTED' || existing.status === 'REJECTED') {
        status = 'REJECTED';
      } else if (r.status !== 'PENDING') {
        status = r.status;
      } else {
        status = existing.status || r.status;
      }

      const assignedBadgeType = status === 'REJECTED' ? 'NONE' : (r.assignedBadgeType && r.assignedBadgeType !== 'NONE' ? r.assignedBadgeType : existing.assignedBadgeType || 'NONE');
      const assignedBadgeTitle = status === 'REJECTED' ? '' : (r.assignedBadgeTitle !== undefined ? r.assignedBadgeTitle : (existing.assignedBadgeTitle || ''));

      map.set(r.id, {
        ...existing,
        ...r,
        status,
        assignedBadgeType,
        assignedBadgeTitle,
      });
    }
  };
  a.forEach(processReq);
  b.forEach(processReq);
  return Array.from(map.values())
    .filter((v) => !isDemoVerificationRequest(v))
    .sort((x, y) => {
      const tX = isNaN(new Date(x.timestamp).getTime()) ? 0 : new Date(x.timestamp).getTime();
      const tY = isNaN(new Date(y.timestamp).getTime()) ? 0 : new Date(y.timestamp).getTime();
      return tY - tX;
    });
}

export function mergeReports(a: Report[] = [], b: Report[] = []): Report[] {
  const map = new Map<string, Report>();
  a.forEach((r) => r?.id && !isDemoNickname(r.reporterNickname) && !isDemoNickname((r as any).reportedNickname) && map.set(r.id, { ...r }));
  b.forEach((r) => r?.id && !isDemoNickname(r.reporterNickname) && !isDemoNickname((r as any).reportedNickname) && map.set(r.id, { ...(map.get(r.id) || {}), ...r }));
  return Array.from(map.values());
}

export function mergeVerifCandidates(a: any[] = [], b: any[] = []): any[] {
  const map = new Map<string, any>();
  const processCand = (c: any) => {
    if (!c) return;
    const key = c.id || c.userId || c.nickname;
    if (!key) return;
    map.set(key, { ...(map.get(key) || {}), ...c });
  };
  a.forEach(processCand);
  b.forEach(processCand);
  return Array.from(map.values());
}

function normalizeHandleList(list: any): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'string') continue;
    const norm = item.toLowerCase().replace(/^@/, '').trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

function getDmTimeMs(m: { timestamp?: any; id?: string }): number {
  if (typeof m.timestamp === 'number' && !isNaN(m.timestamp)) return m.timestamp;
  if (typeof m.timestamp === 'string') {
    const parsed = Date.parse(m.timestamp);
    if (!isNaN(parsed)) return parsed;
  }
  if (typeof m.id === 'string') {
    const match = m.id.match(/(?:dm|msg|sys_group)_(\d{10,14})/);
    if (match && match[1]) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

export function mergeDirectMessages(a: DirectMessage[] = [], b: DirectMessage[] = []): DirectMessage[] {
  const map = new Map<string, DirectMessage>();
  const processMsg = (m: DirectMessage) => {
    if (!m?.id || isDemoDirectMessage(m)) return;
    const existing = map.get(m.id);
    if (!existing) {
      map.set(m.id, {
        ...m,
        readByUsers: Array.isArray(m.readByUsers) ? normalizeHandleList(m.readByUsers) : m.readByUsers,
        deletedForUsers: Array.isArray(m.deletedForUsers) ? normalizeHandleList(m.deletedForUsers) : m.deletedForUsers,
      });
    } else {
      const mergedReadBy = normalizeHandleList([...(existing.readByUsers || []), ...(m.readByUsers || [])]);
      const mergedDeletedFor = normalizeHandleList([...(existing.deletedForUsers || []), ...(m.deletedForUsers || [])]);
      const isDeletedForEveryone = Boolean(existing.isDeletedForEveryone || m.isDeletedForEveryone);

      let mergedReactions: Record<string, string[]> | undefined = existing.reactions || m.reactions;
      if (existing.reactions && m.reactions) {
        mergedReactions = { ...existing.reactions };
        for (const [emoji, users] of Object.entries(m.reactions)) {
          const prevUsers = mergedReactions[emoji] || [];
          const combined = Array.from(new Set([...prevUsers, ...(Array.isArray(users) ? users : [])]));
          if (combined.length > 0) mergedReactions[emoji] = combined;
        }
      }

      map.set(m.id, {
        ...existing,
        ...m,
        text: isDeletedForEveryone ? '🚫 This message was deleted' : (m.text || existing.text),
        isDeletedForEveryone,
        isRead: Boolean(existing.isRead || m.isRead),
        readAt: m.readAt || existing.readAt,
        readByUsers: mergedReadBy.length > 0 ? mergedReadBy : undefined,
        deletedForUsers: mergedDeletedFor.length > 0 ? mergedDeletedFor : undefined,
        reactions: mergedReactions,
      });
    }
  };
  a.forEach(processMsg);
  b.forEach(processMsg);
  return Array.from(map.values()).sort((x, y) => {
    const tX = getDmTimeMs(x);
    const tY = getDmTimeMs(y);
    if (tX !== tY) return tX - tY;
    return (x.id || '').localeCompare(y.id || '');
  });
}

function getNotifTimeMs(n: { createdAt?: string; updatedAt?: string; timestamp?: string; _actionTimestamp?: number }): number {
  if (typeof n._actionTimestamp === 'number' && !isNaN(n._actionTimestamp)) return n._actionTimestamp;
  for (const val of [n.updatedAt, n.createdAt, n.timestamp]) {
    if (typeof val === 'string' && val.trim()) {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return 0;
}

export function mergeNotifications(a: CampusNotification[] = [], b: CampusNotification[] = []): CampusNotification[] {
  const map = new Map<string, CampusNotification>();
  const processNotif = (n: any) => {
    if (!n || !n.id) return;
    if (n.type === 'DIRECT_MESSAGE' || (typeof n.id === 'string' && n.id.startsWith('notif_dm_'))) return;
    const existing = map.get(n.id);
    if (!existing) {
      const readByUsers = normalizeHandleList(n.readByUsers);
      map.set(n.id, {
        ...n,
        ...(readByUsers.length > 0 ? { readByUsers } : {}),
      });
    } else {
      const readByUsers = normalizeHandleList([...(existing.readByUsers || []), ...(n.readByUsers || [])]);
      const exTime = getNotifTimeMs(existing as any);
      const nTime = getNotifTimeMs(n as any);
      const primary = nTime >= exTime ? n : existing;
      const secondary = nTime >= exTime ? existing : n;
      map.set(n.id, {
        ...secondary,
        ...primary,
        isRead: Boolean(existing.isRead || n.isRead),
        ...(readByUsers.length > 0 ? { readByUsers } : {}),
      });
    }
  };
  a.forEach(processNotif);
  b.forEach(processNotif);
  return Array.from(map.values()).sort((x, y) => getNotifTimeMs(y as any) - getNotifTimeMs(x as any));
}

export function mergeChatConversations(a: ChatConversation[] = [], b: ChatConversation[] = []): ChatConversation[] {
  const map = new Map<string, ChatConversation>();
  a.forEach((c) => c?.id && map.set(c.id, { ...c }));
  b.forEach((c) => c?.id && map.set(c.id, { ...(map.get(c.id) || {}), ...c }));
  return Array.from(map.values());
}

export function mergeChatReports(a: ChatReport[] = [], b: ChatReport[] = []): ChatReport[] {
  const map = new Map<string, ChatReport>();
  a.forEach((r) => r?.id && map.set(r.id, { ...r }));
  b.forEach((r) => r?.id && map.set(r.id, { ...(map.get(r.id) || {}), ...r }));
  return Array.from(map.values()).sort((x, y) => {
    const tX = isNaN(new Date(x.timestamp).getTime()) ? 0 : new Date(x.timestamp).getTime();
    const tY = isNaN(new Date(y.timestamp).getTime()) ? 0 : new Date(y.timestamp).getTime();
    return tY - tX;
  });
}

export function mergeChatRestrictions(a: any[] = [], b: any[] = []): any[] {
  const map = new Map<string, any>();
  a.forEach((r) => r?.userNickname && map.set(r.userNickname.toLowerCase(), { ...r }));
  b.forEach((r) => r?.userNickname && map.set(r.userNickname.toLowerCase(), { ...(map.get(r.userNickname.toLowerCase()) || {}), ...r }));
  return Array.from(map.values());
}

export function mergeFollows(a: FollowRecord[] = [], b: FollowRecord[] = []): FollowRecord[] {
  const map = new Map<string, FollowRecord>();
  const processFollow = (f: FollowRecord) => {
    if (!f || !f.followerNickname || !f.followingNickname) return;
    const cleanFollower = f.followerNickname.toLowerCase().replace(/^@/, '').trim();
    const cleanFollowing = f.followingNickname.toLowerCase().replace(/^@/, '').trim();
    if (!cleanFollower || !cleanFollowing || cleanFollower === cleanFollowing) return;
    if (isDemoNickname(cleanFollower) || isDemoNickname(cleanFollowing)) return;
    const key = `${cleanFollower}__${cleanFollowing}`;
    if (!map.has(key)) {
      map.set(key, {
        id: f.id || `${cleanFollower}__follows__${cleanFollowing}`,
        followerNickname: f.followerNickname.startsWith('@') ? f.followerNickname : `@${cleanFollower}`,
        followingNickname: f.followingNickname.startsWith('@') ? f.followingNickname : `@${cleanFollowing}`,
        createdAt: f.createdAt || new Date().toISOString(),
      });
    }
  };

  a.forEach(processFollow);
  b.forEach(processFollow);

  return Array.from(map.values());
}

/**
 * Fetch the complete database from server
 */
export async function fetchServerDb(): Promise<ServerDbState | null> {
  try {
    const res = await fetch('/api/db');
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    const data = await res.json();
    if (data && data.success && data.db) {
      return data.db as ServerDbState;
    }
  } catch (err) {
    // Silent catch if backend server sync endpoint is not available or returning non-JSON
  }
  return null;
}

/**
 * Sync state changes to the server database
 */
export async function pushServerDbSync(partialDb: Partial<ServerDbState>): Promise<ServerDbState | null> {
  try {
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partialDb),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    const data = await res.json();
    if (data && data.success && data.db) {
      return data.db as ServerDbState;
    }
  } catch (err) {
    // Silent catch if backend server sync endpoint is not available or returning non-JSON
  }
  return null;
}

/**
 * Permanently upload user avatar to central server storage
 */
export async function uploadAvatarToServer(
  userId: string,
  nickname: string,
  avatarDataUrl: string
): Promise<{ success: boolean; avatarUrl?: string; fileUrl?: string }> {
  try {
    const res = await fetch('/api/avatar/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nickname, avatarDataUrl }),
    });
    if (!res.ok) {
      return { success: false };
    }
    const data = await res.json();
    if (data && data.success) {
      return {
        success: true,
        avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : avatarDataUrl,
        fileUrl: data.fileUrl,
      };
    }
  } catch (err) {
    console.error('Failed to sync avatar to central server storage:', err);
  }
  return { success: false };
}

/**
 * Delete user avatar from central server storage
 */
export async function deleteAvatarFromServer(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/avatar/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to delete avatar from central server storage:', err);
    return false;
  }
}

