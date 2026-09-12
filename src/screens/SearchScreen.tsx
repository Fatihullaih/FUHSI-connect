import React, { useState, useMemo } from 'react';
import { Post, MarketplaceItem, UserProfile } from '../types';
import { PostCard } from '../components/PostCard';
import { AuthorProfileModal } from '../components/AuthorProfileModal';
import { AvatarIcon } from '../components/AvatarIcon';
import { VerificationBadge } from '../components/VerificationBadge';
import { calculateUserPoints } from '../utils/reputationUtils';
import { isDemoUser, isDemoNickname, isDemoPost } from '../utils/postGenerator';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount, getUserIdentitySubtitle } from '../utils/userDbUtils';
import {
  Search,
  Sparkles,
  TrendingUp,
  User,
  ShoppingBag,
  Hash,
  Building2,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  Crown,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';

interface SearchScreenProps {
  userProfile: UserProfile;
  posts: Post[];
  marketplaceItems: MarketplaceItem[];
  currentUserNickname?: string;
  onSelectPost: (post: Post) => void;
  onLikeClick: (post: Post) => void;
  onBookmarkClick: (post: Post) => void;
  onCommentClick: (post: Post) => void;
  onAuthorClick?: (post: Post) => void;
  onEditPost?: (postId: string, newContent: string) => void;
  onDeletePost?: (postId: string) => void;
}

interface CampusAccount {
  id: string;
  nickname: string;
  realName: string;
  department: string;
  level: string;
  bio: string;
  badgeType: 'GREEN' | 'BLUE' | 'GOLD' | 'PURPLE' | 'NONE' | string;
  badgeTitle: string;
  avatarKey: string;
  avatarUrl?: string;
  reputationScore: number;
  isVerified: boolean;
}

// Helper function to normalize strings for intelligent/smart matching (ignores spaces, underscores, hyphens, @)
const normalize = (str: string): string => {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Fuzzy match similarity score between query and target string
const getMatchScore = (query: string, target: string): number => {
  const normQuery = normalize(query);
  const normTarget = normalize(target);
  if (!normQuery || !normTarget) return 0;
  if (normTarget === normQuery) return 100;
  if (normTarget.startsWith(normQuery)) return 80;
  if (normTarget.includes(normQuery)) return 60;

  // Check token overlap e.g., "sug" and "welfare" in "SUG Welfare Director"
  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const targetTokens = target.toLowerCase().split(/\s+/).filter(Boolean);
  let matchedTokens = 0;
  for (const qToken of queryTokens) {
    const normQ = normalize(qToken);
    if (normQ && targetTokens.some((tToken) => normalize(tToken).includes(normQ))) {
      matchedTokens++;
    }
  }
  if (queryTokens.length > 0 && matchedTokens > 0) {
    return (matchedTokens / queryTokens.length) * 50;
  }
  return 0;
};

export const SearchScreen: React.FC<SearchScreenProps> = ({
  userProfile,
  posts,
  marketplaceItems,
  currentUserNickname,
  onSelectPost,
  onLikeClick,
  onBookmarkClick,
  onCommentClick,
  onAuthorClick,
  onEditPost,
  onDeletePost,
}) => {
  const [query, setQuery] = useState('');
  
  // Expand / View More state for Accounts and Posts
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [showAllHubItems, setShowAllHubItems] = useState(false);

  // Author profile modal
  const [selectedAuthor, setSelectedAuthor] = useState<UserProfile | null>(null);

  React.useEffect(() => {
    const handlePopState = () => {
      if (selectedAuthor) {
        setSelectedAuthor(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedAuthor]);

  const trendingTopics = [
    'SUG Welfare',
    'SUG President',
    'Anatomy CA 2',
    'Nursing Clinicals',
    'Shuttle Bus',
    'Littmann Stethoscope',
    'Guyton Physiology',
    'Ila Gate 2 Prints',
  ];

  // Compile full accounts list combining presets, post authors, and localStorage users
  const allAccounts = useMemo<CampusAccount[]>(() => {
    const accMap = new Map<string, CampusAccount>();

    let verifsList: any[] = [];
    try {
      const vStr = localStorage.getItem('fuhsi_verifications_db');
      if (vStr) verifsList = JSON.parse(vStr);
    } catch (e) {
      console.error(e);
    }

    // Add registered users from local storage if available
    try {
      const storedUsers = localStorage.getItem('fuhsi_users_db');
      if (storedUsers) {
        const parsed: UserProfile[] = JSON.parse(storedUsers);
        parsed.forEach((u) => {
          if (u.nickname && !isDemoUser(u) && !isDemoNickname(u.nickname)) {
            const key = normalize(u.nickname);
            if (!accMap.has(key)) {
              const exactScore = calculateUserPoints(u.nickname, u, posts, []);
              const verifInfo = getUserBadgeInfo(u.nickname, u);
              const isGuest = isGuestAccount(u);
              accMap.set(key, {
                id: u.id || `usr_${key}`,
                nickname: u.nickname.startsWith('@') ? u.nickname : `@${u.nickname}`,
                realName: u.realName || u.nickname,
                department: isGuest ? '' : (u.department || 'FUHSI Student'),
                level: isGuest ? '' : (u.level || 'Student'),
                bio: u.bio || (isGuest ? 'Community Guest Member on FUHSI Connect.' : 'FUHSI Student Community Member.'),
                badgeType: verifInfo.badgeType,
                badgeTitle: verifInfo.badgeTitle,
                avatarKey: u.avatarKey || 'caduceus',
                avatarUrl: u.avatarUrl,
                reputationScore: exactScore,
                isVerified: verifInfo.isVerified,
              });
            }
          }
        });
      }
    } catch (e) {
      console.error(e);
    }

    // Add active logged in userProfile
    if (userProfile && userProfile.nickname && !isDemoUser(userProfile) && !isDemoNickname(userProfile.nickname)) {
      const key = normalize(userProfile.nickname);
      if (!accMap.has(key)) {
        const exactScore = calculateUserPoints(userProfile.nickname, userProfile, posts, []);
        const verifInfo = getUserBadgeInfo(userProfile.nickname, userProfile);
        const isGuest = isGuestAccount(userProfile);
        accMap.set(key, {
          id: userProfile.id || `usr_${key}`,
          nickname: userProfile.nickname.startsWith('@') ? userProfile.nickname : `@${userProfile.nickname}`,
          realName: userProfile.realName || userProfile.nickname,
          department: isGuest ? '' : (userProfile.department || 'FUHSI Student'),
          level: isGuest ? '' : (userProfile.level || 'Student'),
          bio: userProfile.bio || (isGuest ? 'Community Guest Member on FUHSI Connect.' : 'FUHSI Student Community Member.'),
          badgeType: verifInfo.badgeType,
          badgeTitle: verifInfo.badgeTitle,
          avatarKey: userProfile.avatarKey || 'caduceus',
          avatarUrl: userProfile.avatarUrl,
          reputationScore: exactScore,
          isVerified: verifInfo.isVerified,
        });
      }
    }

    // Add author nicknames from posts (excluding demo posts)
    (posts || []).forEach((p) => {
      if (isDemoPost(p)) return;
      const nick = p.authorNickname || p.nickname || p.customNickname;
      if (nick && !isDemoNickname(nick)) {
        const key = normalize(nick);
        if (!accMap.has(key)) {
          const exactScore = calculateUserPoints(nick, { nickname: nick }, posts, []);
          const verifInfo = getUserBadgeInfo(nick);
          accMap.set(key, {
            id: `post_author_${key}`,
            nickname: nick.startsWith('@') ? nick : `@${nick}`,
            realName: nick.replace('@', ''),
            department: p.department || 'FUHSI Campus',
            level: 'Student',
            bio: `Active campus contributor on FUHSI Connect.`,
            badgeType: verifInfo.badgeType,
            badgeTitle: verifInfo.badgeTitle,
            avatarKey: p.authorAvatarKey || 'caduceus',
            avatarUrl: p.authorAvatarUrl,
            reputationScore: exactScore,
            isVerified: verifInfo.isVerified,
          });
        }
      }
    });

    return Array.from(accMap.values());
  }, [posts, userProfile]);

  // Perform Intelligent Search Matching for Accounts
  const matchingAccounts = useMemo(() => {
    if (!query.trim()) return [];
    
    return allAccounts
      .map((acc) => {
        const nickScore = getMatchScore(query, acc.nickname);
        const nameScore = getMatchScore(query, acc.realName);
        const deptScore = getMatchScore(query, acc.department);
        const titleScore = getMatchScore(query, acc.badgeTitle);
        const maxScore = Math.max(nickScore, nameScore, deptScore, titleScore);
        return { account: acc, score: maxScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.account);
  }, [query, allAccounts]);

  // Perform Intelligent Search Matching for Posts
  const matchingPosts = useMemo(() => {
    if (!query.trim()) return [];

    return (posts || [])
      .filter((p) => !isDemoPost(p))
      .map((p) => {
        const contentScore = getMatchScore(query, p.content || '');
        const nickScore = getMatchScore(query, p.authorNickname || p.nickname || '');
        const deptScore = getMatchScore(query, p.department || '');
        const maxScore = Math.max(contentScore, nickScore, deptScore);
        return { post: p, score: maxScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.post);
  }, [query, posts]);

  // Perform Intelligent Search Matching for Marketplace Items (Disabled for Guest accounts)
  const matchingHubItems = useMemo(() => {
    if (!query.trim() || isGuestAccount(userProfile)) return [];

    return (marketplaceItems || [])
      .filter((item) => {
        if (item.status === 'SOLD' && item.soldAt) {
          const daysAgo = Math.floor((Date.now() - new Date(item.soldAt).getTime()) / (1000 * 60 * 60 * 24));
          if (daysAgo > 7) return false;
        }
        return true;
      })
      .map((item) => {
        const titleScore = getMatchScore(query, item.title || '');
        const descScore = getMatchScore(query, item.description || '');
        const catScore = getMatchScore(query, item.category || '');
        const sellerScore = getMatchScore(query, item.sellerNickname || '');
        const maxScore = Math.max(titleScore, descScore, catScore, sellerScore);
        return { item, score: maxScore };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [query, marketplaceItems]);

  // Smart Search Suggestions ("Are you looking for...")
  const smartSuggestions = useMemo(() => {
    if (!query.trim()) return [];
    
    // Find closest accounts that might match user intent even with typos
    const suggestions = allAccounts
      .map((acc) => {
        const score = Math.max(
          getMatchScore(query, acc.nickname),
          getMatchScore(query, acc.realName),
          getMatchScore(query, acc.badgeTitle)
        );
        return { nickname: acc.nickname, realName: acc.realName, score };
      })
      .filter((item) => item.score > 0)
      .slice(0, 4);

    return suggestions;
  }, [query, allAccounts]);

  // Reset View More toggle whenever query changes
  const handleQueryChange = (val: string) => {
    setQuery(val);
    setShowAllAccounts(false);
    setShowAllPosts(false);
    setShowAllHubItems(false);
  };

  // Convert account to UserProfile for modal
  const handleAccountClick = (acc: CampusAccount) => {
    const dummyPost: Post = {
      id: `acc_${acc.id}`,
      authorNickname: acc.nickname,
      authorAvatarKey: acc.avatarKey,
      authorBadgeType: acc.badgeType,
      authorBadgeTitle: acc.badgeTitle,
      authorPoints: acc.reputationScore,
      timeAgo: '',
      category: 'General',
      categoryTag: 'General',
      content: acc.bio,
      text: acc.bio,
      timestamp: new Date().toISOString(),
      likesCount: 0,
      commentsCount: 0,
      isQuarantined: false,
      createdAt: '',
    };

    if (onAuthorClick) {
      onAuthorClick(dummyPost);
    } else {
      const profile: UserProfile = {
        id: acc.id,
        nickname: acc.nickname,
        realName: acc.realName,
        department: acc.department,
        level: acc.level,
        bio: acc.bio,
        badgeType: acc.badgeType as any,
        badgeTitle: acc.badgeTitle,
        avatarKey: acc.avatarKey,
        reputationScore: acc.reputationScore,
        isVerified: acc.isVerified,
      };
      setSelectedAuthor(profile);
      try { window.history.pushState({ subModal: 'searchAuthor' }, ''); } catch (e) { console.error(e); }
    }
  };

  const displayedAccounts = showAllAccounts ? matchingAccounts : matchingAccounts.slice(0, 3);
  const displayedPosts = showAllPosts ? matchingPosts : matchingPosts.slice(0, 5);
  const displayedHubItems = showAllHubItems ? matchingHubItems : matchingHubItems.slice(0, 3);

  const hasNoResults =
    query.trim() &&
    matchingAccounts.length === 0 &&
    matchingPosts.length === 0 &&
    matchingHubItems.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-4 pb-28 font-sans">
      {/* Search Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-teal-800 text-teal-100 shadow-xs">
            <Search size={20} />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>Campus Search</span>
              <Sparkles size={16} className="text-amber-500 fill-amber-400" />
            </h1>
            <p className="text-xs text-slate-500 font-semibold">
              Find accounts, posts, discussions, and campus marketplace items
            </p>
          </div>
        </div>

        {/* Search Bar Input */}
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search users, posts, topics, or marketplace..."
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none transition-all shadow-inner"
          />
          {query && (
            <button
              onClick={() => handleQueryChange('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 text-xs font-bold bg-slate-200 hover:bg-slate-300 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Smart Search Suggestions ("Are you looking for...") */}
      {query.trim() && smartSuggestions.length > 0 && (
        <div className="p-3 bg-teal-50/80 border border-teal-200/90 rounded-2xl text-xs text-teal-900 space-y-1.5 shadow-2xs">
          <div className="flex items-center gap-1.5 font-black text-teal-950">
            <Sparkles size={14} className="text-teal-600" />
            <span>Are you looking for...</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {smartSuggestions.map((sug) => (
              <button
                key={sug.nickname}
                onClick={() => handleQueryChange(sug.nickname)}
                className="px-2.5 py-1 bg-white hover:bg-teal-100/80 border border-teal-300 rounded-lg font-bold text-teal-800 hover:text-teal-950 text-[11px] transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <User size={12} className="text-teal-600 shrink-0" />
                <span>{sug.nickname}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {query.trim() && (
        <div className="space-y-5">
          {/* USER ACCOUNTS */}
          {matchingAccounts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-teal-700" />
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Matching User Accounts ({matchingAccounts.length})
                  </h2>
                </div>
              </div>

              {/* Render Accounts */}
              <div className="divide-y divide-slate-100">
                {displayedAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => handleAccountClick(acc)}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        <AvatarIcon avatarKey={acc.avatarKey} avatarUrl={acc.avatarUrl} size={40} sizeClassName="w-10 h-10 text-teal-700 rounded-full object-cover" />
                      </div>

                      <div className="min-w-0 leading-snug">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-teal-700 transition-colors">
                            {acc.nickname}
                          </h3>
                          <VerificationBadge isVerified={acc.isVerified} badgeType={acc.badgeType} title={acc.badgeTitle} showTitle />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAccountClick(acc);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200 text-xs font-bold transition-all shrink-0 flex items-center gap-1 shadow-2xs"
                    >
                      <span>View Profile</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* View More User Accounts Button */}
              {matchingAccounts.length > 3 && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setShowAllAccounts(!showAllAccounts)}
                    className="w-full py-2.5 px-4 bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs border border-teal-200/80"
                  >
                    <span>
                      {showAllAccounts
                        ? 'Show Top 3 Accounts'
                        : `View More Accounts (${matchingAccounts.length - 3} remaining)`}
                    </span>
                    {showAllAccounts ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* POSTS */}
          {matchingPosts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-teal-600" />
                  <span>Matching Posts ({matchingPosts.length})</span>
                </h2>
              </div>

              {displayedPosts.map((post, idx) => (
                <PostCard
                  key={post.id || `search_post_${idx}`}
                  post={post}
                  userProfile={userProfile}
                  currentUserNickname={currentUserNickname || userProfile?.nickname}
                  onLikeClick={() => onLikeClick(post)}
                  onBookmarkClick={() => onBookmarkClick(post)}
                  onCommentClick={() => onCommentClick(post)}
                  onAuthorClick={onAuthorClick}
                  onEditPost={onEditPost}
                  onDeletePost={onDeletePost}
                />
              ))}

              {/* View More Posts Button */}
              {matchingPosts.length > 5 && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowAllPosts(!showAllPosts)}
                    className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-xs rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>
                      {showAllPosts
                        ? 'Show Top 5 Posts'
                        : `View More Posts (${matchingPosts.length - 5} remaining)`}
                    </span>
                    {showAllPosts ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MARKETPLACE HUB ITEMS */}
          {matchingHubItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} className="text-teal-700" />
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Marketplace & Hub Matches ({matchingHubItems.length})
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {displayedHubItems.map((item, idx) => (
                  <div
                    key={item.id || `search_hub_${idx}`}
                    className="bg-slate-50 p-3 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-md">
                          {item.category}
                        </span>
                        {item.status === 'SOLD' && (
                          <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-md">
                            SOLD
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-extrabold text-slate-900 truncate mt-1">{item.title}</h3>
                      <p className={`text-xs font-black ${item.status === 'SOLD' ? 'text-slate-400 line-through' : 'text-teal-800'}`}>
                        ₦{(item.adminApprovedPrice ?? item.askingPrice ?? 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">
                        By{' '}
                        <button
                          type="button"
                          onClick={() => {
                            if (onAuthorClick) {
                              onAuthorClick({
                                id: `seller_${item.id}`,
                                authorNickname: item.sellerNickname,
                                timeAgo: 'Marketplace',
                                category: 'Marketplace',
                                categoryTag: 'Trade',
                                content: `Seller of ${item.title}`,
                                text: `Seller of ${item.title}`,
                                timestamp: new Date().toISOString(),
                                likesCount: 0,
                                commentsCount: 0,
                                createdAt: '',
                              });
                            }
                          }}
                          className="font-bold text-slate-800 hover:text-teal-700 hover:underline cursor-pointer focus:outline-none"
                        >
                          {item.sellerNickname}
                        </button>
                      </p>
                    </div>
                    {item.imageUrls?.[0] && (
                      <img
                        src={item.imageUrls[0]}
                        alt={item.title}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* View More Hub Items Button */}
              {matchingHubItems.length > 3 && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setShowAllHubItems(!showAllHubItems)}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>
                      {showAllHubItems
                        ? 'Show Top 3 Items'
                        : `View More Items (${matchingHubItems.length - 3} remaining)`}
                    </span>
                    {showAllHubItems ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* No Results Found */}
          {hasNoResults && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <HelpCircle size={24} />
              </div>
              <h3 className="text-sm font-black text-slate-900">No exact matches found for "{query}"</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try searching for different keywords, usernames, or topics.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Author Profile Modal */}
      {selectedAuthor && (
        <AuthorProfileModal
          authorNickname={selectedAuthor.nickname}
          authorAvatarKey={selectedAuthor.avatarKey}
          authorAvatarUrl={selectedAuthor.avatarUrl}
          authorBadgeType={selectedAuthor.badgeType}
          authorBadgeTitle={selectedAuthor.badgeTitle}
          allPosts={posts}
          userProfile={userProfile}
          onClose={() => setSelectedAuthor(null)}
          onCommentClick={(post) => {
            onSelectPost(post);
          }}
        />
      )}
    </div>
  );
};
