import { UserProfile } from '../types';
import { saveUserToFirestore } from '../lib/firestoreSync';
import { normalizeNickname } from './messagingUtils';

export const PRESENCE_ACTIVE_THRESHOLD_MS = 90 * 1000; // 90 seconds threshold for active presence

/**
 * Accurately determines if a user is currently online based on real-time presence signals & heartbeat timestamp
 */
export function isUserOnline(user: UserProfile | { lastActiveAt?: string; isOnline?: boolean; isBanned?: boolean } | null | undefined): boolean {
  if (!user) return false;
  if (user.isBanned) return false;
  
  if (user.isOnline === false) {
    return false;
  }

  if (user.lastActiveAt) {
    const lastActiveTime = new Date(user.lastActiveAt).getTime();
    if (!isNaN(lastActiveTime)) {
      const diffMs = Date.now() - lastActiveTime;
      // If within active threshold, user is online
      return diffMs < PRESENCE_ACTIVE_THRESHOLD_MS;
    }
  }

  // Fallback if isOnline is explicitly true and no invalid lastActiveAt
  return Boolean(user.isOnline);
}

/**
 * Updates the current active user's presence in local storage and Firestore
 */
export function updateActiveUserPresence(user: UserProfile | null | undefined, isOnline: boolean = true): void {
  if (!user || !user.nickname) return;
  const cleanNick = normalizeNickname(user.nickname);
  const nowIso = new Date().toISOString();

  // 1. Update active user in local storage
  try {
    const storedActiveStr = localStorage.getItem('fuhsi_active_user');
    if (storedActiveStr) {
      const activeObj = JSON.parse(storedActiveStr);
      if (normalizeNickname(activeObj.nickname) === cleanNick) {
        const updated = {
          ...activeObj,
          lastActiveAt: nowIso,
          isOnline: isOnline,
        };
        localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
      }
    }
  } catch (e) {
    console.error('Error updating active user presence in localStorage:', e);
  }

  // 2. Update user in users list database
  try {
    const usersStr = localStorage.getItem('fuhsi_users_db');
    if (usersStr) {
      const usersList: UserProfile[] = JSON.parse(usersStr);
      let changed = false;
      const updatedList = usersList.map((u) => {
        if (normalizeNickname(u.nickname) === cleanNick || u.id === user.id) {
          changed = true;
          return {
            ...u,
            lastActiveAt: nowIso,
            isOnline: isOnline,
          };
        }
        return u;
      });
      if (changed) {
        localStorage.setItem('fuhsi_users_db', JSON.stringify(updatedList));
      }
    }
  } catch (e) {
    console.error('Error updating user presence in users db:', e);
  }

  // 3. Save to Firestore for real-time synchronization across devices
  const userPayload: UserProfile = {
    ...user,
    lastActiveAt: nowIso,
    isOnline: isOnline,
  };
  saveUserToFirestore(userPayload).catch((err) => {
    console.error('Error syncing presence to Firestore:', err);
  });

  // Dispatch local window event so other components immediately react
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fuhsi_presence_updated', { detail: { nickname: user.nickname, isOnline, lastActiveAt: nowIso } }));
  }
}
