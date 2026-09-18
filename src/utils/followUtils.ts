import { FollowRecord, CampusNotification } from '../types';
import { isDemoNickname } from './postGenerator';

const FOLLOWS_STORAGE_KEY = 'fuhsi_user_follows_v1';

export function normalizeHandle(handle?: string | null): string {
  if (!handle) return '';
  return handle.trim().toLowerCase().replace(/^@/, '');
}

export function formatHandle(handle?: string | null): string {
  if (!handle) return '';
  const clean = normalizeHandle(handle);
  return clean ? `@${clean}` : '';
}

export function generateFollowDocId(followerHandle: string, followingHandle: string): string {
  const cleanFollower = normalizeHandle(followerHandle);
  const cleanFollowing = normalizeHandle(followingHandle);
  return `${cleanFollower}__follows__${cleanFollowing}`;
}

/**
 * Retrieve local cached follows
 */
export function getStoredFollows(): FollowRecord[] {
  try {
    const raw = localStorage.getItem(FOLLOWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (f) =>
          f &&
          f.followerNickname &&
          f.followingNickname &&
          !isDemoNickname(f.followerNickname) &&
          !isDemoNickname(f.followingNickname)
      );
    }
    return [];
  } catch (e) {
    console.error('Error reading stored follows:', e);
    return [];
  }
}

/**
 * Persist follows to local storage
 */
export function saveStoredFollows(follows: FollowRecord[]): void {
  try {
    const cleaned = (follows || []).filter(
      (f) =>
        f &&
        f.followerNickname &&
        f.followingNickname &&
        !isDemoNickname(f.followerNickname) &&
        !isDemoNickname(f.followingNickname)
    );
    localStorage.setItem(FOLLOWS_STORAGE_KEY, JSON.stringify(cleaned));
  } catch (e) {
    console.error('Error saving stored follows:', e);
  }
}

/**
 * Check if follower is actively following target
 */
export function isUserFollowing(
  followerHandle?: string | null,
  targetHandle?: string | null,
  allFollows: FollowRecord[] = []
): boolean {
  const cleanFollower = normalizeHandle(followerHandle);
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanFollower || !cleanTarget || cleanFollower === cleanTarget) return false;

  return allFollows.some(
    (f) =>
      normalizeHandle(f.followerNickname) === cleanFollower &&
      normalizeHandle(f.followingNickname) === cleanTarget
  );
}

/**
 * Count total accounts actively following this user
 */
export function getFollowersCount(
  targetHandle?: string | null,
  allFollows: FollowRecord[] = []
): number {
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanTarget) return 0;

  return allFollows.filter((f) => normalizeHandle(f.followingNickname) === cleanTarget).length;
}

/**
 * Count total accounts this user actively follows
 */
export function getFollowingCount(
  targetHandle?: string | null,
  allFollows: FollowRecord[] = []
): number {
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanTarget) return 0;

  return allFollows.filter((f) => normalizeHandle(f.followerNickname) === cleanTarget).length;
}

/**
 * Safely parses any ISO timestamp or numeric epoch into milliseconds, guaranteeing no NaN in sort comparators
 */
export function parseTimestampSafe(ts?: string | number | null): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return isNaN(ts) ? 0 : ts;
  const parsed = new Date(ts).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Get all follower records for a target user (sorted strictly by latest followers first)
 */
export function getFollowersList(
  targetHandle?: string | null,
  allFollows: FollowRecord[] = []
): FollowRecord[] {
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanTarget) return [];

  const rawList = allFollows.filter((f) => normalizeHandle(f.followingNickname) === cleanTarget);

  // Sort strictly descending by latest first (newest timestamp first)
  const sorted = [...rawList].sort((a, b) => {
    const timeA = parseTimestampSafe(a.createdAt);
    const timeB = parseTimestampSafe(b.createdAt);
    if (timeB !== timeA) return timeB - timeA;
    return rawList.indexOf(b) - rawList.indexOf(a);
  });

  // Deduplicate by follower nickname, preserving the newest entry
  const seen = new Set<string>();
  const deduplicated: FollowRecord[] = [];
  for (const record of sorted) {
    const h = normalizeHandle(record.followerNickname);
    if (!seen.has(h)) {
      seen.add(h);
      deduplicated.push(record);
    }
  }

  return deduplicated;
}

/**
 * Get all users followed by a user (sorted strictly by latest followed first)
 */
export function getFollowingList(
  targetHandle?: string | null,
  allFollows: FollowRecord[] = []
): FollowRecord[] {
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanTarget) return [];

  const rawList = allFollows.filter((f) => normalizeHandle(f.followerNickname) === cleanTarget);

  // Sort strictly descending by latest first (newest timestamp first)
  const sorted = [...rawList].sort((a, b) => {
    const timeA = parseTimestampSafe(a.createdAt);
    const timeB = parseTimestampSafe(b.createdAt);
    if (timeB !== timeA) return timeB - timeA;
    return rawList.indexOf(b) - rawList.indexOf(a);
  });

  // Deduplicate by following nickname, preserving the newest entry
  const seen = new Set<string>();
  const deduplicated: FollowRecord[] = [];
  for (const record of sorted) {
    const h = normalizeHandle(record.followingNickname);
    if (!seen.has(h)) {
      seen.add(h);
      deduplicated.push(record);
    }
  }

  return deduplicated;
}

/**
 * Toggle follow state: returns updated follow list and boolean indicating if now following
 */
export function toggleFollowState(
  followerHandle: string,
  targetHandle: string,
  currentFollows: FollowRecord[] = []
): {
  updatedFollows: FollowRecord[];
  isNowFollowing: boolean;
  docId: string;
} {
  const cleanFollower = normalizeHandle(followerHandle);
  const cleanTarget = normalizeHandle(targetHandle);
  const docId = generateFollowDocId(cleanFollower, cleanTarget);

  if (!cleanFollower || !cleanTarget || cleanFollower === cleanTarget) {
    return { updatedFollows: currentFollows, isNowFollowing: false, docId };
  }

  const existingIndex = currentFollows.findIndex(
    (f) =>
      normalizeHandle(f.followerNickname) === cleanFollower &&
      normalizeHandle(f.followingNickname) === cleanTarget
  );

  if (existingIndex >= 0) {
    // Unfollow
    const updatedFollows = currentFollows.filter((_, idx) => idx !== existingIndex);
    return { updatedFollows, isNowFollowing: false, docId };
  } else {
    // Follow
    const newRecord: FollowRecord = {
      id: docId,
      followerNickname: formatHandle(cleanFollower),
      followingNickname: formatHandle(cleanTarget),
      createdAt: new Date().toISOString(),
    };
    const updatedFollows = [...currentFollows, newRecord];
    return { updatedFollows, isNowFollowing: true, docId };
  }
}

/**
 * Generates natural follower notification copy based on unread follower count:
 * - 0 followers: "Someone follows you"
 * - 1 follower: "@username follows you"
 * - 2 followers: "@username and @anotheruser follow you"
 * - 3 followers: "@username and 2 others follow you"
 * - 4 followers: "@username and 3 others follow you" (e.g. "@john and 3 others follow you")
 * - 5 followers: "@username and 4 others follow you"
 * - 6 followers: "@username and 5 others follow you"
 */
export function formatFollowNotificationText(followers: string[]): { title: string; message: string } {
  const count = followers.length;
  if (count <= 0) {
    return { title: 'New Follower', message: 'Someone follows you' };
  }
  if (count === 1) {
    return {
      title: 'New Follower',
      message: `${followers[0]} follows you`,
    };
  }
  if (count === 2) {
    return {
      title: 'New Followers',
      message: `${followers[0]} and ${followers[1]} follow you`,
    };
  }
  // 3 or more unread followers: "@user and (count - 1) others follow you"
  return {
    title: 'New Followers',
    message: `${followers[0]} and ${count - 1} others follow you`,
  };
}

/**
 * Record a follower notification for target user, aggregating if an unread one already exists
 */
export function recordFollowNotification(
  followerHandle: string,
  targetHandle: string
): CampusNotification | null {
  const cleanFollower = normalizeHandle(followerHandle);
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanFollower || !cleanTarget || cleanFollower === cleanTarget) {
    return null;
  }

  const formattedFollower = formatHandle(cleanFollower);
  const targetKey = `fuhsi_user_notifications_${cleanTarget}`;

  let userNotifs: CampusNotification[] = [];
  try {
    const stored = localStorage.getItem(targetKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        userNotifs = parsed;
      }
    }
  } catch (e) {
    userNotifs = [];
  }

  // Check read map for target user
  let readMap: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(`fuhsi_notifications_read_${cleanTarget}`);
    if (raw) readMap = JSON.parse(raw);
  } catch (e) {}

  // Look for existing unread FOLLOW notification
  const unreadIndex = userNotifs.findIndex((n) => {
    if (n.type !== 'FOLLOW') return false;
    if (n.isRead) return false;
    if (readMap[n.id]) return false;
    return true;
  });

  let notifToPersist: CampusNotification;

  if (unreadIndex >= 0) {
    const existing = userNotifs[unreadIndex];
    const existingFollowers: string[] = Array.isArray(existing.followerNicknames) && existing.followerNicknames.length > 0
      ? existing.followerNicknames
      : (existing.senderNickname ? [existing.senderNickname] : []);

    // Filter out cleanFollower if already in list, then prepend newest follower to the front
    const updatedFollowers = [
      formattedFollower,
      ...existingFollowers.filter((f) => normalizeHandle(f) !== cleanFollower)
    ];

    const { title, message } = formatFollowNotificationText(updatedFollowers);

    notifToPersist = {
      ...existing,
      title,
      message,
      timestamp: new Date().toISOString(),
      isRead: false,
      senderNickname: formattedFollower,
      followerNicknames: updatedFollowers,
      actionType: 'VIEW_FOLLOWERS',
    };

    // Remove existing from list and put updated at index 0 (top of notifications)
    const filtered = userNotifs.filter((_, idx) => idx !== unreadIndex);
    userNotifs = [notifToPersist, ...filtered];
  } else {
    // Brand new unread notification
    const { title, message } = formatFollowNotificationText([formattedFollower]);

    notifToPersist = {
      id: `follow_notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'FOLLOW',
      title,
      message,
      timestamp: new Date().toISOString(),
      isRead: false,
      senderNickname: formattedFollower,
      followerNicknames: [formattedFollower],
      actionType: 'VIEW_FOLLOWERS',
    };

    userNotifs = [notifToPersist, ...userNotifs];
  }

  try {
    localStorage.setItem(targetKey, JSON.stringify(userNotifs));
  } catch (e) {
    console.error('Error saving follower notification:', e);
  }

  // Dispatch custom event to notify listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fuhsi_notification_received', {
        detail: { targetNickname: cleanTarget, notif: notifToPersist },
      })
    );
  }

  return notifToPersist;
}
