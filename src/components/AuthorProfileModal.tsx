import React, { useState, useMemo } from 'react';
import { Post, Comment, BadgeType, UserProfile, FollowRecord } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { PostCard } from './PostCard';
import { ProfilePictureModal } from './ProfilePictureModal';
import { FollowersListModal } from './FollowersListModal';
import { formatRelativeTime, getTimestampMs } from '../utils/dateUtils';
import { calculateUserPoints } from '../utils/reputationUtils';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount, findUserByNickname, isModulaAccount, formatJoinDate } from '../utils/userDbUtils';
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
  Radio
} from 'lucide-react';

interface AuthorProfileModalProps {
  authorNickname: string;
  authorAvatarKey?: string;
  authorAvatarUrl?: string;
  authorBadgeType?: BadgeType;
  authorBadgeTitle?: string;
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

  React.useEffect(() => {
    const handlePopState = () => {
      if (showFollowersModal) {
        setShowFollowersModal(null);
        return;
      }
      if (showPictureModal) {
        setShowPictureModal(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showPictureModal, showFollowersModal]);

  // Derive username format
  const username = authorNickname.startsWith('@') 
    ? authorNickname 
    : `@${authorNickname.replace(/\s+/g, '_').toLowerCase()}`;

  const normAuthor = authorNickname ? authorNickname.toLowerCase().replace(/^@/, '').trim() : '';
  const normCurrentUser = (currentUserNickname || userProfile?.nickname || '').toLowerCase().replace(/^@/, '').trim();
  const isViewingSelf = Boolean(normCurrentUser && normAuthor === normCurrentUser);
  const effectivePosts = (allPosts && allPosts.length > 0) ? allPosts : posts;

  // Resolve freshest author profile from allUsers, userProfile, or storage
  const authorProfileUser = useMemo(() => {
    if (isViewingSelf && userProfile) {
      return userProfile;
    }
    if (allUsers && allUsers.length > 0) {
      const match = allUsers.find(
        (u) => (u.nickname || '').toLowerCase().replace(/^@/, '').trim() === normAuthor
      );
      if (match) return match;
    }
    return findUserByNickname(authorNickname);
  }, [isViewingSelf, userProfile, allUsers, normAuthor, authorNickname]);

  const badgeInfo = useMemo(() => {
    return getUserBadgeInfo(authorNickname, authorProfileUser);
  }, [authorNickname, authorProfileUser]);

  const isVerifiedAuthor = badgeInfo.isVerified;

  const isAuthorModula = isModulaAccount(authorProfileUser) || isModulaAccount(authorNickname) || isModulaAccount(username);
  const effectiveAvatarKey = authorProfileUser?.avatarKey || authorAvatarKey || 'caduceus';
  const effectiveAvatarUrl = authorProfileUser?.avatarUrl !== undefined ? authorProfileUser.avatarUrl : authorAvatarUrl;
  const effectiveBio = authorProfileUser?.bio || '';
  const effectiveDepartment = isAuthorModula ? '' : (authorProfileUser?.department || '');
  const effectiveLevel = isAuthorModula ? '' : (authorProfileUser?.level || '');
  const effectiveJoinedDate = useMemo(() => {
    return formatJoinDate(authorProfileUser || { joinedDate: authorJoinedDate });
  }, [authorProfileUser, authorJoinedDate]);

  // Real, dynamic Following and Followers calculations
  const isFollowingAuthor = useMemo(() => {
    return isUserFollowing(normCurrentUser, normAuthor, allFollows);
  }, [normCurrentUser, normAuthor, allFollows]);

  const hasAuthorFollowedBack = useMemo(() => {
    return isUserFollowing(normAuthor, normCurrentUser, allFollows);
  }, [normAuthor, normCurrentUser, allFollows]);

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

  // Find all threads written by this author or reposted by them, sorted chronologically (newest first)
  const authorPosts = useMemo(() => {
    return effectivePosts
      .filter((p) => {
        if (!p || p.id.startsWith('repost_')) return false;
        const nick = (p.authorNickname || p.nickname || (p as any).customNickname || '')
          .toLowerCase()
          .replace(/^@/, '')
          .trim();
        const reposters = Array.isArray(p.repostedBy)
          ? p.repostedBy.map((r) => (r || '').toLowerCase().replace(/^@/, '').trim())
          : [];
        const hasReposted = reposters.includes(normAuthor);
        return nick === normAuthor || hasReposted;
      })
      .sort((a, b) => {
        const aTime = (Array.isArray(a.repostRecords) ? a.repostRecords.find((r) => (r.userNickname || '').toLowerCase().replace(/^@/, '').trim() === normAuthor)?.timestamp : null) || a.timestamp;
        const bTime = (Array.isArray(b.repostRecords) ? b.repostRecords.find((r) => (r.userNickname || '').toLowerCase().replace(/^@/, '').trim() === normAuthor)?.timestamp : null) || b.timestamp;
        return getTimestampMs(bTime) - getTimestampMs(aTime);
      });
  }, [effectivePosts, normAuthor]);

  // Find all replies/comments made by this author across all threads
  const authorReplies = useMemo(() => {
    const list: Array<{ comment: Comment; parentPost?: Post }> = [];
    const seen = new Set<string>();

    // From allComments prop
    (allComments || []).forEach((c) => {
      const cNick = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
      if (cNick === normAuthor) {
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
          const cNick = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
          if (cNick === normAuthor) {
            if (!seen.has(c.id)) {
              seen.add(c.id);
              list.push({ comment: c, parentPost: p });
            }
          }
        });
      }
    });

    return list;
  }, [allComments, effectivePosts, normAuthor]);

  // Calculate points dynamically based on actual activity
  const computedPoints = useMemo(() => {
    return calculateUserPoints(
      authorNickname || '',
      { nickname: authorNickname, department: 'FUHSI' },
      effectivePosts,
      allComments
    );
  }, [authorNickname, effectivePosts, allComments]);

  const displayPoints = computedPoints;

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
                onClick={() => setShowPictureModal(true)}
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
                  <h2 className="text-lg sm:text-xl font-black text-white truncate">{authorNickname}</h2>
                  <VerificationBadge 
                    isVerified={badgeInfo.isVerified} 
                    badgeType={badgeInfo.badgeType}
                    title={badgeInfo.badgeTitle}
                    showTitle 
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
                  <>
                    <p className="text-xs text-teal-200 font-bold mt-0.5">{username}</p>

                    {isAuthorModula ? null : isGuestAccount(authorProfileUser || authorNickname) ? (
                      <p className="text-[11px] text-teal-200/70 font-medium mt-0.5">
                        Guest
                      </p>
                    ) : (
                      (effectiveDepartment || effectiveLevel) && (
                        <p className="text-xs text-teal-100/90 font-semibold mt-0.5 truncate">
                          {[effectiveDepartment, effectiveLevel].filter(Boolean).join(' • ')}
                        </p>
                      )
                    )}

                    <p className="text-xs text-teal-100 font-medium mt-1 flex items-center gap-1.5">
                      <Calendar size={13} className="text-teal-300 shrink-0" />
                      <span>Joined {effectiveJoinedDate}</span>
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Right Column: [Chat] and [Follow] / [Following] Action Buttons */}
            {!isViewingSelf && (
              <div className="shrink-0 flex items-center gap-2">
                {/* Chat button only accessible if not private-locked and not guest */}
                {!isPrivateLocked && !isGuestAccount(userProfile) && !isGuestAccount(authorNickname) && (
                  <button
                    id={`btn-chat-with-${normAuthor}`}
                    onClick={() => {
                      if (onStartChat) {
                        onStartChat(authorNickname, effectiveAvatarKey, effectiveAvatarUrl);
                      }
                    }}
                    className="inline-flex items-center justify-center px-3 py-1.5 bg-white/90 hover:bg-white text-teal-950 active:scale-95 text-xs font-black rounded-xl shadow-xs transition-all border border-teal-200 cursor-pointer hover:shadow-md"
                    title={`Chat with ${authorNickname}`}
                  >
                    <span>💬 Chat</span>
                  </button>
                )}

                {/* Follow Button (Available for all account types: Student & Guest) */}
                <button
                  id={`btn-follow-${normAuthor}`}
                  onClick={() => {
                    if (onToggleFollow) {
                      onToggleFollow(authorNickname);
                    }
                  }}
                  className={`inline-flex items-center justify-center px-3.5 py-1.5 active:scale-95 text-xs font-black rounded-xl shadow-xs transition-all border cursor-pointer hover:shadow-md ${
                    isFollowingAuthor
                      ? 'bg-teal-950/80 text-teal-100 border-teal-400/80 hover:bg-rose-900/90 hover:text-white hover:border-rose-400'
                      : 'bg-white text-teal-950 hover:bg-teal-50 border-white'
                  }`}
                  title={isFollowingAuthor ? `Unfollow ${authorNickname}` : `Follow ${authorNickname}`}
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
                onClick={() => setShowFollowersModal({ open: true, tab: 'following' })}
                className="hover:text-teal-700 transition-colors cursor-pointer flex items-center gap-1 group"
              >
                <span className="text-sm font-black text-slate-900 group-hover:text-teal-700">{authorFollowingCount}</span>
                <span className="text-slate-500 group-hover:text-teal-700 font-bold">Following</span>
              </button>
              <span className="text-slate-300 font-bold">·</span>
              <button
                type="button"
                onClick={() => setShowFollowersModal({ open: true, tab: 'followers' })}
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
                const isOriginalAuthor = (post.authorNickname || '').toLowerCase().replace(/^@/, '').trim() === normAuthor;
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    repostedByNick={!isOriginalAuthor ? authorNickname : undefined}
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

                      <p className="text-slate-800 font-semibold leading-relaxed pl-3.5 border-l-2 border-teal-500/50">
                        {comment.content}
                      </p>

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
          nickname={authorNickname}
          avatarUrl={effectiveAvatarUrl}
          avatarKey={effectiveAvatarKey}
          isOwner={false}
          onClose={() => setShowPictureModal(false)}
        />
      )}

      {/* Followers & Following List Modal */}
      {showFollowersModal && (
        <FollowersListModal
          targetNickname={authorNickname}
          initialTab={showFollowersModal.tab}
          allFollows={allFollows}
          allUsers={allUsers}
          currentUserNickname={currentUserNickname || userProfile?.nickname}
          onToggleFollow={onToggleFollow}
          onSelectUser={(selectedNick) => {
            setShowFollowersModal(null);
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
          onClose={() => setShowFollowersModal(null)}
        />
      )}
    </div>
  );
};
