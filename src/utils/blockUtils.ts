/**
 * FUHSI Connect - User Blocking Utility
 * Allows users to block problematic users/sellers to hide their listings and posts.
 */

const BLOCKS_STORAGE_PREFIX = 'fuhsi_blocked_users_';

export function getBlockedUsers(currentNickname?: string): string[] {
  if (!currentNickname) return [];
  const cleanNick = currentNickname.toLowerCase().replace(/^@/, '');
  try {
    const stored = localStorage.getItem(`${BLOCKS_STORAGE_PREFIX}${cleanNick}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.map((n: string) => n.toLowerCase().replace(/^@/, ''));
    }
  } catch (e) {
    console.error('Error loading blocked users:', e);
  }
  return [];
}

export function blockUser(currentNickname: string, targetNickname: string): void {
  if (!currentNickname || !targetNickname) return;
  const cleanCurrent = currentNickname.toLowerCase().replace(/^@/, '');
  const cleanTarget = targetNickname.toLowerCase().replace(/^@/, '');
  if (cleanCurrent === cleanTarget) return;

  const currentBlocks = getBlockedUsers(currentNickname);
  if (!currentBlocks.includes(cleanTarget)) {
    const updated = [...currentBlocks, cleanTarget];
    try {
      localStorage.setItem(`${BLOCKS_STORAGE_PREFIX}${cleanCurrent}`, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('fuhsi_blocks_updated', { detail: { blockedNickname: cleanTarget } }));
    } catch (e) {
      console.error('Error saving blocked user:', e);
    }
  }
}

export function unblockUser(currentNickname: string, targetNickname: string): void {
  if (!currentNickname || !targetNickname) return;
  const cleanCurrent = currentNickname.toLowerCase().replace(/^@/, '');
  const cleanTarget = targetNickname.toLowerCase().replace(/^@/, '');

  const currentBlocks = getBlockedUsers(currentNickname);
  const updated = currentBlocks.filter((n) => n !== cleanTarget);
  try {
    localStorage.setItem(`${BLOCKS_STORAGE_PREFIX}${cleanCurrent}`, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fuhsi_blocks_updated', { detail: { unblockedNickname: cleanTarget } }));
  } catch (e) {
    console.error('Error unblocking user:', e);
  }
}

export function isUserBlocked(currentNickname?: string, targetNickname?: string): boolean {
  if (!currentNickname || !targetNickname) return false;
  const cleanTarget = targetNickname.toLowerCase().replace(/^@/, '');
  const list = getBlockedUsers(currentNickname);
  return list.includes(cleanTarget);
}
