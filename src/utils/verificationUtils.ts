import { UserProfile } from '../types';

export interface UserBadgeInfo {
  isVerified: boolean;
  badgeType: 'BLUE' | 'GREEN' | 'ORANGE' | 'PURPLE' | 'GOLD' | string;
  badgeTitle: string;
}

/**
 * Single source of truth helper to retrieve consistent verification status and badge presentation.
 * Ensures:
 * 1. Verification status is accurate across all screens.
 * 2. Badge colors (Blue, Green, Orange, Purple, Gold) remain distinct and identical everywhere.
 * 3. No public title is ever auto-generated or invented if none was explicitly assigned by Admin.
 */
export function getUserBadgeInfo(nicknameOrId?: string, fallbackUser?: UserProfile | null): UserBadgeInfo {
  const defaultInfo: UserBadgeInfo = {
    isVerified: false,
    badgeType: 'BLUE',
    badgeTitle: '',
  };

  const clean = (nicknameOrId || fallbackUser?.nickname || '').trim().toLowerCase().replace(/^@/, '');
  if (!clean && !fallbackUser) return defaultInfo;

  let user: UserProfile | undefined = fallbackUser || undefined;

  try {
    const uStr = localStorage.getItem('fuhsi_users_db');
    if (uStr) {
      const uList: UserProfile[] = JSON.parse(uStr);
      const match = uList.find(
        (u) =>
          u.id === nicknameOrId ||
          (u.nickname || '').trim().toLowerCase().replace(/^@/, '') === clean ||
          (u.studentEmail || '').trim().toLowerCase() === clean
      );
      if (match) {
        user = match;
      }
    }
  } catch (e) {
    console.error('Error reading users db in getUserBadgeInfo:', e);
  }

  if (!user && fallbackUser) {
    user = fallbackUser;
  }

  // Also check verifications DB for approved request and explicitly assigned badge and title
  let approvedVerifReq: any = null;
  try {
    const vStr = localStorage.getItem('fuhsi_verifications_db');
    if (vStr) {
      const vList: any[] = JSON.parse(vStr);
      approvedVerifReq = vList.find(
        (req) =>
          req.status === 'APPROVED' &&
          req.requestType !== 'STUDENT_CONVERSION' &&
          req.category !== 'Student Conversion Subscription' &&
          (req.applicantNickname || '').trim().toLowerCase().replace(/^@/, '') === clean
      );
    }
  } catch (e) {
    console.error('Error reading verifications db in getUserBadgeInfo:', e);
  }

  const isVerified = Boolean(
    user?.isVerified ||
    user?.verificationStatus === 'approved' ||
    user?.isAdmin ||
    clean === 'modula' ||
    Boolean(approvedVerifReq)
  );

  if (!isVerified) {
    return {
      isVerified: false,
      badgeType: 'BLUE',
      badgeTitle: '',
    };
  }

  // Determine Badge Color: Honor exact assigned color without alteration
  let rawType = (
    approvedVerifReq?.assignedBadgeType ||
    user?.badgeType ||
    'BLUE'
  ).toUpperCase();

  if (rawType === 'VERIFIED' || rawType === 'NONE' || !rawType) {
    rawType = 'BLUE';
  }

  // Determine Badge Title: ONLY show what was explicitly assigned by the Admin.
  // Never invent, auto-assign, or inject a generic default title.
  let rawTitle = '';
  if (approvedVerifReq?.assignedBadgeTitle !== undefined && approvedVerifReq?.assignedBadgeTitle !== null) {
    rawTitle = String(approvedVerifReq.assignedBadgeTitle).trim();
  } else if (user?.badgeTitle) {
    rawTitle = String(user.badgeTitle).trim();
  }

  // Filter out any legacy automatic placeholder strings so they don't display as titles
  const isGenericPlaceholder =
    rawTitle.toLowerCase().includes('decline') ||
    rawTitle.toLowerCase().includes('pending') ||
    rawTitle.toLowerCase().includes('reject') ||
    [
      'FUHSI Student',
      'Student',
      'Verified',
      'Verified Student',
      'Member',
      'Campus Member',
      'Official Admin',
      'Executive Council',
      'Admin Official',
      'FUHSI Official',
      'Student Executive',
      'Guest',
    ].includes(rawTitle);

  if (isGenericPlaceholder) {
    rawTitle = '';
  }

  return {
    isVerified,
    badgeType: rawType,
    badgeTitle: rawTitle,
  };
}

/**
 * Single source of truth helper to determine if a user or author nickname is verified.
 */
export function checkIsUserVerified(nickname?: string, userProfile?: UserProfile | null): boolean {
  return getUserBadgeInfo(nickname, userProfile).isVerified;
}

