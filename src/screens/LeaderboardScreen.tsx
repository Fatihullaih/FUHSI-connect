import React, { useState, useMemo } from 'react';
import { UserProfile, Post, Comment, Report } from '../types';
import { INITIAL_USER_PROFILE } from '../data/initialData';
import { VerificationBadge } from '../components/VerificationBadge';
import { AvatarIcon } from '../components/AvatarIcon';
import { isDemoUser, isDemoNickname } from '../utils/postGenerator';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount, getUserIdentitySubtitle, isModulaAccount } from '../utils/userDbUtils';
import {
  getWeeklyRankingWindow,
  calculateWeeklyUserPoints,
  calculateDepartmentStandings,
  calculateTopTrendingPosts,
  calculateUserPoints,
  DepartmentStandingItem,
  TrendingPostItem,
} from '../utils/reputationUtils';
import {
  Trophy,
  Award,
  Sparkles,
  Building2,
  TrendingUp,
  Flame,
  Clock,
  MessageSquare,
  ThumbsUp,
  Share2,
  Users,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface LeaderboardScreenProps {
  userProfile?: UserProfile | null;
  user?: UserProfile | null;
  allUsers?: UserProfile[];
  activePosts?: Post[];
  allComments?: Comment[];
  allReports?: Report[];
  onAuthorClick?: (post: any) => void;
  onSelectPost?: (post: Post) => void;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  userProfile,
  user,
  allUsers = [],
  activePosts = [],
  allComments = [],
  allReports = [],
  onAuthorClick,
  onSelectPost,
}) => {
  // Main two sections only: Weekly Campus Ranking & Department Standing
  const [activeMainSection, setActiveMainSection] = useState<'weekly' | 'departments'>('weekly');
  // Under Weekly Campus Ranking: Top 10 Most Engaging & Top 5 Trending Posts
  const [weeklySubTab, setWeeklySubTab] = useState<'engaging' | 'trending'>('engaging');

  const currentUser = userProfile || user || INITIAL_USER_PROFILE;

  // Retrieve Sunday → Saturday weekly window
  const weeklyWindow = useMemo(() => getWeeklyRankingWindow(), []);

  // Consolidate real platform users (exclude demo accounts and guests if applicable)
  const realUsersList = useMemo(() => {
    const map = new Map<string, UserProfile>();

    // 1. From allUsers prop
    (allUsers || []).forEach((u) => {
      if (!u || !u.nickname) return;
      const clean = u.nickname.trim().toLowerCase().replace(/^@/, '');
      if (!clean || isDemoUser(u) || isDemoNickname(clean)) return;
      map.set(clean, u);
    });

    // 2. From localStorage fuhsi_users_db
    try {
      const stored = localStorage.getItem('fuhsi_users_db');
      if (stored) {
        const parsed: UserProfile[] = JSON.parse(stored);
        parsed.forEach((u) => {
          if (!u || !u.nickname) return;
          const clean = u.nickname.trim().toLowerCase().replace(/^@/, '');
          if (!clean || isDemoUser(u) || isDemoNickname(clean)) return;
          if (!map.has(clean)) {
            map.set(clean, u);
          }
        });
      }
    } catch (e) {
      console.error('Error reading fuhsi_users_db:', e);
    }

    // 3. Current logged in user
    if (currentUser && currentUser.nickname && !isDemoUser(currentUser) && !isDemoNickname(currentUser.nickname)) {
      const clean = currentUser.nickname.trim().toLowerCase().replace(/^@/, '');
      map.set(clean, currentUser);
    }

    return Array.from(map.values());
  }, [allUsers, currentUser]);

  // WEEKLY CAMPUS RANKINGS: Top 10 Most Engaging Students (Sunday → Saturday reset)
  const top10EngagingUsers = useMemo(() => {
    const scored = realUsersList
      .filter((u) => {
        // Exclude system admin / modula from student rankings
        if (isModulaAccount(u) || u.isAdmin) return false;
        return true;
      })
      .map((u) => {
        const weeklyPts = calculateWeeklyUserPoints(
          u.nickname,
          u,
          activePosts,
          allComments,
          allReports,
          weeklyWindow
        );
        const totalPts = calculateUserPoints(
          u.nickname,
          u,
          activePosts,
          allComments,
          allReports
        );

        return {
          user: u,
          nickname: u.nickname.startsWith('@') ? u.nickname : `@${u.nickname}`,
          department: isGuestAccount(u) ? '' : (u.department || 'FUHSI Student'),
          level: isGuestAccount(u) ? '' : (u.level || '100L'),
          avatarKey: u.avatarKey || 'caduceus',
          avatarUrl: u.avatarUrl,
          weeklyPoints: weeklyPts,
          totalPoints: totalPts,
          isVerified: Boolean(u.isVerified),
        };
      });

    // Sort descending by weekly points, breaking ties by total all-time points
    scored.sort((a, b) => {
      if (b.weeklyPoints !== a.weeklyPoints) {
        return b.weeklyPoints - a.weeklyPoints;
      }
      return b.totalPoints - a.totalPoints;
    });

    return scored.slice(0, 10).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }, [realUsersList, activePosts, allComments, allReports, weeklyWindow]);

  // TOP 5 TRENDING POSTS: Dynamic engagement based on likes, comments, and shares
  const top5TrendingPosts: TrendingPostItem[] = useMemo(() => {
    return calculateTopTrendingPosts(activePosts, 5);
  }, [activePosts]);

  // DEPARTMENT STANDINGS: Real registered student accounts only, guests excluded, aggregates legitimate student points
  const departmentStandings: DepartmentStandingItem[] = useMemo(() => {
    return calculateDepartmentStandings(realUsersList, activePosts, allComments, allReports);
  }, [realUsersList, activePosts, allComments, allReports]);

  // Current user's weekly standing summary
  const currentUserWeeklyPoints = useMemo(() => {
    if (!currentUser?.nickname) return 0;
    return calculateWeeklyUserPoints(
      currentUser.nickname,
      currentUser,
      activePosts,
      allComments,
      allReports,
      weeklyWindow
    );
  }, [currentUser, activePosts, allComments, allReports, weeklyWindow]);

  const currentUserWeeklyRank = useMemo(() => {
    if (!currentUser?.nickname) return null;
    const cleanCurrent = currentUser.nickname.trim().toLowerCase().replace(/^@/, '');
    const foundIndex = top10EngagingUsers.findIndex(
      (u) => u.nickname.toLowerCase().replace(/^@/, '') === cleanCurrent
    );
    return foundIndex !== -1 ? foundIndex + 1 : null;
  }, [currentUser, top10EngagingUsers]);

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6 pb-24">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-amber-400/20 text-amber-200 border border-amber-400/30 px-3 py-1 rounded-full mb-3">
            <Trophy size={14} />
            FUHSI Reputation & Leaderboards
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            🏆 Campus Reputation & Rankings
          </h1>
          <p className="text-sm text-amber-100/90 leading-relaxed">
            Real-time campus rankings driven purely by student engagement, peer-reviewed discussions, and active academic department participation.
          </p>
        </div>

        <div className="absolute right-0 bottom-0 opacity-10 translate-x-8 translate-y-8 pointer-events-none">
          <Trophy size={260} />
        </div>
      </div>

      {/* Main Two Sections Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-2xl p-1.5 shadow-xs">
        <button
          id="btn-nav-weekly-ranking"
          onClick={() => setActiveMainSection('weekly')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeMainSection === 'weekly'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Flame size={18} className={activeMainSection === 'weekly' ? 'text-white' : 'text-amber-600'} />
          <span>🔥 Weekly Campus Ranking</span>
        </button>

        <button
          id="btn-nav-department-standing"
          onClick={() => setActiveMainSection('departments')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeMainSection === 'departments'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 size={18} className={activeMainSection === 'departments' ? 'text-white' : 'text-teal-700'} />
          <span>🏫 Department Standing</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: WEEKLY CAMPUS RANKING (Top 10 Engaging + Top 5 Trending Posts) */}
      {/* ========================================================================= */}
      {activeMainSection === 'weekly' && (
        <div className="space-y-6">
          {/* Sub-navigation pill toggle: Top 10 Most Engaging vs Top 5 Trending Posts */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <button
                id="btn-sub-engaging"
                onClick={() => setWeeklySubTab('engaging')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  weeklySubTab === 'engaging'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Flame size={14} />
                <span>🔥 Top 10 Most Engaging</span>
              </button>

              <button
                id="btn-sub-trending"
                onClick={() => setWeeklySubTab('trending')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  weeklySubTab === 'trending'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp size={14} />
                <span>🔥 Top 5 Trending Posts</span>
              </button>
            </div>

            {/* Weekly Reset Status Indicator */}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Clock size={14} className="text-amber-600 shrink-0" />
              <span>
                Period: <strong className="text-slate-900">{weeklyWindow.label}</strong> (Sunday → Saturday)
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-1" />
              <span className="text-[11px] font-bold text-emerald-700">Live</span>
            </div>
          </div>

          {/* Privacy Note */}
          <p className="text-xs text-slate-500 font-medium px-1">
            🔒 Privacy Guarantee: Campus rankings display verified student handles/nicknames. Real names remain strictly confidential.
          </p>

          {/* SUB-VIEW 1: TOP 10 MOST ENGAGING */}
          {weeklySubTab === 'engaging' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Leaderboard Table / Cards */}
              <div className="lg:col-span-2 space-y-3">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Flame size={20} className="text-amber-500" />
                      <div>
                        <h2 className="font-extrabold text-slate-900 text-base">
                          Top 10 Most Engaging Students
                        </h2>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Continuously ranked by legitimate activity earned this week (Sunday – Saturday).
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 shrink-0">
                      Live Reset Weekly
                    </span>
                  </div>

                  {top10EngagingUsers.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 font-medium space-y-2">
                      <p>No student engagement activity logged yet for this week ({weeklyWindow.label}).</p>
                      <p className="text-slate-400">Post updates and participate in peer discussions to claim the #1 spot!</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {top10EngagingUsers.map((item) => {
                        const cleanItemNick = item.nickname.toLowerCase().replace(/^@/, '');
                        const cleanCurrentNick = (currentUser?.nickname || '').toLowerCase().replace(/^@/, '');
                        const isCurrent = cleanItemNick === cleanCurrentNick;
                        const bInfo = getUserBadgeInfo(item.nickname);

                        return (
                          <div
                            key={item.nickname}
                            className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              isCurrent
                                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20'
                                : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Position Badge */}
                              <div
                                className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                                  item.rank === 1
                                    ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-500/40'
                                    : item.rank === 2
                                    ? 'bg-slate-300 text-slate-800'
                                    : item.rank === 3
                                    ? 'bg-amber-700 text-amber-100'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                #{item.rank}
                              </div>

                              {/* Avatar */}
                              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                <AvatarIcon
                                  avatarKey={item.avatarKey}
                                  avatarUrl={item.avatarUrl}
                                  size={18}
                                  sizeClassName="w-full h-full object-cover"
                                />
                              </div>

                              {/* Details */}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => {
                                      if (onAuthorClick) {
                                        onAuthorClick({
                                          id: `weekly_${item.rank}_${item.nickname}`,
                                          authorNickname: item.nickname,
                                          timeAgo: 'Weekly Leaderboard',
                                          categoryTag: item.department,
                                          text: '',
                                          likesCount: 0,
                                          commentsCount: 0,
                                          createdAt: '',
                                        });
                                      }
                                    }}
                                    className="font-extrabold text-slate-900 hover:text-amber-700 text-xs sm:text-sm hover:underline cursor-pointer truncate text-left"
                                  >
                                    {item.nickname}
                                  </button>

                                  <VerificationBadge
                                    isVerified={bInfo.isVerified}
                                    badgeType={bInfo.badgeType}
                                    title={bInfo.badgeTitle}
                                  />

                                  {isCurrent && (
                                    <span className="text-[10px] font-extrabold bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full">
                                      YOU
                                    </span>
                                  )}
                                </div>

                                <p className="text-[11px] text-slate-500 font-medium truncate">
                                  {getUserIdentitySubtitle(item.user, item.department, item.level)}
                                </p>
                              </div>
                            </div>

                            {/* Weekly Points Metric */}
                            <div className="text-right shrink-0">
                              <span className="font-extrabold text-xs sm:text-sm text-amber-700 block">
                                {item.weeklyPoints} pts
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400">
                                this week
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* User Standing & Reset Sidebar */}
              <div className="space-y-4">
                {/* Your Standing Box */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                    <Sparkles size={18} className="text-amber-600" />
                    <span>Your Weekly Standing</span>
                  </h3>

                  <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200/80 text-center">
                    <div className="text-[11px] uppercase font-extrabold tracking-wider text-amber-800 mb-1">
                      Points Earned This Week
                    </div>
                    <div className="text-3xl font-extrabold text-amber-900 mb-1">
                      {currentUserWeeklyPoints}
                    </div>
                    <p className="text-xs font-semibold text-amber-700">
                      {currentUserWeeklyRank
                        ? `Ranked #${currentUserWeeklyRank} in Top 10 Campus Leaders`
                        : 'Participate to enter the weekly Top 10'}
                    </p>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 font-medium">
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                      <span>Ranking Cycle</span>
                      <span className="font-bold text-slate-900">Sunday → Saturday</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                      <span>Reset Timer</span>
                      <span className="font-bold text-amber-700">
                        {weeklyWindow.daysRemaining}d {weeklyWindow.hoursRemaining}h remaining
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span>Live Re-calculation</span>
                      <span className="font-bold text-emerald-600">Active</span>
                    </div>
                  </div>
                </div>

                {/* Point Earning Rules Explainer */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
                  <span className="font-bold text-slate-900 block">How Weekly Points Are Earned:</span>
                  <ul className="space-y-1 text-slate-600 text-[11px]">
                    <li className="flex items-center justify-between">
                      <span>📝 Create a thread</span>
                      <strong className="text-emerald-700">+2 pts</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>👍 Receive like from peer</span>
                      <strong className="text-emerald-700">+1 pt</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>💬 Receive comment from peer</span>
                      <strong className="text-emerald-700">+1 pt</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>🔄 Receive thread repost</span>
                      <strong className="text-emerald-700">+1 pt</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>👤 Complete profile</span>
                      <strong className="text-blue-700">+20 pts</strong>
                    </li>
                  </ul>
                  <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                    Self-likes and self-comments earn 0 points. Weekly rankings reset automatically each Sunday at 00:00.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: TOP 5 TRENDING POSTS */}
          {weeklySubTab === 'trending' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <TrendingUp size={20} className="text-purple-600" />
                    <span>🔥 Top 5 Trending Posts</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Calculated dynamically from real engagement (likes, comments, and shares) generated on each post.
                  </p>
                </div>
                <span className="text-[11px] font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200 shrink-0">
                  Top 5 Active
                </span>
              </div>

              {top5TrendingPosts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 font-medium">
                  No active campus feed discussions found.
                </div>
              ) : (
                <div className="space-y-3">
                  {top5TrendingPosts.map((item) => {
                    const post = item.post;
                    const authorNick = post.authorNickname || post.nickname || '@FUHSI_Student';
                    const bInfo = getUserBadgeInfo(authorNick);
                    const category = post.category || post.categoryTag || 'Campus Discussion';
                    const textSnippet = post.content || post.text || 'Campus discussion update';

                    return (
                      <div
                        key={post.id || item.rank}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-purple-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {/* Rank */}
                          <span
                            className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                              item.rank === 1
                                ? 'bg-purple-700 text-white shadow-2xs'
                                : item.rank === 2
                                ? 'bg-purple-200 text-purple-900'
                                : item.rank === 3
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            #{item.rank}
                          </span>

                          <div className="min-w-0 flex-1 space-y-1">
                            {/* Author & Category */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => {
                                  if (onAuthorClick) {
                                    onAuthorClick({
                                      id: post.id,
                                      authorNickname: authorNick,
                                      timeAgo: post.timeAgo || 'Trending',
                                      categoryTag: category,
                                      text: textSnippet,
                                      likesCount: item.likesCount,
                                      commentsCount: item.commentsCount,
                                      createdAt: post.createdAt,
                                    });
                                  }
                                }}
                                className="font-extrabold text-slate-900 hover:text-purple-700 text-xs hover:underline cursor-pointer"
                              >
                                {authorNick}
                              </button>

                              <VerificationBadge
                                isVerified={bInfo.isVerified}
                                badgeType={bInfo.badgeType}
                                title={bInfo.badgeTitle}
                              />

                              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">
                                {category}
                              </span>
                            </div>

                            {/* Snippet / Link to open */}
                            <button
                              onClick={() => {
                                if (onSelectPost) {
                                  onSelectPost(post);
                                }
                              }}
                              className="text-xs text-slate-800 font-medium line-clamp-2 hover:text-purple-800 cursor-pointer text-left block"
                            >
                              {textSnippet}
                            </button>
                          </div>
                        </div>

                        {/* Engagement Stats Pill */}
                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <div className="flex items-center gap-3 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                            <span className="flex items-center gap-1 font-bold text-amber-700">
                              <ThumbsUp size={13} />
                              {item.likesCount}
                            </span>
                            <span className="flex items-center gap-1 font-bold text-teal-700">
                              <MessageSquare size={13} />
                              {item.commentsCount}
                            </span>
                            <span className="flex items-center gap-1 font-bold text-purple-700">
                              <Share2 size={13} />
                              {item.sharesCount}
                            </span>
                          </div>

                          {onSelectPost && (
                            <button
                              onClick={() => onSelectPost(post)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer"
                              title="View Discussion"
                            >
                              <ChevronRight size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: DEPARTMENT STANDING (Real registered students, guests excluded) */}
      {/* ========================================================================= */}
      {activeMainSection === 'departments' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                  <Building2 size={22} className="text-teal-700" />
                  <span>🏫 FUHSI Department Standing</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Aggregated strictly from registered student accounts on FUHSI Connect. Guests and demo accounts are excluded.
                </p>
              </div>

              <span className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-full border border-teal-200 w-fit shrink-0">
                Live Department Standings
              </span>
            </div>

            {departmentStandings.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 font-medium space-y-2">
                <p>No registered departmental students active yet.</p>
                <p className="text-slate-400">
                  Departments appear automatically as students register and participate across campus.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {departmentStandings.map((dept) => (
                  <div
                    key={dept.name}
                    className="bg-slate-50/70 hover:bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-teal-300 hover:shadow-xs transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-black px-2.5 py-0.5 rounded-md shrink-0 ${
                            dept.rank === 1
                              ? 'bg-amber-400 text-amber-950 ring-1 ring-amber-500/30'
                              : dept.rank === 2
                              ? 'bg-slate-300 text-slate-800'
                              : dept.rank === 3
                              ? 'bg-amber-700 text-amber-100'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          #{dept.rank}
                        </span>
                        <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                          {dept.name}
                        </h3>
                      </div>

                      {/* Active participation details */}
                      <p className="text-xs text-slate-600 font-medium">
                        <strong className="text-slate-900">{dept.activeStudents}</strong>{' '}
                        {dept.activeStudents === 1 ? 'active student' : 'active students'}
                        {dept.topContributor && (
                          <>
                            {' • Top: '}
                            <button
                              onClick={() => {
                                if (onAuthorClick && dept.topContributor) {
                                  onAuthorClick({
                                    id: `dept_${dept.name}_${dept.topContributor.nickname}`,
                                    authorNickname: dept.topContributor.nickname,
                                    timeAgo: 'Department Leader',
                                    categoryTag: dept.name,
                                    text: '',
                                    likesCount: 0,
                                    commentsCount: 0,
                                    createdAt: '',
                                  });
                                }
                              }}
                              className="font-bold text-teal-700 hover:underline cursor-pointer"
                            >
                              {dept.topContributor.nickname}
                            </button>
                            {' '}({dept.topContributor.points} pts)
                          </>
                        )}
                      </p>
                    </div>

                    {/* Total Points */}
                    <div className="text-right shrink-0 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-base sm:text-lg font-black text-amber-700">
                        {dept.totalPoints.toLocaleString()}
                      </div>
                      <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                        Total Points
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
