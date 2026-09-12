import { FollowRecord } from '../types';
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
 * Get all follower records for a target user
 */
export function getFollowersList(
  targetHandle?: string | null,
  allFollows: FollowRecord[] = []
): FollowRecord[] {
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanTarget) return [];

  return allFollows.filter((f) => normalizeHandle(f.followingNickname) === cleanTarget);
}

/**
 * Get all users followed by a user
 */
export function getFollowingList(
  targetHandle?: string | null,
  allFollows: FollowRecord[] = []
): FollowRecord[] {
  const cleanTarget = normalizeHandle(targetHandle);
  if (!cleanTarget) return [];

  return allFollows.filter((f) => normalizeHandle(f.followerNickname) === cleanTarget);
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
