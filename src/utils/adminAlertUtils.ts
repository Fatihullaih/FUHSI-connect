import { useState, useEffect } from 'react';
import { UserProfile, VerificationRequest, MarketplaceItem, Post, Report, ChatReport } from '../types';
import { getStoredUsers } from './userDbUtils';
import { getStoredMarketplaceReports } from './marketplaceUtils';
import { getStoredChatReports } from './messagingUtils';

export interface AdminTasksBreakdown {
  studentAccounts: number;
  verificationRequests: number;
  marketplaceManagement: number;
  flaggedCommunityPosts: number;
  chatModeration: number;
  totalPending: number;
  hasPendingTasks: boolean;
}

/**
 * Pure calculation function to get exact counts from actual records without ghost notifications
 */
export function calculateAdminPendingCounts(
  usersList?: UserProfile[],
  verificationRequestsList?: VerificationRequest[],
  pendingMarketplaceList?: MarketplaceItem[],
  flaggedPostsList?: Post[],
  reportsList?: Report[],
  chatReportsList?: ChatReport[]
): AdminTasksBreakdown {
  // 1. Pending Student Accounts: Unapproved, non-admin, non-modula accounts
  const users = usersList && usersList.length > 0 ? usersList : getStoredUsers();
  const pendingStudents = users.filter((u) => {
    if (u.isAdmin || u.nickname === '@modula') return false;
    return !u.isApproved;
  }).length;

  // 2. Pending Verification Requests: Get Verified subscriptions awaiting admin approval
  let pendingVerifs = 0;
  if (verificationRequestsList) {
    pendingVerifs = verificationRequestsList.filter((r) => r.status === 'PENDING').length;
  } else {
    try {
      const stored = localStorage.getItem('fuhsi_verifications_db');
      if (stored) {
        const parsed: VerificationRequest[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          pendingVerifs = parsed.filter((r) => r.status === 'PENDING').length;
        }
      }
    } catch {
      pendingVerifs = 0;
    }
  }

  // 3. Pending Marketplace Management: Items awaiting review + pending marketplace dispute/trade reports
  let pendingMarketplaceItemsCount = 0;
  if (pendingMarketplaceList) {
    pendingMarketplaceItemsCount = pendingMarketplaceList.filter(
      (m) => (m.status as string)?.toUpperCase() === 'PENDING'
    ).length;
  } else {
    try {
      const stored = localStorage.getItem('fuhsi_pending_marketplace_items');
      if (stored) {
        const parsed: any[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          pendingMarketplaceItemsCount = parsed.filter((m) => (m.status as string)?.toUpperCase() === 'PENDING').length;
        }
      }
    } catch {
      pendingMarketplaceItemsCount = 0;
    }
  }
  const pendingMarketplaceReportsCount = getStoredMarketplaceReports().filter((r) => r.status === 'PENDING').length;
  const pendingMarketplace = pendingMarketplaceItemsCount + pendingMarketplaceReportsCount;

  // 4. Flagged Community Posts & Content Moderation Reports
  // CRITICAL: Strictly count ONLY posts that actually exist and are currently under review or have pending reports
  let pendingFlagged = 0;
  try {
    const postsPool: Post[] = flaggedPostsList || (() => {
      try {
        const storedPostsRaw = localStorage.getItem('fuhsi_posts_db');
        return storedPostsRaw ? JSON.parse(storedPostsRaw) : [];
      } catch {
        return [];
      }
    })();

    const reportsPool: Report[] = reportsList || (() => {
      try {
        const storedReportsRaw = localStorage.getItem('fuhsi_reports_db');
        return storedReportsRaw ? JSON.parse(storedReportsRaw) : [];
      } catch {
        return [];
      }
    })();

    const pendingReportPostIds = new Set(
      reportsPool.filter((r) => r && r.status === 'PENDING').map((r) => r.postId)
    );

    // Strictly filter: post must exist and have genuine flagged status or a pending report
    const actuallyFlagged = postsPool.filter((p) => {
      if (!p || !p.id) return false;
      const isQuarantined = Boolean(p.isQuarantined);
      const isUnderReview = p.status === 'UnderReview';
      const isFlagged = Boolean(p.isFlagged);
      const hasPendingReport = pendingReportPostIds.has(p.id);
      return isQuarantined || isUnderReview || isFlagged || hasPendingReport;
    });

    pendingFlagged = actuallyFlagged.length;
  } catch {
    pendingFlagged = 0;
  }

  // 5. Chat Moderation Cases
  const chatReports = chatReportsList || getStoredChatReports();
  const pendingChatReports = chatReports.filter((c) => c.status === 'PENDING').length;

  // Total
  const totalPending =
    pendingStudents +
    pendingVerifs +
    pendingMarketplace +
    pendingFlagged +
    pendingChatReports;

  return {
    studentAccounts: pendingStudents,
    verificationRequests: pendingVerifs,
    marketplaceManagement: pendingMarketplace,
    flaggedCommunityPosts: pendingFlagged,
    chatModeration: pendingChatReports,
    totalPending,
    hasPendingTasks: totalPending > 0,
  };
}

/**
 * React Hook for Realtime Admin Pending Activity & Attention State
 */
export function useAdminPendingCounts(
  initialUsers?: UserProfile[],
  initialVerifs?: VerificationRequest[],
  initialPendingMarketplace?: MarketplaceItem[],
  initialFlaggedPosts?: Post[],
  initialReports?: Report[]
): AdminTasksBreakdown {
  const [counts, setCounts] = useState<AdminTasksBreakdown>(() =>
    calculateAdminPendingCounts(
      initialUsers,
      initialVerifs,
      initialPendingMarketplace,
      initialFlaggedPosts,
      initialReports
    )
  );

  useEffect(() => {
    const refresh = () => {
      setCounts(
        calculateAdminPendingCounts(
          initialUsers,
          initialVerifs,
          initialPendingMarketplace,
          initialFlaggedPosts,
          initialReports
        )
      );
    };

    refresh();

    // Fast sync interval
    const interval = setInterval(refresh, 1500);

    // Event listeners for immediate real-time response
    const eventNames = [
      'fuhsi_registered_users_updated',
      'fuhsi_user_profile_updated',
      'fuhsi_verifications_updated',
      'fuhsi_marketplace_updated',
      'fuhsi_marketplace_report_submitted',
      'fuhsi_marketplace_report_updated',
      'fuhsi_chat_report_submitted',
      'fuhsi_chat_report_updated',
      'fuhsi_post_flagged',
      'fuhsi_reports_updated',
    ];

    eventNames.forEach((evt) => window.addEventListener(evt, refresh));

    return () => {
      clearInterval(interval);
      eventNames.forEach((evt) => window.removeEventListener(evt, refresh));
    };
  }, [
    initialUsers,
    initialVerifs,
    initialPendingMarketplace,
    initialFlaggedPosts,
    initialReports,
  ]);

  return counts;
}
