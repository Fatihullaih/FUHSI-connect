import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, Post, CampusNotification } from '../types';
import { Bell, ShieldCheck, Sparkles, MessageSquare, Heart, CheckCheck, Megaphone, Building2, Landmark, Shield, UserPlus, Users } from 'lucide-react';
import { isUserMatchingAudience, isFacultyTarget } from '../utils/audienceUtils';
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

interface NotificationScreenProps {
  userProfile: UserProfile;
  allPosts?: Post[];
  onSelectPost?: (post: Post) => void;
  onOpenTradeChat?: (convId?: string) => void;
  onOpenFollowersDirectory?: () => void;
}

export const NotificationScreen: React.FC<NotificationScreenProps> = ({ 
  userProfile, 
  allPosts = [], 
  onSelectPost,
  onOpenTradeChat,
  onOpenFollowersDirectory,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'TARGETED' | 'UNREAD' | 'OFFICIAL' | 'INTERACTIONS'>('ALL');
  const [readNotifIds, setReadNotifIds] = useState<Record<string, boolean>>(() => {
    return userProfile?.nickname ? getReadNotificationIds(userProfile.nickname) : {};
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  // Base platform notifications
  const baseNotifications: CampusNotification[] = useMemo(() => [
    ...customUserNotifications,
  ], [customUserNotifications]);

  // Dynamically compute targeted announcements for posts directed at the user's registered department/faculty
  const targetedNotifications: CampusNotification[] = useMemo(() => {
    const list: CampusNotification[] = [];
    allPosts.forEach((p) => {
      const target = p.targetDepartment;
      if (!target || target === 'General Campus' || target === 'General') return;

      if (isUserMatchingAudience(userProfile.department, target)) {
        const isFaculty = isFacultyTarget(target);
        const snippet = p.content.length > 90 ? `${p.content.substring(0, 90)}...` : p.content;

        list.push({
          id: `targeted_notif_${p.id}`,
          type: isFaculty ? 'TARGETED_FACULTY' : 'TARGETED_DEPT',
          title: isFaculty ? `🏛️ Faculty Notice: ${target}` : `📢 Department Alert: ${target}`,
          message: `${p.authorNickname} posted for ${target}: "${snippet}"`,
          timestamp: p.timestamp || 'Recent',
          isRead: Boolean(readNotifIds[`targeted_notif_${p.id}`]),
          targetDepartment: target,
          postId: p.id,
        });
      }
    });
    return list;
  }, [allPosts, userProfile.department, readNotifIds]);

  // Combine base notifications and targeted announcements
  const allCombinedNotifications: CampusNotification[] = useMemo(() => {
    const combined = [...targetedNotifications, ...baseNotifications];
    return combined.map((n) => {
      const isMarkedReadInState = readNotifIds[n.id];
      const effectiveIsRead = isMarkedReadInState !== undefined ? isMarkedReadInState : Boolean(n.isRead);
      return {
        ...n,
        isRead: effectiveIsRead,
      };
    });
  }, [targetedNotifications, baseNotifications, readNotifIds]);

  const handleMarkAllRead = () => {
    const updated: Record<string, boolean> = {};
    const allIds = allCombinedNotifications.map((n) => n.id);
    allIds.forEach((id) => {
      updated[id] = true;
    });
    setReadNotifIds(updated);
    setAllNotificationIdsRead(userProfile.nickname, allIds);
    markAllNotificationsAsRead(userProfile.nickname);
  };

  const handleNotificationClick = (n: CampusNotification) => {
    // Mark as read immediately when clicked
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

    if (n.type === 'FOLLOW' || n.actionType === 'VIEW_FOLLOWERS') {
      if (onOpenFollowersDirectory) {
        onOpenFollowersDirectory();
      }
      return;
    }

    if (n.postId && onSelectPost) {
      const matchingPost = allPosts.find((p) => p.id === n.postId);
      if (matchingPost) {
        onSelectPost(matchingPost);
      }
    }
  };

  const filtered = allCombinedNotifications.filter((n) => {
    if (filter === 'UNREAD') return !n.isRead;
    if (filter === 'TARGETED') return n.type === 'TARGETED_DEPT' || n.type === 'TARGETED_FACULTY';
    if (filter === 'OFFICIAL') return n.type === 'ADMIN' || n.type === 'VERIFICATION' || (n.type as any) === 'CONVERSION';
    if (filter === 'INTERACTIONS') return n.type === 'LIKE' || n.type === 'COMMENT' || n.type === 'FOLLOW';
    return true;
  });

  const unreadCount = allCombinedNotifications.filter((n) => !n.isRead).length;
  const targetedCount = targetedNotifications.length;
  const officialCount = allCombinedNotifications.filter((n) => n.type === 'ADMIN' || n.type === 'VERIFICATION' || (n.type as any) === 'CONVERSION').length;
  const interactionsCount = allCombinedNotifications.filter((n) => n.type === 'LIKE' || n.type === 'COMMENT' || n.type === 'FOLLOW').length;

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
                {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'} requiring attention` : 'All caught up! No unread notifications'}
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

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-bold">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              filter === 'ALL'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({allCombinedNotifications.length})
          </button>
          <button
            onClick={() => setFilter('TARGETED')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
              filter === 'TARGETED'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200/60'
            }`}
          >
            <Building2 size={13} />
            <span>Targeted ({targetedCount})</span>
          </button>
          <button
            onClick={() => setFilter('UNREAD')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              filter === 'UNREAD'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('OFFICIAL')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              filter === 'OFFICIAL'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Official & Updates ({officialCount})
          </button>
          {interactionsCount > 0 && (
            <button
              onClick={() => setFilter('INTERACTIONS')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                filter === 'INTERACTIONS'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Heart size={13} />
              <span>Interactions ({interactionsCount})</span>
            </button>
          )}
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
                className={`p-4 transition-all cursor-pointer flex items-start gap-3 hover:bg-slate-50/80 ${
                  !n.isRead ? 'bg-teal-50/40 border-l-4 border-l-teal-600' : ''
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {n.type === 'TARGETED_DEPT' && (
                    <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center border border-teal-200 shadow-2xs">
                      <Building2 size={18} />
                    </div>
                  )}
                  {n.type === 'TARGETED_FACULTY' && (
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center border border-indigo-200 shadow-2xs">
                      <Landmark size={18} />
                    </div>
                  )}
                  {(n.type === 'VERIFICATION' || (n.type as any) === 'CONVERSION') && (
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
                      <ShieldCheck size={18} />
                    </div>
                  )}
                  {n.type === 'ADMIN' && (
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                      <Megaphone size={18} />
                    </div>
                  )}
                  {n.type === 'LIKE' && (
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center border border-rose-200">
                      <Heart size={18} />
                    </div>
                  )}
                  {n.type === 'COMMENT' && (
                    <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center border border-sky-200">
                      <MessageSquare size={18} />
                    </div>
                  )}
                  {n.type === 'MARKET' && (
                    <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center border border-purple-200">
                      <Sparkles size={18} />
                    </div>
                  )}
                  {n.type === 'FOLLOW' && (
                    <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center border border-teal-200">
                      <UserPlus size={18} />
                    </div>
                  )}
                  {n.type !== 'TARGETED_DEPT' && n.type !== 'TARGETED_FACULTY' && n.type !== 'VERIFICATION' && (n.type as any) !== 'CONVERSION' && n.type !== 'ADMIN' && n.type !== 'LIKE' && n.type !== 'COMMENT' && n.type !== 'MARKET' && n.type !== 'FOLLOW' && (
                    <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center border border-teal-200">
                      <Bell size={18} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-xs ${!n.isRead ? 'font-black text-slate-900' : 'font-bold text-slate-800'}`}>
                      {n.title}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-semibold shrink-0">{displayTime}</span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-medium whitespace-pre-line">{n.message}</p>
                  
                  {n.targetDepartment && (
                    <span className="inline-block text-[10px] font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md mt-1">
                      Audience: {n.targetDepartment}
                    </span>
                  )}

                  {(n.type === 'FOLLOW' || n.actionType === 'VIEW_FOLLOWERS') && (
                    <div className="pt-1.5">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-teal-700 bg-teal-50/90 px-2.5 py-1 rounded-lg border border-teal-200 hover:bg-teal-100 transition-colors">
                        <Users size={12} />
                        <span>View Connections →</span>
                      </span>
                    </div>
                  )}

                  {n.postId && (
                    <div className="pt-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-teal-700 bg-teal-50/80 px-2.5 py-1 rounded-lg border border-teal-200 hover:bg-teal-100 transition-colors">
                        View Post →
                      </span>
                    </div>
                  )}
                </div>

                {!n.isRead && (
                  <div className="w-2 h-2 rounded-full bg-teal-600 shrink-0 self-center" />
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
    </div>
  );
};

