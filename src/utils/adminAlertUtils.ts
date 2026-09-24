import { useState, useEffect } from 'react';
import { UserProfile, VerificationRequest, MarketplaceItem, Post, Report, ChatReport, HelpDeskInquiry } from '../types';
import { getStoredUsers, isGuestAccount } from './userDbUtils';
import { getStoredMarketplaceReports } from './marketplaceUtils';
import { getStoredChatReports } from './messagingUtils';
import { getStoredHelpDeskInquiries } from './helpDeskUtils';

export interface AdminTasksBreakdown {
  studentAccounts: number;
  verificationRequests: number;
  marketplaceManagement: number;
  flaggedCommunityPosts: number;
  chatModeration: number;
  helpDesk: number;
  totalPending: number;
  hasPendingTasks: boolean;
}

/**
 * Pure calculation function to get exact counts from actual records
 */
export function calculateAdminPendingCounts(
  usersList?: UserProfile[],
  verificationRequestsList?: VerificationRequest[],
  pendingMarketplaceList?: MarketplaceItem[],
  flaggedPostsList?: Post[],
  reportsList?: Report[],
  chatReportsList?: ChatReport[],
  helpDeskList?: HelpDeskInquiry[]
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
  let pendingFlagged = 0;
  if (flaggedPostsList) {
    pendingFlagged += flaggedPostsList.filter((p) => p.status === 'UnderReview').length;
  }
  if (reportsList) {
    pendingFlagged += reportsList.filter((r) => r.status === 'PENDING').length;
  } else {
    try {
      const stored = localStorage.getItem('fuhsi_reports_db');
      if (stored) {
        const parsed: Report[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          pendingFlagged += parsed.filter((r) => r.status === 'PENDING').length;
        }
      }
    } catch {}
  }

  // 5. Chat Moderation Cases
  const chatReports = chatReportsList || getStoredChatReports();
  const pendingChatReports = chatReports.filter((c) => c.status === 'PENDING').length;

  // 6. Help Desk Inquiries & Registration Appeals
  const helpDeskInquiries = helpDeskList || getStoredHelpDeskInquiries();
  const pendingHelpDesk = helpDeskInquiries.filter((h) => h.status === 'PENDING').length;

  // Total
  const totalPending =
    pendingStudents +
    pendingVerifs +
    pendingMarketplace +
    pendingFlagged +
    pendingChatReports +
    pendingHelpDesk;

  return {
    studentAccounts: pendingStudents,
    verificationRequests: pendingVerifs,
    marketplaceManagement: pendingMarketplace,
    flaggedCommunityPosts: pendingFlagged,
    chatModeration: pendingChatReports,
    helpDesk: pendingHelpDesk,
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
      'fuhsi_helpdesk_inquiry_submitted',
      'fuhsi_helpdesk_inquiry_updated',
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
