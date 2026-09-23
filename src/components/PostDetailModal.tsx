import React, { useState, useMemo, useEffect } from 'react';
import { X, ArrowLeft, MessageSquare, Heart, Bookmark, Send, CornerDownRight, Maximize2, Trash2, AlertTriangle, BarChart2, Check, Image as ImageIcon, Edit3, Lock, ShieldCheck, Clock, Repeat } from 'lucide-react';
import { Post, Comment, UserProfile, PollOption } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { VerificationModal } from './VerificationModal';
import { formatRelativeTime, formatExactDateTime, getTimestampMs } from '../utils/dateUtils';
import { ImagePreviewModal } from './ImagePreviewModal';
import { compressImageFile } from '../utils/imageUtils';
import { checkIsUserVerified, getUserBadgeInfo } from '../utils/verificationUtils';
import { findUserByNickname, isGuestAccount, isModulaAccount } from '../utils/userDbUtils';
import { isItemLikedByUser, getEffectiveLikesCount } from '../utils/reactionUtils';
import { ShareRepostModal } from './ShareRepostModal';
import { normalizeHandle } from '../utils/followUtils';

interface PostDetailModalProps {
  post: Post;
  comments: Comment[];
  userProfile: UserProfile | null;
  zIndex?: number;
  onClose: () => void;
  onAddComment: (commentText: string, parentId?: string, replyToNickname?: string, imageUrl?: string) => void;
  onLikeComment?: (commentId: string) => void;
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
  onEditPost?: (postId: string, newContent: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onVotePoll?: (post: Post, optionId: string) => void;
  onAuthorClick?: (author: { nickname: string; avatarKey?: string; avatarUrl?: string; badgeType?: string; badgeTitle?: string }) => void;
  onRepost?: (post: Post) => void;
  onUndoRepost?: (post: Post) => void;
  onQuote?: (post: Post, caption: string) => void;
  onSelectPost?: (post: Post) => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  post,
  comments = [],
  userProfile,
  zIndex,
  onClose,
  onAddComment,
  onLikeComment,
  onToggleLike,
  onToggleBookmark,
  onDeletePost,
  onEditPost,
  onDeleteComment,
  onVotePoll,
  onAuthorClick,
  onRepost,
  onUndoRepost,
  onQuote,
  onSelectPost,
}) => {
  if (!post) return null;

  const [commentText, setCommentText] = useState('');
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; nickname: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [confirmDeletePost, setConfirmDeletePost] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(post?.content || (post as any)?.text || '');
  const [showEditLockModal, setShowEditLockModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    setEditedContent(post?.content || (post as any)?.text || '');
  }, [post?.content, (post as any)?.text]);

  // Live ticker to update relative timestamps in real-time every 15 seconds
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick((prev) => prev + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const isModulaAdmin = useMemo(() => {
    if (isModulaAccount(userProfile)) return true;
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
  }, [userProfile]);

  const isVerifiedUser = useMemo(() => {
    return checkIsUserVerified(post?.authorNickname || userProfile?.nickname, userProfile);
  }, [post?.authorNickname, userProfile]);

  const isRepostedByMe = useMemo(() => {
    const userNick = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '').trim();
    if (!userNick) return false;
    const list = Array.isArray(post?.repostedBy) ? post.repostedBy : [];
    return list.some((nick) => nick.toLowerCase().replace(/^@/, '').trim() === userNick);
  }, [post?.repostedBy, userProfile?.nickname]);

  const effectiveRepostsCount = useMemo(() => {
    if (post?.repostsCount !== undefined && post?.repostsCount !== null) {
      return post.repostsCount;
    }
    if (Array.isArray(post?.repostedBy)) {
      return post.repostedBy.length;
    }
    return post?.shareCount || 0;
  }, [post?.repostsCount, post?.repostedBy, post?.shareCount]);

  const effectiveReposter = useMemo(() => {
    if (!post) return null;
    if (post.reposterNickname) {
      return post.reposterNickname;
    }
    const reposters = Array.isArray(post.repostedBy) ? post.repostedBy : [];
    if (reposters.length === 0) return null;

    const userNick = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '').trim();
    if (userNick && reposters.some((nick) => (nick || '').toLowerCase().replace(/^@/, '').trim() === userNick)) {
      return userProfile?.nickname || 'You';
    }
    return reposters[reposters.length - 1];
  }, [post?.reposterNickname, post?.repostedBy, userProfile?.nickname]);

  const isViewerReposter = useMemo(() => {
    if (!effectiveReposter) return false;
    const userNick = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '').trim();
    const reposterNorm = effectiveReposter.toLowerCase().replace(/^@/, '').trim();
    return reposterNorm === 'you' || (Boolean(userNick) && reposterNorm === userNick);
  }, [effectiveReposter, userProfile?.nickname]);

  React.useEffect(() => {
    const handlePopState = () => {
      if (previewImage) {
        setPreviewImage(null);
        return;
      }
      if (confirmDeletePost) {
        setConfirmDeletePost(false);
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [previewImage, confirmDeletePost]);

  const handleCommentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 800, 800, 0.75);
        setCommentImage(compressed);
      } catch (err) {
        const reader = new FileReader();
        reader.onloadend = () => setCommentImage(reader.result as string);
        reader.readAsDataURL(file);
      }
      e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() && !commentImage) return;

    if (replyingTo) {
      onAddComment(commentText.trim(), replyingTo.id, replyingTo.nickname, commentImage || undefined);
      setReplyingTo(null);
    } else {
      onAddComment(commentText.trim(), undefined, undefined, commentImage || undefined);
    }
    setCommentText('');
    setCommentImage(null);
  };

  // Sort comments chronologically (earliest to latest for a natural top-to-bottom discussion flow)
  const sortedComments = useMemo(() => {
    return [...(comments || [])].sort((a, b) => {
      const timeA = getTimestampMs(a.timestamp);
      const timeB = getTimestampMs(b.timestamp);
      return timeA - timeB;
    });
  }, [comments]);

  // Build comment tree (top-level vs nested child replies) in chronological order
  const topLevelComments = useMemo(() => {
    return sortedComments.filter((c) => !c.parentId);
  }, [sortedComments]);
  
  const getChildReplies = (parentId: string): Comment[] => {
    return sortedComments.filter((c) => c.parentId === parentId);
  };

  // Helper component to render a comment item recursively or nested
  const renderCommentItem = (comment: Comment, depth: number = 0) => {
    const replies = getChildReplies(comment.id);
    const isMaxDepth = depth >= 3;
    const isMyComment = Boolean(
      userProfile?.nickname &&
      comment.authorNickname?.toLowerCase() === userProfile.nickname.toLowerCase()
    );

    const relativeTime = formatRelativeTime(comment.timestamp);
    const exactTime = formatExactDateTime(comment.timestamp) || comment.timestamp;

    const commentAuthorUser = findUserByNickname(comment.authorNickname);
    const commentAvatarKey = (isMyComment ? userProfile?.avatarKey : undefined) || commentAuthorUser?.avatarKey || comment.authorAvatarKey || '1';
    const commentAvatarUrl = (isMyComment ? userProfile?.avatarUrl : undefined) ?? commentAuthorUser?.avatarUrl ?? comment.authorAvatarUrl;

    const commentBadgeInfo = getUserBadgeInfo(comment.authorNickname, commentAuthorUser || (isMyComment ? userProfile : null));

    return (
      <div key={comment.id} className="space-y-2">
        <div 
          className={`p-3 rounded-2xl border transition-colors ${
            replyingTo?.id === comment.id 
              ? 'bg-teal-50/90 border-teal-300 ring-2 ring-teal-500/20' 
              : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/60'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div 
              onClick={() => onAuthorClick?.({
                nickname: comment.authorNickname,
                avatarKey: commentAvatarKey,
                avatarUrl: commentAvatarUrl,
                badgeType: commentBadgeInfo.badgeType,
                badgeTitle: commentBadgeInfo.badgeTitle
              })}
              className="flex items-center gap-2 flex-wrap cursor-pointer group/user"
              title={`View ${comment.authorNickname}'s profile`}
            >
              <AvatarIcon
                avatarKey={commentAvatarKey}
                avatarUrl={commentAvatarUrl}
                sizeClassName="w-7 h-7 rounded-full object-cover shrink-0 group-hover/user:scale-105 transition-transform"
              />
              <span className="font-extrabold text-slate-900 text-xs group-hover/user:text-teal-700 group-hover/user:underline">
                {comment.authorNickname}
              </span>
              <VerificationBadge 
                isVerified={commentBadgeInfo.isVerified} 
                badgeType={commentBadgeInfo.badgeType}
                title={commentBadgeInfo.badgeTitle}
              />
              {isGuestAccount(comment.authorNickname) && (
                <span className="text-[10px] text-slate-400 font-medium">Guest</span>
              )}
              {comment.replyToNickname && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAuthorClick?.({
                      nickname: comment.replyToNickname!,
                    });
                  }}
                  className="text-[10px] text-teal-700 font-bold bg-teal-100/70 hover:bg-teal-200/80 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer"
                  title={`View @${comment.replyToNickname}'s profile`}
                >
                  Replying to @{comment.replyToNickname}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span 
                className="text-[10px] text-slate-400 font-medium flex items-center gap-1 hover:text-slate-600 transition-colors cursor-help"
                title={`Exact time: ${exactTime}`}
              >
                <Clock size={11} className="text-slate-400 inline shrink-0" />
                <span>{relativeTime}</span>
              </span>
              {isModulaAdmin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingCommentId(comment.id);
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title={comment.parentId ? "Admin Delete Reply (@modula)" : "Admin Delete Comment (@modula)"}
                  aria-label="Admin delete"
                >
                  <X size={14} className="stroke-[2.2]" />
                </button>
              )}
            </div>
          </div>

          {comment.content && (
            <p className="text-xs text-slate-800 pt-1.5 leading-relaxed font-medium whitespace-pre-line pl-9">
              {comment.content}
            </p>
          )}

          {comment.imageUrl && (
            <div className="pl-9 pt-2">
              <div 
                onClick={() => setPreviewImage(comment.imageUrl!)}
                className="inline-block rounded-xl overflow-hidden border border-slate-200 max-h-52 max-w-sm bg-slate-950 cursor-pointer group"
              >
                <img
                  src={comment.imageUrl}
                  alt="Comment visual attachment"
                  className="max-h-52 w-auto object-cover group-hover:scale-102 transition-transform duration-200"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 pl-9 text-[11px] font-bold text-slate-500">
            <div className="flex items-center gap-3">
              {(() => {
                const isCommentLiked = isItemLikedByUser(comment, userProfile);
                const commentLikes = getEffectiveLikesCount(comment);
                return (
                  <button
                    type="button"
                    onClick={() => onLikeComment?.(comment.id)}
                    className={`flex items-center gap-1 hover:text-rose-600 transition-colors cursor-pointer ${
                      isCommentLiked ? 'text-rose-600 font-black' : ''
                    }`}
                    title={isCommentLiked ? 'Unlike comment' : 'Like comment'}
                  >
                    <Heart size={12} className={isCommentLiked ? 'fill-rose-600 text-rose-600' : ''} />
                    <span>{commentLikes}</span>
                  </button>
                );
              })()}

              <button
                type="button"
                onClick={() => setReplyingTo({ id: comment.id, nickname: comment.authorNickname })}
                className="flex items-center gap-1 text-teal-700 hover:text-teal-900 hover:underline transition-colors cursor-pointer"
              >
                <CornerDownRight size={12} />
                <span>Reply</span>
              </button>
            </div>

            {!isModulaAdmin && isMyComment && (
              <button
                type="button"
                onClick={() => setDeletingCommentId(comment.id)}
                className="flex items-center gap-1 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
                title={comment.parentId ? "Delete your reply" : "Delete your comment"}
              >
                <Trash2 size={12} />
                <span>Delete</span>
              </button>
            )}
          </div>

          {deletingCommentId === comment.id && (
            <div className="mt-2.5 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-[11px]">
                <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                <span>
                  {comment.parentId
                    ? 'Are you sure you want to delete this reply?'
                    : 'Are you sure you want to delete this comment?'}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingCommentId(null)}
                  className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-[11px] font-bold hover:bg-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeletingCommentId(null);
                    if (onDeleteComment) onDeleteComment(comment.id);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-extrabold hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                >
                  Yes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nested Child Replies */}
        {replies.length > 0 && (
          <div className={`pl-4 sm:pl-6 border-l-2 border-teal-200/80 space-y-2 ml-3 pt-1`}>
            {replies.map((child) => renderCommentItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150"
      style={{ zIndex: zIndex ?? 75 }}
    >
      <div className="w-full h-full max-w-3xl mx-auto bg-white flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
        {/* Full-width Sticky Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-white/95 backdrop-blur-md shrink-0 z-10 shadow-2xs">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 -ml-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5 font-bold text-xs sm:text-sm cursor-pointer"
              title="Return to previous page"
            >
              <ArrowLeft className="w-5 h-5 text-slate-800" />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-700" />
              <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">Thread Discussion</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Main Post Card */}
          {(() => {
            const isMyPost = Boolean(
              userProfile?.nickname &&
              post?.authorNickname &&
              post.authorNickname.toLowerCase() === userProfile.nickname.toLowerCase()
            );
            const isModulaAdmin = Boolean(
              isModulaAccount(userProfile) ||
              (typeof localStorage !== 'undefined' && isModulaAccount(localStorage.getItem('fuhsi_active_user')))
            );
            const authorUser = findUserByNickname(post?.authorNickname);
            const postAvatarKey = (isMyPost ? userProfile?.avatarKey : undefined) || authorUser?.avatarKey || post.authorAvatarKey || '1';
            const postAvatarUrl = (isMyPost ? userProfile?.avatarUrl : undefined) ?? authorUser?.avatarUrl ?? post.authorAvatarUrl;

            const authorBadgeInfo = getUserBadgeInfo(post?.authorNickname, authorUser || (isMyPost ? userProfile : null));

            return (
              <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-3 shadow-2xs">
                {/* Repost Header Indicator */}
                {effectiveReposter && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold pb-2 border-b border-slate-200">
                    <Repeat size={14} className="text-emerald-600 shrink-0" />
                    <span>
                      {isViewerReposter ? (
                        <span>You reposted</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAuthorClick) {
                              onAuthorClick({
                                nickname: `@${effectiveReposter.replace(/^@/, '')}`,
                                badgeType: 'NONE',
                                badgeTitle: '',
                              });
                            }
                          }}
                          className="hover:text-slate-800 hover:underline cursor-pointer"
                        >
                          @{effectiveReposter.replace(/^@/, '')} reposted
                        </button>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div 
                    onClick={() => onAuthorClick?.({
                      nickname: post.authorNickname,
                      avatarKey: postAvatarKey,
                      avatarUrl: postAvatarUrl,
                      badgeType: authorBadgeInfo.badgeType,
                      badgeTitle: authorBadgeInfo.badgeTitle
                    })}
                    className="flex items-center gap-3 cursor-pointer group/author flex-1 min-w-0"
                    title={`View ${post.authorNickname}'s profile`}
                  >
                    <AvatarIcon
                      avatarKey={postAvatarKey}
                      avatarUrl={postAvatarUrl}
                      sizeClassName="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-teal-500/20 group-hover/author:scale-105 transition-transform"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-slate-900 text-sm truncate group-hover/author:text-teal-700 group-hover/author:underline">
                          {post.authorNickname}
                        </span>
                        <VerificationBadge 
                          isVerified={authorBadgeInfo.isVerified} 
                          badgeType={authorBadgeInfo.badgeType}
                          title={authorBadgeInfo.badgeTitle}
                          showTitle 
                        />
                        {isGuestAccount(post.authorNickname) && (
                          <span className="text-[10px] text-slate-400 font-medium">Guest</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
                        {post.department && post.department !== 'General' && !isGuestAccount(post.authorNickname) && (
                          <>
                            <span className="font-extrabold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80 text-[10px]">
                              {post.department}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span 
                          className="font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                          title={formatExactDateTime(post.timestamp) || post.timestamp}
                        >
                          {formatRelativeTime(post.timestamp)}
                        </span>
                        {post.isEdited && (
                          <span className="text-[10px] text-slate-400 font-normal italic">(edited)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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
                        {!isModulaAdmin && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePost(true)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete your thread"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </>
                    )}
                    {/* Admin Delete Control: ONLY visible to @modula */}
                    {isModulaAdmin && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePost(true)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Admin Delete Thread (@modula)"
                        aria-label="Admin delete thread"
                      >
                        <X size={17} className="stroke-[2.2]" />
                      </button>
                    )}
                  </div>
                </div>

                {confirmDeletePost && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-rose-900 font-bold">
                      <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                      <span>Are you sure you want to delete this thread?</span>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePost(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeletePost(false);
                          if (onDeletePost) onDeletePost(post.id);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-extrabold hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                      >
                        Yes
                      </button>
                    </div>
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      rows={3}
                      className="w-full text-xs sm:text-sm p-3 rounded-xl border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-normal"
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
                  <p className="text-slate-800 text-xs sm:text-sm leading-relaxed whitespace-pre-line font-medium pt-1">
                    {post.content}
                  </p>
                )}

            {(() => {
              const postImages: string[] = post.imageUrls && post.imageUrls.length > 0
                ? post.imageUrls
                : post.imageUrl
                ? [post.imageUrl]
                : post.imageResName
                ? [post.imageResName]
                : [];

              if (postImages.length === 0) return null;

              if (postImages.length === 1) {
                return (
                  <div 
                    onClick={() => setPreviewImage(postImages[0])}
                    className="rounded-2xl overflow-hidden border border-slate-200 max-h-64 bg-slate-100 cursor-pointer"
                  >
                    <img src={postImages[0]} alt="attachment" className="w-full h-full object-cover hover:scale-101 transition-transform duration-200" />
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 gap-2">
                  {postImages.slice(0, 2).map((imgUrl, idx) => (
                    <div
                      key={idx}
                      onClick={() => setPreviewImage(imgUrl)}
                      className="rounded-2xl overflow-hidden border border-slate-200 h-48 sm:h-56 bg-slate-100 cursor-pointer"
                    >
                      <img src={imgUrl} alt={`attachment ${idx + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Optional Poll Component */}
            {post.pollQuestion && (
              (() => {
                const optionsList: PollOption[] = post.pollOptions && post.pollOptions.length > 0
                  ? post.pollOptions
                  : (post.pollOptA || post.pollOptB
                      ? [
                          { id: 'A', text: post.pollOptA || 'Option A', votes: post.pollVotesA || 0 },
                          { id: 'B', text: post.pollOptB || 'Option B', votes: post.pollVotesB || 0 },
                        ]
                      : []);

                const userKey = userProfile?.nickname?.toLowerCase();
                const myVotedOptionId = userKey && post.pollVotesByUser
                  ? (post.pollVotesByUser[userKey] || post.pollVotesByUser[userProfile?.nickname || ''])
                  : undefined;

                const hasVoted = Boolean(myVotedOptionId);
                const totalPollVotes = optionsList.reduce((acc, opt) => acc + (opt.votes || 0), 0);

                if (optionsList.length === 0) return null;

                return (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
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
                );
              })()
            )}

            {/* Embedded Quoted Post Card */}
            {post.isQuote && post.quotedPost && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectPost) onSelectPost(post.quotedPost!);
                }}
                className="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:bg-slate-50 transition-colors cursor-pointer space-y-2 mt-2"
              >
                <div className="flex items-center gap-2">
                  <AvatarIcon
                    avatarKey={post.quotedPost.authorAvatarKey}
                    avatarUrl={post.quotedPost.authorAvatarUrl}
                    sizeClassName="w-5 h-5 rounded-full"
                  />
                  <span className="font-bold text-xs text-slate-900">
                    {post.quotedPost.authorNickname}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {post.quotedPost.timeAgo || formatRelativeTime(post.quotedPost.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-slate-700 line-clamp-3 leading-relaxed">
                  {post.quotedPost.content || (post.quotedPost as any).text}
                </p>
                {post.quotedPost.imageUrl && (
                  <div className="h-32 w-full rounded-xl overflow-hidden border border-slate-200 mt-2">
                    <img src={post.quotedPost.imageUrl} alt="Quoted attachment" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            )}

            {/* Interaction Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs font-extrabold text-slate-600">
              <div className="flex items-center gap-4">
                {(() => {
                  const isPostLiked = isItemLikedByUser(post, userProfile);
                  const postLikes = getEffectiveLikesCount(post);
                  return (
                    <button
                      onClick={() => onToggleLike(post)}
                      className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isPostLiked ? 'text-rose-600 font-black' : 'hover:text-slate-900'
                      }`}
                      title={isPostLiked ? 'Unlike post' : 'Like post'}
                    >
                      <Heart className={`w-4 h-4 ${isPostLiked ? 'fill-rose-600 text-rose-600' : ''}`} />
                      <span>{postLikes}</span>
                    </button>
                  );
                })()}

                <div className="flex items-center gap-1.5 text-teal-800">
                  <MessageSquare className="w-4 h-4 text-teal-600" />
                  <span>{topLevelComments.length} {topLevelComments.length === 1 ? 'Comment' : 'Comments'}</span>
                </div>

                <button
                  id={`btn-detail-share-${post.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowShareModal(true);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-colors cursor-pointer ${
                    isRepostedByMe ? 'text-emerald-700 font-black bg-emerald-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="Repost, Quote, or Share thread"
                >
                  <Repeat className="w-4 h-4" />
                  <span>{effectiveRepostsCount > 0 ? `${effectiveRepostsCount} Repost${effectiveRepostsCount === 1 ? '' : 's'}` : 'Share'}</span>
                </button>
              </div>

              <button
                onClick={() => onToggleBookmark(post)}
                className={`p-1.5 rounded-xl transition-colors ${
                  post.isBookmarkedByMe ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${post.isBookmarkedByMe ? 'fill-amber-500 text-amber-500' : ''}`} />
              </button>
            </div>
          </div>
        );
      })()}

          {/* Comments Section */}
          <div className="space-y-3 pt-1">
            <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-teal-700" />
              Student Discussion ({topLevelComments.length})
            </h3>

            {topLevelComments.length === 0 ? (
              <p className="text-xs text-slate-500 font-medium italic bg-slate-50 p-6 rounded-2xl text-center border border-slate-200/80">
                No replies yet. Be the first student to respond!
              </p>
            ) : (
              <div className="space-y-3">
                {topLevelComments.map((comment) => renderCommentItem(comment))}
              </div>
            )}
          </div>
        </div>

        {/* Reply Input Bar */}
        <form onSubmit={handleSubmit} className="p-3.5 border-t border-slate-200 bg-slate-50/95 shrink-0 space-y-2">
          {replyingTo && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-teal-100/90 text-teal-900 rounded-xl text-xs font-bold border border-teal-300 animate-in fade-in">
              <span className="flex items-center gap-1.5">
                <CornerDownRight size={13} className="text-teal-700" />
                <span>Replying to <strong>@{replyingTo.nickname}</strong></span>
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-teal-800 hover:text-teal-950 p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Comment Image Attachment Preview */}
          {commentImage && (
            <div className="relative inline-block rounded-xl overflow-hidden border border-slate-300 max-h-32 bg-slate-900 group">
              <img src={commentImage} alt="Comment image attachment" className="max-h-32 w-auto object-cover" />
              <button
                type="button"
                onClick={() => setCommentImage(null)}
                className="absolute top-1 right-1 bg-rose-600 text-white p-1 rounded-full shadow-md hover:bg-rose-700 transition-colors"
                title="Remove image"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex gap-2 items-center">
            <label
              className="p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-teal-700 cursor-pointer flex items-center justify-center shrink-0 transition-colors shadow-2xs"
              title="Attach image to comment"
            >
              <ImageIcon size={18} />
              <input
                type="file"
                accept="image/*"
                onChange={handleCommentImageUpload}
                className="hidden"
              />
            </label>
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={
                replyingTo
                  ? `Write a reply to @${replyingTo.nickname}...`
                  : 'Write a comment or attach an image...'
              }
              className="flex-1 text-xs rounded-xl border border-slate-300 bg-white p-2.5 text-slate-800 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 shadow-2xs"
            />
            <button
              type="submit"
              disabled={!commentText.trim() && !commentImage}
              className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Reply</span>
            </button>
          </div>
        </form>
      </div>

      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          title={`Attachment by ${post.authorNickname}`}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* Edit Thread Lock Modal for Unverified Users */}
      {showEditLockModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
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
                <li className="flex items-center gap-1.5">✓ Verified checkmark across FUHSI Connect</li>
                {!isGuestAccount(userProfile) ? (
                  <li className="flex items-center gap-1.5">✓ Marketplace seller access & priority support</li>
                ) : (
                  <li className="flex items-center gap-1.5">✓ Higher trust & platform credibility</li>
                )}
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
          userProfile={userProfile}
          onClose={() => setShowVerificationModal(false)}
          onSubmitVerification={() => setShowVerificationModal(false)}
        />
      )}

      {showShareModal && (
        <ShareRepostModal
          post={post}
          currentUser={userProfile}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onRepost={(target) => {
            if (onRepost) onRepost(target);
          }}
          onUndoRepost={(target) => {
            if (onUndoRepost) onUndoRepost(target);
          }}
          onQuote={(target, caption) => {
            if (onQuote) onQuote(target, caption);
          }}
          isRepostedByMe={isRepostedByMe}
          repostsCount={effectiveRepostsCount}
        />
      )}
    </div>
  );
};
