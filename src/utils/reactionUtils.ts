import { UserProfile } from '../types';

/**
 * Normalizes a user identifier (nickname or ID) for clean matching.
 */
export function normalizeUserKey(identifier: string | null | undefined): string {
  if (!identifier) return '';
  return identifier.toLowerCase().replace(/^@/, '').trim();
}

/**
 * Checks if a specific logged-in user account has liked a post or comment.
 * Verifies against the item's likedBy array using both clean nickname and user ID.
 * Returns false if user is guest/unauthenticated or if user is not in likedBy.
 */
export function isItemLikedByUser(
  item: { likedBy?: string[]; isLikedByMe?: boolean } | null | undefined,
  user: UserProfile | null | undefined
): boolean {
  if (!item || !user) return false;
  
  const normUserNick = normalizeUserKey(user.nickname);
  const userId = normalizeUserKey(user.id);

  if (!normUserNick && !userId) return false;

  if (Array.isArray(item.likedBy)) {
    return item.likedBy.some((k) => {
      if (!k) return false;
      const norm = normalizeUserKey(k);
      return (normUserNick && norm === normUserNick) || (userId && norm === userId);
    });
  }

  return false;
}

/**
 * Calculates the total reaction count on a post or comment.
 * If likedBy array exists, its count is authoritative.
 * Otherwise falls back to likesCount or likes property.
 */
export function getEffectiveLikesCount(
  item: { likedBy?: string[]; likesCount?: number; likes?: number; upvotes?: number } | null | undefined
): number {
  if (!item) return 0;
  if (Array.isArray(item.likedBy)) {
    return item.likedBy.length;
  }
  return item.likesCount ?? item.likes ?? item.upvotes ?? 0;
}

/**
 * Pure function to toggle a user's like in a likedBy array.
 * Returns the new array of user keys and whether the user is now liked.
 */
export function toggleUserLike(
  currentLikedBy: string[] | undefined,
  user: UserProfile
): { nextLikedBy: string[]; isLiked: boolean } {
  const normUserNick = normalizeUserKey(user.nickname);
  const userId = normalizeUserKey(user.id);
  const userKey = normUserNick || userId;

  if (!userKey) {
    return { nextLikedBy: currentLikedBy || [], isLiked: false };
  }

  const list = Array.isArray(currentLikedBy) ? [...currentLikedBy] : [];
  const existingIndex = list.findIndex((k) => {
    if (!k) return false;
    const norm = normalizeUserKey(k);
    return (normUserNick && norm === normUserNick) || (userId && norm === userId);
  });

  if (existingIndex >= 0) {
    // User already liked -> remove them (unlike)
    list.splice(existingIndex, 1);
    return { nextLikedBy: list, isLiked: false };
  } else {
    // User has not liked -> add them (like)
    list.push(userKey);
    return { nextLikedBy: list, isLiked: true };
  }
}
