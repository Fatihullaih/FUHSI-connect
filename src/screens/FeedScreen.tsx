import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Post, Comment, PostCategory, UserProfile } from '../types';
import { PostCard } from '../components/PostCard';
import { generateMorePosts, isDemoPost } from '../utils/postGenerator';
import { getTimestampMs } from '../utils/dateUtils';
import { 
  Loader2,
  RefreshCw,
  SquarePen,
  ArrowUp,
  Sparkles,
  MessageSquarePlus
} from 'lucide-react';

interface FeedScreenProps {
  userProfile?: UserProfile | null;
  user?: UserProfile | null;
  posts: Post[];
  selectedFilter?: string;
  onFilterSelect?: (filter: string) => void;
  onLikeClick?: (post: Post) => void;
  onBookmarkClick?: (post: Post) => void;
  onCommentClick?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
  onEditPost?: (postId: string, newContent: string) => void;
  onVotePoll?: (post: Post, option: string) => void;
  onReportPost?: (post: Post, reason: string) => void;
  onAuthorClick?: (post: Post) => void;
  onCreatePostClick?: () => void;

  // Legacy / alternative props compatibility
  comments?: Record<string, Comment[]>;
  onVote?: (postId: string, voteType: 'up' | 'down') => void;
  onBookmark?: (postId: string) => void;
  onAddComment?: (postId: string, text: string) => void;
  onFlagPost?: (postId: string, reason: string) => void;
  onCreatePost?: (content: string, category: PostCategory, customNickname?: string) => void;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({
  userProfile,
  user,
  posts = [],
  onLikeClick,
  onBookmarkClick,
  onCommentClick,
  onDeletePost,
  onEditPost,
  onVotePoll,
  onReportPost,
  onAuthorClick,
  onCreatePostClick,
  onCreatePost,
  comments = {},
  onVote,
  onBookmark,
  onAddComment,
  onFlagPost,
}) => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [autoRefreshNotice, setAutoRefreshNotice] = useState<string | null>(null);

  // Finite scrolling state with clear end
  const [extraPosts, setExtraPosts] = useState<Post[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadCountRef = useRef(0);
  const MAX_LOAD_BATCHES = 3;

  // Handle scroll detection for Back to Top button
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-refresh interval (checks every 25 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoRefreshNotice('✨ Feed updated automatically with fresh campus posts');
      setTimeout(() => setAutoRefreshNotice(null), 4000);
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Infinite Scroll Trigger Function with distinct end
  const loadMorePosts = useCallback(() => {
    if (isLoadingMore || hasReachedEnd) return;
    if (loadCountRef.current >= MAX_LOAD_BATCHES) {
      setHasReachedEnd(true);
      return;
    }

    setIsLoadingMore(true);

    setTimeout(() => {
      const nextBatch = generateMorePosts(4, loadCountRef.current * 4);
      loadCountRef.current += 1;
      setExtraPosts((prev) => [...prev, ...nextBatch]);
      setIsLoadingMore(false);

      if (loadCountRef.current >= MAX_LOAD_BATCHES) {
        setHasReachedEnd(true);
      }
    }, 600);
  }, [isLoadingMore, hasReachedEnd]);

  // Intersection Observer for scroll trigger
  useEffect(() => {
    if (hasReachedEnd) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !hasReachedEnd) {
          loadMorePosts();
        }
      },
      { threshold: 0.1, rootMargin: '150px' }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [observerTarget, isLoadingMore, hasReachedEnd, loadMorePosts]);

  // Combine initial posts and extra loaded posts (excluding any demo posts)
  const allCombinedPosts = [...posts, ...extraPosts].filter((post) => !isDemoPost(post));

  // Filter removed posts and sort chronologically (newest first)
  const activePosts = allCombinedPosts
    .filter((post) => post.status !== 'Removed')
    .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));

  return (
    <div className="py-4 px-3 sm:px-4 max-w-2xl mx-auto pb-28 space-y-3">
      {/* Auto-refresh Notification Toast */}
      {autoRefreshNotice && (
        <div className="sticky top-14 z-20 bg-teal-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md flex items-center justify-between animate-in slide-in-from-top-2 border border-teal-600">
          <span className="flex items-center gap-2">
            <Sparkles size={15} className="text-teal-300" />
            <span>{autoRefreshNotice}</span>
          </span>
          <button onClick={() => setAutoRefreshNotice(null)} className="text-teal-200 hover:text-white font-black text-sm cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Chronological Feed */}
      <div className="space-y-3">
        {activePosts.length === 0 ? (
          <div className="py-12 px-6 bg-white rounded-2xl border border-slate-200 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 bg-teal-50 text-teal-700 rounded-2xl flex items-center justify-center mx-auto border border-teal-200/80">
              <MessageSquarePlus size={28} />
            </div>
            <div className="max-w-sm mx-auto space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">No Campus Posts Yet</h3>
              <p className="text-xs text-slate-500 font-medium">
                Be the first to share an update, academic question, or announcement with the university community.
              </p>
            </div>
            <button
              onClick={() => {
                if (onCreatePostClick) {
                  onCreatePostClick();
                } else if (onCreatePost) {
                  onCreatePost('', 'General');
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <SquarePen size={15} />
              <span>Create First Post</span>
            </button>
          </div>
        ) : (
          <>
            {activePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                comments={comments[post.id] || []}
                currentUserNickname={userProfile?.nickname || user?.nickname}
                userProfile={userProfile || user}
                onLikeClick={onLikeClick}
                onBookmarkClick={onBookmarkClick}
                onCommentClick={onCommentClick}
                onDeletePost={onDeletePost}
                onEditPost={onEditPost}
                onVotePoll={onVotePoll}
                onReportPost={onReportPost}
                onAuthorClick={onAuthorClick}
                onVote={onVote}
                onBookmark={onBookmark}
                onAddComment={onAddComment}
                onFlagPost={onFlagPost}
              />
            ))}

            {/* End of Posts & Back to Top Handler */}
            {!hasReachedEnd ? (
              <div ref={observerTarget} className="py-6 text-center flex flex-col items-center justify-center space-y-3">
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-800 bg-teal-50 px-4 py-2.5 rounded-full border border-teal-200/80 shadow-xs">
                    <Loader2 size={16} className="animate-spin text-teal-700" />
                    <span>Loading older campus posts...</span>
                  </div>
                ) : (
                  <button
                    onClick={loadMorePosts}
                    className="text-xs font-bold text-slate-500 hover:text-teal-800 hover:bg-slate-100 px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={14} />
                    <span>Load older posts...</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="py-6 px-4 bg-white rounded-2xl border border-slate-200/90 text-center space-y-3 shadow-xs">
                <div className="w-10 h-10 bg-teal-50 text-teal-700 rounded-full flex items-center justify-center mx-auto border border-teal-200">
                  <Sparkles size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">You've reached the last post on the feed!</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Click "Back to Top" below to return to the newest updates.</p>
                </div>
                <button
                  onClick={scrollToTop}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <ArrowUp size={15} />
                  <span>Back to Top</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Back to Top Button (visible when scrolled down) */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 left-4 sm:left-8 z-40 bg-slate-900/90 hover:bg-slate-900 active:scale-95 text-white rounded-full p-3 shadow-xl flex items-center gap-1.5 transition-all border border-slate-700/60 cursor-pointer"
          title="Back to Top"
        >
          <ArrowUp className="w-5 h-5 text-white" />
          <span className="hidden sm:inline font-bold text-xs pr-1">Top</span>
        </button>
      )}

      {/* Floating Action Button for Creating Posts */}
      <button
        onClick={() => {
          if (onCreatePostClick) {
            onCreatePostClick();
          } else if (onCreatePost) {
            onCreatePost('', 'General');
          }
        }}
        className="fixed bottom-20 right-4 sm:right-8 z-40 bg-teal-700 hover:bg-teal-800 active:scale-95 text-white rounded-full p-4 sm:px-5 sm:py-3.5 shadow-2xl flex items-center gap-2 transition-all hover:scale-105 border border-teal-500/40 group cursor-pointer"
        title="Post to Campus Feed"
      >
        <SquarePen className="w-5 h-5 text-white transition-transform group-hover:rotate-6" />
        <span className="hidden sm:inline font-black text-sm tracking-wide">Post</span>
      </button>
    </div>
  );
};
