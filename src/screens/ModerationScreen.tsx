import React, { useState, useEffect } from 'react';
import { Post, Report, VerificationRequest, MarketplaceItem, UserProfile, BadgeType, DirectMessage } from '../types';
import { getStoredUsers, saveStoredUsers, isGuestAccount, markUserPermanentlyDeleted } from '../utils/userDbUtils';
import { pushServerDbSync } from '../utils/apiSync';
import { deleteUserFromFirestore, subscribeVerificationFee, saveVerificationFeeToFirestore, saveUserToFirestore } from '../lib/firestoreSync';
import { Shield, Lock, Search, Eye, CheckCircle2, XCircle, AlertTriangle, MessageSquare, Send, Award, RefreshCw, Key, Check, UserCheck, ShoppingBag, PhoneCall, AlertCircle, Mail, ShieldAlert, Info, Trash2 } from 'lucide-react';
import { VerificationBadge } from '../components/VerificationBadge';
import { AdminTradeDesk } from '../components/AdminTradeDesk';
import { AdminChatReportsDesk } from '../components/AdminChatReportsDesk';
import { INITIAL_VERIFICATION_CANDIDATES, INITIAL_USER_PROFILE } from '../data/initialData';
import { sendDirectMessage, normalizeNickname, formatMessageTime } from '../utils/messagingUtils';

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
  onUpdateVerificationRequestStatus?: (id: string, status: 'APPROVED' | 'REJECTED') => void;
  onApproveVerification?: (id: string, badgeType?: BadgeType, badgeTitle?: string) => void;
  onRejectVerification?: (id: string) => void;
  onApproveStudentConversion?: (reqId: string, applicantNickname: string, fullName: string, matricNumber: string, department: string, level: string) => void;
  onRejectStudentConversion?: (reqId: string, applicantNickname: string) => void;
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
  onApproveStudentConversion = () => {},
  onRejectStudentConversion = () => {},
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

  // Pending Student Registrations Approval State
  const [allUsersList, setAllUsersList] = useState<UserProfile[]>([]);
  const [activeUserTab, setActiveUserTab] = useState<'PENDING' | 'APPROVED' | 'ALL'>('PENDING');

  // Direct User Query / Message State
  const [queryModalUser, setQueryModalUser] = useState<{ nickname: string; realName?: string; email?: string } | null>(null);
  const [querySubject, setQuerySubject] = useState('');
  const [queryMessage, setQueryMessage] = useState('');
  const [queryToast, setQueryToast] = useState<string | null>(null);

  const handleOpenQueryModal = (nick: string, realName?: string, email?: string) => {
    setQueryModalUser({ nickname: nick, realName, email });
    setQuerySubject(`Official Council Inquiry - FUHSI Campus Verification`);
    setQueryMessage('');
  };

  const handleSendAdminQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryModalUser || !queryMessage.trim()) return;

    const targetNick = queryModalUser.nickname;
    const cleanNick = normalizeNickname(targetNick);
    const convId = `conv_${cleanNick}_council`;

    const fullMessageText = `📋 [${querySubject || 'CAMPUS COUNCIL INQUIRY'}]\n\n${queryMessage.trim()}\n\n— FUHSI Campus Council & Secretariat`;

    const newMsg: DirectMessage = {
      id: `dm_council_query_${Date.now()}`,
      conversationId: convId,
      senderNickname: userProfile?.nickname ? userProfile.nickname : 'FUHSI Campus Council',
      receiverNickname: targetNick,
      text: fullMessageText,
      timestamp: formatMessageTime(),
    };

    sendDirectMessage(newMsg);

    setQueryToast(`✓ Notice and message successfully dispatched to ${targetNick}!`);
    setQueryModalUser(null);
    setQueryMessage('');

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

      {/* PENDING STUDENT ACCOUNT REGISTRATIONS APPROVAL DESK */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 text-teal-900">
              <UserCheck className="w-4 h-4 text-teal-600" /> Student Account Management Desk ({allUsersList.filter(u => !u.isAdmin).length})
            </h2>
            <p className="text-[11px] text-slate-500">
              Review new registrations, approve matric credentials, or manage registered student accounts.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl flex-wrap">
            <button
              onClick={() => setActiveUserTab('PENDING')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                activeUserTab === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({allUsersList.filter((u) => !u.isApproved && !u.isAdmin).length})
            </button>
            <button
              onClick={() => setActiveUserTab('APPROVED')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                activeUserTab === 'APPROVED'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approved ({allUsersList.filter((u) => u.isApproved && !u.isAdmin).length})
            </button>
            <button
              onClick={() => setActiveUserTab('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                activeUserTab === 'ALL'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({allUsersList.filter((u) => !u.isAdmin).length})
            </button>
          </div>
        </div>

        {approvalToast && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
            {approvalToast}
          </div>
        )}

        {(() => {
          const displayUsers = allUsersList.filter((u) => {
            if (u.isAdmin) return false;
            if (activeUserTab === 'PENDING') return !u.isApproved;
            if (activeUserTab === 'APPROVED') return u.isApproved;
            return true;
          });

          if (displayUsers.length === 0) {
            return (
              <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <CheckCircle2 size={24} className="mx-auto text-teal-600 mb-1" />
                <p className="font-bold text-slate-800">
                  {activeUserTab === 'PENDING'
                    ? 'No pending student account registrations!'
                    : activeUserTab === 'APPROVED'
                    ? 'No approved active students found.'
                    : 'No registered student accounts found.'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  New account registrations submitted by students will automatically appear here for Admin approval.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-3">
              {displayUsers.map((user) => (
                <div key={user.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm">{user.nickname}</span>
                        {isGuestAccount(user) ? (
                          <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md">
                            Account Type: Guest
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-teal-100 text-teal-900 px-2 py-0.5 rounded-md">
                            Account Type: Student • {user.department || 'General'} ({user.level || 'Student'})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-700 font-medium mt-0.5">
                        👤 Real Name: <span className="font-bold text-slate-900">{user.realName || 'Guest User'}</span>
                      </p>
                      {isGuestAccount(user) ? (
                        <p className="text-[11px] text-slate-600">
                          Account Type: <strong className="text-amber-800 font-bold">Guest</strong> • Email: <span className="font-bold text-teal-800">{user.studentEmail || 'N/A'}</span> • Phone: <span className="font-bold text-slate-700">{user.emergencyHomePhone || 'N/A'}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-600">
                          Matric: <span className="font-mono font-bold text-slate-800">{user.matricNumber || 'N/A'}</span> • Email: <span className="font-bold text-teal-800">{user.studentEmail || `${user.nickname.replace(/^@/, '')}@fuhsi.edu.ng`}</span> • Phone: <span className="font-bold text-slate-700">{user.emergencyHomePhone || 'N/A'}</span>
                        </p>
                      )}
                    </div>

                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                      user.isApproved
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}>
                      {user.isApproved
                        ? '✅ APPROVED & ACTIVE'
                        : '⏳ PENDING APPROVAL'}
                    </span>
                  </div>

                  {user.bio && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600">
                      <span className="font-bold text-slate-800">Bio:</span> {user.bio}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => handleOpenQueryModal(user.nickname, user.realName, user.studentEmail)}
                      className="py-1.5 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center justify-center gap-1 transition-colors"
                      title="Send official inquiry or message to this student"
                    >
                      <MessageSquare size={13} />
                      <span>Message / Query</span>
                    </button>

                    {!user.isApproved ? (
                      <button
                        onClick={() => handleApproveRegistration(user.id, user.nickname)}
                        className="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <CheckCircle2 size={14} />
                        <span>Approve Account</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeclineRegistration(user.id, user.nickname)}
                        className="py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs transition-colors flex items-center gap-1"
                        title="Revoke approval and move this account back to Pending"
                      >
                        <AlertCircle size={13} />
                        <span>Revoke Approval</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteUserAccount(user.id, user.nickname)}
                      className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs transition-colors flex items-center gap-1"
                      title="Permanently erase this account from the entire platform"
                    >
                      <Trash2 size={13} />
                      <span>Delete Totally</span>
                    </button>
                  </div>
                </div>
              ))}
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
              {lookupResult.accountType !== 'Guest' ? (
                <>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">MATRICULATION NUMBER</span>
                    <span className="font-extrabold font-mono text-slate-800">{lookupResult.matricNumber || 'Not Provided'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">DEPARTMENT & LEVEL</span>
                    <span className="font-bold text-slate-800">{lookupResult.department || 'FUHSI'} ({lookupResult.level || '100L'})</span>
                  </div>
                </>
              ) : (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">STUDENT STATUS</span>
                  <span className="font-bold text-slate-500 text-xs italic">Guest Member (Non-Student)</span>
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
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-600" />
              <span>"Get Verified" Subscription Requests & Fee Desk</span>
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

        {/* Requests Queue */}
        <div className="space-y-3 pt-1">
          {verificationRequests.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              No verification subscription requests submitted yet.
            </div>
          ) : (
            verificationRequests.map((req) => {
              const isConversion = req.requestType === 'STUDENT_CONVERSION';
              const currentBadgeColor = selectedReqColors[req.id] || req.assignedBadgeType || 'BLUE';
              const currentBadgeTitle = selectedReqTitles[req.id] !== undefined ? selectedReqTitles[req.id] : (req.assignedBadgeTitle || '');

              return (
                <div 
                  key={req.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    req.status === 'APPROVED' ? 'bg-emerald-50/40 border-emerald-200' :
                    req.status === 'REJECTED' ? 'bg-rose-50/40 border-rose-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm">{req.applicantNickname}</span>
                        
                        {isConversion ? (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1">
                            <span>🎓</span>
                            <span>Guest → Student Conversion</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-900 text-white">
                            {req.accountType || 'Student'}
                          </span>
                        )}

                        {req.positionTitle && !isConversion && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 border border-teal-200">
                            Requested Title / Note: {req.positionTitle}
                          </span>
                        )}

                        <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200">
                          Ref: {req.paymentRef || 'PAY-FUHSI-OK'} (₦{req.amountPaid ? req.amountPaid.toLocaleString() : (isConversion ? '2,000' : adminVerificationFee.toLocaleString())})
                        </span>
                      </div>

                      {isConversion ? (
                        <div className="text-xs text-slate-700 font-medium mt-1.5 space-y-0.5">
                          <p>
                            👤 Full Name: <strong className="text-slate-900">{req.applicantFullName || req.applicantNickname}</strong> • Matric: <strong className="text-slate-900 font-mono">{req.matricNumber}</strong>
                          </p>
                          <p>
                            🏛️ Department: <strong className="text-teal-900">{req.department}</strong> ({req.level || '100L'}) • Contact: <span className="text-slate-600">{req.applicantEmail || req.applicantPhone || 'Provided'}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600 font-medium mt-1">
                          Matric / Reg No: <strong className="text-slate-900 font-mono">{req.matricNumber || 'Tendered'}</strong> • Statement: "{req.statement}"
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                        req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                        req.status === 'REJECTED' ? 'bg-rose-100 text-rose-900 border-rose-300' : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}>
                        {req.status === 'APPROVED' ? (isConversion ? '✔️ APPROVED & CONVERTED TO STUDENT' : '✔️ APPROVED & VERIFIED') :
                         req.status === 'REJECTED' ? (isConversion ? 'DECLINED (REMAINS GUEST)' : 'REVISION REQUESTED') : '⏳ PENDING ADMIN REVIEW'}
                      </span>
                    </div>
                  </div>

                  {/* Student Conversion Approval Actions */}
                  {isConversion && req.status === 'PENDING' && (
                    <div className="bg-white p-3.5 rounded-xl border border-purple-200/90 space-y-2.5 text-xs">
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        Applicant submitted full student credentials and paid the <strong>₦2,000</strong> conversion fee. Approving will convert this account from <strong>Guest</strong> to standard <strong>Student</strong> status (Unverified). The account is <strong>NOT</strong> automatically verified. The student must separately apply through <em>Get Verified</em> under Account Settings to gain verified-only benefits.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            onApproveStudentConversion(
                              req.id,
                              req.applicantNickname,
                              req.applicantFullName || req.applicantNickname,
                              req.matricNumber || '',
                              req.department || 'General',
                              req.level || '100L'
                            );
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <CheckCircle2 size={14} />
                          <span>Approve Student Conversion</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onRejectStudentConversion(req.id, req.applicantNickname);
                            onUpdateVerificationRequestStatus(req.id, 'REJECTED');
                          }}
                          className="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl font-extrabold text-xs transition-colors cursor-pointer"
                        >
                          Decline (Keep Guest)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Badge Assignment Controls (for regular verification requests) */}
                  {!isConversion && req.status === 'PENDING' && (
                    <div className="bg-white p-3 rounded-xl border border-slate-200/90 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Assign Badge Colour
                          </label>
                          <div className="grid grid-cols-4 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedReqColors((prev) => ({ ...prev, [req.id]: 'BLUE' }))}
                              className={`py-1.5 rounded-lg text-[10px] font-black border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                                currentBadgeColor === 'BLUE' ? 'bg-sky-50 text-sky-800 border-sky-400 ring-2 ring-sky-400/30' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                              <span>Blue</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedReqColors((prev) => ({ ...prev, [req.id]: 'GREEN' }))}
                              className={`py-1.5 rounded-lg text-[10px] font-black border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                                currentBadgeColor === 'GREEN' ? 'bg-emerald-50 text-emerald-800 border-emerald-400 ring-2 ring-emerald-400/30' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                              <span>Green</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedReqColors((prev) => ({ ...prev, [req.id]: 'ORANGE' }))}
                              className={`py-1.5 rounded-lg text-[10px] font-black border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                                currentBadgeColor === 'ORANGE' || currentBadgeColor === 'GOLD' ? 'bg-orange-50 text-orange-900 border-orange-400 ring-2 ring-orange-400/30' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                              <span>Orange</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedReqColors((prev) => ({ ...prev, [req.id]: 'PURPLE' }))}
                              className={`py-1.5 rounded-lg text-[10px] font-black border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                                currentBadgeColor === 'PURPLE' ? 'bg-purple-50 text-purple-900 border-purple-400 ring-2 ring-purple-400/30' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                              <span>Purple</span>
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Assign Custom Title / Role (Optional)
                          </label>
                          <input
                            type="text"
                            value={currentBadgeTitle}
                            onChange={(e) => setSelectedReqTitles((prev) => ({ ...prev, [req.id]: e.target.value }))}
                            placeholder="Leave empty for badge only (or enter custom title)"
                            className="w-full text-xs rounded-xl border border-slate-300 p-2 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            If left blank, user gets only the verified badge with no title text.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-500">Live Preview:</span>
                          <VerificationBadge isVerified badgeType={currentBadgeColor} title={currentBadgeTitle.trim()} showTitle={Boolean(currentBadgeTitle.trim())} />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onApproveVerification(req.id, currentBadgeColor, currentBadgeTitle.trim());
                            }}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <CheckCircle2 size={14} />
                            <span>Approve Verification</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onRejectVerification(req.id);
                              onUpdateVerificationRequestStatus(req.id, 'REJECTED');
                            }}
                            className="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl font-extrabold text-xs transition-colors cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
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
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 text-rose-700">
          <AlertTriangle className="w-4 h-4" /> Flagged Community Posts Queue ({flaggedPosts.length})
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
                  <span>Dispatch Query to Student</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
