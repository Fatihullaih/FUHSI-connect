import React, { useState, useMemo, useEffect } from 'react';
import { Post, Comment, PostCategory, BadgeType, PollOption, UserProfile } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { VerificationModal } from './VerificationModal';
import { formatRelativeTime } from '../utils/dateUtils';
import { ImagePreviewModal } from './ImagePreviewModal';
import { CampusVideoPlayer } from './CampusVideoPlayer';
import { checkIsUserVerified, getUserBadgeInfo } from '../utils/verificationUtils';
import { findUserByNickname } from '../utils/userDbUtils';
import { isItemLikedByUser, getEffectiveLikesCount } from '../utils/reactionUtils';
import { 
  Heart, 
  MessageSquare, 
  Share2, 
  Bookmark, 
  BookmarkCheck, 
  Flag, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  X,
  AlertTriangle,
  BarChart2,
  Check,
  Zap,
  Maximize2,
  Trash2,
  Edit3,
  Lock,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface PostCardProps {
  post: Post;
  comments?: Comment[];
  currentUserNickname?: string;
  userProfile?: UserProfile | null;
  onLikeClick?: (post: Post) => void;
  onBookmarkClick?: (post: Post) => void;
  onCommentClick?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
  onEditPost?: (postId: string, newContent: string) => void;
  onVotePoll?: (post: Post, option: string) => void;
  onReportPost?: (post: Post, reason: string) => void;
  onAuthorClick?: (post: Post) => void;
  // Alternative legacy props
  onVote?: (postId: string, voteType: 'up' | 'down') => void;
  onBookmark?: (postId: string) => void;
  onAddComment?: (postId: string, text: string) => void;
  onFlagPost?: (postId: string, reason: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  comments = [],
  currentUserNickname,
  userProfile,
  onLikeClick,
  onBookmarkClick,
  onCommentClick,
  onDeletePost,
  onEditPost,
  onVotePoll,
  onReportPost,
  onAuthorClick,
  onVote,
  onBookmark,
  onAddComment,
  onFlagPost,
}) => {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('Inappropriate Content / Harassment');
  const [customReason, setCustomReason] = useState('');
  const [copiedShare, setCopiedShare] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content || post.text || '');
  const [showEditLockModal, setShowEditLockModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setEditedContent(post.content || post.text || '');
    setIsExpanded(false);
  }, [post.content, post.text]);

  const isMyPost = Boolean(
    (post as any).isOwner ||
    (currentUserNickname && post.authorNickname?.toLowerCase() === currentUserNickname.toLowerCase())
  );

  const authorUser = useMemo(() => {
    return findUserByNickname(post.authorNickname);
  }, [post.authorNickname]);

  const authorBadgeInfo = useMemo(() => {
    return getUserBadgeInfo(post.authorNickname || currentUserNickname, authorUser || (isMyPost ? userProfile : null));
  }, [post.authorNickname, currentUserNickname, authorUser, isMyPost, userProfile]);

  const isVerifiedUser = authorBadgeInfo.isVerified;
  const likesCount = getEffectiveLikesCount(post);
  const isLiked = isItemLikedByUser(post, userProfile);
  const isBookmarked = post.isBookmarkedByMe !== undefined ? Boolean(post.isBookmarkedByMe) : Boolean(post.isBookmarked);
  const commentsCount = post.commentsCount ?? post.commentCount ?? comments.length;
  const department = post.department || post.authorDepartment || 'General';

  const avatarKey = (isMyPost ? userProfile?.avatarKey : undefined) || authorUser?.avatarKey || post.authorAvatarKey || post.authorAvatarId || 'caduceus';
  const avatarUrl = (isMyPost ? userProfile?.avatarUrl : undefined) ?? authorUser?.avatarUrl ?? post.authorAvatarUrl;
  const category = post.category || 'General';

  const postRawContent = post.content || post.text || '';
  const isLongContent = useMemo(() => {
    if (!postRawContent) return false;
    const lines = postRawContent.split('\n');
    return postRawContent.length > 280 || lines.length > 4;
  }, [postRawContent]);

  const displayContent = useMemo(() => {
    if (!postRawContent) return '';
    if (!isLongContent || isExpanded) {
      return postRawContent;
    }
    const lines = postRawContent.split('\n');
    if (lines.length > 4) {
      const truncatedByLines = lines.slice(0, 4).join('\n');
      if (truncatedByLines.length > 260) {
        return truncatedByLines.slice(0, 260).trim() + '...';
      }
      return truncatedByLines + '...';
    }
    if (postRawContent.length > 280) {
      return postRawContent.slice(0, 280).trim() + '...';
    }
    return postRawContent;
  }, [postRawContent, isLongContent, isExpanded]);

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'Academic':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Events':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Confessions':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Marketplace':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'LostAndFound':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const handleToggleLike = () => {
    if (onLikeClick) {
      onLikeClick(post);
    } else if (onVote) {
      onVote(post.id, 'up');
    }
  };

  const handleToggleBookmark = () => {
    if (onBookmarkClick) {
      onBookmarkClick(post);
    } else if (onBookmark) {
      onBookmark(post.id);
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (onAddComment) {
      onAddComment(post.id, newComment.trim());
    }
    setNewComment('');
  };

  const handleShare = () => {
    navigator.clipboard?.writeText?.(window.location.href);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = flagReason === 'Other' ? customReason : flagReason;
    if (!finalReason) return;
    if (onReportPost) {
      onReportPost(post, finalReason);
    } else if (onFlagPost) {
      onFlagPost(post.id, finalReason);
    }
    setShowFlagModal(false);
  };

  // Poll calculations & multi-option support
  const optionsList: PollOption[] = useMemo(() => {
    if (post.pollOptions && post.pollOptions.length > 0) {
      return post.pollOptions;
    }
    if (post.pollOptA || post.pollOptB) {
      return [
        { id: 'A', text: post.pollOptA || 'Option A', votes: post.pollVotesA || 0 },
        { id: 'B', text: post.pollOptB || 'Option B', votes: post.pollVotesB || 0 },
      ];
    }
    return [];
  }, [post.pollOptions, post.pollOptA, post.pollOptB, post.pollVotesA, post.pollVotesB]);

  // User-specific vote check
  const userKey = currentUserNickname?.toLowerCase();
  const myVotedOptionId = userKey && post.pollVotesByUser
    ? (post.pollVotesByUser[userKey] || post.pollVotesByUser[currentUserNickname || ''])
    : undefined;

  const hasVoted = Boolean(myVotedOptionId);

  const totalPollVotes = useMemo(() => {
    return optionsList.reduce((acc, opt) => acc + (opt.votes || 0), 0);
  }, [optionsList]);

  return (
    <article className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transform-gpu hover:scale-[1.012] transition-all duration-200 overflow-hidden mb-4">
      <div className="p-4 sm:p-5">
        {/* Post Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onAuthorClick?.(post)}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-teal-50 border-teal-200/80 hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-teal-500/40 overflow-hidden"
              title={`View ${post.authorNickname}'s profile details`}
            >
              <AvatarIcon avatarKey={avatarKey} avatarUrl={avatarUrl} size={20} sizeClassName="w-10 h-10 rounded-xl object-cover" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onAuthorClick?.(post)}
                  className="font-bold text-slate-900 text-sm hover:text-teal-700 cursor-pointer focus:outline-none focus:underline"
                  title={`View ${post.authorNickname}'s profile details`}
                >
                  {post.authorNickname}
                </button>

                <VerificationBadge 
                  isVerified={authorBadgeInfo.isVerified} 
                  badgeType={authorBadgeInfo.badgeType}
                  title={authorBadgeInfo.badgeTitle}
                  showTitle 
                />
              </div>
              <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <span>{formatRelativeTime(post.timestamp)}</span>
                {post.isEdited && (
                  <span className="text-[10px] text-slate-400 font-normal italic">(edited)</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleBookmark}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isBookmarked ? 'text-teal-600 bg-teal-50' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              }`}
              title={isBookmarked ? 'Remove Bookmark' : 'Save Post'}
            >
              {isBookmarked ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            </button>
            {isMyPost && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (isVerifiedUser) {
                      setIsEditing(true);
                      setEditedContent(post.content);
                    } else {
                      setShowEditLockModal(true);
                    }
                  }}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold ${
                    isVerifiedUser
                      ? 'text-indigo-600 hover:bg-indigo-50'
                      : 'text-slate-400 hover:bg-slate-100'
                  }`}
                  title={isVerifiedUser ? 'Edit your thread' : 'Edit Thread (Verified Feature Only)'}
                >
                  <Edit3 size={16} />
                  {!isVerifiedUser && <Lock size={12} className="text-amber-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(true)}
                  className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Delete your thread"
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Delete Confirmation Banner */}
        {showConfirmDelete && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-rose-900 font-bold">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>Are you sure you want to delete your thread permanently? This cannot be undone.</span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmDelete(false);
                  if (onDeletePost) onDeletePost(post.id);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-extrabold hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
              >
                Yes, Delete Thread
              </button>
            </div>
          </div>
        )}

        {/* Post Content or Inline Edit */}
        {isEditing ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={3}
              className="w-full text-sm p-3 rounded-xl border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-normal"
              placeholder="Edit your thread content..."
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editedContent.trim() && onEditPost) {
                    onEditPost(post.id, editedContent.trim());
                  }
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-extrabold hover:bg-teal-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
              >
                <Check size={14} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <p 
              onClick={() => onCommentClick?.(post)}
              className="text-slate-800 text-sm sm:text-base leading-relaxed whitespace-pre-line font-normal cursor-pointer hover:text-teal-950 transition-colors"
              title="Click to view full thread, comments & replies"
            >
              {displayContent}
            </p>
            {isLongContent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900 bg-teal-50/80 hover:bg-teal-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer border border-teal-200/50"
              >
                <span>{isExpanded ? 'Read Less' : 'Read More'}</span>
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
          </div>
        )}

        {/* Attached Images (Supports up to 2 images) */}
        {(() => {
          const imagesList: string[] = post.imageUrls && post.imageUrls.length > 0
            ? post.imageUrls
            : post.imageUrl
            ? [post.imageUrl]
            : post.imageResName
            ? [post.imageResName]
            : [];

          if (imagesList.length === 0) return null;

          if (imagesList.length === 1) {
            return (
              <div 
                onClick={() => setPreviewImage(imagesList[0])}
                className="mt-3.5 rounded-xl overflow-hidden border border-slate-200/90 bg-slate-950 group cursor-pointer"
              >
                <img
                  src={imagesList[0]}
                  alt="Post visual attachment"
                  className="w-full max-h-96 object-cover group-hover:scale-101 transition-transform duration-200"
                />
              </div>
            );
          }

          return (
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              {imagesList.slice(0, 2).map((imgUrl, idx) => (
                <div
                  key={idx}
                  onClick={() => setPreviewImage(imgUrl)}
                  className="rounded-xl overflow-hidden border border-slate-200/90 bg-slate-950 group cursor-pointer h-48 sm:h-60"
                >
                  <img
                    src={imgUrl}
                    alt={`Post attachment ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
              ))}
            </div>
          );
        })()}

        {/* Attached Video (Publicly Viewable; Download Exclusive to Verified) */}
        {post.videoUri && (
          <CampusVideoPlayer
            videoUri={post.videoUri}
            userProfile={userProfile}
            className="mt-3.5"
          />
        )}

        {/* Optional Poll Component */}
        {post.pollQuestion && optionsList.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-teal-800">
              <BarChart2 size={16} className="shrink-0 text-teal-600" />
              <span>Campus Poll: {post.pollQuestion}</span>
            </div>

            <div className="space-y-2">
              {optionsList.map((opt, idx) => {
                const isThisSelected =
                  myVotedOptionId === opt.id ||
                  myVotedOptionId === opt.text ||
                  (idx === 0 && myVotedOptionId === 'A') ||
                  (idx === 1 && myVotedOptionId === 'B');

                const pct = totalPollVotes > 0 ? Math.round(((opt.votes || 0) / totalPollVotes) * 100) : 0;

                return (
                  <button
                    key={opt.id || `opt_${idx}`}
                    disabled={hasVoted}
                    onClick={() => onVotePoll && onVotePoll(post, opt.id || `opt_${idx}`)}
                    className={`w-full p-2.5 rounded-xl text-left border text-xs font-semibold relative overflow-hidden transition-all flex items-center justify-between ${
                      hasVoted ? 'cursor-default' : 'cursor-pointer hover:border-teal-400 hover:bg-teal-50/40'
                    } ${
                      isThisSelected
                        ? 'border-teal-600 bg-teal-50/90 text-teal-950 font-extrabold ring-1 ring-teal-600/30'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {/* Background Progress Bar when voted */}
                    {hasVoted && (
                      <div
                        className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-500 ${
                          isThisSelected ? 'bg-teal-200/60' : 'bg-slate-100/80'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {isThisSelected && <Check size={14} className="text-teal-700 shrink-0" />}
                      <span>{opt.text}</span>
                    </span>
                    {hasVoted && (
                      <span className="relative z-10 font-bold text-teal-800 shrink-0 ml-2">
                        {pct}% ({opt.votes || 0})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {totalPollVotes} student {totalPollVotes === 1 ? 'vote' : 'votes'} • Anonymous poll
            </p>
          </div>
        )}

        {/* Post Footer Controls */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
          <button
            onClick={handleToggleLike}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors ${
              isLiked
                ? 'bg-rose-50 text-rose-600 font-bold'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
            title="Like post"
          >
            <Heart size={16} className={isLiked ? 'fill-rose-500 text-rose-500' : ''} />
            <span>{likesCount}</span>
          </button>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => {
                if (onCommentClick) {
                  onCommentClick(post);
                } else {
                  setShowComments(!showComments);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <MessageSquare size={16} />
              <span>{commentsCount} Comments</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
              title="Share post link"
            >
              {copiedShare ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span className="text-emerald-600">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 size={16} />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowFlagModal(true)}
              className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
              title="Report post to moderators"
            >
              <Flag size={16} />
            </button>
          </div>
        </div>

        {/* Local Comment Drawer Section (when onCommentClick is not passed) */}
        {showComments && !onCommentClick && (
          <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/70 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-4 sm:p-5 rounded-b-2xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <MessageSquare size={14} />
              Student Discussions ({comments.length})
            </h4>

            {/* List of comments */}
            <div className="space-y-3 mb-4">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No comments yet. Be the first student to reply!</p>
              ) : (
                comments.map((comment) => {
                  const isMyComment = Boolean(
                    userProfile?.nickname &&
                    comment?.authorNickname &&
                    comment.authorNickname.toLowerCase() === userProfile.nickname.toLowerCase()
                  );
                  const cAuthorUser = findUserByNickname(comment.authorNickname);
                  const commentAvatarKey = (isMyComment ? userProfile?.avatarKey : undefined) || cAuthorUser?.avatarKey || comment.authorAvatarKey || comment.authorAvatarId || 'caduceus';
                  const commentAvatarUrl = (isMyComment ? userProfile?.avatarUrl : undefined) ?? cAuthorUser?.avatarUrl ?? comment.authorAvatarUrl;

                  return (
                    <div key={comment.id} className="bg-white p-3 rounded-xl border border-slate-200/70 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <div 
                          onClick={() => {
                            if (onAuthorClick) {
                              onAuthorClick({
                                ...post,
                                authorNickname: comment.authorNickname,
                                authorAvatarKey: commentAvatarKey,
                                authorAvatarUrl: commentAvatarUrl,
                                authorBadgeType: comment.authorBadgeType,
                                authorBadgeTitle: comment.authorBadgeTitle,
                              });
                            }
                          }}
                          className={`flex items-center gap-2 ${onAuthorClick ? 'cursor-pointer group/user' : ''}`}
                          title={onAuthorClick ? `View ${comment.authorNickname}'s profile` : undefined}
                        >
                          <div className="w-5 h-5 rounded-full bg-teal-50 flex items-center justify-center shrink-0 group-hover/user:scale-105 transition-transform overflow-hidden">
                            <AvatarIcon avatarKey={commentAvatarKey} avatarUrl={commentAvatarUrl} size={12} sizeClassName="w-5 h-5 object-cover" />
                          </div>
                          <span className="font-bold text-slate-800 group-hover/user:text-teal-700 group-hover/user:underline">{comment.authorNickname}</span>
                        </div>
                        <span className="text-slate-400 text-[10px]" title={comment.timestamp}>{formatRelativeTime(comment.timestamp)}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed pl-7">{comment.content}</p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Comment Input */}
            <form onSubmit={handleCommentSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Write a constructive campus reply..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={!newComment.trim()}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Send size={14} />
                <span>Post</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Flag / Report Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-slate-900 text-base">Report Post to FUHSI Moderation</h3>
              </div>
              <button onClick={() => setShowFlagModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Help keep FUHSI Connect safe. Reported content is escalated to student moderators and evaluated against campus community guidelines.
            </p>

            <form onSubmit={handleReportSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Reason</label>
                <select
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:border-teal-500"
                >
                  <option value="Inappropriate Content / Harassment">Inappropriate Content / Harassment</option>
                  <option value="Academic Fraud / Exam Misconduct">Academic Fraud / Exam Misconduct</option>
                  <option value="Spam / Commercial Unverified Sale">Spam / Commercial Unverified Sale</option>
                  <option value="False Information / Rumors">False Information / Campus Rumors</option>
                  <option value="Other">Other Reason</option>
                </select>
              </div>

              {flagReason === 'Other' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Specify Details</label>
                  <textarea
                    rows={2}
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Provide details about why this post violates community guidelines..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFlagModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 shadow-xs transition-colors"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          title={`Attachment by ${post.authorNickname}`}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* Edit Thread Lock Modal for Unverified Users */}
      {showEditLockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs border border-amber-200">
              <Lock size={24} />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">Edit Thread — Verified Feature</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Editing published threads and custom posts is exclusive to Verified accounts on FUHSI Connect to maintain content integrity and community trust.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-left text-xs space-y-1.5 text-slate-800 font-medium">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <ShieldCheck size={16} />
                <span>Get Verified to unlock:</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-700 font-medium">
                <li className="flex items-center gap-1.5">✓ Live editing of your published threads</li>
                <li className="flex items-center gap-1.5">✓ Create custom threads with video attachments</li>
                <li className="flex items-center gap-1.5">✓ Verified checkmark across FUHSI Connect</li>
                <li className="flex items-center gap-1.5">✓ Marketplace seller access & priority support</li>
              </ul>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEditLockModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEditLockModal(false);
                  setShowVerificationModal(true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <ShieldCheck size={14} />
                <span>Get Verified</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerificationModal && (
        <VerificationModal
          userProfile={userProfile || null}
          onClose={() => setShowVerificationModal(false)}
          onSubmitVerification={() => setShowVerificationModal(false)}
        />
      )}
    </article>
  );
};
