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
  Building2,
  Flame,
  MessageSquare,
  ThumbsUp,
  Share2,
  Clock,
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
  // Main sections: Weekly Campus Ranking & Department Standing
  const [activeMainSection, setActiveMainSection] = useState<'weekly' | 'departments'>('weekly');

  // Sub-tabs under Weekly Campus Ranking: Top 10 Most Engaging & Top 5 Trending Posts
  const [weeklySubTab, setWeeklySubTab] = useState<'engaging' | 'trending'>('engaging');

  const currentUser = userProfile || user || INITIAL_USER_PROFILE;

  // Retrieve Sunday → Saturday weekly window
  const weeklyWindow = useMemo(() => getWeeklyRankingWindow(), []);

  // Consolidate real platform users strictly (no demo accounts, no guests)
  const realUsersList = useMemo(() => {
    const map = new Map<string, UserProfile>();

    // 1. From allUsers prop (synced from Firestore)
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

  // 1. WEEKLY CAMPUS RANKINGS: Top 10 Most Engaging Students (Real central platform data, Sunday → Saturday)
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

  // 2. TOP 5 TRENDING POSTS: Dynamic engagement based on real likes, comments, and shares
  const top5TrendingPosts: TrendingPostItem[] = useMemo(() => {
    return calculateTopTrendingPosts(activePosts, allComments, 5);
  }, [activePosts, allComments]);

  // 3. DEPARTMENT STANDINGS: Real registered student accounts only, guests excluded, aggregates legitimate student points
  const departmentStandings: DepartmentStandingItem[] = useMemo(() => {
    return calculateDepartmentStandings(realUsersList, activePosts, allComments, allReports);
  }, [realUsersList, activePosts, allComments, allReports]);

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-5 pb-24">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-950 rounded-3xl p-6 sm:p-7 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-amber-400/20 text-amber-200 border border-amber-400/30 px-3 py-1 rounded-full mb-2.5">
            <Trophy size={13} />
            Campus Recognition
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1.5 flex items-center gap-2">
            <span>🏆 Leaderboards</span>
          </h1>
          <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed font-medium">
            Real-time rankings driven purely by active student engagement, discussions, and academic department participation.
          </p>
        </div>

        <div className="absolute right-0 bottom-0 opacity-10 translate-x-8 translate-y-8 pointer-events-none">
          <Trophy size={220} />
        </div>
      </div>

      {/* Main Two Sections Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-2xl p-1.5 shadow-xs gap-1.5">
        <button
          id="btn-nav-weekly-ranking"
          onClick={() => setActiveMainSection('weekly')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeMainSection === 'weekly'
              ? 'bg-amber-600 text-white shadow-xs'
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
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 size={18} className={activeMainSection === 'departments' ? 'text-white' : 'text-teal-700'} />
          <span>🏫 Department Standing</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: WEEKLY CAMPUS RANKING                                         */}
      {/* Top 10 Most Engaging & Top 5 Trending Posts                              */}
      {/* ========================================================================= */}
      {activeMainSection === 'weekly' && (
        <div className="space-y-4">
          {/* Sub-tab Navigation */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setWeeklySubTab('engaging')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                weeklySubTab === 'engaging'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Top 10 Most Engaging
            </button>
            <button
              onClick={() => setWeeklySubTab('trending')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                weeklySubTab === 'trending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Top 5 Trending Posts
            </button>
          </div>

          {/* Sub-tab 1: Top 10 Most Engaging */}
          {weeklySubTab === 'engaging' && (
            <div className="space-y-2.5">
              {top10EngagingUsers.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center text-xs text-slate-500 font-medium border border-slate-200">
                  No activity yet this week.
                </div>
              ) : (
                top10EngagingUsers.map((item) => {
                  const cleanItemNick = item.nickname.toLowerCase().replace(/^@/, '');
                  const cleanCurrentNick = (currentUser?.nickname || '').toLowerCase().replace(/^@/, '');
                  const isCurrent = cleanItemNick === cleanCurrentNick;
                  const bInfo = getUserBadgeInfo(item.nickname);

                  return (
                    <div
                      key={item.nickname}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20'
                          : 'bg-white border-slate-200 hover:border-slate-300'
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

                      {/* Weekly Points */}
                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-xs sm:text-sm text-amber-700 block">
                          {item.weeklyPoints} pts
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Sub-tab 2: Top 5 Trending Posts */}
          {weeklySubTab === 'trending' && (
            <div className="space-y-3">
              {top5TrendingPosts.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center text-xs text-slate-500 font-medium border border-slate-200">
                  No trending posts yet.
                </div>
              ) : (
                top5TrendingPosts.map((item) => {
                  const p = item.post;
                  const bInfo = getUserBadgeInfo(p.authorNickname || '');
                  return (
                    <div
                      key={p.id}
                      onClick={() => onSelectPost?.(p)}
                      className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-amber-300 hover:shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs mt-0.5 ${
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

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="w-6 h-6 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                              <AvatarIcon
                                avatarKey={p.authorAvatarKey}
                                avatarUrl={p.authorAvatarUrl}
                                size={14}
                                sizeClassName="w-full h-full object-cover"
                              />
                            </div>
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {p.authorNickname?.startsWith('@') ? p.authorNickname : `@${p.authorNickname || 'Student'}`}
                            </span>
                            <VerificationBadge
                              isVerified={bInfo.isVerified}
                              badgeType={bInfo.badgeType}
                              title={bInfo.badgeTitle}
                            />
                            {p.categoryTag && (
                              <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                                {p.categoryTag}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-800 font-medium line-clamp-2 leading-relaxed">
                            {p.content || p.text || 'No text content'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="flex items-center gap-3 text-slate-500 text-xs font-bold">
                          <span className="flex items-center gap-1" title="Likes">
                            <ThumbsUp size={13} className="text-rose-500" />
                            <span>{item.likesCount}</span>
                          </span>
                          <span className="flex items-center gap-1" title="Comments">
                            <MessageSquare size={13} className="text-teal-600" />
                            <span>{item.commentsCount}</span>
                          </span>
                          <span className="flex items-center gap-1" title="Shares">
                            <Share2 size={13} className="text-indigo-500" />
                            <span>{item.sharesCount}</span>
                          </span>
                        </div>

                        <div className="text-right pl-3 sm:border-l sm:border-slate-100">
                          <div className="text-xs sm:text-sm font-black text-amber-700">
                            {item.totalEngagement}
                          </div>
                          <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                            Score
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: DEPARTMENT STANDING                                            */}
      {/* ========================================================================= */}
      {activeMainSection === 'departments' && (
        <div className="space-y-4">
          {departmentStandings.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center text-xs text-slate-500 font-medium border border-slate-200">
              No department activity yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departmentStandings.map((dept) => (
                <div
                  key={dept.name}
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-teal-300 hover:shadow-xs transition-all flex items-center justify-between gap-3"
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

                  <div className="text-right shrink-0 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
                    <div className="text-base sm:text-lg font-black text-amber-700">
                      {dept.totalPoints.toLocaleString()}
                    </div>
                    <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                      Points
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Weekly Reset Note */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 mt-6">
        <div className="flex items-center gap-2 font-bold">
          <Clock size={16} className="text-amber-600 shrink-0" />
          <span>Weekly rankings reset every Sunday at 00:00 • Real-time live updates</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-900 font-extrabold bg-white px-3 py-1.5 rounded-full border border-amber-200 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>Cycle: {weeklyWindow.label} ({weeklyWindow.daysRemaining}d {weeklyWindow.hoursRemaining}h remaining)</span>
        </div>
      </div>
    </div>
  );
};
