import { UserProfile, Post, Comment, MarketplaceItem, VerificationRequest, Report, DirectMessage, ChatConversation, ChatReport, FollowRecord } from '../types';
import { normalizeMatricNumber } from './matricValidation';
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
      return deleted.some((d) => {
        const dId = d.id ? String(d.id).trim() : '';
        const dNick = d.nickname ? String(d.nickname).trim().toLowerCase().replace(/^@/, '') : '';
        const dEmail = d.studentEmail ? String(d.studentEmail).trim().toLowerCase() : '';
        return (uId && dId && uId === dId) || (uNick && dNick && uNick === dNick) || (uEmail && dEmail && uEmail === dEmail);
      });
    } catch {
      return false;
    }
  };

  const processUser = (u: UserProfile) => {
    if (!u || isDemoUser(u) || isDemoNickname(u.nickname) || isDeletedLocally(u)) return;

    const uId = u.id ? String(u.id).trim() : '';
    const uNick = u.nickname ? String(u.nickname).trim().toLowerCase().replace(/^@/, '') : '';
    const uEmail = u.studentEmail && !u.studentEmail.includes('admin@fuhsi.edu.ng') ? String(u.studentEmail).trim().toLowerCase() : '';
    const uMatric = u.matricNumber ? String(u.matricNumber).trim().toUpperCase() : '';

    const existingIndex = mergedList.findIndex((ex) => {
      const exId = ex.id ? String(ex.id).trim() : '';
      const exNick = ex.nickname ? String(ex.nickname).trim().toLowerCase().replace(/^@/, '') : '';
      const exEmail = ex.studentEmail && !ex.studentEmail.includes('admin@fuhsi.edu.ng') ? String(ex.studentEmail).trim().toLowerCase() : '';
      const exMatric = ex.matricNumber ? String(ex.matricNumber).trim().toUpperCase() : '';

      if (uId && exId && uId === exId) return true;
      if (uNick && exNick && uNick === exNick) return true;
      if (uEmail && exEmail && uEmail === exEmail) return true;
      if (uMatric && exMatric && (uMatric === exMatric || normalizeMatricNumber(uMatric) === normalizeMatricNumber(exMatric))) return true;
      return false;
    });

    if (existingIndex === -1) {
      mergedList.push({ ...u, badgeTitle: u.badgeTitle ? u.badgeTitle.trim() : '' });
    } else {
      const existing = mergedList[existingIndex];
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const incomingTime = u.updatedAt ? new Date(u.updatedAt).getTime() : 0;
      const useIncoming = incomingTime >= existingTime;

      const primary = useIncoming ? u : existing;
      const secondary = useIncoming ? existing : u;

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

      const merged: UserProfile = {
        ...secondary,
        ...primary,
        id: primary.id || secondary.id,
        nickname: primary.nickname || secondary.nickname,
        realName: primary.realName || secondary.realName,
        realNameHidden: primary.realNameHidden || secondary.realNameHidden || primary.realName || secondary.realName,
        studentEmail: primary.studentEmail || secondary.studentEmail,
        emergencyHomePhone: primary.emergencyHomePhone || secondary.emergencyHomePhone,
        department: primary.department || secondary.department,
        matricNumber: primary.matricNumber || secondary.matricNumber,
        level: primary.level || secondary.level,
        bio: primary.bio !== undefined ? primary.bio : (secondary.bio || ''),
        avatarKey: primary.avatarKey || secondary.avatarKey || 'caduceus',
        avatarUrl: primary.avatarUrl !== undefined ? primary.avatarUrl : secondary.avatarUrl,
        isApproved,
        isDeclined,
        isVerified: Boolean(primary.isVerified !== undefined ? primary.isVerified : secondary.isVerified),
        verificationStatus: primary.verificationStatus || secondary.verificationStatus,
        isAdmin: Boolean(primary.isAdmin || secondary.isAdmin),
        reputationScore: Math.max(primary.reputationScore || 0, secondary.reputationScore || 0),
        badgeType: primary.badgeType && primary.badgeType !== 'NONE' ? primary.badgeType : secondary.badgeType || 'BLUE',
        badgeTitle,
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

export function mergePosts(a: Post[] = [], b: Post[] = []): Post[] {
  const map = new Map<string, Post>();

  const processPost = (p: Post) => {
    if (!p || !p.id || isDemoPost(p)) return;
    const existing = map.get(p.id);
    if (!existing) {
      const likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
      const likesCount = likedBy.length > 0 ? likedBy.length : (p.likesCount ?? p.likes ?? 0);
      map.set(p.id, {
        ...p,
        likedBy,
        likesCount,
        likes: likesCount,
      });
    } else {
      // Determine which version has newer edits / content / reaction updates
      const existingUpdatedMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const pUpdatedMs = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
      const isPNewer = pUpdatedMs >= existingUpdatedMs;

      const primary = isPNewer ? p : existing;
      const secondary = isPNewer ? existing : p;

      // Handle likedBy list
      let mergedLikedBy: string[] = [];
      if (Array.isArray(primary.likedBy) && (primary.likedBy.length > 0 || isPNewer)) {
        mergedLikedBy = primary.likedBy;
      } else if (Array.isArray(secondary.likedBy)) {
        mergedLikedBy = secondary.likedBy;
      }

      const likesCount = mergedLikedBy.length > 0
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

      const bookmarks = Math.max(existing.bookmarks || 0, p.bookmarks || 0);
      const commentsCount = Math.max(existing.commentsCount || 0, p.commentsCount || 0);

      map.set(p.id, {
        ...secondary,
        ...primary,
        likedBy: mergedLikedBy,
        likes: likesCount,
        likesCount,
        repostedBy: mergedRepostedBy,
        repostsCount,
        shareCount: repostsCount,
        bookmarks,
        commentsCount,
      });
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
    if (!c || !c.id || isDemoComment(c)) return;
    const existing = map.get(c.id);
    if (!existing) {
      const likedBy = Array.isArray(c.likedBy) ? c.likedBy : [];
      const likesCount = likedBy.length > 0 ? likedBy.length : (c.likesCount ?? c.likes ?? 0);
      map.set(c.id, { ...c, likedBy, likes: likesCount, likesCount });
    } else {
      let mergedLikedBy: string[] = [];
      if (Array.isArray(c.likedBy)) {
        mergedLikedBy = c.likedBy;
      } else if (Array.isArray(existing.likedBy)) {
        mergedLikedBy = existing.likedBy;
      }
      const likesCount = mergedLikedBy.length > 0
        ? mergedLikedBy.length
        : (c.likesCount !== undefined ? c.likesCount : (existing.likesCount ?? 0));

      map.set(c.id, { ...existing, ...c, likedBy: mergedLikedBy, likes: likesCount, likesCount });
    }
  };
  a.forEach(processComment);
  b.forEach(processComment);
  return Array.from(map.values()).filter((c) => !isDemoComment(c));
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
      const status = r.status !== 'PENDING' ? r.status : (existing.status || r.status);
      const assignedBadgeType = r.assignedBadgeType || existing.assignedBadgeType;
      const assignedBadgeTitle = r.assignedBadgeTitle || existing.assignedBadgeTitle;
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

export function mergeDirectMessages(a: DirectMessage[] = [], b: DirectMessage[] = []): DirectMessage[] {
  const map = new Map<string, DirectMessage>();
  a.forEach((m) => m?.id && map.set(m.id, { ...m }));
  b.forEach((m) => {
    if (m?.id) {
      const existing = map.get(m.id);
      if (existing) {
        map.set(m.id, {
          ...existing,
          ...m,
          isRead: Boolean(existing.isRead || m.isRead),
          readAt: m.readAt || existing.readAt,
        });
      } else {
        map.set(m.id, { ...m });
      }
    }
  });
  return Array.from(map.values()).sort((x, y) => {
    const tX = isNaN(new Date(x.timestamp).getTime()) ? 0 : new Date(x.timestamp).getTime();
    const tY = isNaN(new Date(y.timestamp).getTime()) ? 0 : new Date(y.timestamp).getTime();
    return tX - tY;
  });
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

