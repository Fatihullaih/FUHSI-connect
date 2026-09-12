import React, { useState, useMemo } from 'react';
import { DepartmentRanking, UserProfile, Post } from '../types';
import { INITIAL_USER_PROFILE } from '../data/initialData';
import { VerificationBadge } from '../components/VerificationBadge';
import { AvatarIcon } from '../components/AvatarIcon';
import { isDemoUser, isDemoNickname, isDemoPost } from '../utils/postGenerator';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount, getUserIdentitySubtitle, isModulaAccount } from '../utils/userDbUtils';
import { 
  Trophy, 
  Award, 
  Sparkles, 
  Crown, 
  Building2, 
  Medal, 
  ShieldCheck,
  Send,
  CheckCircle2,
  TrendingUp,
  ThumbsUp,
  MessageSquare,
  FileText,
  Flame,
  Star,
  Users
} from 'lucide-react';

interface LeaderboardScreenProps {
  userProfile?: UserProfile | null;
  user?: UserProfile | null;
  departmentRankings?: DepartmentRanking[];
  activePosts?: Post[];
  onSubmitVerificationRequest?: (category: string, statement: string) => void;
  onAuthorClick?: (post: any) => void;
}

const DEFAULT_DEPARTMENTS: DepartmentRanking[] = [
  { name: 'Medicine & Surgery', code: 'MED', totalPoints: 12450, activeStudents: 340, topContributor: '-' },
  { name: 'Nursing Science', code: 'NRS', totalPoints: 9820, activeStudents: 280, topContributor: '-' },
  { name: 'Medical Lab Science', code: 'MLS', totalPoints: 7640, activeStudents: 190, topContributor: '-' },
  { name: 'Physiology', code: 'PHY', totalPoints: 5430, activeStudents: 150, topContributor: '-' },
  { name: 'Anatomy', code: 'ANA', totalPoints: 4890, activeStudents: 120, topContributor: '-' },
  { name: 'Biochemistry', code: 'BCH', totalPoints: 4120, activeStudents: 110, topContributor: '-' },
];

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  userProfile,
  user,
  departmentRankings = DEFAULT_DEPARTMENTS,
  activePosts = [],
  onSubmitVerificationRequest,
  onAuthorClick,
}) => {
  const [activeLeaderTab, setActiveLeaderTab] = useState<'students' | 'weekly' | 'departments' | 'badges' | 'verify'>('weekly');
  const [weeklySubCategory, setWeeklySubCategory] = useState<'engaging' | 'helpful' | 'trending'>('engaging');
  const [verifCategory, setVerifCategory] = useState('Trusted Student Leader (Clinical Skills Mentor)');

  const checkIsVerified = (nickname?: string) => {
    if (!nickname) return false;
    try {
      const cleanNick = nickname.toLowerCase().replace(/^@/, '');
      const vStr = localStorage.getItem('fuhsi_verifications_db');
      if (vStr) {
        const vList: any[] = JSON.parse(vStr);
        const found = vList.find(
          (req) =>
            req.status === 'APPROVED' &&
            req.applicantNickname?.toLowerCase().replace(/^@/, '') === cleanNick
        );
        if (found) return true;
      }
      const uStr = localStorage.getItem('fuhsi_users_db');
      if (uStr) {
        const uList: any[] = JSON.parse(uStr);
        const foundU = uList.find(
          (usr) => (usr.nickname || '').toLowerCase().replace(/^@/, '') === cleanNick
        );
        if (foundU && (foundU.isVerified || foundU.verificationStatus === 'approved')) return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };
  const [verifStatement, setVerifStatement] = useState('');
  const [verifSubmitted, setVerifSubmitted] = useState(false);

  const currentUser = userProfile || user || INITIAL_USER_PROFILE;
  const currentRep = currentUser?.reputationScore ?? currentUser?.reputationPoints ?? 100;
  const currentBadgeType = currentUser?.badgeType || 'BLUE';
  const currentBadgeTitle = currentUser?.badgeTitle || currentUser?.badge || 'Campus Member';

  // Compute real student rankings dynamically
  const topStudents = useMemo(() => {
    const usersMap = new Map<string, any>();
    try {
      const stored = localStorage.getItem('fuhsi_users_db');
      if (stored) {
        const parsed: UserProfile[] = JSON.parse(stored);
        parsed.forEach((u) => {
          if (u.nickname && !isDemoUser(u) && !isDemoNickname(u.nickname)) {
            const clean = u.nickname.toLowerCase().replace(/^@/, '');
            const isGuest = isGuestAccount(u);
            const isMod = isModulaAccount(u);
            usersMap.set(clean, {
              nickname: u.nickname.startsWith('@') ? u.nickname : `@${u.nickname}`,
              department: isGuest || isMod ? '' : (u.department || 'FUHSI Student'),
              level: isGuest || isMod ? '' : (u.level || '100L'),
              accountType: isMod ? 'Admin' : (u.accountType || (isGuest ? 'Guest' : 'Student')),
              avatarKey: u.avatarKey || 'caduceus',
              avatarUrl: u.avatarUrl,
              reputationScore: u.reputationScore ?? 100,
              isVerified: Boolean(u.isVerified),
            });
          }
        });
      }
    } catch (e) {
      console.error(e);
    }

    if (currentUser && currentUser.nickname && !isDemoUser(currentUser) && !isDemoNickname(currentUser.nickname)) {
      const clean = currentUser.nickname.toLowerCase().replace(/^@/, '');
      const isGuest = isGuestAccount(currentUser);
      const isMod = isModulaAccount(currentUser);
      usersMap.set(clean, {
        nickname: currentUser.nickname.startsWith('@') ? currentUser.nickname : `@${currentUser.nickname}`,
        department: isGuest || isMod ? '' : (currentUser.department || 'FUHSI Student'),
        level: isGuest || isMod ? '' : (currentUser.level || '100L'),
        accountType: isMod ? 'Admin' : (currentUser.accountType || (isGuest ? 'Guest' : 'Student')),
        avatarKey: currentUser.avatarKey || 'caduceus',
        avatarUrl: currentUser.avatarUrl,
        reputationScore: currentRep,
        isVerified: Boolean(currentUser.isVerified),
      });
    }

    const list = Array.from(usersMap.values()).sort((a, b) => b.reputationScore - a.reputationScore);
    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }, [currentUser, currentRep]);

  // Compute weekly campus rankings dynamically from real students and real posts
  const weeklyRankings = useMemo(() => {
    const validPosts = (activePosts || []).filter((p) => !isDemoPost(p));

    const topEngaging = topStudents.slice(0, 10).map((student, idx) => ({
      rank: idx + 1,
      nickname: student.nickname,
      department: student.department,
      level: student.level,
      avatarKey: student.avatarKey,
      avatarUrl: student.avatarUrl,
      metricValue: `${student.reputationScore} pts`,
      changeTag: idx === 0 ? '🏆 Top Leader' : '⭐ Active Contributor',
      isVerified: student.isVerified,
    }));

    const topHelpful = topStudents.slice(0, 10).map((student, idx) => ({
      rank: idx + 1,
      nickname: student.nickname,
      department: student.department,
      level: student.level,
      avatarKey: student.avatarKey,
      avatarUrl: student.avatarUrl,
      metricValue: `${Math.round(student.reputationScore * 0.8)} helpful pts`,
      changeTag: '🌟 Academic Helper',
      isVerified: student.isVerified,
    }));

    const topTrendingPosts = validPosts.slice(0, 10).map((post, idx) => ({
      rank: idx + 1,
      nickname: post.authorNickname || '@FUHSI_Student',
      category: post.category || post.categoryTag || 'General',
      snippet: post.content || post.text || 'Campus discussion update',
      engagement: `${(post.likesCount || 0) + (post.commentsCount || 0)} interactions`,
    }));

    return { topEngaging, topHelpful, topTrendingPosts };
  }, [topStudents, activePosts]);

  const handleApplyVerif = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifStatement.trim()) return;
    if (onSubmitVerificationRequest) {
      onSubmitVerificationRequest(verifCategory, verifStatement.trim());
    }
    setVerifSubmitted(true);
    setVerifStatement('');
    setTimeout(() => setVerifSubmitted(false), 4000);
  };

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6 pb-24">
      {/* Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-amber-400/20 text-amber-200 border border-amber-400/30 px-3 py-1 rounded-full mb-3">
            <Trophy size={14} />
            FUHSI Reputation & Leaderboards
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Campus Honor Roll
          </h1>
          <p className="text-sm text-amber-100/90 leading-relaxed">
            Students earn reputation points by sharing verified revision materials, answering peer questions, and upholding community guidelines.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveLeaderTab('weekly')}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
            activeLeaderTab === 'weekly'
              ? 'border-amber-600 text-amber-700 bg-amber-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Flame size={18} className="text-amber-600" />
          Weekly Campus Rankings
        </button>

        <button
          onClick={() => setActiveLeaderTab('students')}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
            activeLeaderTab === 'students'
              ? 'border-amber-600 text-amber-700 bg-amber-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Crown size={18} />
          All-Time Honor Roll
        </button>

        <button
          onClick={() => setActiveLeaderTab('departments')}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
            activeLeaderTab === 'departments'
              ? 'border-amber-600 text-amber-700 bg-amber-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 size={18} />
          Department Standings
        </button>

        <button
          onClick={() => setActiveLeaderTab('badges')}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
            activeLeaderTab === 'badges'
              ? 'border-amber-600 text-amber-700 bg-amber-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Medal size={18} />
          Badges & Points Rules
        </button>

        <button
          onClick={() => setActiveLeaderTab('verify')}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
            activeLeaderTab === 'verify'
              ? 'border-amber-600 text-amber-700 bg-amber-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck size={18} />
          Apply for Verification
        </button>
      </div>

      {/* TAB 0: WEEKLY CAMPUS RANKINGS */}
      {activeLeaderTab === 'weekly' && (
        <div className="space-y-6">
          {/* Sub-navigation pill selector */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit border border-slate-200">
            <button
              onClick={() => setWeeklySubCategory('engaging')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                weeklySubCategory === 'engaging'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame size={14} />
              <span>🥇 Top 10 Most Engaging</span>
            </button>

            <button
              onClick={() => setWeeklySubCategory('helpful')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                weeklySubCategory === 'helpful'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ThumbsUp size={14} />
              <span>🥈 Top 10 Most Helpful</span>
            </button>

            <button
              onClick={() => setWeeklySubCategory('trending')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                weeklySubCategory === 'trending'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp size={14} />
              <span>🥉 Top 10 Trending Posts</span>
            </button>
          </div>

          <p className="text-xs text-slate-500 font-medium">
            🔒 Privacy Guarantee: Campus rankings display strictly student handles/nicknames (e.g. <span className="font-bold text-amber-800">@FutureDoctor</span>, <span className="font-bold text-teal-800">@MedBoss</span>). Real names remain strictly hidden.
          </p>

          {/* Sub-view 1: Top 10 Most Engaging Users */}
          {weeklySubCategory === 'engaging' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Flame size={20} className="text-amber-500" />
                  <span>Weekly Campus Leaders — Most Engaging Students</span>
                </h3>
                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  Updated Live
                </span>
              </div>

              {weeklyRankings.topEngaging.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-medium">
                  No active student engagement logged yet for this week.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {weeklyRankings.topEngaging.map((user) => (
                    <div key={user.rank} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg font-extrabold text-xs flex items-center justify-center ${
                          user.rank === 1 ? 'bg-amber-400 text-amber-950' :
                          user.rank === 2 ? 'bg-slate-300 text-slate-800' :
                          user.rank === 3 ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-700'
                        }`}>
                          #{user.rank}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                if (onAuthorClick) {
                                  onAuthorClick({
                                    id: `ldr_${user.rank}_${user.nickname}`,
                                    authorNickname: user.nickname,
                                    timeAgo: 'Leaderboard',
                                    categoryTag: user.department,
                                    text: '',
                                    likesCount: 0,
                                    commentsCount: 0,
                                    createdAt: '',
                                  });
                                }
                              }}
                              className="font-bold text-slate-900 hover:text-amber-700 text-xs sm:text-sm hover:underline cursor-pointer"
                            >
                              {user.nickname}
                            </button>
                            {(() => {
                              const bInfo = getUserBadgeInfo(user.nickname);
                              return (
                                <VerificationBadge
                                  isVerified={bInfo.isVerified}
                                  badgeType={bInfo.badgeType}
                                  title={bInfo.badgeTitle}
                                />
                              );
                            })()}
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium">
                            {getUserIdentitySubtitle(user.nickname, user.department, user.level)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-extrabold text-xs text-amber-700 block">{user.metricValue}</span>
                        <span className="text-[10px] font-bold text-slate-400">{user.changeTag}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-view 2: Top 10 Most Helpful Contributors */}
          {weeklySubCategory === 'helpful' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <ThumbsUp size={20} className="text-teal-600" />
                  <span>Top Academic Contributors — Verified Resources & Study Guides</span>
                </h3>
                <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                  Academic Leaderboard
                </span>
              </div>

              {weeklyRankings.topHelpful.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-medium">
                  No academic contributions recorded yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {weeklyRankings.topHelpful.map((user) => (
                    <div key={user.rank} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg font-extrabold text-xs flex items-center justify-center ${
                          user.rank === 1 ? 'bg-teal-600 text-white' :
                          user.rank === 2 ? 'bg-teal-100 text-teal-900' :
                          user.rank === 3 ? 'bg-teal-50 text-teal-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          #{user.rank}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                if (onAuthorClick) {
                                  onAuthorClick({
                                    id: `ldr_${user.rank}_${user.nickname}`,
                                    authorNickname: user.nickname,
                                    timeAgo: 'Leaderboard',
                                    categoryTag: user.department,
                                    text: '',
                                    likesCount: 0,
                                    commentsCount: 0,
                                    createdAt: '',
                                  });
                                }
                              }}
                              className="font-bold text-slate-900 hover:text-teal-700 text-xs sm:text-sm hover:underline cursor-pointer"
                            >
                              {user.nickname}
                            </button>
                            {(() => {
                              const bInfo = getUserBadgeInfo(user.nickname);
                              return (
                                <VerificationBadge
                                  isVerified={bInfo.isVerified}
                                  badgeType={bInfo.badgeType}
                                  title={bInfo.badgeTitle}
                                />
                              );
                            })()}
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium">
                            {getUserIdentitySubtitle(user.nickname, user.department, user.level)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-extrabold text-xs text-teal-800 block">{user.metricValue}</span>
                        <span className="text-[10px] font-bold text-slate-400">{user.changeTag}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-view 3: Top 10 Trending Posts */}
          {weeklySubCategory === 'trending' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <TrendingUp size={20} className="text-purple-600" />
                  <span>Top 10 Trending Campus Discussions</span>
                </h3>
                <span className="text-[11px] font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                  Viral Trends
                </span>
              </div>

              {weeklyRankings.topTrendingPosts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-medium">
                  No active trending posts on campus feed yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {weeklyRankings.topTrendingPosts.map((post) => (
                    <div key={post.rank} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-900 font-black text-xs flex items-center justify-center shrink-0">
                          #{post.rank}
                        </span>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-slate-900 text-xs">{post.nickname}</span>
                            <span className="text-[9px] font-extrabold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">
                              {post.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 font-medium line-clamp-1">{post.snippet}</p>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-purple-800 shrink-0 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
                        {post.engagement}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: TOP STUDENTS */}
      {activeLeaderTab === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {topStudents.length === 0 ? (
              <div className="py-12 px-6 bg-white rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                  <Trophy size={24} />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">No Student Rankings Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Registered students earn reputation points by publishing peer-reviewed revision resources and contributing to campus discussions.
                </p>
              </div>
            ) : (
              topStudents.map((student) => {
                const isCurrentUser = student.nickname === currentUser?.nickname;
                return (
                  <div
                    key={student.nickname}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isCurrentUser
                        ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl font-extrabold text-sm flex items-center justify-center shrink-0 ${
                        student.rank === 1 ? 'bg-amber-400 text-amber-950' :
                        student.rank === 2 ? 'bg-slate-300 text-slate-800' :
                        student.rank === 3 ? 'bg-amber-700 text-amber-100' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        #{student.rank}
                      </div>

                      <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center shrink-0 overflow-hidden">
                        <AvatarIcon avatarKey={student.avatarKey} avatarUrl={student.avatarUrl} size={18} sizeClassName="w-full h-full object-cover" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                            {student.nickname}
                          </span>
                          {(() => {
                            const bInfo = getUserBadgeInfo(student.nickname);
                            return (
                              <VerificationBadge
                                isVerified={bInfo.isVerified}
                                badgeType={bInfo.badgeType}
                                title={bInfo.badgeTitle}
                                showTitle
                              />
                            );
                          })()}
                          {isCurrentUser && (
                            <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                              YOU
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {getUserIdentitySubtitle(student, student.department, student.level)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm sm:text-base font-extrabold text-amber-700 flex items-center gap-1 justify-end">
                        <Award size={16} />
                        <span>{student.reputationScore} pts</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* User Score Summary Sidebar */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <Sparkles size={18} className="text-amber-600" />
              Your Leaderboard Standing
            </h3>

            <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200/80 text-center">
              <div className="text-xs uppercase font-extrabold tracking-wider text-amber-800 mb-1">Current Points</div>
              <div className="text-3xl font-extrabold text-amber-900 mb-1">{currentRep}</div>
              <p className="text-xs font-semibold text-amber-700">Rank #2 in Medicine & Surgery</p>
            </div>

            <div className="space-y-2 text-xs text-slate-600 font-medium">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span>Account Status</span>
                <span className="font-bold text-emerald-600">Active Campus Member</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEPARTMENTS */}
      {activeLeaderTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {departmentRankings.map((dept, idx) => (
            <div key={dept.code} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                    #{idx + 1}
                  </span>
                  <h3 className="font-extrabold text-slate-900 text-base">{dept.name}</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Active Students: {dept.activeStudents} • Top Contributor: <span className="text-teal-700 font-bold">{dept.topContributor}</span>
                </p>
              </div>

              <div className="text-right">
                <div className="text-lg font-extrabold text-amber-700">{dept.totalPoints}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Total Pts</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: BADGES & RULES */}
      {activeLeaderTab === 'badges' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="font-extrabold text-slate-900 text-lg">Reputation Levels & Verification Rules</h3>
            <p className="text-xs text-slate-500 mt-1">
              FUHSI Connect uses a background reputation score to maintain quality and unlock eligibility for official campus verification.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-medium">
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 space-y-1">
              <div className="font-bold text-emerald-950 text-sm">🟢 0–499 Points</div>
              <p className="text-emerald-900 font-bold">New Member</p>
              <p className="text-slate-600 text-[11px]">Welcome to FUHSI campus community! Explore, read notes, and start interacting.</p>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 space-y-1">
              <div className="font-bold text-blue-950 text-sm">🔵 500–1,499 Points</div>
              <p className="text-blue-900 font-bold">Active Member</p>
              <p className="text-slate-600 text-[11px]">Active participant in campus discussions and academic note sharing.</p>
            </div>

            <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-1">
              <div className="font-bold text-purple-950 text-sm">🟣 1,500–2,999 Points</div>
              <p className="text-purple-900 font-bold">Trusted Member</p>
              <p className="text-slate-600 text-[11px]">Established contributor with strong peer upvotes and clean safety history.</p>
            </div>

            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-1">
              <div className="font-bold text-amber-950 text-sm">🟡 3,000+ Points</div>
              <p className="text-amber-900 font-bold">Eligible for Verification</p>
              <p className="text-slate-600 text-[11px]">Unlocks eligibility for official review! Reaching 3,000 points enters the queue for credential verification badge evaluation.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block">➕ How Users Earn Points:</span>
              <ul className="space-y-1.5 text-slate-700 text-[11px]">
                <li className="flex items-center justify-between">• 📝 Create a quality post <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+2 pts</span></li>
                <li className="flex items-center justify-between">• 👍 Receive a like on a thread <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+1 pt</span></li>
                <li className="flex items-center justify-between">• 💬 Receive a comment on a thread <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+1 pt</span></li>
                <li className="flex items-center justify-between">• 🔄 Receive a repost/quote of a thread <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+1 pt</span></li>
                <li className="flex items-center justify-between">• 👤 Complete profile (one-time reward) <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">+20 pts</span></li>
              </ul>
            </div>

            <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200 space-y-2">
              <span className="font-bold text-rose-950 block">➖ How Users Lose Points & Anti-Abuse Rules:</span>
              <ul className="space-y-1.5 text-rose-900 text-[11px]">
                <li className="flex items-center justify-between">• 🚫 Spam penalty <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">-20 pts</span></li>
                <li className="flex items-center justify-between">• ❌ Offensive post penalty <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">-20 pts</span></li>
                <li className="flex items-center justify-between">• ⚠️ Multiple valid reports penalty <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">-20 pts</span></li>
                <li className="text-[10px] text-slate-600 bg-white/80 p-2 rounded border border-rose-200/60 font-medium mt-1">
                  🔒 <strong>Abuse Prevention:</strong> Liking, commenting on, or reposting your own post earns 0 points. Only interactions from other users count.
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-teal-50 border border-teal-200/80 rounded-xl text-xs text-teal-900 space-y-1">
            <span className="font-bold block">⭐ Verification Criteria (Required for Approval):</span>
            <p className="leading-relaxed">
              ✅ At least 3,000 reputation points • ✅ Account age older than 2 months (60+ days) • ✅ Clean record with 0 serious violations • ✅ Positive long-term engagement • ✅ Final clearance by the FUHSI Verification Board.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: APPLY VERIFICATION */}
      {activeLeaderTab === 'verify' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-teal-700 font-bold text-base">
            <ShieldCheck size={22} />
            <h2>Apply for Student Leadership & Tutor Badge</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Verified badges recognize class representatives, clinical mentors, and academic group leaders. Applications are evaluated by the campus review committee.
          </p>

          {verifSubmitted ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={18} />
              <span>Verification request submitted successfully! Credential review in progress.</span>
            </div>
          ) : (
            <form onSubmit={handleApplyVerif} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Badge Category</label>
                <select
                  value={verifCategory}
                  onChange={(e) => setVerifCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:border-teal-500"
                >
                  <option value="Trusted Student Leader (Class Rep / Exec)">Class Representative / Executive</option>
                  <option value="Clinical Skills Mentor">Clinical Skills Mentor</option>
                  <option value="Academic Study Lead">Academic Study Group Lead</option>
                  <option value="Lab Practical Helper">Lab Practical Helper</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Leadership Statement / Qualifications</label>
                <textarea
                  rows={3}
                  value={verifStatement}
                  onChange={(e) => setVerifStatement(e.target.value)}
                  placeholder="Describe your student role, achievements, or clinical session facilitation details..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={!verifStatement.trim()}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Send size={16} />
                <span>Submit Verification Application</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
