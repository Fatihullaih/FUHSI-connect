import React, { useState, useMemo, useEffect } from 'react';
import { Post, Comment, BadgeType, UserProfile, FollowRecord } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { PostCard } from './PostCard';
import { ProfilePictureModal } from './ProfilePictureModal';
import { FollowersListModal } from './FollowersListModal';
import { useBackHandler, NAV_PRIORITY, pushNavState, navigateBack } from '../utils/navigationStack';
import { formatRelativeTime, getTimestampMs } from '../utils/dateUtils';
import { calculateUserPoints } from '../utils/reputationUtils';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount, findUserByNickname, isModulaAccount, formatJoinDate, isUserPermanentlyDeleted, resolveUserIdentity, getUserAllHandleAliases, doesRecordBelongToUser, normalizeNicknameHandle } from '../utils/userDbUtils';
import { isUserFollowing, getFollowersCount, getFollowingCount, normalizeHandle } from '../utils/followUtils';
import { canViewerSeeOnlineStatus, isUserOnline } from '../utils/presenceUtils';
import { LinkifiedText } from './LinkifiedText';
import { 
  X, 
  ArrowLeft,
  AlertTriangle,
  Award, 
  Calendar, 
  UserCheck, 
  UserPlus,
  Users,
  FileText, 
  MessageSquare,
  Lock,
  ArrowRight,
  Radio,
  UserX
} from 'lucide-react';

interface AuthorProfileModalProps {
  authorId?: string;
  authorNickname: string;
  authorAvatarKey?: string;
  authorAvatarUrl?: string;
  authorBadgeType?: BadgeType;
  authorBadgeTitle?: string;
  authorBio?: string;
  authorIsVerified?: boolean;
  authorPoints?: number;
  authorJoinedDate?: string;
  currentUserNickname?: string;
  userProfile?: UserProfile | null;
  allPosts?: Post[];
  posts?: Post[];
  allComments?: Comment[];
  allFollows?: FollowRecord[];
  allUsers?: UserProfile[];
  zIndex?: number;
  onClose: () => void;
  onLikeClick?: (post: Post) => void;
  onBookmarkClick?: (post: Post) => void;
  onCommentClick?: (post: Post) => void;
  onAuthorClick?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onEditPost?: (postId: string, newContent: string) => void;
  onStartChat?: (recipientNickname: string, recipientAvatarKey?: string, recipientAvatarUrl?: string) => void;
  onToggleFollow?: (targetNickname: string) => void;
  onRepost?: (post: Post) => void;
  onUndoRepost?: (post: Post) => void;
  onQuote?: (post: Post, caption: string) => void;
  onSelectPost?: (post: Post) => void;
}

export const AuthorProfileModal: React.FC<AuthorProfileModalProps> = (props) => {
  const {
    authorId,
    authorNickname,
    authorAvatarKey = 'caduceus',
    authorAvatarUrl,
    authorBadgeType = 'NONE',
    authorBadgeTitle = '',
    authorIsVerified = false,
    authorPoints,
    authorJoinedDate,
    currentUserNickname,
    userProfile,
    allPosts = [],
    posts = [],
    allComments = [],
    allFollows = [],
    allUsers = [],
    zIndex,
    onClose,
    onLikeClick,
    onBookmarkClick,
    onCommentClick,
    onAuthorClick,
    onDeletePost,
    onDeleteComment,
    onEditPost,
    onStartChat,
    onToggleFollow,
    onRepost,
    onUndoRepost,
    onQuote,
    onSelectPost,
  } = props;

  const [activeTab, setActiveTab] = useState<'threads' | 'replies'>('threads');
  const [showPictureModal, setShowPictureModal] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState<{ open: boolean; tab: 'followers' | 'following' } | null>(null);
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);

  const isViewerModula = useMemo(() => {
    if (isModulaAccount(userProfile) || isModulaAccount(currentUserNickname)) {
      return true;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('fuhsi_active_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (isModulaAccount(u)) return true;
        }
      }
    } catch {}
    return false;
  }, [userProfile, currentUserNickname]);

  useBackHandler(
    'author_picture_modal',
    NAV_PRIORITY.SUBMODAL,
    showPictureModal,
    () => setShowPictureModal(false)
  );

  useBackHandler(
    'author_followers_modal',
    NAV_PRIORITY.SUBPAGE,
    Boolean(showFollowersModal),
    () => setShowFollowersModal(null)
  );

  const handleOpenPictureModal = () => {
    setShowPictureModal(true);
    pushNavState({ type: 'author_picture', author: authorNickname });
  };

  const handleOpenFollowersModal = (tab: 'followers' | 'following') => {
    setShowFollowersModal({ open: true, tab });
    pushNavState({ type: 'author_followers', author: authorNickname, tab });
  };

  const [profileTick, setProfileTick] = useState(0);
  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileTick((t) => t + 1);
    };
    window.addEventListener('fuhsi_profile_updated', handleProfileUpdate);
    window.addEventListener('fuhsi_users_updated', handleProfileUpdate);
    window.addEventListener('storage', handleProfileUpdate);
    return () => {
      window.removeEventListener('fuhsi_profile_updated', handleProfileUpdate);
      window.removeEventListener('fuhsi_users_updated', handleProfileUpdate);
      window.removeEventListener('storage', handleProfileUpdate);
    };
  }, []);

  // Resolve freshest author profile across current/previous handles and account ID
  const authorProfileUser = useMemo(() => {
    const resolved = resolveUserIdentity({ userId: authorId, nickname: authorNickname }, allUsers);
    if (resolved) return resolved;
    const rawClean = normalizeNicknameHandle(authorNickname);
    const selfAliases = userProfile ? getUserAllHandleAliases(userProfile) : new Set<string>();
    if (userProfile && ((authorId && userProfile.id === authorId) || (rawClean && selfAliases.has(rawClean)))) {
      return userProfile;
    }
    return undefined;
  }, [authorId, authorNickname, allUsers, userProfile, profileTick]);

  const effectiveAuthorNickname = authorProfileUser?.nickname || authorNickname;
  const username = effectiveAuthorNickname.startsWith('@')
    ? effectiveAuthorNickname
    : `@${effectiveAuthorNickname.replace(/\s+/g, '_').toLowerCase()}`;

  const normAuthor = normalizeNicknameHandle(effectiveAuthorNickname);
  const normCurrentUser = normalizeNicknameHandle(currentUserNickname || userProfile?.nickname || '');
  const isViewingSelf = Boolean(
    (authorProfileUser?.id && userProfile?.id && authorProfileUser.id === userProfile.id) ||
    (normCurrentUser && normAuthor && normAuthor === normCurrentUser)
  );
  const effectivePosts = (allPosts && allPosts.length > 0) ? allPosts : posts;

  const authorHandleAliases = useMemo(() => {
    const set = getUserAllHandleAliases(authorProfileUser, authorNickname);
    if (normAuthor) set.add(normAuthor);
    return set;
  }, [authorProfileUser, authorNickname, normAuthor, profileTick]);

  const [badgeTick, setBadgeTick] = useState(0);
  useEffect(() => {
    const handleBadgeUpdate = () => {
      setBadgeTick((t) => t + 1);
    };
    window.addEventListener('fuhsi_badge_updated', handleBadgeUpdate);
    return () => window.removeEventListener('fuhsi_badge_updated', handleBadgeUpdate);
  }, []);

  const badgeInfo = useMemo(() => {
    return getUserBadgeInfo(effectiveAuthorNickname, authorProfileUser);
  }, [effectiveAuthorNickname, authorProfileUser, badgeTick, profileTick]);

  const isVerifiedAuthor = badgeInfo.isVerified;

  const isAuthorModula = useMemo(() => {
    return isModulaAccount(authorProfileUser) || 
      isModulaAccount(effectiveAuthorNickname) || 
      isModulaAccount(username) ||
      normAuthor === 'modula';
  }, [authorProfileUser, effectiveAuthorNickname, username, normAuthor]);
  const effectiveAvatarKey = authorProfileUser?.avatarKey || authorAvatarKey || 'caduceus';
  const effectiveAvatarUrl = authorProfileUser?.avatarUrl !== undefined ? authorProfileUser.avatarUrl : authorAvatarUrl;
  const effectiveBio = useMemo(() => {
    const raw = (authorProfileUser?.bio || props.authorBio || '').trim();
    return raw.slice(0, 50);
  }, [authorProfileUser?.bio, props.authorBio]);
  const effectiveDepartment = isAuthorModula ? '' : (authorProfileUser?.department || '');
  const effectiveLevel = isAuthorModula ? '' : (authorProfileUser?.level || '');
  const effectiveJoinedDate = useMemo(() => {
    return formatJoinDate(authorProfileUser || { joinedDate: authorJoinedDate });
  }, [authorProfileUser, authorJoinedDate]);

  // Real, dynamic Following and Followers calculations (checks current + any legacy alias handles)
  const isFollowingAuthor = useMemo(() => {
    if (isUserFollowing(normCurrentUser, normAuthor, allFollows)) return true;
    return Array.from(authorHandleAliases).some((alias) => isUserFollowing(normCurrentUser, alias, allFollows));
  }, [normCurrentUser, normAuthor, authorHandleAliases, allFollows]);

  const hasAuthorFollowedBack = useMemo(() => {
    if (isUserFollowing(normAuthor, normCurrentUser, allFollows)) return true;
    return Array.from(authorHandleAliases).some((alias) => isUserFollowing(alias, normCurrentUser, allFollows));
  }, [normAuthor, normCurrentUser, authorHandleAliases, allFollows]);

  const isAuthorPrivate = Boolean(authorProfileUser?.isPrivate);
  
  // Unlocked if viewing self, admin, or if author followed viewer back AND viewer follows author
  const isPrivateLocked = useMemo(() => {
    if (!isAuthorPrivate) return false;
    if (isViewingSelf || userProfile?.isAdmin) return false;
    return !(isFollowingAuthor && hasAuthorFollowedBack);
  }, [isAuthorPrivate, isViewingSelf, userProfile?.isAdmin, isFollowingAuthor, hasAuthorFollowedBack]);

  // Online Activity Status Visibility Check
  const canSeeOnlineStatus = useMemo(() => {
    return canViewerSeeOnlineStatus(authorProfileUser, userProfile, allFollows);
  }, [authorProfileUser, userProfile, allFollows]);

  const authorIsOnline = useMemo(() => {
    if (!canSeeOnlineStatus) return false;
    return isUserOnline(authorProfileUser);
  }, [canSeeOnlineStatus, authorProfileUser]);

  const authorFollowersCount = useMemo(() => {
    return getFollowersCount(normAuthor, allFollows);
  }, [normAuthor, allFollows]);

  const authorFollowingCount = useMemo(() => {
    return getFollowingCount(normAuthor, allFollows);
  }, [normAuthor, allFollows]);

  // Find all threads written by this author (current OR previous usernames / matching authorId) or reposted by them, sorted chronologically
  const authorPosts = useMemo(() => {
    return effectivePosts
      .filter((p) => {
        if (!p || p.id.startsWith('repost_')) return false;
        if (doesRecordBelongToUser(p, authorProfileUser, effectiveAuthorNickname)) {
          return true;
        }
        const nick = normalizeNicknameHandle(p.authorNickname || p.nickname || (p as any).customNickname || '');
        if (nick && authorHandleAliases.has(nick)) return true;
        const reposters = Array.isArray(p.repostedBy)
          ? p.repostedBy.map((r) => normalizeNicknameHandle(r))
          : [];
        const hasReposted = reposters.some((r) => authorHandleAliases.has(r));
        return hasReposted;
      })
      .sort((a, b) => {
        const aTime = (Array.isArray(a.repostRecords) ? a.repostRecords.find((r) => authorHandleAliases.has(normalizeNicknameHandle(r.userNickname)))?.timestamp : null) || a.timestamp;
        const bTime = (Array.isArray(b.repostRecords) ? b.repostRecords.find((r) => authorHandleAliases.has(normalizeNicknameHandle(r.userNickname)))?.timestamp : null) || b.timestamp;
        return getTimestampMs(bTime) - getTimestampMs(aTime);
      });
  }, [effectivePosts, authorProfileUser, effectiveAuthorNickname, authorHandleAliases]);

  // Find all replies/comments made by this author across all threads
  const authorReplies = useMemo(() => {
    const list: Array<{ comment: Comment; parentPost?: Post }> = [];
    const seen = new Set<string>();

    // From allComments prop
    (allComments || []).forEach((c) => {
      const cNick = normalizeNicknameHandle(c.authorNickname || '');
      if (doesRecordBelongToUser(c, authorProfileUser, effectiveAuthorNickname) || (cNick && authorHandleAliases.has(cNick))) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          const parentPost = effectivePosts.find((p) => p.id === c.postId);
          list.push({ comment: c, parentPost });
        }
      }
    });

    // From embedded comments inside posts
    effectivePosts.forEach((p) => {
      if ((p as any).comments && Array.isArray((p as any).comments)) {
        (p as any).comments.forEach((c: Comment) => {
          const cNick = normalizeNicknameHandle(c.authorNickname || '');
          if (doesRecordBelongToUser(c, authorProfileUser, effectiveAuthorNickname) || (cNick && authorHandleAliases.has(cNick))) {
            if (!seen.has(c.id)) {
              seen.add(c.id);
              list.push({ comment: c, parentPost: p });
            }
          }
        });
      }
    });

    return list;
  }, [allComments, effectivePosts, authorProfileUser, effectiveAuthorNickname, authorHandleAliases]);

  // Calculate points dynamically based on actual activity across all aliases
  const computedPoints = useMemo(() => {
    return calculateUserPoints(
      effectiveAuthorNickname || '',
      authorProfileUser || { nickname: effectiveAuthorNickname, department: 'FUHSI' },
      effectivePosts,
      allComments
    );
  }, [effectiveAuthorNickname, authorProfileUser, effectivePosts, allComments]);

  const displayPoints = computedPoints;

  const isDeletedAccount = useMemo(() => {
    if (authorNickname === 'Account Deleted') return true;
    if (authorProfileUser && isUserPermanentlyDeleted(authorProfileUser)) return true;
    if (!authorProfileUser && isUserPermanentlyDeleted(normAuthor)) return true;
    return false;
  }, [authorProfileUser, authorNickname, normAuthor]);

  useEffect(() => {
    if (isAuthorModula) {
      onClose();
    }
  }, [isAuthorModula, onClose]);

  if (isAuthorModula) {
    return null;
  }

  if (isDeletedAccount) {
    return (
      <div 
        className="fixed inset-0 w-full h-full bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        style={{ zIndex: zIndex ?? 70 }}
      >
        <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl border border-slate-200 dark:border-slate-800">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <UserX size={32} />
          </div>
          <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">
            Account Deleted
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            This account is no longer available on FUHSI-Connect. All associated records and activity have been permanently removed.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150"
      style={{ zIndex: zIndex ?? 70 }}
    >
      <div className="w-full h-full max-w-3xl mx-auto bg-slate-50 flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 p-4 sm:p-6 text-white shrink-0 shadow-xs relative">
          <div className="flex items-center justify-between gap-3 mb-3">
            <button
              onClick={onClose}
              className="p-1.5 -ml-1 rounded-xl bg-teal-900/60 hover:bg-teal-900 text-teal-100 hover:text-white transition-colors flex items-center gap-1.5 font-bold text-xs sm:text-sm cursor-pointer"
              title="Return to previous page"
            >
              <ArrowLeft size={18} />
              <span>Back</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-teal-900/60 hover:bg-teal-900 text-teal-100 hover:text-white transition-colors cursor-pointer"
              title="Close Profile Details"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* Left Column: Avatar + Handle / Username / Join Date */}
            <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
              {/* Clickable Profile Picture for Full-size View & Download */}
              <div 
                className="relative shrink-0 cursor-pointer"
                onClick={handleOpenPictureModal}
                title="Click to view full size profile picture"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center border-2 border-teal-300/80 shadow-md overflow-hidden hover:scale-105 transition-transform">
                  <AvatarIcon
                    avatarKey={effectiveAvatarKey}
                    avatarUrl={effectiveAvatarUrl}
                    sizeClassName="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-black text-white truncate">{username}</h2>
                  <VerificationBadge 
                    isVerified={badgeInfo.isVerified} 
                    badgeType={badgeInfo.badgeType}
                    title={badgeInfo.badgeTitle}
                    size={15}
                    showTitle={false}
                  />
                  {isAuthorPrivate && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-200 bg-black/30 backdrop-blur-xs px-2 py-0.5 rounded-full border border-amber-400/40 shadow-xs">
                      <Lock size={11} />
                      <span>Private Account</span>
                    </span>
                  )}
                  {canSeeOnlineStatus && authorIsOnline && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-200 bg-emerald-950/60 border border-emerald-400/40 px-2 py-0.5 rounded-full backdrop-blur-xs shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Active</span>
                    </span>
                  )}
                  {canSeeOnlineStatus && !authorIsOnline && authorProfileUser?.lastActiveAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-teal-200/80 font-medium">
                      <span>Active {formatRelativeTime(authorProfileUser.lastActiveAt)}</span>
                    </span>
                  )}
                </div>

                {/* When account is private and locked: Non-followers only see handle and department */}
                {isPrivateLocked ? (
                  <div className="mt-1">
                    <p className="text-xs text-teal-100 font-bold truncate">
                      {effectiveDepartment || 'FUHSI Department'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5 mt-0.5">
                    {/* Short Profile Description / Bio (if present, max 50 chars, subtle & small) */}
                    {effectiveBio ? (
                      <p className="text-xs text-teal-100/90 font-normal leading-snug break-words">
                        {effectiveBio}
                      </p>
                    ) : null}

                    {/* Department • Level */}
                    {isAuthorModula ? null : isGuestAccount(authorProfileUser || authorNickname) ? (
                      <p className="text-[11px] text-teal-200/70 font-medium">
                        Guest
                      </p>
                    ) : (
                      (effectiveDepartment || effectiveLevel) && (
                        <p className="text-xs text-teal-200/90 font-semibold truncate">
                          {[effectiveDepartment, effectiveLevel].filter(Boolean).join(' • ')}
                        </p>
                      )
                    )}

                    {/* Joined Date */}
                    <p className="text-xs text-teal-100 font-medium flex items-center gap-1.5 pt-0.5">
                      <Calendar size={13} className="text-teal-300 shrink-0" />
                      <span>Joined {effectiveJoinedDate}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: [Chat] and [Follow] / [Following] Action Buttons */}
            {!isViewingSelf && (
              <div className="shrink-0 flex items-center gap-2">
                {/* Chat button only accessible if not private-locked and not guest */}
                {!isPrivateLocked && !isGuestAccount(userProfile) && !isGuestAccount(effectiveAuthorNickname) && (
                  <button
                    id={`btn-chat-with-${normAuthor}`}
                    onClick={() => {
                      if (onStartChat) {
                        onStartChat(effectiveAuthorNickname, effectiveAvatarKey, effectiveAvatarUrl);
                      }
                    }}
                    className="inline-flex items-center justify-center px-3 py-1.5 bg-white/90 hover:bg-white text-teal-950 active:scale-95 text-xs font-black rounded-xl shadow-xs transition-all border border-teal-200 cursor-pointer hover:shadow-md"
                    title={`Chat with ${effectiveAuthorNickname}`}
                  >
                    <span>💬 Chat</span>
                  </button>
                )}

                {/* Follow Button (Available for all account types: Student & Guest) */}
                <button
                  id={`btn-follow-${normAuthor}`}
                  onClick={() => {
                    if (onToggleFollow) {
                      onToggleFollow(effectiveAuthorNickname);
                    }
                  }}
                  className={`inline-flex items-center justify-center px-3.5 py-1.5 active:scale-95 text-xs font-black rounded-xl shadow-xs transition-all border cursor-pointer hover:shadow-md ${
                    isFollowingAuthor
                      ? 'bg-teal-950/80 text-teal-100 border-teal-400/80 hover:bg-rose-900/90 hover:text-white hover:border-rose-400'
                      : 'bg-white text-teal-950 hover:bg-teal-50 border-white'
                  }`}
                  title={isFollowingAuthor ? `Unfollow ${effectiveAuthorNickname}` : `Follow ${effectiveAuthorNickname}`}
                >
                  {isFollowingAuthor ? (
                    <span className="flex items-center gap-1.5">
                      <UserCheck size={13} className="text-teal-300" />
                      <span>{isPrivateLocked ? 'Requested' : 'Following'}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <UserPlus size={13} className="text-teal-700" />
                      <span>Follow</span>
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Public Stats Row & Follower Row: Hidden when account is private and locked */}
        {isPrivateLocked ? (
          <div className="bg-slate-50/90 border-b border-slate-200 py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
            <Lock size={12} className="text-amber-600" />
            <span>Activity statistics and follower lists are hidden</span>
          </div>
        ) : (
          <>
            {/* Public Stats Row: Total Threads & Points Earned */}
            <div className="bg-white border-b border-slate-200 p-3 px-5 grid grid-cols-2 text-center divide-x divide-slate-100">
              <div>
                <div className="text-base sm:text-lg font-black text-slate-900">{authorPosts.length}</div>
                <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Total Threads</div>
              </div>
              <div>
                <div className="text-base sm:text-lg font-black text-teal-700 flex items-center justify-center gap-1">
                  <Award size={16} className="text-teal-600" />
                  <span>{(displayPoints ?? 0).toLocaleString()} <span className="text-xs font-bold text-teal-600">pts</span></span>
                </div>
                <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Total Points Earned</div>
              </div>
            </div>

            {/* Real Dynamic Following & Followers Row (Calculated from actual accounts) */}
            <div className="bg-slate-50/90 border-b border-slate-200 py-2.5 px-4 flex items-center justify-center gap-3 text-xs font-black text-slate-700">
              <button
                type="button"
                onClick={() => handleOpenFollowersModal('following')}
                className="hover:text-teal-700 transition-colors cursor-pointer flex items-center gap-1 group"
              >
                <span className="text-sm font-black text-slate-900 group-hover:text-teal-700">{authorFollowingCount}</span>
                <span className="text-slate-500 group-hover:text-teal-700 font-bold">Following</span>
              </button>
              <span className="text-slate-300 font-bold">·</span>
              <button
                type="button"
                onClick={() => handleOpenFollowersModal('followers')}
                className="hover:text-teal-700 transition-colors cursor-pointer flex items-center gap-1 group"
              >
                <span className="text-sm font-black text-slate-900 group-hover:text-teal-700">{authorFollowersCount}</span>
                <span className="text-slate-500 group-hover:text-teal-700 font-bold">Followers</span>
              </button>
            </div>
          </>
        )}

        {/* When account is private and viewer is not a mutual follower or admin */}
        {isPrivateLocked ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center bg-slate-50/50">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full border border-slate-200 shadow-sm space-y-4">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto border border-amber-200 shadow-xs">
                <Lock size={32} />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-slate-900 font-black text-base">This Account is Private</h4>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Non-followers who visit this profile will only see the handle and department. Posts and replies are hidden until <span className="font-bold text-slate-800">{authorNickname}</span> follows you back.
                </p>
              </div>

              {onToggleFollow && !isViewingSelf && (
                <div className="pt-2">
                  {!isFollowingAuthor ? (
                    <button
                      type="button"
                      onClick={() => onToggleFollow(authorNickname)}
                      className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <UserPlus size={16} />
                      <span>Follow {authorNickname}</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs font-semibold flex items-center justify-center gap-2">
                        <UserCheck size={16} className="text-amber-600 shrink-0" />
                        <span>Requested — Waiting for follow back to unlock posts</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleFollow(authorNickname)}
                        className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        Cancel Follow
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Tabs Row: Threads & Replies */}
            <div className="bg-white border-b border-slate-200 flex px-4 gap-2">
          <button
            onClick={() => setActiveTab('threads')}
            className={`py-3 px-4 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'threads'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={15} />
            <span>Threads ({authorPosts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('replies')}
            className={`py-3 px-4 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'replies'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare size={15} />
            <span>Replies ({authorReplies.length})</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-3 flex-1">
          {activeTab === 'threads' && (
            authorPosts.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2 my-auto">
                <div className="w-12 h-12 bg-teal-50 text-teal-700 rounded-2xl flex items-center justify-center mx-auto border border-teal-100">
                  <UserCheck size={24} />
                </div>
                <h4 className="text-slate-800 font-bold text-sm">No Public Threads Yet</h4>
                <p className="text-slate-500 text-xs max-w-xs mx-auto">
                  {authorNickname} has earned {(displayPoints ?? 0).toLocaleString()} points on FUHSI Connect.
                </p>
              </div>
            ) : (
              authorPosts.map((post) => {
                const isOriginalAuthor =
                  doesRecordBelongToUser(post, authorProfileUser, effectiveAuthorNickname) ||
                  authorHandleAliases.has(normalizeNicknameHandle(post.authorNickname || ''));
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    repostedByNick={!isOriginalAuthor ? effectiveAuthorNickname : undefined}
                    comments={(allComments || []).filter((c) => c && c.postId === post.id)}
                    allComments={allComments}
                    currentUserNickname={currentUserNickname}
                    userProfile={userProfile}
                    onLikeClick={onLikeClick}
                    onBookmarkClick={onBookmarkClick}
                    onCommentClick={(p) => {
                      if (onCommentClick) onCommentClick(p);
                    }}
                    onAuthorClick={onAuthorClick}
                    onDeletePost={onDeletePost}
                    onEditPost={onEditPost}
                    onRepost={onRepost}
                    onUndoRepost={onUndoRepost}
                    onQuote={onQuote}
                    onSelectPost={onSelectPost}
                    onDeleteComment={onDeleteComment}
                  />
                );
              })
            )
          )}

          {activeTab === 'replies' && (
            authorReplies.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2 my-auto">
                <div className="w-12 h-12 bg-teal-50 text-teal-700 rounded-2xl flex items-center justify-center mx-auto border border-teal-100">
                  <MessageSquare size={24} />
                </div>
                <h4 className="text-slate-800 font-bold text-sm">No Replies Yet</h4>
                <p className="text-slate-500 text-xs max-w-xs mx-auto">
                  {authorNickname} hasn't commented on any discussions yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {authorReplies.map(({ comment, parentPost }) => {
                  const targetPost = parentPost || effectivePosts.find((p) => p.id === comment.postId);
                  return (
                    <div
                      key={comment.id}
                      onClick={() => {
                        if (targetPost && onCommentClick) {
                          onCommentClick(targetPost);
                        } else if (onCommentClick) {
                          const fallbackPost: Post = {
                            id: comment.postId || `post_${comment.id}`,
                            authorNickname: 'Student',
                            authorAvatarKey: 'caduceus',
                            category: 'General',
                            categoryTag: 'General',
                            content: 'Campus Thread Discussion',
                            text: '',
                            timestamp: comment.timestamp || new Date().toISOString(),
                            likesCount: 0,
                            commentsCount: 1,
                            isQuarantined: false,
                            createdAt: '',
                          };
                          onCommentClick(fallbackPost);
                        }
                      }}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200/90 text-xs space-y-2 hover:bg-teal-50/50 hover:border-teal-300 transition-all cursor-pointer group shadow-2xs"
                      title="Click to view full thread and comments"
                    >
                      <div className="flex items-center justify-between text-[11px] font-medium gap-2">
                        <div className="flex items-center gap-1.5 font-extrabold text-teal-800 truncate">
                          <MessageSquare className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span className="truncate">
                            Replying on: "{targetPost ? (targetPost.content.length > 45 ? targetPost.content.substring(0, 45) + '...' : targetPost.content) : 'Campus Thread'}"
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-teal-700 group-hover:underline font-extrabold flex items-center gap-0.5">
                            View thread & comments <ArrowRight size={10} />
                          </span>
                          {isViewerModula && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingReplyId(comment.id);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Admin Delete Reply (@modula)"
                              aria-label="Admin delete reply"
                            >
                              <X size={15} className="stroke-[2.2]" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-slate-800 font-semibold leading-relaxed pl-3.5 border-l-2 border-teal-500/50">
                        <LinkifiedText text={comment.content} />
                      </div>

                      <div className="text-[10px] text-slate-400 font-medium text-right">
                        {formatRelativeTime(comment.timestamp)}
                      </div>

                      {deletingReplyId === comment.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2 animate-in fade-in text-left"
                        >
                          <div className="flex items-center gap-2 text-rose-900 font-bold">
                            <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                            <span>Are you sure you want to delete this reply?</span>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setDeletingReplyId(null)}
                              className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-bold text-[11px] hover:bg-slate-300 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingReplyId(null);
                                if (onDeleteComment) onDeleteComment(comment.id);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-extrabold text-[11px] hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                            >
                              Yes
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
          </>
        )}

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
          >
            Close Profile
          </button>
        </div>
      </div>

      {/* Profile Picture Full-size Lightbox Modal */}
      {showPictureModal && (
        <ProfilePictureModal
          nickname={effectiveAuthorNickname}
          avatarUrl={effectiveAvatarUrl}
          avatarKey={effectiveAvatarKey}
          isOwner={false}
          onClose={navigateBack}
        />
      )}

      {/* Followers & Following List Modal */}
      {showFollowersModal && (
        <FollowersListModal
          targetNickname={effectiveAuthorNickname}
          initialTab={showFollowersModal.tab}
          allFollows={allFollows}
          allUsers={allUsers}
          currentUserNickname={currentUserNickname || userProfile?.nickname}
          onToggleFollow={onToggleFollow}
          onSelectUser={(selectedNick) => {
            navigateBack();
            if (onAuthorClick) {
              const dummyPost: Post = {
                id: `author_${selectedNick}`,
                authorNickname: selectedNick,
                authorAvatarKey: 'caduceus',
                authorBadgeType: 'NONE' as any,
                authorBadgeTitle: '',
                authorPoints: 0,
                timeAgo: '',
                category: 'General',
                categoryTag: 'General',
                content: '',
                text: '',
                timestamp: new Date().toISOString(),
                likesCount: 0,
                commentsCount: 0,
                isQuarantined: false,
                createdAt: '',
              };
              onAuthorClick(dummyPost);
            }
          }}
          onClose={navigateBack}
        />
      )}
    </div>
  );
};
