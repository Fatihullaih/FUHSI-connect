import { UserProfile, Post, Comment, MarketplaceItem, VerificationRequest, Report, LeaderboardUser, WeeklyRankingItem, WeeklyTrendingPost, CommunityFundSummary } from '../types';

export const INITIAL_USER_PROFILE: UserProfile = {
  id: 'usr_admin_modula',
  nickname: '@modula',
  accountType: 'Admin',
  realName: 'Administrator',
  matricNumber: '',
  studentEmail: 'fuhsiconnectsupport@gmail.com',
  emergencyHomePhone: '08000000000',
  department: '',
  level: '',
  bio: 'Platform Administrator (@modula).',
  avatarKey: '1',
  badgeType: 'GOLD',
  badgeTitle: 'Official Admin',
  reputationScore: 9999,
  isVerified: true,
  isApproved: true,
  isDeclined: false,
  isAdmin: true,
  joinedDate: 'Sep 2024',
  createdAt: '2024-09-01T00:00:00.000Z',
};

export const INITIAL_POSTS: Post[] = [];

export const INITIAL_COMMENTS: Comment[] = [];

export const INITIAL_MARKETPLACE_ITEMS: MarketplaceItem[] = [];

export const INITIAL_PENDING_MARKETPLACE_ITEMS: MarketplaceItem[] = [];

export const INITIAL_VERIFICATION_REQUESTS: VerificationRequest[] = [];

export const INITIAL_REPORTS: Report[] = [];

export const TOP_LEADERBOARD_USERS: LeaderboardUser[] = [];

export const INITIAL_ACHIEVEMENTS = [
  {
    id: 'ach_1',
    title: '🌟 Rising Star',
    icon: '🌟',
    description: 'Earned 100+ reputation points during your first month on campus.',
    isUnlocked: true,
    progressPct: 100,
    unlockedAt: '1 month ago',
    category: 'Engagement' as const,
    rewardPoints: 50
  },
  {
    id: 'ach_2',
    title: '🔥 Trending Creator',
    icon: '🔥',
    description: 'Sparked a post that generated 25+ peer comments and active discussions.',
    isUnlocked: true,
    progressPct: 100,
    unlockedAt: '2 weeks ago',
    category: 'Engagement' as const,
    rewardPoints: 100
  },
  {
    id: 'ach_3',
    title: '🎓 Academic Helper',
    icon: '🎓',
    description: 'Uploaded 5 verified lecture summaries, past questions, or clinical notes.',
    isUnlocked: true,
    progressPct: 100,
    unlockedAt: '3 days ago',
    category: 'Academic' as const,
    rewardPoints: 150
  },
  {
    id: 'ach_4',
    title: '💬 Top Commenter',
    icon: '💬',
    description: 'Contributed 50+ constructive answers and peer advice replies.',
    isUnlocked: true,
    progressPct: 100,
    unlockedAt: 'Yesterday',
    category: 'Community' as const,
    rewardPoints: 100
  },
  {
    id: 'ach_5',
    title: '❤️ Most Appreciated',
    icon: '❤️',
    description: 'Received 100+ likes on study guides and answers provided to peers.',
    isUnlocked: true,
    progressPct: 100,
    unlockedAt: '5 days ago',
    category: 'Engagement' as const,
    rewardPoints: 120
  },
  {
    id: 'ach_6',
    title: '🏆 Campus Influencer',
    icon: '🏆',
    description: 'Ranked in the Top 10 on the Weekly Campus Leaderboard.',
    isUnlocked: true,
    progressPct: 100,
    unlockedAt: 'This Week',
    category: 'Engagement' as const,
    rewardPoints: 200
  },
  {
    id: 'ach_7',
    title: 'FUHSI Student',
    icon: '✔️',
    description: 'Passed multi-factor admin verification review (3+ mos tenure, 0 strikes, 1200+ rep).',
    isUnlocked: true,
    progressPct: 100,
    unlockedAt: 'Verified',
    category: 'Verification' as const,
    rewardPoints: 300
  }
];

export const INITIAL_VERIFICATION_CANDIDATES: any[] = [];

export const WEEKLY_CAMPUS_RANKINGS: {
  topEngaging: WeeklyRankingItem[];
  topHelpful: WeeklyRankingItem[];
  topTrendingPosts: WeeklyTrendingPost[];
} = {
  topEngaging: [],
  topHelpful: [],
  topTrendingPosts: []
};

export const INITIAL_COMMUNITY_FUND: CommunityFundSummary = {
  totalFundRaised: 348500,
  currentMonthBalance: 125000,
  activeDonorsCount: 86,
  lastAuditDate: 'August 2026 Monthly Report',
  allocationBreakdown: {
    serversAndMaintenancePct: 40,
    featureDevelopmentPct: 30,
    campusActivitiesPct: 20,
    emergencyReservePct: 10
  },
  recentExpenditures: []
};

