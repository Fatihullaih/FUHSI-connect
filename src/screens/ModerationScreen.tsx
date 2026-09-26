import React, { useState, useEffect, useMemo } from 'react';
import { Post, Report, VerificationRequest, MarketplaceItem, UserProfile, BadgeType, CampusNotification, HelpDeskInquiry } from '../types';
import { getStoredUsers, saveStoredUsers, isGuestAccount, markUserPermanentlyDeleted } from '../utils/userDbUtils';
import { pushServerDbSync } from '../utils/apiSync';
import { deleteUserFromFirestore, subscribeVerificationFee, saveVerificationFeeToFirestore, saveUserToFirestore, saveVerificationRequestToFirestore } from '../lib/firestoreSync';
import { Shield, Lock, Search, Eye, CheckCircle2, XCircle, AlertTriangle, MessageSquare, Send, Award, RefreshCw, Key, Check, UserCheck, ShoppingBag, PhoneCall, AlertCircle, Mail, ShieldAlert, Info, Trash2, ChevronLeft, ChevronRight, X, GraduationCap, Building2, User, LifeBuoy } from 'lucide-react';
import { VerificationBadge } from '../components/VerificationBadge';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { AdminTradeDesk } from '../components/AdminTradeDesk';
import { AdminChatReportsDesk } from '../components/AdminChatReportsDesk';
import { INITIAL_VERIFICATION_CANDIDATES, INITIAL_USER_PROFILE } from '../data/initialData';
import { sendUserNotification, normalizeNickname, formatMessageTime } from '../utils/messagingUtils';
import { useAdminPendingCounts } from '../utils/adminAlertUtils';
import { getStoredHelpDeskInquiries, updateHelpDeskInquiryStatus, deleteHelpDeskInquiry } from '../utils/helpDeskUtils';

interface ModerationScreenProps {
  userProfile?: UserProfile | null;
  flaggedPosts?: Post[];
  reports?: Report[];
  verificationRequests?: VerificationRequest[];
  approvedMarketplaceItems?: MarketplaceItem[];
  pendingMarketplaceItems?: MarketplaceItem[];
  onToggleAntiDoxxing?: (enabled: boolean) => void;
  onToggleProfanityShield?: (enabled: boolean) => void;
  onDismissReport?: (reportId: string, postId: string) => void;
  onQuarantinePost?: (reportId: string, postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onUpdateBadge?: (badgeType: BadgeType, badgeTitle: string) => void;
  onUpdateReputationScore?: (newScore: number) => void;
  onUpdateVerificationRequestStatus?: (id: string, status: 'APPROVED' | 'DECLINED' | 'REVOKED' | 'REJECTED') => void;
  onApproveVerification?: (id: string, badgeType?: BadgeType, badgeTitle?: string) => void;
  onRejectVerification?: (id: string) => void;
  onRevokeVerification?: (id: string) => void;
  onDeleteVerification?: (id: string) => void;
  onResolveReport?: (reportId: string) => void;
  onAdminApproveMarketplaceItem?: (id: string, approvedPrice: number, note: string) => void;
  onAdminRejectMarketplaceItem?: (id: string, note: string) => void;
  onDeleteMarketplaceItem?: (id: string) => void;
  onSendPriceAdvisory?: (id: string, suggestedPrice: number, message: string) => void;
}

export const ModerationScreen: React.FC<ModerationScreenProps> = ({
  userProfile,
  flaggedPosts = [],
  reports = [],
  verificationRequests = [],
  approvedMarketplaceItems = [],
  pendingMarketplaceItems = [],
  onToggleAntiDoxxing = () => {},
  onToggleProfanityShield = () => {},
  onDismissReport = () => {},
  onQuarantinePost = () => {},
  onDeletePost = () => {},
  onUpdateBadge = () => {},
  onUpdateReputationScore = () => {},
  onUpdateVerificationRequestStatus = () => {},
  onApproveVerification = () => {},
  onRejectVerification = () => {},
  onRevokeVerification = () => {},
  onDeleteVerification = () => {},
  onResolveReport = () => {},
  onAdminApproveMarketplaceItem = () => {},
  onAdminRejectMarketplaceItem = () => {},
  onDeleteMarketplaceItem,
  onSendPriceAdvisory = () => {},
}) => {
  // Authorization Security Guard
  if (!userProfile?.isAdmin) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-rose-200 shadow-xl text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          The <strong>Admin Console</strong> and <strong>Admin Trade Desk</strong> are strictly reserved for authenticated administrators. Normal student accounts do not have permission to view or manage trade desk records.
        </p>
      </div>
    );
  }
  // Verification candidates state with persistence
  const [verifCandidates, setVerifCandidates] = useState(() => {
    try {
      const stored = localStorage.getItem('fuhsi_verif_candidates_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_VERIFICATION_CANDIDATES || [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_verif_candidates_db', JSON.stringify(verifCandidates));
      pushServerDbSync({ verifCandidates });
    } catch (e) {
      console.error(e);
    }
  }, [verifCandidates]);

  // Identity Lookup State
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<UserProfile | null>(null);
  const [lookupNotFound, setLookupNotFound] = useState(false);

  // Campus Desk Hotline Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'admin'; text: string; time: string }>>([
    { sender: 'admin', text: 'FUHSI Campus Secretariat desk active. How can we assist with campus inquiries, trade assistance, or verification review?', time: '10:00 AM' }
  ]);
  const [chatInput, setChatInput] = useState('');

  // Admin Badge Modifier State
  const [selectedBadgeType, setSelectedBadgeType] = useState<BadgeType>(userProfile?.badgeType || 'BLUE');
  const [badgeTitleInput, setBadgeTitleInput] = useState(userProfile?.badgeTitle || 'Class Rep & Tech Lead');
  const [reputationInput, setReputationInput] = useState(userProfile?.reputationScore || 2450);
  const [adminUpdateToast, setAdminUpdateToast] = useState(false);

  // Dynamic Verification Subscription Fee state
  const [adminVerificationFee, setAdminVerificationFee] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_verification_fee');
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 0) return val;
      }
    } catch (e) {
      console.error(e);
    }
    return 1500;
  });
  const [feeSaveToast, setFeeSaveToast] = useState(false);
  const [isSavingFee, setIsSavingFee] = useState(false);

  // Subscribe to real-time verification fee updates across all devices
  useEffect(() => {
    const unsubscribe = subscribeVerificationFee((newFee) => {
      if (typeof newFee === 'number' && !isNaN(newFee) && newFee >= 0) {
        setAdminVerificationFee(newFee);
        try {
          localStorage.setItem('fuhsi_verification_fee', newFee.toString());
        } catch (e) {}
      }
    });

    const handleFeeEvent = (e: any) => {
      const fee = e.detail;
      if (typeof fee === 'number' && !isNaN(fee)) {
        setAdminVerificationFee(fee);
      }
    };
    window.addEventListener('fuhsi_verification_fee_updated', handleFeeEvent);

    return () => {
      unsubscribe();
      window.removeEventListener('fuhsi_verification_fee_updated', handleFeeEvent);
    };
  }, []);

  // Per-request color badge & title assignment state
  const [selectedReqColors, setSelectedReqColors] = useState<Record<string, BadgeType>>({});
  const [selectedReqTitles, setSelectedReqTitles] = useState<Record<string, string>>({});
  const [reassignSuccessMsg, setReassignSuccessMsg] = useState<Record<string, string>>({});
  const [verifFilterTab, setVerifFilterTab] = useState<'PENDING' | 'APPROVED' | 'DECLINED' | 'REVOKED'>('PENDING');
  const [verifSearchQuery, setVerifSearchQuery] = useState('');
  const [verifCurrentPage, setVerifCurrentPage] = useState(1);
  const [selectedReqForView, setSelectedReqForView] = useState<VerificationRequest | null>(null);

  // Student Registrations State & Search & Pagination
  const [allUsersList, setAllUsersList] = useState<UserProfile[]>([]);
  const [activeUserTab, setActiveUserTab] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentCurrentPage, setStudentCurrentPage] = useState(1);
  const [selectedStudentForView, setSelectedStudentForView] = useState<UserProfile | null>(null);

  // Help Desk Tickets State & Search
  const [helpDeskList, setHelpDeskList] = useState<HelpDeskInquiry[]>(() => getStoredHelpDeskInquiries());
  const [selectedTicketForView, setSelectedTicketForView] = useState<HelpDeskInquiry | null>(null);
  const [helpDeskFilter, setHelpDeskFilter] = useState<'PENDING' | 'RESOLVED' | 'ALL'>('PENDING');
  const [helpDeskSearchQuery, setHelpDeskSearchQuery] = useState('');

  // Internal desk navigator: preserves Admin Console context without URL hash changes or browser history resets
  const navigateToDesk = (deskId: string, tab?: string) => {
    if (deskId === 'student-accounts-desk') {
      if (tab) setActiveUserTab(tab as any);
    } else if (deskId === 'verification-requests-desk') {
      if (tab) setVerifFilterTab(tab as any);
    } else if (deskId === 'helpdesk-desk') {
      if (tab) setHelpDeskFilter(tab as any);
    }
    const el = document.getElementById(deskId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Listen to open admin desk events from dashboard alerts or notifications
  useEffect(() => {
    const handleOpenDesk = (e: any) => {
      const { deskId, tab } = e.detail || {};
      if (deskId) {
        setTimeout(() => {
          navigateToDesk(deskId, tab);
        }, 100);
      }
    };
    window.addEventListener('fuhsi_open_admin_desk', handleOpenDesk);
    return () => window.removeEventListener('fuhsi_open_admin_desk', handleOpenDesk);
  }, []);

  // Sync Help Desk inquiries
  useEffect(() => {
    const handleHelpDeskUpdate = () => {
      setHelpDeskList(getStoredHelpDeskInquiries());
    };
    window.addEventListener('fuhsi_helpdesk_inquiry_submitted', handleHelpDeskUpdate);
    window.addEventListener('fuhsi_helpdesk_inquiry_updated', handleHelpDeskUpdate);
    return () => {
      window.removeEventListener('fuhsi_helpdesk_inquiry_submitted', handleHelpDeskUpdate);
      window.removeEventListener('fuhsi_helpdesk_inquiry_updated', handleHelpDeskUpdate);
    };
  }, []);

  // Central live Admin Tasks & Pending Activity counter
  const adminTasks = useAdminPendingCounts(
    allUsersList,
    verificationRequests,
    pendingMarketplaceItems,
    flaggedPosts,
    reports
  );

  // Direct Official Updates / Messages State (strictly Notifications, not Chat)
  const [queryModalUser, setQueryModalUser] = useState<{ nickname: string; realName?: string; email?: string } | null>(null);
  const [queryCategory, setQueryCategory] = useState('Official Notice');
  const [querySubject, setQuerySubject] = useState('');
  const [queryMessage, setQueryMessage] = useState('');
  const [queryToast, setQueryToast] = useState<string | null>(null);

  const handleOpenQueryModal = (nick: string, realName?: string, email?: string, defaultSubject?: string) => {
    setQueryModalUser({ nickname: nick, realName, email });
    setQueryCategory(defaultSubject ? defaultSubject : 'Official Notice');
    setQuerySubject(defaultSubject ? defaultSubject : 'Official Platform Notice');
    setQueryMessage('');
  };

  const handleSendAdminQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryModalUser || !queryMessage.trim()) return;

    const targetNick = queryModalUser.nickname;
    const cleanNick = normalizeNickname(targetNick);

    const title = querySubject.trim() || queryCategory || 'Official Platform Notice';
    const message = queryMessage.trim();

    const officialNotif: CampusNotification = {
      id: `official_update_${Date.now()}`,
      type: 'ADMIN',
      title,
      message,
      timestamp: new Date().toISOString(),
      isRead: false,
    };

    sendUserNotification(targetNick, officialNotif);

    // Sync notification list to server DB & Firestore
    try {
      const notifKey = `fuhsi_user_notifications_${cleanNick}`;
      const stored = localStorage.getItem(notifKey);
      const list = stored ? JSON.parse(stored) : [];
      pushServerDbSync({ notifications: { [cleanNick]: list } } as any).catch(() => {});
    } catch (e) {
      console.error(e);
    }

    setQueryToast(`✓ Official Update dispatched to ${targetNick}'s Notifications!`);
    setQueryModalUser(null);
    setQueryMessage('');
    setQuerySubject('');

    setTimeout(() => {
      setQueryToast(null);
    }, 4500);
  };

  const refreshUsersList = () => {
    const list = getStoredUsers();
    setAllUsersList(list);
  };

  useEffect(() => {
    refreshUsersList();
    const interval = setInterval(refreshUsersList, 1500);
    return () => clearInterval(interval);
  }, []);

  const [approvalToast, setApprovalToast] = useState<string | null>(null);

  const handleApproveRegistration = (userId: string, nick: string) => {
    let targetEmail = '';
    let targetRealName = '';
    try {
      const storedList = getStoredUsers();
      const updatedList = storedList.map((u) => {
        const isMatch = userId ? u.id === userId : Boolean(nick && u.nickname && u.nickname.toLowerCase() === nick.toLowerCase());
        if (isMatch) {
          targetEmail = u.studentEmail || `${(u.nickname || nick).replace(/^@/, '')}@fuhsi.edu.ng`;
          targetRealName = u.realName || u.nickname || nick;
          return {
            ...u,
            isApproved: true,
            isDeclined: false,
            badgeType: u.badgeType && u.badgeType !== 'NONE' ? u.badgeType : 'BLUE',
            badgeTitle: u.badgeTitle ? u.badgeTitle.trim() : '',
            isAdmin: Boolean(u.isAdmin),
          };
        }
        return u;
      });

      saveStoredUsers(updatedList);
      setAllUsersList(updatedList);

      // Create official automated email object sent from fuhsiconnect@gmail.com
      const cleanNick = nick ? nick.toLowerCase().replace(/^@/, '') : '';
      const emailRecord = {
        id: `email_appr_${Date.now()}`,
        from: 'FUHSI Connect <fuhsiconnect@gmail.com>',
        to: targetEmail,
        recipientName: targetRealName,
        recipientNickname: nick,
        subject: 'FUHSI Connect Account Verified & Approved',
        body: 'Your FUHSI Connect account has been verified and approved. You can now log in and start using the platform.',
        notice: 'Note: This email was sent from an unmonitored system email address (fuhsiconnect@gmail.com). Please do not reply directly to this email.',
        isNoReply: true,
        sentAt: new Date().toISOString(),
        formattedDate: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      };

      // Store email in global sent emails db
      try {
        const existingEmailsStr = localStorage.getItem('fuhsi_sent_emails_db');
        const existingEmails = existingEmailsStr ? JSON.parse(existingEmailsStr) : [];
        localStorage.setItem('fuhsi_sent_emails_db', JSON.stringify([emailRecord, ...existingEmails]));
      } catch (e) {
        console.error(e);
      }

      // Save notification & email copy in user's in-app inbox
      if (cleanNick) {
        const notifKey = `fuhsi_user_notifications_${cleanNick}`;
        const approvalMsg = {
          id: `appr_notif_${Date.now()}`,
          type: 'VERIFICATION',
          title: '📧 Email Notification Received from fuhsiconnect@gmail.com',
          message: `From: FUHSI Connect <fuhsiconnect@gmail.com> [Do Not Reply]\nTo: ${targetEmail}\nSubject: FUHSI Connect Account Verified & Approved\n\n"Your FUHSI Connect account has been verified and approved. You can now log in and start using the platform."`,
          timestamp: 'Just now',
          isRead: false,
          emailDetails: emailRecord,
        };
        let existingNotifs = [];
        try {
          const storedNotifs = localStorage.getItem(notifKey);
          if (storedNotifs) existingNotifs = JSON.parse(storedNotifs);
        } catch (e) { console.error(e); }
        localStorage.setItem(notifKey, JSON.stringify([approvalMsg, ...existingNotifs]));
      }

      // Update active user profile in localStorage if it matches
      const activeJson = localStorage.getItem('fuhsi_active_user');
      if (activeJson) {
        const activeUser: UserProfile = JSON.parse(activeJson);
        const matchActive = userId ? activeUser.id === userId : (nick && activeUser.nickname?.toLowerCase() === nick.toLowerCase());
        if (activeUser && matchActive) {
          const updatedActive = { ...activeUser, isApproved: true, isDeclined: false, badgeTitle: activeUser.badgeTitle || '' };
          localStorage.setItem('fuhsi_active_user', JSON.stringify(updatedActive));
        }
      }
    } catch (err) {
      console.error(err);
    }

    setApprovalToast(`✅ Account Approved & Active for ${nick || userId}! Total Member Counter updated.`);
    setTimeout(() => setApprovalToast(null), 5000);
  };

  const handleDeclineRegistration = (userId: string, nick: string) => {
    try {
      const storedList = getStoredUsers();
      let revokedUser: UserProfile | null = null;
      const updatedList = storedList.map((u) => {
        const isMatch = userId ? u.id === userId : Boolean(nick && u.nickname && u.nickname.toLowerCase() === nick.toLowerCase());
        if (isMatch) {
          const updated: UserProfile = {
            ...u,
            isApproved: false,
            isDeclined: false,
            isVerified: false,
            verificationStatus: 'rejected' as const,
            badgeType: 'NONE' as const,
            badgeTitle: '',
            updatedAt: new Date().toISOString(),
          };
          revokedUser = updated;
          return updated;
        }
        return u;
      });

      saveStoredUsers(updatedList);
      setAllUsersList(updatedList);

      if (revokedUser) {
        saveUserToFirestore(revokedUser).catch((err) => console.error(err));
      }
      pushServerDbSync({ users: updatedList, replaceUsers: true } as any).catch((err) => console.error(err));

      if (onRevokeVerification) {
        onRevokeVerification(nick || userId);
      }

      // If viewing this student in details modal, update the selected modal student too
      if (selectedStudentForView) {
        setSelectedStudentForView((prev) => prev ? { ...prev, isApproved: false, isVerified: false, badgeType: 'NONE', badgeTitle: '' } : null);
      }

      // Switch active tab to 'PENDING' so the administrator immediately sees the revoked account in the Pending list
      setActiveUserTab('PENDING');

      const activeJson = localStorage.getItem('fuhsi_active_user');
      if (activeJson) {
        const activeUser: UserProfile = JSON.parse(activeJson);
        const matchActive = userId ? activeUser.id === userId : (nick && activeUser.nickname?.toLowerCase() === nick.toLowerCase());
        if (activeUser && matchActive && !activeUser.isAdmin) {
          localStorage.removeItem('fuhsi_active_user');
        }
      }
    } catch (err) {
      console.error(err);
    }

    setApprovalToast(`Account approval revoked. ${nick || userId} is now under Pending.`);
    setTimeout(() => setApprovalToast(null), 4000);
  };

  const handleDeleteUserAccount = (userId: string, nick: string) => {
    try {
      const storedList = getStoredUsers();
      const userToDelete = storedList.find((u) => (userId && u.id === userId) || (nick && u.nickname?.toLowerCase() === nick.toLowerCase()));

      if (userToDelete?.isAdmin || nick === '@modula') {
        alert('The platform administrator account cannot be deleted.');
        return;
      }

      const confirmed = window.confirm(
        `Are you sure you want to permanently delete ${nick || 'this account'}?\n\nThis will completely erase the account from all devices, servers, and databases. The account will no longer exist and the user will see that no such account exists (as if they never created it).`
      );
      if (!confirmed) return;

      const email = userToDelete?.studentEmail;
      const matric = userToDelete?.matricNumber;

      // 1. Mark permanently deleted in tombstone
      markUserPermanentlyDeleted({ id: userId, nickname: nick, studentEmail: email, matricNumber: matric });

      // 2. Remove from local list
      const updatedList = storedList.filter((u) => {
        if (userId && u.id === userId) return false;
        if (nick && u.nickname?.toLowerCase() === nick.toLowerCase()) return false;
        if (email && u.studentEmail?.toLowerCase() === email.toLowerCase()) return false;
        return true;
      });
      saveStoredUsers(updatedList);
      setAllUsersList(updatedList);

      // 3. Delete from Firestore permanently
      deleteUserFromFirestore(userId, nick, email);

      // 4. Push deletion to central server database
      pushServerDbSync({
        users: updatedList,
        replaceUsers: true,
        deletedUserIds: userId ? [userId] : [],
        deletedUserNicknames: nick ? [nick] : [],
      } as any).catch((err) => console.error('Error syncing user deletion to server:', err));

      // 5. If deleted user was active in local session, clear session
      const activeJson = localStorage.getItem('fuhsi_active_user');
      if (activeJson) {
        const activeUser: UserProfile = JSON.parse(activeJson);
        const matchActive = (userId && activeUser.id === userId) ||
          (nick && activeUser.nickname?.toLowerCase() === nick.toLowerCase()) ||
          (email && activeUser.studentEmail?.toLowerCase() === email.toLowerCase());
        if (matchActive && !activeUser.isAdmin) {
          localStorage.removeItem('fuhsi_active_user');
        }
      }

      setApprovalToast(`🗑️ Account for ${nick || userId} has been permanently deleted and completely removed.`);
      setTimeout(() => setApprovalToast(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  // Price Advisory Modal State
  const [advisoryItem, setAdvisoryItem] = useState<MarketplaceItem | null>(null);
  const [suggestedPrice, setSuggestedPrice] = useState<number>(0);
  const [advisoryMsg, setAdvisoryMsg] = useState('');

  // Admin Marketplace Middleman Trade Desk State
  const [adminTradeRequests, setAdminTradeRequests] = useState<any[]>([]);

  const handleLookup = (e?: React.FormEvent, searchOverride?: string) => {
    if (e) e.preventDefault();
    const query = (searchOverride !== undefined ? searchOverride : lookupQuery).trim();
    if (!query) {
      setLookupResult(null);
      setLookupNotFound(false);
      return;
    }

    const cleanQuery = query.toLowerCase().replace(/^@/, '');
    const users = getStoredUsers();

    const matched = users.find((u) => {
      const uNick = (u.nickname || '').toLowerCase().replace(/^@/, '');
      const uReal = (u.realName || '').toLowerCase();
      const uMatric = (u.matricNumber || '').toLowerCase();
      const uEmail = (u.studentEmail || '').toLowerCase();

      return (
        uNick === cleanQuery ||
        uNick.includes(cleanQuery) ||
        (uMatric && uMatric.includes(cleanQuery)) ||
        (uReal && uReal.includes(cleanQuery)) ||
        (uEmail && uEmail.includes(cleanQuery))
      );
    });

    if (matched) {
      setLookupResult(matched);
      setLookupNotFound(false);
    } else {
      setLookupResult(null);
      setLookupNotFound(true);
    }
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMsg = { sender: 'user' as const, text: chatInput, time: 'Just now' };
    setChatMessages((prev) => [...prev, newMsg]);
    setChatInput('');

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'admin',
          text: 'Message received by FUHSI Security & SUG Welfare Council. An officer will reply shortly.',
          time: 'Just now',
        },
      ]);
    }, 1000);
  };

  const handleSaveBadgeAndRep = () => {
    onUpdateBadge?.(selectedBadgeType, badgeTitleInput);
    onUpdateReputationScore?.(reputationInput);
    setAdminUpdateToast(true);
    setTimeout(() => setAdminUpdateToast(false), 2000);
  };

  const handleSendAdvisory = () => {
    if (advisoryItem) {
      onSendPriceAdvisory?.(advisoryItem.id, suggestedPrice, advisoryMsg);
      setAdvisoryItem(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-24 px-4 pt-4 space-y-4">
      {/* Toast Alert */}
      {queryToast && (
        <div className="p-3 bg-emerald-600 text-white font-extrabold text-xs rounded-2xl shadow-lg flex items-center justify-between animate-in fade-in">
          <span>{queryToast}</span>
          <button onClick={() => setQueryToast(null)} className="text-white/80 hover:text-white ml-2">✕</button>
        </div>
      )}

      {/* Moderation Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 shadow-lg border border-indigo-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-300">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-base">FUHSI Safety & Moderation Console</h1>
            <p className="text-xs text-indigo-200">
              Admin Trade Desk, Student Verification Vault & Content Moderation Console
            </p>
          </div>
        </div>
      </div>

      {/* ADMIN TASKS ACTION RADAR & CENTRAL ACTIVITY OVERVIEW */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{adminTasks.hasPendingTasks ? '🟡' : '🟢'}</span>
            <div>
              <h2 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span>Admin Tasks & Action Radar</span>
                {adminTasks.hasPendingTasks ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse shadow-2xs">
                    {adminTasks.totalPending} Pending Item{adminTasks.totalPending === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                    All Caught Up — No Pending Work
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Centrally synchronized pending tasks requiring administrator review and action.
              </p>
            </div>
          </div>
          {adminTasks.hasPendingTasks && (
            <span className="hidden sm:inline-flex text-[10px] font-extrabold text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-full border border-amber-300 animate-pulse">
              Requires Admin Review
            </span>
          )}
        </div>

        {/* 6 Section Breakdown Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          {/* 1. Student Accounts */}
          <button
            type="button"
            onClick={() => navigateToDesk('student-accounts-desk', 'PENDING')}
            className={`p-3 rounded-xl border transition-all flex flex-col justify-between cursor-pointer text-left ${
              adminTasks.studentAccounts > 0
                ? 'bg-amber-50/80 border-amber-300 hover:bg-amber-100/90 shadow-2xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-extrabold text-slate-800 text-xs">Student Accounts</span>
              <UserCheck size={14} className={adminTasks.studentAccounts > 0 ? 'text-amber-600' : 'text-slate-400'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Registrations</span>
              {adminTasks.studentAccounts > 0 ? (
                <span className="px-2 py-0.5 rounded-md font-black text-xs bg-amber-500 text-slate-950 shadow-2xs animate-pulse">
                  {adminTasks.studentAccounts} new
                </span>
              ) : (
                <span className="text-slate-400 font-bold text-xs">0</span>
              )}
            </div>
          </button>

          {/* 2. Verification Requests */}
          <button
            type="button"
            onClick={() => navigateToDesk('verification-requests-desk', 'PENDING')}
            className={`p-3 rounded-xl border transition-all flex flex-col justify-between cursor-pointer text-left ${
              adminTasks.verificationRequests > 0
                ? 'bg-amber-50/80 border-amber-300 hover:bg-amber-100/90 shadow-2xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-extrabold text-slate-800 text-xs">Verification Requests</span>
              <Shield size={14} className={adminTasks.verificationRequests > 0 ? 'text-amber-600' : 'text-slate-400'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Subscriptions</span>
              {adminTasks.verificationRequests > 0 ? (
                <span className="px-2 py-0.5 rounded-md font-black text-xs bg-amber-500 text-slate-950 shadow-2xs animate-pulse">
                  {adminTasks.verificationRequests} new
                </span>
              ) : (
                <span className="text-slate-400 font-bold text-xs">0</span>
              )}
            </div>
          </button>

          {/* 3. Marketplace Management */}
          <button
            type="button"
            onClick={() => navigateToDesk('marketplace-management-desk')}
            className={`p-3 rounded-xl border transition-all flex flex-col justify-between cursor-pointer text-left ${
              adminTasks.marketplaceManagement > 0
                ? 'bg-amber-50/80 border-amber-300 hover:bg-amber-100/90 shadow-2xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-extrabold text-slate-800 text-xs">Marketplace</span>
              <ShoppingBag size={14} className={adminTasks.marketplaceManagement > 0 ? 'text-amber-600' : 'text-slate-400'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Items & Reports</span>
              {adminTasks.marketplaceManagement > 0 ? (
                <span className="px-2 py-0.5 rounded-md font-black text-xs bg-amber-500 text-slate-950 shadow-2xs animate-pulse">
                  {adminTasks.marketplaceManagement} pending
                </span>
              ) : (
                <span className="text-slate-400 font-bold text-xs">0</span>
              )}
            </div>
          </button>

          {/* 4. Flagged Community Posts */}
          <button
            type="button"
            onClick={() => navigateToDesk('flagged-posts-desk')}
            className={`p-3 rounded-xl border transition-all flex flex-col justify-between cursor-pointer text-left ${
              adminTasks.flaggedCommunityPosts > 0
                ? 'bg-rose-50/80 border-rose-300 hover:bg-rose-100/90 shadow-2xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-extrabold text-slate-800 text-xs">Flagged Posts</span>
              <AlertTriangle size={14} className={adminTasks.flaggedCommunityPosts > 0 ? 'text-rose-600' : 'text-slate-400'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Content Flags</span>
              {adminTasks.flaggedCommunityPosts > 0 ? (
                <span className="px-2 py-0.5 rounded-md font-black text-xs bg-rose-600 text-white shadow-2xs animate-pulse">
                  {adminTasks.flaggedCommunityPosts} new
                </span>
              ) : (
                <span className="text-slate-400 font-bold text-xs">0</span>
              )}
            </div>
          </button>

          {/* 5. Chat Moderation */}
          <button
            type="button"
            onClick={() => navigateToDesk('chat-moderation-desk')}
            className={`p-3 rounded-xl border transition-all flex flex-col justify-between cursor-pointer text-left ${
              adminTasks.chatModeration > 0
                ? 'bg-rose-50/80 border-rose-300 hover:bg-rose-100/90 shadow-2xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-extrabold text-slate-800 text-xs">Chat Moderation</span>
              <MessageSquare size={14} className={adminTasks.chatModeration > 0 ? 'text-rose-600' : 'text-slate-400'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Reported Cases</span>
              {adminTasks.chatModeration > 0 ? (
                <span className="px-2 py-0.5 rounded-md font-black text-xs bg-rose-600 text-white shadow-2xs animate-pulse">
                  {adminTasks.chatModeration} cases
                </span>
              ) : (
                <span className="text-slate-400 font-bold text-xs">0</span>
              )}
            </div>
          </button>

          {/* 6. Help Desk */}
          <button
            type="button"
            onClick={() => navigateToDesk('helpdesk-desk', 'PENDING')}
            className={`p-3 rounded-xl border transition-all flex flex-col justify-between cursor-pointer text-left ${
              adminTasks.helpDesk > 0
                ? 'bg-purple-50/80 border-purple-300 hover:bg-purple-100/90 shadow-2xs'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-extrabold text-slate-800 text-xs">Help Desk</span>
              <LifeBuoy size={14} className={adminTasks.helpDesk > 0 ? 'text-purple-600' : 'text-slate-400'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Appeals & Inquiries</span>
              {adminTasks.helpDesk > 0 ? (
                <span className="px-2 py-0.5 rounded-md font-black text-xs bg-purple-600 text-white shadow-2xs animate-pulse">
                  {adminTasks.helpDesk} new
                </span>
              ) : (
                <span className="text-slate-400 font-bold text-xs">0</span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* PENDING & REGISTERED STUDENT ACCOUNT MANAGEMENT DESK */}
      <div id="student-accounts-desk" className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 text-teal-900">
              <UserCheck className="w-4 h-4 text-teal-600" />
              <span>Student Account Management Desk</span>
              {adminTasks.studentAccounts > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse shadow-2xs">
                  {adminTasks.studentAccounts} new
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500">
              Compact directory of all registered students. Search and manage matriculation records, approve new accounts, or send official notices.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl flex-wrap">
            <button
              onClick={() => { setActiveUserTab('ALL'); setStudentCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeUserTab === 'ALL'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({allUsersList.filter((u) => !u.isAdmin && u.nickname !== '@modula').length})
            </button>
            <button
              onClick={() => { setActiveUserTab('PENDING'); setStudentCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeUserTab === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({allUsersList.filter((u) => !u.isApproved && !u.isAdmin && u.nickname !== '@modula').length})
            </button>
            <button
              onClick={() => { setActiveUserTab('APPROVED'); setStudentCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeUserTab === 'APPROVED'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approved ({allUsersList.filter((u) => u.isApproved && !u.isAdmin && u.nickname !== '@modula').length})
            </button>
          </div>
        </div>

        {/* PROMINENT STUDENT SEARCH FIELD */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={studentSearchQuery}
            onChange={(e) => { setStudentSearchQuery(e.target.value); setStudentCurrentPage(1); }}
            placeholder="Search students by @username, Real Name, Matric Number (e.g. 24/PRT/007), Email, or Phone..."
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all placeholder:text-slate-400"
          />
          {studentSearchQuery && (
            <button
              onClick={() => { setStudentSearchQuery(''); setStudentCurrentPage(1); }}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {approvalToast && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
            {approvalToast}
          </div>
        )}

        {(() => {
          const cleanSearch = studentSearchQuery.trim().toLowerCase().replace(/^@/, '');
          const filteredStudents = allUsersList.filter((u) => {
            if (u.isAdmin || u.nickname === '@modula') return false;
            if (activeUserTab === 'PENDING' && u.isApproved) return false;
            if (activeUserTab === 'APPROVED' && !u.isApproved) return false;

            if (!cleanSearch) return true;

            const nick = (u.nickname || '').toLowerCase().replace(/^@/, '');
            const real = (u.realName || '').toLowerCase();
            const matric = (u.matricNumber || '').toLowerCase();
            const email = (u.studentEmail || '').toLowerCase();
            const phone = (u.emergencyHomePhone || '').toLowerCase();

            return (
              nick.includes(cleanSearch) ||
              real.includes(cleanSearch) ||
              matric.includes(cleanSearch) ||
              email.includes(cleanSearch) ||
              phone.includes(cleanSearch)
            );
          });

          if (filteredStudents.length === 0) {
            return (
              <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                <CheckCircle2 size={24} className="mx-auto text-teal-600 mb-1" />
                <p className="font-bold text-slate-800">
                  {studentSearchQuery
                    ? `No students matching "${studentSearchQuery}"`
                    : activeUserTab === 'PENDING'
                    ? 'No pending student registrations!'
                    : activeUserTab === 'APPROVED'
                    ? 'No approved active students found.'
                    : 'No registered student accounts found.'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {studentSearchQuery ? 'Try searching with another matric number, username, or name.' : 'Student registrations will appear here automatically.'}
                </p>
              </div>
            );
          }

          const STUDENTS_PAGE_SIZE = 15;
          const totalPages = Math.max(1, Math.ceil(filteredStudents.length / STUDENTS_PAGE_SIZE));
          const safePage = Math.min(studentCurrentPage, totalPages);
          const startIndex = (safePage - 1) * STUDENTS_PAGE_SIZE;
          const paginatedStudents = filteredStudents.slice(startIndex, startIndex + STUDENTS_PAGE_SIZE);

          return (
            <div className="space-y-2">
              {/* Table / List Header Summary */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1">
                <span>
                  Showing {startIndex + 1}–{Math.min(startIndex + STUDENTS_PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} student{filteredStudents.length === 1 ? '' : 's'}
                </span>
                {studentSearchQuery && (
                  <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                    Filtered by: "{studentSearchQuery}"
                  </span>
                )}
              </div>

              {/* Compact Minimal Student Rows */}
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {paginatedStudents.map((user) => {
                  const bInfo = getUserBadgeInfo(user.nickname, user);

                  return (
                    <div
                      key={user.id}
                      className="p-2.5 sm:px-3.5 hover:bg-slate-50/90 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      {/* Left: Minimal Profile Identity */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-xs">
                          {(user.realName || user.nickname || 'S').charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-xs">{user.nickname}</span>
                            {bInfo.isVerified && (
                              <VerificationBadge
                                isVerified={bInfo.isVerified}
                                badgeType={bInfo.badgeType}
                                title={bInfo.badgeTitle}
                                size={13}
                                showTitle={false}
                              />
                            )}
                            <span className="text-[10px] font-bold text-slate-500">
                              · {isGuestAccount(user) ? 'Guest' : 'Student'}
                            </span>
                            {!isGuestAccount(user) && user.department && (
                              <span className="text-[10px] text-slate-400 font-medium truncate max-w-[140px]">
                                ({user.department} {user.level || ''})
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-600 truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-800">{user.realName || (isGuestAccount(user) ? 'Guest Member' : 'Student Member')}</span>
                            {!isGuestAccount(user) && user.matricNumber && (
                              <span className="font-mono text-slate-500 font-semibold">· {user.matricNumber}</span>
                            )}
                            {user.studentEmail && (
                              <span className="text-slate-400 hidden md:inline">· {user.studentEmail}</span>
                            )}
                            {isGuestAccount(user) && user.emergencyHomePhone && (
                              <span className="text-slate-400 hidden md:inline">· {user.emergencyHomePhone}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Status & Compact Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          user.isApproved
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}>
                          {user.isApproved ? 'Approved' : 'Pending'}
                        </span>

                        <button
                          type="button"
                          onClick={() => setSelectedStudentForView(user)}
                          className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="View complete student record"
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenQueryModal(user.nickname, user.realName, user.studentEmail, 'Account Review')}
                          className="py-1 px-2.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="Send official platform notice or query"
                        >
                          <MessageSquare size={12} />
                          <span>Message / Query</span>
                        </button>

                        {!user.isApproved ? (
                          <button
                            type="button"
                            onClick={() => handleApproveRegistration(user.id, user.nickname)}
                            className="py-1 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                          >
                            <CheckCircle2 size={12} />
                            <span>Approve</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeclineRegistration(user.id, user.nickname)}
                            className="py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                            title="Revoke approval and move back to Pending"
                          >
                            <AlertCircle size={12} />
                            <span>Revoke</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteUserAccount(user.id, user.nickname)}
                          className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors cursor-pointer"
                          title="Permanently erase this account"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[11px] text-slate-500">
                    Page {safePage} of {totalPages}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setStudentCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer transition-colors"
                      title="Previous Page"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <span className="px-2 text-slate-700 font-bold text-xs">
                      {safePage}
                    </span>

                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setStudentCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer transition-colors"
                      title="Next Page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ADMIN MARKETPLACE MANAGEMENT DESK */}
      <AdminTradeDesk
        userProfile={userProfile}
        approvedMarketplaceItems={approvedMarketplaceItems}
        pendingMarketplaceItems={pendingMarketplaceItems}
        onAdminApproveMarketplaceItem={onAdminApproveMarketplaceItem}
        onAdminRejectMarketplaceItem={onAdminRejectMarketplaceItem}
        onDeleteMarketplaceItem={onDeleteMarketplaceItem}
      />

      {/* CHAT MODERATION CASES & REPORTED CONVERSATIONS DESK */}
      <AdminChatReportsDesk userProfile={userProfile || undefined} />

      {/* Admin Student Identity & Emergency Phone Lookup */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-600" /> Student Identity & Secret Phone Vault
          </h2>
        </div>

        <form onSubmit={(e) => handleLookup(e)} className="flex gap-2">
          <input
            type="text"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="Enter @username, Matric No, or Email..."
            className="flex-1 text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
          >
            Search Identity
          </button>
        </form>

        {lookupNotFound && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>User not found. No registered account matching "<strong>{lookupQuery}</strong>" exists in the user database.</span>
          </div>
        )}

        {lookupResult && (
          <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 text-xs space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
              <p className="font-bold text-indigo-950 flex items-center gap-1.5 text-sm">
                <Key className="w-4 h-4 text-indigo-600" /> Decrypted Student Identity Record:
              </p>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                lookupResult.isApproved
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}>
                {lookupResult.isApproved
                  ? '✅ Active Approved Member'
                  : '⏳ Pending Approval'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-indigo-950 font-medium bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">FULL REAL NAME</span>
                <span className="font-extrabold text-sm text-slate-900">{lookupResult.realName || 'Not Provided'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">USERNAME / NICKNAME</span>
                <span className="font-extrabold text-sm text-indigo-700">{lookupResult.nickname}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">ACCOUNT CATEGORY</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black ${
                  lookupResult.accountType === 'Guest' 
                    ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                    : 'bg-teal-100 text-teal-900 border border-teal-300'
                }`}>
                  {lookupResult.accountType || 'Student'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">COMPULSORY PHONE NUMBER</span>
                <span className="font-extrabold text-teal-700 text-sm">{lookupResult.emergencyHomePhone || 'Not Provided'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">EMAIL ADDRESS</span>
                <span className="font-bold text-slate-800 font-mono text-[11px]">{lookupResult.studentEmail || 'Not Provided'}</span>
              </div>
              {!isGuestAccount(lookupResult) ? (
                <>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">MATRICULATION NUMBER</span>
                    <span className="font-extrabold font-mono text-slate-800">{lookupResult.matricNumber || 'Not Provided'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">DEPARTMENT & LEVEL</span>
                    <span className="font-bold text-slate-800">{lookupResult.department || 'Not Provided'} ({lookupResult.level || 'Not Provided'})</span>
                  </div>
                </>
              ) : (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">ACCOUNT TYPE</span>
                  <span className="font-bold text-amber-800 text-xs">Guest Account (Non-Student Member)</span>
                </div>
              )}
            </div>

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => handleOpenQueryModal(lookupResult.nickname, lookupResult.realName, lookupResult.studentEmail)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <MessageSquare size={13} />
                <span>Send Official Query / Message to {lookupResult.nickname}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Verification Subscription Fee & Paid Applications Desk */}
      <div id="verification-requests-desk" className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-600" />
              <span>"Get Verified" Subscription Requests & Fee Desk</span>
              {adminTasks.verificationRequests > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse shadow-2xs">
                  {adminTasks.verificationRequests} new
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Review paid verification subscriptions, tendered position held details, and assign custom verify badge colors.
            </p>
          </div>

          <span className="self-start sm:self-center text-xs font-black text-sky-900 bg-sky-50 px-3 py-1 rounded-full border border-sky-200 shrink-0">
            {verificationRequests.filter((r) => r.status === 'PENDING').length} Pending Subscriptions
          </span>
        </div>

        {/* Fee Configuration Bar */}
        <div className="bg-slate-900 text-white rounded-2xl p-3.5 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              ₦
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Verification Subscription Fee</span>
              <span className="text-xs font-bold text-slate-200">Current Price Charged to Students on "Get Verified" Page</span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-36">
              <span className="absolute left-3 top-2.5 text-xs font-extrabold text-slate-400">₦</span>
              <input
                type="number"
                value={adminVerificationFee}
                onChange={(e) => setAdminVerificationFee(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full text-xs font-black rounded-xl bg-slate-950 border border-slate-700 pl-7 pr-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              disabled={isSavingFee}
              onClick={async () => {
                setIsSavingFee(true);
                try {
                  localStorage.setItem('fuhsi_verification_fee', adminVerificationFee.toString());
                  await saveVerificationFeeToFirestore(adminVerificationFee);
                  await pushServerDbSync({ verificationFee: adminVerificationFee });
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('fuhsi_verification_fee_updated', { detail: adminVerificationFee }));
                  }
                  setFeeSaveToast(true);
                  setTimeout(() => setFeeSaveToast(false), 3500);
                } catch (e) {
                  console.error('Error saving verification fee:', e);
                } finally {
                  setIsSavingFee(false);
                }
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              {isSavingFee ? (
                <span>Updating...</span>
              ) : (
                <>
                  <Check size={13} />
                  <span>Save Fee</span>
                </>
              )}
            </button>
          </div>
        </div>

        {feeSaveToast && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center animate-in fade-in">
            ✓ Verification Fee updated to ₦{adminVerificationFee.toLocaleString()}! Synchronized immediately across the platform and all devices.
          </div>
        )}

        {/* Search Field & Filter Tabs for Verification Queue */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={verifSearchQuery}
              onChange={(e) => { setVerifSearchQuery(e.target.value); setVerifCurrentPage(1); }}
              placeholder="Search requests by @username, Real Name, Matric Number, or Payment Ref..."
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all placeholder:text-slate-400"
            />
            {verifSearchQuery && (
              <button
                onClick={() => { setVerifSearchQuery(''); setVerifCurrentPage(1); }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold border-b border-slate-100">
            <button
              type="button"
              onClick={() => { setVerifFilterTab('PENDING'); setVerifCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                verifFilterTab === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>⏳ Pending Review</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {verificationRequests.filter((r) => r.status === 'PENDING').length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setVerifFilterTab('APPROVED'); setVerifCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                verifFilterTab === 'APPROVED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <span>✔️ Approved</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {verificationRequests.filter((r) => r.status === 'APPROVED').length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setVerifFilterTab('DECLINED'); setVerifCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                verifFilterTab === 'DECLINED'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <span>❌ Declined</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {verificationRequests.filter((r) => r.status === 'DECLINED' || r.status === 'REJECTED').length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setVerifFilterTab('REVOKED'); setVerifCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                verifFilterTab === 'REVOKED'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100'
              }`}
            >
              <span>🔄 Revoked</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {verificationRequests.filter((r) => r.status === 'REVOKED').length}
              </span>
            </button>
          </div>
        </div>

        {/* Requests Queue */}
        <div className="space-y-2 pt-1">
          {(() => {
            const cleanSearch = verifSearchQuery.trim().toLowerCase().replace(/^@/, '');
            const filteredRequests = verificationRequests.filter((req) => {
              if (verifFilterTab === 'PENDING' && req.status !== 'PENDING') return false;
              if (verifFilterTab === 'APPROVED' && req.status !== 'APPROVED') return false;
              if (verifFilterTab === 'DECLINED' && (req.status !== 'DECLINED' && req.status !== 'REJECTED')) return false;
              if (verifFilterTab === 'REVOKED' && req.status !== 'REVOKED') return false;

              if (!cleanSearch) return true;

              const nick = (req.applicantNickname || '').toLowerCase().replace(/^@/, '');
              const real = (req.realName || '').toLowerCase();
              const matric = (req.matricNumber || '').toLowerCase();
              const ref = (req.paymentRef || '').toLowerCase();
              const dept = (req.department || '').toLowerCase();

              return (
                nick.includes(cleanSearch) ||
                real.includes(cleanSearch) ||
                matric.includes(cleanSearch) ||
                ref.includes(cleanSearch) ||
                dept.includes(cleanSearch)
              );
            });

            if (filteredRequests.length === 0) {
              return (
                <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  {verifSearchQuery
                    ? `No verification requests matching "${verifSearchQuery}"`
                    : verifFilterTab === 'PENDING'
                    ? 'No pending verification requests awaiting review.'
                    : verifFilterTab === 'APPROVED'
                    ? 'No approved active verified requests.'
                    : verifFilterTab === 'DECLINED'
                    ? 'No declined verification requests.'
                    : 'No revoked verification records.'}
                </div>
              );
            }

            const VERIF_PAGE_SIZE = 15;
            const totalVerifPages = Math.max(1, Math.ceil(filteredRequests.length / VERIF_PAGE_SIZE));
            const safeVerifPage = Math.min(verifCurrentPage, totalVerifPages);
            const startVerifIndex = (safeVerifPage - 1) * VERIF_PAGE_SIZE;
            const paginatedRequests = filteredRequests.slice(startVerifIndex, startVerifIndex + VERIF_PAGE_SIZE);

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1">
                  <span>
                    Showing {startVerifIndex + 1}–{Math.min(startVerifIndex + VERIF_PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} request{filteredRequests.length === 1 ? '' : 's'}
                  </span>
                  {verifSearchQuery && (
                    <span className="text-sky-700 font-bold bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                      Filtered by: "{verifSearchQuery}"
                    </span>
                  )}
                </div>

                {/* Compact Minimal Verification Request Rows */}
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {paginatedRequests.map((req) => {
                    const currentBadgeColor = selectedReqColors[req.id] || req.assignedBadgeType || 'GREEN';
                    const currentBadgeTitle = selectedReqTitles[req.id] !== undefined
                      ? selectedReqTitles[req.id]
                      : (req.assignedBadgeTitle !== undefined && req.assignedBadgeTitle !== ''
                          ? req.assignedBadgeTitle
                          : (req.positionTitle || ''));

                    return (
                      <div
                        key={req.id}
                        className="p-2.5 sm:px-3.5 hover:bg-slate-50/90 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        {/* Minimal Identity Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-xs">{req.applicantNickname}</span>
                            <VerificationBadge
                              isVerified={req.status === 'APPROVED'}
                              badgeType={currentBadgeColor}
                              size={13}
                            />
                            <span className="text-[10px] font-bold text-slate-500">
                              · {req.accountType === 'Guest' ? 'Guest' : (req.accountType || 'Student')}
                            </span>
                            {req.positionTitle && (
                              <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200 truncate max-w-[150px]">
                                "{req.positionTitle}"
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-600 truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {req.accountType !== 'Guest' && (req.matricNumber || req.department) && (
                              <span className="font-mono text-slate-700 font-semibold">{req.matricNumber || req.department}</span>
                            )}
                            <span className="text-slate-400 font-mono">· Ref: {req.paymentRef || 'PAY-OK'}</span>
                            <span className="text-emerald-700 font-bold">
                              (₦{(req.amountPaid || adminVerificationFee).toLocaleString()})
                            </span>
                          </div>
                        </div>

                        {/* Status Badge & Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                            req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                            req.status === 'REVOKED' ? 'bg-orange-100 text-orange-900 border-orange-300' :
                            req.status === 'DECLINED' || req.status === 'REJECTED' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                            'bg-amber-100 text-amber-900 border-amber-300'
                          }`}>
                            {req.status === 'APPROVED' ? 'Approved' : req.status === 'REVOKED' ? 'Revoked' : req.status === 'DECLINED' || req.status === 'REJECTED' ? 'Declined' : 'Pending'}
                          </span>

                          <button
                            type="button"
                            onClick={() => setSelectedReqForView(req)}
                            className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                            title="View full verification application & badge controls"
                          >
                            <Eye size={12} />
                            <span>View</span>
                          </button>

                          {req.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                                  onUpdateVerificationRequestStatus(req.id, 'APPROVED');
                                }}
                                className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                              >
                                <CheckCircle2 size={12} />
                                <span>Approve</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateVerificationRequestStatus(req.id, 'DECLINED');
                                }}
                                className="py-1 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Decline
                              </button>
                            </>
                          )}

                          {req.status === 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to revoke verification and remove the active badge for ${req.applicantNickname}?`)) {
                                  onRevokeVerification(req.id);
                                  onUpdateVerificationRequestStatus(req.id, 'REVOKED');
                                }
                              }}
                              className="py-1 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                              title="Revoke verification and remove badge immediately"
                            >
                              <XCircle size={12} />
                              <span>Revoke</span>
                            </button>
                          )}

                          {req.status === 'REVOKED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                                  onUpdateVerificationRequestStatus(req.id, 'APPROVED');
                                }}
                                className="py-1 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] transition-colors cursor-pointer"
                                title="Reassign and approve verification"
                              >
                                Reassign & Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Permanently delete this verification record for ${req.applicantNickname}? This cannot be undone.`)) {
                                    onDeleteVerification(req.id);
                                  }
                                }}
                                className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 font-bold text-[11px] transition-colors cursor-pointer"
                                title="Permanently delete record"
                              >
                                Delete
                              </button>
                            </>
                          )}

                          {(req.status === 'DECLINED' || req.status === 'REJECTED') && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                                  onUpdateVerificationRequestStatus(req.id, 'APPROVED');
                                }}
                                className="py-1 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Permanently delete this verification record for ${req.applicantNickname}? This cannot be undone.`)) {
                                    onDeleteVerification(req.id);
                                  }
                                }}
                                className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 font-bold text-[11px] transition-colors cursor-pointer"
                                title="Permanently delete record"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Verification Pagination Controls */}
                {totalVerifPages > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-[11px] text-slate-500">
                      Page {safeVerifPage} of {totalVerifPages}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeVerifPage <= 1}
                        onClick={() => setVerifCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer transition-colors"
                        title="Previous Page"
                      >
                        <ChevronLeft size={14} />
                      </button>

                      <span className="px-2 text-slate-700 font-bold text-xs">
                        {safeVerifPage}
                      </span>

                      <button
                        type="button"
                        disabled={safeVerifPage >= totalVerifPages}
                        onClick={() => setVerifCurrentPage((p) => Math.min(totalVerifPages, p + 1))}
                        className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer transition-colors"
                        title="Next Page"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      {/* Marketplace Price Review & Benchmark Queue */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          🛍️ Marketplace Price Review & Benchmark Queue ({pendingMarketplaceItems.length})
        </h2>

        {pendingMarketplaceItems.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No pending marketplace items awaiting review.</p>
        ) : (
          <div className="space-y-3">
            {pendingMarketplaceItems.map((item) => (
              <div key={item.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs">{item.title}</h3>
                    <p className="text-[11px] text-slate-500">
                      Seller: {item.sellerNickname} • Asking Price: ₦{item.askingPrice.toLocaleString()}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                    PENDING REVIEW
                  </span>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => onAdminApproveMarketplaceItem?.(item.id, item.askingPrice, 'Approved at asking price')}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors"
                  >
                    Approve ₦{item.askingPrice.toLocaleString()}
                  </button>

                  <button
                    onClick={() => {
                      setAdvisoryItem(item);
                      setSuggestedPrice(Math.round(item.askingPrice * 0.9));
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors"
                  >
                    Suggest Price
                  </button>

                  <button
                    onClick={() => onAdminRejectMarketplaceItem?.(item.id, 'Price exceeds campus benchmark')}
                    className="py-1.5 px-3 rounded-lg bg-rose-100 text-rose-800 font-bold hover:bg-rose-200 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flagged Posts Queue */}
      <div id="flagged-posts-desk" className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 text-rose-700">
          <AlertTriangle className="w-4 h-4" />
          <span>Flagged Community Posts Queue</span>
          {adminTasks.flaggedCommunityPosts > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse shadow-2xs">
              {adminTasks.flaggedCommunityPosts} new
            </span>
          )}
        </h2>

        {flaggedPosts.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No flagged posts requiring moderation attention.</p>
        ) : (
          <div className="space-y-3">
            {flaggedPosts.map((post) => (
              <div key={post.id} className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-200 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-rose-950">{post.authorNickname}</span>
                  <span className="text-[10px] text-rose-700 font-semibold">{post.timestamp}</span>
                </div>
                <p className="text-slate-800">{post.content}</p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => onDeletePost?.(post.id)}
                    className="flex-1 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors"
                  >
                    Delete Post
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HELP DESK & STUDENT INQUIRIES DESK */}
      <div id="helpdesk-desk" className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2 text-purple-950">
              <LifeBuoy className="w-4 h-4 text-purple-600" />
              <span>Help Desk & Student Inquiries Queue</span>
              {adminTasks.helpDesk > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white animate-pulse shadow-2xs">
                  {adminTasks.helpDesk} new
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Review student registration appeals, matriculation conflicts, login issues, and direct support inquiries.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-center">
            <button
              onClick={() => setHelpDeskFilter('PENDING')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                helpDeskFilter === 'PENDING'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({helpDeskList.filter((h) => h.status === 'PENDING').length})
            </button>
            <button
              onClick={() => setHelpDeskFilter('RESOLVED')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                helpDeskFilter === 'RESOLVED'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Resolved ({helpDeskList.filter((h) => h.status === 'RESOLVED').length})
            </button>
            <button
              onClick={() => setHelpDeskFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                helpDeskFilter === 'ALL'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({helpDeskList.length})
            </button>
          </div>
        </div>

        {/* Search Field */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={helpDeskSearchQuery}
            onChange={(e) => setHelpDeskSearchQuery(e.target.value)}
            placeholder="Search tickets by ticket ID, student name, @username, or matric..."
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-slate-400"
          />
          {helpDeskSearchQuery && (
            <button
              onClick={() => setHelpDeskSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tickets List */}
        {(() => {
          const q = helpDeskSearchQuery.trim().toLowerCase();
          const filteredTickets = helpDeskList.filter((ticket) => {
            if (helpDeskFilter === 'PENDING' && ticket.status !== 'PENDING') return false;
            if (helpDeskFilter === 'RESOLVED' && ticket.status !== 'RESOLVED') return false;
            if (!q) return true;
            return (
              (ticket.ticketId || '').toLowerCase().includes(q) ||
              (ticket.fullName || '').toLowerCase().includes(q) ||
              (ticket.nickname || '').toLowerCase().includes(q) ||
              (ticket.matricNumber || '').toLowerCase().includes(q) ||
              (ticket.email || '').toLowerCase().includes(q) ||
              (ticket.message || '').toLowerCase().includes(q) ||
              (ticket.categoryLabel || '').toLowerCase().includes(q)
            );
          });

          if (filteredTickets.length === 0) {
            return (
              <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                {helpDeskSearchQuery
                  ? `No help desk inquiries matching "${helpDeskSearchQuery}"`
                  : helpDeskFilter === 'PENDING'
                  ? 'No pending student inquiries or appeals awaiting review!'
                  : 'No tickets found in this view.'}
              </div>
            );
          }

          return (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-3 sm:px-3.5 hover:bg-slate-50/90 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px]">
                        {ticket.ticketId}
                      </span>
                      <span className="font-extrabold text-slate-900 text-xs">{ticket.fullName}</span>
                      {ticket.nickname && (
                        <span className="font-bold text-teal-800 text-[11px]">({ticket.nickname})</span>
                      )}
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {ticket.categoryLabel}
                      </span>
                      {ticket.matricNumber && (
                        <span className="font-mono text-[10px] text-slate-500 font-semibold">
                          · {ticket.matricNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-1 mt-1 font-medium">
                      "{ticket.message}"
                    </p>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Submitted: {formatMessageTime(ticket.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                        ticket.status === 'RESOLVED'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-purple-100 text-purple-900 border-purple-300'
                      }`}
                    >
                      {ticket.status === 'RESOLVED' ? 'Resolved' : 'Pending'}
                    </span>

                    <button
                      type="button"
                      onClick={() => setSelectedTicketForView(ticket)}
                      className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                      title="View complete inquiry dossier"
                    >
                      <Eye size={12} />
                      <span>View</span>
                    </button>

                    {ticket.nickname && (
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenQueryModal(
                            ticket.nickname!,
                            ticket.fullName,
                            ticket.email,
                            `Help Desk [${ticket.ticketId}] Response`
                          )
                        }
                        className="py-1 px-2.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        title="Send official update reply"
                      >
                        <MessageSquare size={12} />
                        <span>Reply</span>
                      </button>
                    )}

                    {ticket.status === 'PENDING' ? (
                      <button
                        type="button"
                        onClick={() => updateHelpDeskInquiryStatus(ticket.id, 'RESOLVED', 'Resolved by Admin')}
                        className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 size={12} />
                        <span>Resolve</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateHelpDeskInquiryStatus(ticket.id, 'PENDING')}
                        className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        Re-open
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* MODAL: SUGGEST PRICE ADVISORY */}
      {advisoryItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">Send Price Advisory Note</h3>
              <button onClick={() => setAdvisoryItem(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-600">
                Item: <span className="font-bold text-slate-900">{advisoryItem.title}</span> (Asking: ₦{advisoryItem.askingPrice.toLocaleString()})
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Suggested Price Benchmark (₦)</label>
                <input
                  type="number"
                  value={suggestedPrice}
                  onChange={(e) => setSuggestedPrice(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 p-2 text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Advisory Message to Seller</label>
                <textarea
                  value={advisoryMsg}
                  onChange={(e) => setAdvisoryMsg(e.target.value)}
                  placeholder="e.g. SUG Commerce suggests lowering asking price to match current 300L student market rate..."
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 p-2 text-slate-800"
                />
              </div>

              <button
                onClick={handleSendAdvisory}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors"
              >
                Send Price Advisory Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SEND OFFICIAL COUNCIL QUERY / MESSAGE */}
      {queryModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <Shield className="w-4 h-4 text-teal-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Issue Council Inquiry / Official Notice</h3>
                  <p className="text-[11px] text-slate-500 font-medium">To: {queryModalUser.nickname} {queryModalUser.realName ? `(${queryModalUser.realName})` : ''}</p>
                </div>
              </div>
              <button 
                onClick={() => setQueryModalUser(null)} 
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendAdminQuery} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject Line</label>
                <input
                  type="text"
                  value={querySubject}
                  onChange={(e) => setQuerySubject(e.target.value)}
                  placeholder="e.g. Identity Verification Clarification / Conduct Notice"
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Inquiry / Message Body</label>
                <textarea
                  value={queryMessage}
                  onChange={(e) => setQueryMessage(e.target.value)}
                  placeholder="Type the formal message or inquiry to the student. They will receive an instant notification in their inbox and can reply directly..."
                  rows={5}
                  className="w-full text-xs rounded-xl border border-slate-300 p-3 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                  required
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  This message is sent with official FUHSI Security & Moderation authority. The student will be alerted with high priority.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQueryModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!queryMessage.trim()}
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={13} />
                  <span>Dispatch Official Update</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FULL STUDENT RECORD DETAILS */}
      {selectedStudentForView && (() => {
        const student = selectedStudentForView;
        const bInfo = getUserBadgeInfo(student.nickname, student);
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-8">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-sm">
                    {(student.realName || student.nickname || 'S').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-slate-900 text-base">{student.nickname}</h3>
                      {bInfo.isVerified && (
                        <VerificationBadge
                          isVerified={bInfo.isVerified}
                          badgeType={bInfo.badgeType}
                          title={bInfo.badgeTitle}
                          size={14}
                          showTitle={true}
                        />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {isGuestAccount(student) ? 'Guest Account Registration Record' : 'Complete Student Registration Record'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStudentForView(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Record details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Username</span>
                  <span className="font-bold text-slate-900 text-sm">{student.nickname}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Account Type</span>
                  <span className="font-bold text-teal-800">{isGuestAccount(student) ? 'Guest' : (student.accountType || 'Student')}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Full Real Name</span>
                  <span className="font-bold text-slate-900">{student.realName || 'Not Provided'}</span>
                </div>
                {!isGuestAccount(student) && (
                  <>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Matriculation Number</span>
                      <span className="font-mono font-bold text-slate-900">{student.matricNumber || 'Not Provided'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Department</span>
                      <span className="font-bold text-slate-900">{student.department || 'Not Provided'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Academic Level</span>
                      <span className="font-bold text-slate-900">{student.level || 'Not Provided'}</span>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Email Address</span>
                  <span className="font-mono text-slate-800 break-all">{student.studentEmail || 'Not Provided'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">
                    {isGuestAccount(student) ? 'Phone Number' : 'Emergency Phone'}
                  </span>
                  <span className="font-bold text-teal-800 font-mono">{student.emergencyHomePhone || 'Not Provided'}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">
                    {isGuestAccount(student) ? 'Biography / Profile Notes' : 'Student Biography'}
                  </span>
                  <p className="text-slate-700 italic mt-0.5 whitespace-pre-wrap">{student.bio || 'No biography entered yet.'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Registration Status</span>
                  <span className={`inline-block mt-0.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                    student.isApproved
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {student.isApproved ? 'Approved Member' : 'Pending Approval'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Verification Status</span>
                  <span className={`inline-block mt-0.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                    bInfo.isVerified
                      ? 'bg-sky-100 text-sky-900 border-sky-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}>
                    {bInfo.isVerified ? `Verified (${bInfo.badgeType}${bInfo.badgeTitle ? ` - ${bInfo.badgeTitle}` : ''})` : 'Not Verified / Standard'}
                  </span>
                </div>
              </div>

              {/* Actions toolbar inside modal */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const nick = student.nickname;
                    const real = student.realName;
                    const email = student.studentEmail;
                    setSelectedStudentForView(null);
                    handleOpenQueryModal(nick, real, email, 'Account Review');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <MessageSquare size={13} />
                  <span>Send Official Update / Query</span>
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  {!student.isApproved ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleApproveRegistration(student.id, student.nickname);
                        setSelectedStudentForView((prev) => prev ? { ...prev, isApproved: true } : null);
                      }}
                      className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 size={13} />
                      <span>Approve Registration</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        handleDeclineRegistration(student.id, student.nickname);
                        setSelectedStudentForView((prev) => prev ? { ...prev, isApproved: false } : null);
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <AlertCircle size={13} />
                      <span>Revoke Approval</span>
                    </button>
                  )}

                  {bInfo.isVerified && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to completely revoke verification for ${student.nickname}? This will remove the verification badge platform-wide.`)) {
                          onRevokeVerification?.(student.nickname || student.id);
                          setSelectedStudentForView((prev) => prev ? { ...prev, isVerified: false, badgeType: 'NONE', badgeTitle: '' } : null);
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <XCircle size={13} />
                      <span>Revoke Verification</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentForView(null);
                      handleDeleteUserAccount(student.id, student.nickname);
                    }}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer"
                    title="Permanently erase account"
                  >
                    <Trash2 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedStudentForView(null)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: FULL VERIFICATION APPLICATION DETAILS & BADGE CONTROLS */}
      {selectedReqForView && (() => {
        const req = selectedReqForView;
        const currentBadgeColor = selectedReqColors[req.id] || req.assignedBadgeType || 'GREEN';
        const currentBadgeTitle = selectedReqTitles[req.id] !== undefined
          ? selectedReqTitles[req.id]
          : (req.assignedBadgeTitle !== undefined && req.assignedBadgeTitle !== ''
              ? req.assignedBadgeTitle
              : (req.positionTitle || ''));

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-8">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 font-bold flex items-center justify-center">
                    <Shield className="w-5 h-5 text-sky-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-slate-900 text-base">{req.applicantNickname}</h3>
                      <VerificationBadge
                        isVerified={req.status === 'APPROVED'}
                        badgeType={currentBadgeColor}
                        title={currentBadgeTitle}
                        size={15}
                        showTitle={true}
                      />
                    </div>
                    <p className="text-xs text-slate-500 font-medium">Verification Subscription Application Dossier</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReqForView(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Application Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Applicant</span>
                  <span className="font-bold text-slate-900 text-sm">{req.applicantNickname}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Account Type</span>
                  <span className="font-bold text-slate-800">{req.accountType || 'Student'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Real Name</span>
                  <span className="font-bold text-slate-900">{req.realName || 'Not Provided'}</span>
                </div>
                {req.accountType !== 'Guest' && (
                  <>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Matric Number</span>
                      <span className="font-mono font-bold text-slate-900">{req.matricNumber || 'Not Provided'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Department</span>
                      <span className="font-bold text-slate-900">{req.department || 'Not Provided'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Level</span>
                      <span className="font-bold text-slate-900">{req.level || 'Not Provided'}</span>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Payment Reference</span>
                  <span className="font-mono font-bold text-emerald-800">{req.paymentRef || 'PAY-VERIF-SUCCESS'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Amount Paid</span>
                  <span className="font-bold text-emerald-700">₦{(req.amountPaid || adminVerificationFee).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Position / Title Tendered</span>
                  <span className="font-bold text-teal-900">{req.positionTitle || 'Standard Verified Student'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Application Date</span>
                  <span className="font-medium text-slate-700">{req.timestamp || 'Recent'}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Verification Statement / Portfolio Proof</span>
                  <p className="text-slate-700 italic mt-0.5 bg-white p-2.5 rounded-lg border border-slate-200">
                    "{req.statement || 'No additional statement provided.'}"
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Current Status</span>
                  <span className={`inline-block mt-0.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                    req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                    req.status === 'REVOKED' ? 'bg-orange-100 text-orange-900 border-orange-300' :
                    req.status === 'DECLINED' || req.status === 'REJECTED' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                    'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {req.status === 'APPROVED' ? 'Approved & Active' : req.status === 'REVOKED' ? 'Revoked' : req.status === 'DECLINED' || req.status === 'REJECTED' ? 'Declined' : 'Pending Review'}
                  </span>
                </div>
              </div>

              {/* Badge Color & Title Assignment Controls */}
              <div className="bg-sky-50/70 p-3.5 rounded-xl border border-sky-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-sky-950 flex items-center gap-1.5">
                    <Award size={14} className="text-sky-700" />
                    <span>Assign Verification Badge & Custom Title</span>
                  </h4>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500 font-semibold">Preview:</span>
                    <VerificationBadge
                      isVerified={true}
                      badgeType={currentBadgeColor}
                      title={currentBadgeTitle}
                      size={15}
                      showTitle={Boolean(currentBadgeTitle)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Badge Color</label>
                    <select
                      value={currentBadgeColor}
                      onChange={(e) => {
                        const newColor = e.target.value as BadgeType;
                        setSelectedReqColors((prev) => ({ ...prev, [req.id]: newColor }));
                      }}
                      className="w-full bg-white text-xs rounded-xl border border-slate-300 p-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="GREEN">Green (Campus Leader / Standard)</option>
                      <option value="BLUE">Blue (Honor / General Verified)</option>
                      <option value="GOLD">Gold (Executive / High Achievement)</option>
                      <option value="ORANGE">Orange (Department Representative)</option>
                      <option value="PURPLE">Purple (Distinguished Scholar)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Title (Optional)</label>
                    <input
                      type="text"
                      value={currentBadgeTitle}
                      onChange={(e) => {
                        const newTitle = e.target.value;
                        setSelectedReqTitles((prev) => ({ ...prev, [req.id]: newTitle }));
                      }}
                      placeholder="e.g. SUG President, 400L Class Rep..."
                      className="w-full bg-white text-xs rounded-xl border border-slate-300 p-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const nick = req.applicantNickname;
                    const real = req.realName;
                    setSelectedReqForView(null);
                    handleOpenQueryModal(nick, real, undefined, 'Verification Update');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <MessageSquare size={13} />
                  <span>Send Official Update / Query</span>
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  {req.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                          onUpdateVerificationRequestStatus(req.id, 'APPROVED');
                          setSelectedReqForView((prev) => prev ? { ...prev, status: 'APPROVED', assignedBadgeType: currentBadgeColor, assignedBadgeTitle: currentBadgeTitle.trim() } : null);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 size={13} />
                        <span>Approve & Grant Badge</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onUpdateVerificationRequestStatus(req.id, 'DECLINED');
                          setSelectedReqForView((prev) => prev ? { ...prev, status: 'DECLINED' } : null);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Decline Request
                      </button>
                    </>
                  )}

                  {req.status === 'APPROVED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                          alert(`Updated badge assignment to ${currentBadgeColor} with title "${currentBadgeTitle.trim()}".`);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                      >
                        Save Badge Changes
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to revoke verification and remove the active badge for ${req.applicantNickname}?`)) {
                            onRevokeVerification(req.id);
                            onUpdateVerificationRequestStatus(req.id, 'REVOKED');
                            setSelectedReqForView((prev) => prev ? { ...prev, status: 'REVOKED', assignedBadgeType: 'NONE', assignedBadgeTitle: '' } : null);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle size={13} />
                        <span>Revoke Verification</span>
                      </button>
                    </>
                  )}

                  {req.status === 'REVOKED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                          onUpdateVerificationRequestStatus(req.id, 'APPROVED');
                          setSelectedReqForView((prev) => prev ? { ...prev, status: 'APPROVED', assignedBadgeType: currentBadgeColor, assignedBadgeTitle: currentBadgeTitle.trim() } : null);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 size={13} />
                        <span>Reassign & Approve</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Permanently delete this verification record for ${req.applicantNickname}? This cannot be undone.`)) {
                            onDeleteVerification(req.id);
                            setSelectedReqForView(null);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Delete Permanently</span>
                      </button>
                    </>
                  )}

                  {(req.status === 'DECLINED' || req.status === 'REJECTED') && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                          onUpdateVerificationRequestStatus(req.id, 'APPROVED');
                          setSelectedReqForView((prev) => prev ? { ...prev, status: 'APPROVED', assignedBadgeType: currentBadgeColor, assignedBadgeTitle: currentBadgeTitle.trim() } : null);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 size={13} />
                        <span>Approve Verification</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Permanently delete this verification record for ${req.applicantNickname}? This cannot be undone.`)) {
                            onDeleteVerification(req.id);
                            setSelectedReqForView(null);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Delete Record</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedReqForView(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: FULL HELP DESK TICKET DETAILS */}
      {selectedTicketForView && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 font-bold flex items-center justify-center">
                  <LifeBuoy className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Ticket {selectedTicketForView.ticketId}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {selectedTicketForView.categoryLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketForView(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Student Name</span>
                <span className="font-bold text-slate-900 text-sm">{selectedTicketForView.fullName}</span>
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Username</span>
                <span className="font-bold text-teal-800">{selectedTicketForView.nickname || 'Not Provided'}</span>
              </div>
              {selectedTicketForView.matricNumber && (
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Matric Number</span>
                  <span className="font-mono font-bold text-slate-900">{selectedTicketForView.matricNumber}</span>
                </div>
              )}
              {selectedTicketForView.department && (
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Department</span>
                  <span className="font-bold text-slate-900">{selectedTicketForView.department}</span>
                </div>
              )}
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Email Address</span>
                <span className="font-mono text-slate-800 break-all">{selectedTicketForView.email}</span>
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Current Status</span>
                <span className={`inline-block mt-0.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                  selectedTicketForView.status === 'RESOLVED'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-purple-100 text-purple-900 border-purple-300'
                }`}>
                  {selectedTicketForView.status === 'RESOLVED' ? 'Resolved' : 'Pending Review'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Student Statement / Appeal</span>
                <p className="text-slate-800 font-medium mt-1 bg-white p-3 rounded-xl border border-slate-200 whitespace-pre-wrap">
                  {selectedTicketForView.message}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              {selectedTicketForView.nickname && (
                <button
                  type="button"
                  onClick={() => {
                    const nick = selectedTicketForView.nickname!;
                    const name = selectedTicketForView.fullName;
                    const mail = selectedTicketForView.email;
                    const ticketId = selectedTicketForView.ticketId;
                    setSelectedTicketForView(null);
                    handleOpenQueryModal(nick, name, mail, `Help Desk [${ticketId}] Official Resolution`);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <MessageSquare size={13} />
                  <span>Send Official Update / Query</span>
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                {selectedTicketForView.status === 'PENDING' ? (
                  <button
                    type="button"
                    onClick={() => {
                      updateHelpDeskInquiryStatus(selectedTicketForView.id, 'RESOLVED', 'Resolved by Admin');
                      setSelectedTicketForView((prev) => prev ? { ...prev, status: 'RESOLVED' } : null);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 size={13} />
                    <span>Mark as Resolved</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      updateHelpDeskInquiryStatus(selectedTicketForView.id, 'PENDING');
                      setSelectedTicketForView((prev) => prev ? { ...prev, status: 'PENDING' } : null);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Re-open Ticket
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTicketForView(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
