import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, Post, CampusNotification } from '../types';
import { 
  Bell, 
  ShieldCheck, 
  Sparkles, 
  MessageSquare, 
  Heart, 
  CheckCheck, 
  Megaphone, 
  UserPlus, 
  X, 
  Clock,
  Shield
} from 'lucide-react';
import { 
  normalizeNickname, 
  formatMessageTime,
  getReadNotificationIds,
  setReadNotificationId,
  setAllNotificationIdsRead,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUserNotifications,
  isChatMessageNotification
} from '../utils/messagingUtils';

export function getAdminDeskForNotification(n: CampusNotification | null): { deskId: string; tab?: string } | null {
  if (!n) return null;
  const str = `${n.type || ''} ${n.actionType || ''} ${n.title || ''} ${n.message || ''}`.toLowerCase();
  if (str.includes('verif') || str.includes('badge') || str.includes('subscription') || str.includes('payment review') || str.includes('get verified')) {
    return { deskId: 'verification-requests-desk', tab: 'PENDING' };
  }
  if (str.includes('student account') || str.includes('registration') || str.includes('matric') || str.includes('new student') || str.includes('account approval') || str.includes('pending approval')) {
    return { deskId: 'student-accounts-desk', tab: 'PENDING' };
  }
  if (str.includes('marketplace') || str.includes('listing') || str.includes('trade') || str.includes('price review') || str.includes('trade desk') || str.includes('market report') || str.includes('trade report')) {
    return { deskId: 'marketplace-management-desk' };
  }
  if (str.includes('flagged') || str.includes('quarantine') || str.includes('post report') || str.includes('community post') || str.includes('flagged post') || str.includes('content moderation')) {
    return { deskId: 'flagged-posts-desk' };
  }
  if (str.includes('chat report') || str.includes('chat moderation') || str.includes('harassment') || str.includes('chat case') || str.includes('message report')) {
    return { deskId: 'chat-moderation-desk' };
  }
  if (str.includes('help desk') || str.includes('appeal') || str.includes('inquiry') || str.includes('ticket') || str.includes('helpdesk')) {
    return { deskId: 'helpdesk-desk', tab: 'PENDING' };
  }
  return null;
}

interface NotificationScreenProps {
  userProfile: UserProfile;
  allPosts?: Post[];
  onSelectPost?: (post: Post) => void;
  onOpenTradeChat?: (convId?: string) => void;
  onOpenFollowersDirectory?: () => void;
  onNavigateToAdminDesk?: (deskId: string, tab?: string) => void;
}

export const NotificationScreen: React.FC<NotificationScreenProps> = ({ 
  userProfile, 
  allPosts = [], 
  onSelectPost,
  onOpenTradeChat,
  onOpenFollowersDirectory,
  onNavigateToAdminDesk,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'OFFICIAL'>('ALL');
  const [readNotifIds, setReadNotifIds] = useState<Record<string, boolean>>(() => {
    return userProfile?.nickname ? getReadNotificationIds(userProfile.nickname) : {};
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedNotifForModal, setSelectedNotifForModal] = useState<CampusNotification | null>(null);

  // Sync readNotifIds if userProfile changes
  useEffect(() => {
    if (userProfile?.nickname) {
      setReadNotifIds(getReadNotificationIds(userProfile.nickname));
    }
  }, [userProfile?.nickname]);

  // Listen to live platform notifications
  useEffect(() => {
    const handleUpdate = () => {
      setRefreshTrigger((prev) => prev + 1);
      if (userProfile?.nickname) {
        setReadNotifIds(getReadNotificationIds(userProfile.nickname));
      }
    };
    window.addEventListener('fuhsi_notification_received', handleUpdate);
    window.addEventListener('fuhsi_notification_read_updated', handleUpdate);
    return () => {
      window.removeEventListener('fuhsi_notification_received', handleUpdate);
      window.removeEventListener('fuhsi_notification_read_updated', handleUpdate);
    };
  }, [userProfile?.nickname]);

  // Platform notifications (strictly excluding private chat messages)
  const customUserNotifications: CampusNotification[] = useMemo(() => {
    if (!userProfile?.nickname) return [];
    const notifs = getUserNotifications(userProfile.nickname);
    return notifs.filter((n) => !isChatMessageNotification(n));
  }, [userProfile?.nickname, refreshTrigger]);

  // Combine notifications and annotate with live read/unread status
  const allNotifications: CampusNotification[] = useMemo(() => {
    return customUserNotifications.map((n) => {
      const isMarkedReadInState = readNotifIds[n.id];
      const effectiveIsRead = isMarkedReadInState !== undefined ? isMarkedReadInState : Boolean(n.isRead);
      return {
        ...n,
        isRead: effectiveIsRead,
      };
    });
  }, [customUserNotifications, readNotifIds]);

  const handleMarkAllRead = () => {
    const updated: Record<string, boolean> = {};
    const allIds = allNotifications.map((n) => n.id);
    allIds.forEach((id) => {
      updated[id] = true;
    });
    setReadNotifIds(updated);
    setAllNotificationIdsRead(userProfile.nickname, allIds);
    markAllNotificationsAsRead(userProfile.nickname);
  };

  const isFollowerNotification = (n: CampusNotification) => {
    if (!n) return false;
    const typeUpper = (n.type || '').toUpperCase();
    if (typeUpper === 'FOLLOW' || typeUpper === 'FOLLOWER' || typeUpper === 'FOLLOWERS' || typeUpper === 'NEW_FOLLOWER') return true;
    const actionUpper = (n.actionType || '').toUpperCase();
    if (actionUpper === 'VIEW_FOLLOWERS' || actionUpper === 'VIEW_CONNECTIONS' || actionUpper === 'FOLLOWERS' || actionUpper === 'FOLLOW') return true;
    const titleLower = (n.title || '').toLowerCase();
    if (titleLower.includes('follower') || titleLower.includes('follow')) return true;
    const msgLower = (n.message || '').toLowerCase();
    if (msgLower.includes('follows you') || msgLower.includes('followed you') || msgLower.includes('follow you')) return true;
    if (Array.isArray(n.followerNicknames) && n.followerNicknames.length > 0) return true;
    return false;
  };

  const handleNotificationClick = (n: CampusNotification) => {
    // 1. Mark as read immediately in state & persistent storage
    setReadNotifIds((prev) => ({ ...prev, [n.id]: true }));
    setReadNotificationId(userProfile.nickname, n.id, true);
    markNotificationAsRead(userProfile.nickname, n.id);

    const clean = normalizeNickname(userProfile.nickname);
    const key = `fuhsi_user_notifications_${clean}`;
    try {
      const stored = getUserNotifications(userProfile.nickname);
      const updatedList = stored.map((item) => (item.id === n.id ? { ...item, isRead: true } : item));
      localStorage.setItem(key, JSON.stringify(updatedList));
    } catch (e) {
      console.error(e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fuhsi_notification_read_updated', {
          detail: { nickname: userProfile.nickname, notifId: n.id },
        })
      );
    }

    // 2. Follower notifications navigate directly to connection directory
    if (isFollowerNotification(n)) {
      if (onOpenFollowersDirectory) {
        onOpenFollowersDirectory();
      }
      return;
    }

    // 3. Admin task notifications navigate directly to the relevant Admin Console desk!
    if (userProfile?.isAdmin) {
      const adminTarget = getAdminDeskForNotification(n);
      if (adminTarget) {
        if (onNavigateToAdminDesk) {
          onNavigateToAdminDesk(adminTarget.deskId, adminTarget.tab);
        } else if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('fuhsi_open_admin_desk', { detail: adminTarget })
          );
        }
        return;
      }
    }

    // 4. Any other kind of notification opens in a modal so it can be read clearly
    setSelectedNotifForModal({
      ...n,
      isRead: true,
    });
  };

  const isOfficial = (n: CampusNotification) => {
    if (isFollowerNotification(n)) return false;
    const typeUpper = (n.type || '').toUpperCase();
    return (
      typeUpper === 'ADMIN' ||
      typeUpper === 'OFFICIAL' ||
      typeUpper === 'VERIFICATION' ||
      typeUpper === 'CONVERSION' ||
      typeUpper === 'ADMIN_TRADE_DESK'
    );
  };

  const getCleanTitle = (n: CampusNotification) => {
    let t = n.title || 'Notification';
    if (t.toLowerCase().includes('@modula') || t.toLowerCase().includes('message from admin')) {
      return 'Official Platform Update';
    }
    return t;
  };

  const getCleanMessage = (n: CampusNotification) => {
    let m = n.message || '';
    m = m.replace(/@modula\s+sent you a message/gi, 'Official update');
    m = m.replace(/Message from Admin/gi, 'Official Platform Update');
    m = m.replace(/—\s*FUHSI Campus Council & Secretariat/gi, '— FUHSI Connect Administration');
    return m;
  };

  const filtered = allNotifications.filter((n) => {
    if (filter === 'OFFICIAL') return isOfficial(n);
    return true;
  });

  const unreadCount = allNotifications.filter((n) => !n.isRead).length;
  const officialCount = allNotifications.filter(isOfficial).length;

  const renderIcon = (n: CampusNotification, size = 18) => {
    if (isFollowerNotification(n)) {
      return <UserPlus size={size} className="text-teal-700" />;
    }
    switch (n.type as string) {
      case 'VERIFICATION':
      case 'CONVERSION':
        return <ShieldCheck size={size} className="text-emerald-700" />;
      case 'ADMIN':
      case 'ADMIN_TRADE_DESK':
        return <Megaphone size={size} className="text-amber-700" />;
      case 'LIKE':
        return <Heart size={size} className="text-rose-600" />;
      case 'COMMENT':
        return <MessageSquare size={size} className="text-sky-600" />;
      case 'MARKET':
        return <Sparkles size={size} className="text-purple-600" />;
      case 'FOLLOW':
        return <UserPlus size={size} className="text-teal-700" />;
      default:
        return <Bell size={size} className="text-teal-700" />;
    }
  };

  const renderIconBg = (n: CampusNotification) => {
    if (isFollowerNotification(n)) {
      return 'bg-teal-100 border-teal-200';
    }
    switch (n.type as string) {
      case 'VERIFICATION':
      case 'CONVERSION':
        return 'bg-emerald-100 border-emerald-200';
      case 'ADMIN':
      case 'ADMIN_TRADE_DESK':
        return 'bg-amber-100 border-amber-200';
      case 'LIKE':
        return 'bg-rose-100 border-rose-200';
      case 'COMMENT':
        return 'bg-sky-100 border-sky-200';
      case 'MARKET':
        return 'bg-purple-100 border-purple-200';
      case 'FOLLOW':
        return 'bg-teal-100 border-teal-200';
      default:
        return 'bg-teal-100 border-teal-200';
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-4 pb-24">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700 relative">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 tracking-tight">Campus Notifications</h1>
              <p className="text-xs text-slate-500 font-medium">
                {unreadCount > 0 
                  ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` 
                  : 'All caught up! No unread notifications'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="p-2 rounded-xl text-xs font-bold text-teal-700 hover:bg-teal-50 flex items-center gap-1 transition-all cursor-pointer"
                title="Mark all as read"
              >
                <CheckCheck size={16} />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs: All & Official */}
        <div className="flex items-center gap-1.5 pt-1 text-xs font-bold">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
              filter === 'ALL'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({allNotifications.length})
          </button>
          <button
            onClick={() => setFilter('OFFICIAL')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
              filter === 'OFFICIAL'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Official & Updates ({officialCount})
          </button>
        </div>
      </div>

      {/* Notifications List */}
      {filtered.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
          {filtered.map((n) => {
            const displayTime = formatMessageTime(n.timestamp);

            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-4 transition-all cursor-pointer flex items-start gap-3 border-l-4 ${
                  !n.isRead 
                    ? 'bg-teal-50/40 border-l-teal-600 hover:bg-teal-50/70' 
                    : 'bg-white border-l-transparent hover:bg-slate-50/80'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs ${renderIconBg(n)}`}>
                    {renderIcon(n, 18)}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-xs leading-snug ${!n.isRead ? 'font-black text-slate-900' : 'font-semibold text-slate-800'}`}>
                      {getCleanTitle(n)}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-semibold shrink-0">{displayTime}</span>
                  </div>

                  <p className={`text-xs leading-relaxed line-clamp-2 ${!n.isRead ? 'text-slate-700 font-medium' : 'text-slate-500 font-normal'}`}>
                    {getCleanMessage(n)}
                  </p>
                </div>

                {userProfile?.isAdmin && getAdminDeskForNotification(n) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNotificationClick(n);
                      const target = getAdminDeskForNotification(n);
                      if (target && onNavigateToAdminDesk) {
                        onNavigateToAdminDesk(target.deskId, target.tab);
                      }
                    }}
                    className="self-center px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] shrink-0 transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                    title="Open directly in Admin Console"
                  >
                    <Shield size={11} className="fill-slate-950" />
                    <span className="hidden sm:inline">Open Desk</span>
                  </button>
                )}

                {!n.isRead && (
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-600 shrink-0 self-center shadow-xs" title="Unread" />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
          <Bell className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="text-sm font-extrabold text-slate-800">No notifications</h3>
          <p className="text-xs text-slate-500">You don't have any notifications under this filter.</p>
        </div>
      )}

      {/* Pop-up Modal to view notification clearly */}
      {selectedNotifForModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedNotifForModal(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-xs ${renderIconBg(selectedNotifForModal)}`}>
                  {renderIcon(selectedNotifForModal, 22)}
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 leading-tight">
                    {getCleanTitle(selectedNotifForModal)}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-0.5">
                    <Clock size={12} />
                    <span>{formatMessageTime(selectedNotifForModal.timestamp)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedNotifForModal(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                aria-label="Close notification"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content / Full Message */}
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              <p className="text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                {getCleanMessage(selectedNotifForModal)}
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
              {userProfile?.isAdmin && getAdminDeskForNotification(selectedNotifForModal) ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = getAdminDeskForNotification(selectedNotifForModal);
                    setSelectedNotifForModal(null);
                    if (target && onNavigateToAdminDesk) {
                      onNavigateToAdminDesk(target.deskId, target.tab);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Shield size={14} className="fill-slate-950" />
                  <span>Open in Admin Console →</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setSelectedNotifForModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
