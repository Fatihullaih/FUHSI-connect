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
    badgeType: 'NONE',
    badgeTitle: '',
  };

  const clean = (nicknameOrId || fallbackUser?.nickname || '').trim().toLowerCase().replace(/^@/, '');
  if (!clean && !fallbackUser) return defaultInfo;

  // Platform administrator (@modula) is always verified
  if (clean === 'modula' || fallbackUser?.nickname?.toLowerCase().replace(/^@/, '') === 'modula' || fallbackUser?.isAdmin) {
    const adminType = (fallbackUser?.badgeType || user?.badgeType || 'BLUE').toUpperCase();
    const adminTitle = (fallbackUser?.badgeTitle || user?.badgeTitle || '').trim();
    return {
      isVerified: true,
      badgeType: ['BLUE', 'GREEN', 'GOLD', 'ORANGE', 'PURPLE'].includes(adminType) ? adminType : 'BLUE',
      badgeTitle: adminTitle,
    };
  }

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
      const userReqs = vList.filter(
        (req) => (req.applicantNickname || '').trim().toLowerCase().replace(/^@/, '') === clean
      );
      // Pick the most recent approved verification dossier
      approvedVerifReq = [...userReqs].reverse().find(
        (req) =>
          req.status === 'APPROVED' &&
          req.requestType !== 'STUDENT_CONVERSION' &&
          req.category !== 'Student Conversion Subscription'
      );
    }
  } catch (e) {
    console.error('Error reading verifications db in getUserBadgeInfo:', e);
  }

  // Strict check: if user is explicitly revoked or unverified, or badgeType is NONE, revoke badge immediately!
  const isExplicitlyRevokedOrDeclined =
    user?.isVerified === false ||
    user?.verificationStatus === 'rejected' ||
    user?.verificationStatus === 'unverified' ||
    user?.badgeType === 'NONE';

  if (isExplicitlyRevokedOrDeclined && !approvedVerifReq) {
    return {
      isVerified: false,
      badgeType: 'NONE',
      badgeTitle: '',
    };
  }

  // If there is no approved verification request AND user is not marked as approved+verified
  if (!approvedVerifReq && (!user?.isVerified || user?.verificationStatus !== 'approved')) {
    return {
      isVerified: false,
      badgeType: 'NONE',
      badgeTitle: '',
    };
  }

  const isVerified = Boolean(
    (approvedVerifReq && user?.verificationStatus !== 'rejected' && user?.isVerified !== false) ||
    (user?.isVerified && user?.verificationStatus === 'approved' && user?.badgeType !== 'NONE')
  );

  if (!isVerified) {
    return {
      isVerified: false,
      badgeType: 'NONE',
      badgeTitle: '',
    };
  }

  // Determine Badge Color: Honor exact assigned color from latest approved dossier or user record
  let rawType = 'BLUE';
  if (approvedVerifReq?.assignedBadgeType && ['BLUE', 'GREEN', 'GOLD', 'ORANGE', 'PURPLE'].includes(approvedVerifReq.assignedBadgeType.toUpperCase())) {
    rawType = approvedVerifReq.assignedBadgeType.toUpperCase();
  } else if (user?.badgeType && ['BLUE', 'GREEN', 'GOLD', 'ORANGE', 'PURPLE'].includes(user.badgeType.toUpperCase())) {
    rawType = user.badgeType.toUpperCase();
  } else if (user?.badgeType && user.badgeType !== 'NONE') {
    rawType = user.badgeType.toUpperCase();
  }

  // Determine Badge Title: ONLY show what was explicitly assigned by Admin
  let rawTitle = '';
  if (approvedVerifReq?.assignedBadgeTitle && String(approvedVerifReq.assignedBadgeTitle).trim()) {
    rawTitle = String(approvedVerifReq.assignedBadgeTitle).trim();
  } else if (user?.badgeTitle && user.badgeTitle.trim()) {
    rawTitle = String(user.badgeTitle).trim();
  }

  // Filter out internal non-title negative status keywords
  const isInternalStatus =
    rawTitle.toLowerCase().includes('decline') ||
    rawTitle.toLowerCase().includes('pending') ||
    rawTitle.toLowerCase().includes('reject');

  if (isInternalStatus) {
    rawTitle = '';
  }

  return {
    isVerified: true,
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

