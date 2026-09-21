import React, { useState } from 'react';
import { Post, UserProfile } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { formatRelativeTime } from '../utils/dateUtils';
import {
  X,
  Repeat,
  Quote,
  Copy,
  Share2,
  CheckCircle2,
  Send,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface ShareRepostModalProps {
  post: Post;
  currentUser?: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onRepost: (post: Post) => void;
  onUndoRepost?: (post: Post) => void;
  onQuote: (post: Post, caption: string) => void;
  isRepostedByMe?: boolean;
  repostsCount?: number;
}

export const getDedicatedPostUrl = (postId: string): string => {
  if (typeof window === 'undefined') return `/post/${postId}`;
  const origin = window.location.origin;
  return `${origin}/post/${encodeURIComponent(postId)}`;
};

export const ShareRepostModal: React.FC<ShareRepostModalProps> = ({
  post,
  currentUser,
  isOpen,
  onClose,
  onRepost,
  onUndoRepost,
  onQuote,
  isRepostedByMe = false,
  repostsCount = 0,
}) => {
  const [viewMode, setViewMode] = useState<'menu' | 'quote'>('menu');
  const [quoteCaption, setQuoteCaption] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  if (!isOpen) return null;

  // The actual original post (if this was already a repost)
  const targetPost = post.isRepost && post.repostedPost ? post.repostedPost : post;
  const authorNick = targetPost.authorNickname || '@FUHSI_Student';
  const authorBadge = getUserBadgeInfo(authorNick);
  const postUrl = getDedicatedPostUrl(targetPost.id);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy post link:', e);
    }
  };

  const handleNativeShare = async () => {
    const shareData = {
      title: `FUHSI Connect: ${authorNick}'s post`,
      text: targetPost.content || targetPost.text || 'Check out this discussion on FUHSI Connect',
      url: postUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        onClose();
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Native share failed:', err);
        }
      }
    }
    // Fallback: copy link
    handleCopyLink();
  };

  const handleDirectRepost = () => {
    if (isRepostedByMe && onUndoRepost) {
      onUndoRepost(targetPost);
    } else {
      onRepost(targetPost);
    }
    onClose();
  };

  const handlePublishQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteCaption.trim()) return;
    setIsSubmittingQuote(true);
    onQuote(targetPost, quoteCaption.trim());
    setIsSubmittingQuote(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Repeat size={16} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                {viewMode === 'quote' ? 'Quote Thread' : 'Share / Repost'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {viewMode === 'quote'
                  ? 'Add your own thoughts above the original post'
                  : 'Share this thread across FUHSI Connect or copy its link'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* VIEW 1: ACTION MENU */}
        {viewMode === 'menu' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Post Target Preview */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center gap-2">
                <AvatarIcon
                  avatarKey={targetPost.authorAvatarKey}
                  avatarUrl={targetPost.authorAvatarUrl}
                  size={16}
                />
                <span className="font-bold text-xs text-slate-900">{authorNick}</span>
                <VerificationBadge
                  isVerified={authorBadge.isVerified}
                  badgeType={authorBadge.badgeType}
                  title={authorBadge.badgeTitle}
                />
                <span className="text-[10px] text-slate-400">
                  {targetPost.timeAgo || formatRelativeTime(targetPost.timestamp)}
                </span>
              </div>
              <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">
                {targetPost.content || targetPost.text || 'Campus discussion update'}
              </p>
            </div>

            {/* Menu Options */}
            <div className="space-y-2">
              {/* Option 1: Repost / Undo Repost */}
              <button
                id="btn-action-repost"
                onClick={handleDirectRepost}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  isRepostedByMe
                    ? 'bg-rose-50/80 border-rose-200 hover:bg-rose-100/70 text-rose-900'
                    : 'bg-emerald-50/70 border-emerald-200/80 hover:bg-emerald-100/70 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isRepostedByMe ? 'bg-rose-200 text-rose-800' : 'bg-emerald-600 text-white shadow-2xs'
                    }`}
                  >
                    <Repeat size={20} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5">
                      <span>{isRepostedByMe ? 'Undo Repost' : 'Repost'}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/80 text-emerald-800 border border-emerald-200/60">
                        +1 Point
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {isRepostedByMe
                        ? 'Remove this thread from your profile reposts'
                        : 'Instantly share this thread to your profile & campus feed'}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-emerald-800 bg-white px-2 py-1 rounded-lg border border-emerald-200">
                    {repostsCount} {repostsCount === 1 ? 'repost' : 'reposts'}
                  </span>
                </div>
              </button>

              {/* Option 2: Quote */}
              <button
                id="btn-action-quote"
                onClick={() => setViewMode('quote')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-left flex items-center justify-between transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center">
                    <Quote size={20} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                      <span>Quote Post</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200">
                        +2 Points
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Add your own commentary or thoughts above this post
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 3: Copy Dedicated Post Link */}
              <button
                id="btn-action-copy-link"
                onClick={handleCopyLink}
                className="w-full p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-left flex items-center justify-between transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                    {copied ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Copy size={20} />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                      {copied ? 'Link Copied to Clipboard!' : 'Copy Post Link'}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono truncate">
                      {postUrl}
                    </p>
                  </div>
                </div>

                {copied && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 shrink-0">
                    Copied!
                  </span>
                )}
              </button>

              {/* Option 4: Native Share */}
              <button
                id="btn-action-share-native"
                onClick={handleNativeShare}
                className="w-full p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-left flex items-center gap-3 transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                  <Share2 size={20} />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                    Share via Device...
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Send to WhatsApp, Telegram, X, or email
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: QUOTE COMPOSER */}
        {viewMode === 'quote' && (
          <form onSubmit={handlePublishQuote} className="p-4 sm:p-5 space-y-4">
            {/* User typing header */}
            <div className="flex items-center gap-2.5">
              <AvatarIcon
                avatarKey={currentUser?.avatarKey}
                avatarUrl={currentUser?.avatarUrl}
                size={22}
              />
              <div>
                <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                  {currentUser?.nickname || '@FUHSI_Student'}
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">
                  Publishing quote to campus feed
                </span>
              </div>
            </div>

            {/* Caption Input */}
            <textarea
              id="input-quote-caption"
              rows={3}
              value={quoteCaption}
              onChange={(e) => setQuoteCaption(e.target.value)}
              placeholder="Add your caption or opinion on this thread..."
              autoFocus
              className="w-full text-xs sm:text-sm p-3.5 rounded-2xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500/30 focus:border-purple-600 resize-none font-medium placeholder:text-slate-400"
            />

            {/* Embedded Original Post Card */}
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 space-y-2">
              <div className="flex items-center gap-2">
                <AvatarIcon
                  avatarKey={targetPost.authorAvatarKey}
                  avatarUrl={targetPost.authorAvatarUrl}
                  size={16}
                />
                <span className="font-bold text-xs text-slate-900">{authorNick}</span>
                <VerificationBadge
                  isVerified={authorBadge.isVerified}
                  badgeType={authorBadge.badgeType}
                  title={authorBadge.badgeTitle}
                />
                <span className="text-[10px] text-slate-400">
                  {targetPost.timeAgo || formatRelativeTime(targetPost.timestamp)}
                </span>
              </div>

              <p className="text-xs text-slate-700 line-clamp-3 leading-relaxed">
                {targetPost.content || targetPost.text || 'Campus discussion update'}
              </p>

              {targetPost.imageUrl && (
                <div className="h-28 w-full rounded-xl overflow-hidden border border-slate-200">
                  <img
                    src={targetPost.imageUrl}
                    alt="Post media thumbnail"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setViewMode('menu')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={!quoteCaption.trim() || isSubmittingQuote}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Send size={14} />
                <span>Publish Quote</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
