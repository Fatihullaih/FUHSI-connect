import { UserProfile } from '../types';

export interface UserBadgeInfo {
  isVerified: boolean;
  badgeType: 'BLUE' | 'GREEN' | 'ORANGE' | 'PURPLE' | 'NONE';
  badgeTitle: string;
}

/**
 * Valid supported badge colors throughout FUHSI Connect:
 * BLUE, GREEN, ORANGE, PURPLE.
 */
export const VALID_BADGE_COLORS: Array<'BLUE' | 'GREEN' | 'ORANGE' | 'PURPLE'> = [
  'BLUE',
  'GREEN',
  'ORANGE',
  'PURPLE',
];

export function normalizeBadgeColor(type?: string): 'BLUE' | 'GREEN' | 'ORANGE' | 'PURPLE' {
  const t = (type || 'BLUE').toUpperCase();
  if (t === 'GREEN') return 'GREEN';
  if (t === 'ORANGE' || t === 'GOLD' || t === 'RED') return 'ORANGE';
  if (t === 'PURPLE') return 'PURPLE';
  return 'BLUE';
}

/**
 * Single source of truth helper to retrieve consistent verification status and badge presentation.
 * Ensures:
 * 1. Verification status is accurate across all screens.
 * 2. Badge colors are strictly: BLUE, GREEN, ORANGE, PURPLE.
 * 3. Reassigned badges and titles reflect universally on both Admin Console and User End.
 * 4. No public title is invented or hardcoded if not explicitly assigned by Admin.
 */
export function getUserBadgeInfo(nicknameOrId?: string, fallbackUser?: UserProfile | null): UserBadgeInfo {
  const defaultInfo: UserBadgeInfo = {
    isVerified: false,
    badgeType: 'NONE',
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

  // Platform administrator (@modula) is always verified
  if (clean === 'modula' || user?.nickname?.toLowerCase().replace(/^@/, '') === 'modula' || user?.isAdmin) {
    const adminType = normalizeBadgeColor(user?.badgeType || fallbackUser?.badgeType || 'BLUE');
    const adminTitle = (user?.badgeTitle || fallbackUser?.badgeTitle || '').trim();
    return {
      isVerified: true,
      badgeType: adminType,
      badgeTitle: adminTitle,
    };
  }

  // Check verifications DB for approved or revoked requests
  let approvedVerifReq: any = null;
  let latestVerifReq: any = null;
  try {
    const vStr = localStorage.getItem('fuhsi_verifications_db');
    if (vStr) {
      const vList: any[] = JSON.parse(vStr);
      const userReqs = vList
        .filter(
          (req) =>
            (req.applicantNickname || '').trim().toLowerCase().replace(/^@/, '') === clean &&
            req.requestType !== 'STUDENT_CONVERSION' &&
            req.category !== 'Student Conversion Subscription'
        )
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

      latestVerifReq = userReqs[0] || null;
      approvedVerifReq = userReqs.find((req) => req.status === 'APPROVED') || null;
    }
  } catch (e) {
    console.error('Error reading verifications db in getUserBadgeInfo:', e);
  }

  const verifTime = approvedVerifReq?.timestamp ? new Date(approvedVerifReq.timestamp).getTime() : 0;
  const userTime = user?.updatedAt ? new Date(user.updatedAt).getTime() : 0;
  const latestReqTime = latestVerifReq?.timestamp ? new Date(latestVerifReq.timestamp).getTime() : 0;

  // If the most recent dossier action is REVOKED and newer or equal to user profile, revoke immediately
  if (latestVerifReq && latestVerifReq.status === 'REVOKED') {
    if (latestReqTime >= userTime || user?.badgeType === 'NONE' || !user?.isVerified) {
      return defaultInfo;
    }
  }

  // Strict check: if user is explicitly revoked or unverified in user profile
  const isExplicitlyRevokedOrDeclined =
    user?.isVerified === false ||
    user?.verificationStatus === 'rejected' ||
    user?.verificationStatus === 'unverified' ||
    user?.badgeType === 'NONE';

  if (isExplicitlyRevokedOrDeclined && (!approvedVerifReq || userTime >= verifTime)) {
    return defaultInfo;
  }

  // If there is no approved verification request AND user is not marked as approved+verified
  if (!approvedVerifReq && (!user?.isVerified || user?.verificationStatus !== 'approved' || user?.badgeType === 'NONE')) {
    return defaultInfo;
  }

  const isVerified = Boolean(
    (approvedVerifReq && user?.verificationStatus !== 'rejected' && user?.isVerified !== false) ||
    (user?.isVerified && user?.verificationStatus === 'approved' && user?.badgeType && user?.badgeType !== 'NONE')
  );

  if (!isVerified) {
    return defaultInfo;
  }

  // Determine Badge Color: Must be one of BLUE, GREEN, ORANGE, PURPLE
  let rawType: 'BLUE' | 'GREEN' | 'ORANGE' | 'PURPLE' = 'BLUE';
  const preferUser = userTime > verifTime && user?.badgeType && user.badgeType !== 'NONE';

  if (preferUser && user?.badgeType && user.badgeType !== 'NONE') {
    rawType = normalizeBadgeColor(user.badgeType);
  } else if (approvedVerifReq?.assignedBadgeType && approvedVerifReq.assignedBadgeType !== 'NONE') {
    rawType = normalizeBadgeColor(approvedVerifReq.assignedBadgeType);
  } else if (user?.badgeType && user.badgeType !== 'NONE') {
    rawType = normalizeBadgeColor(user.badgeType);
  }

  // Determine Badge Title: ONLY show what was explicitly assigned by Admin in the latest update
  let rawTitle = '';
  if (preferUser && user?.badgeTitle !== undefined && user.badgeTitle.trim()) {
    rawTitle = String(user.badgeTitle).trim();
  } else if (approvedVerifReq?.assignedBadgeTitle !== undefined && String(approvedVerifReq.assignedBadgeTitle).trim()) {
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
