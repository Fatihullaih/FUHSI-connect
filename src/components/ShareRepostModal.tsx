import React, { useState } from 'react';
import { Post, UserProfile } from '../types';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import {
  X,
  Repeat,
  Quote,
  Copy,
  Share2,
  CheckCircle2,
  Send,
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
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 900);
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
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-xs sm:max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-sm">
            {viewMode === 'quote' ? 'Quote Post' : 'Share'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* VIEW 1: COMPACT 2x2 ACTION MENU */}
        {viewMode === 'menu' && (
          <div className="p-3.5">
            <div className="grid grid-cols-2 gap-2.5">
              {/* Option 1: Repost */}
              <button
                id="btn-action-repost"
                type="button"
                onClick={handleDirectRepost}
                className={`flex items-center justify-center gap-2 py-3 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  isRepostedByMe
                    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <Repeat size={16} className={isRepostedByMe ? 'text-rose-600 shrink-0' : 'text-emerald-600 shrink-0'} />
                <span className="truncate">{isRepostedByMe ? 'Undo Repost' : 'Repost'}</span>
              </button>

              {/* Option 2: Quote Post */}
              <button
                id="btn-action-quote"
                type="button"
                onClick={() => setViewMode('quote')}
                className="flex items-center justify-center gap-2 py-3 px-2.5 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-purple-800 text-xs font-bold transition-all cursor-pointer"
              >
                <Quote size={16} className="text-purple-600 shrink-0" />
                <span className="truncate">Quote Post</span>
              </button>

              {/* Option 3: Copy Link */}
              <button
                id="btn-action-copy-link"
                type="button"
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-2 py-3 px-2.5 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100 text-teal-800 text-xs font-bold transition-all cursor-pointer"
              >
                {copied ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span className="text-emerald-700 truncate">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} className="text-teal-600 shrink-0" />
                    <span className="truncate">Copy Link</span>
                  </>
                )}
              </button>

              {/* Option 4: Share */}
              <button
                id="btn-action-share-native"
                type="button"
                onClick={handleNativeShare}
                className="flex items-center justify-center gap-2 py-3 px-2.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-800 text-xs font-bold transition-all cursor-pointer"
              >
                <Share2 size={16} className="text-blue-600 shrink-0" />
                <span className="truncate">Share</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: QUOTE COMPOSER */}
        {viewMode === 'quote' && (
          <form onSubmit={handlePublishQuote} className="p-3.5 space-y-3">
            <textarea
              id="input-quote-caption"
              rows={3}
              value={quoteCaption}
              onChange={(e) => setQuoteCaption(e.target.value)}
              placeholder="Add your thoughts..."
              autoFocus
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500/30 focus:border-purple-600 resize-none font-medium placeholder:text-slate-400"
            />

            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-600 line-clamp-2">
              <span className="font-bold text-slate-800 mr-1.5">{authorNick}:</span>
              {targetPost.content || targetPost.text || 'Campus discussion update'}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setViewMode('menu')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={!quoteCaption.trim() || isSubmittingQuote}
                className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Send size={13} />
                <span>Publish</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
