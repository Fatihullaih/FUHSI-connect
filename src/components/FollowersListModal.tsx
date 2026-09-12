import React, { useState, useMemo } from 'react';
import { FollowRecord, UserProfile, Post } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { normalizeHandle, formatHandle, isUserFollowing, getFollowersList, getFollowingList } from '../utils/followUtils';
import { X, ArrowLeft, Users, UserPlus, UserCheck } from 'lucide-react';

interface FollowersListModalProps {
  targetNickname: string;
  initialTab?: 'followers' | 'following';
  allFollows: FollowRecord[];
  allUsers?: UserProfile[];
  currentUserNickname?: string;
  onToggleFollow?: (targetNickname: string) => void;
  onSelectUser?: (userNickname: string) => void;
  onClose: () => void;
}

export const FollowersListModal: React.FC<FollowersListModalProps> = ({
  targetNickname,
  initialTab = 'followers',
  allFollows = [],
  allUsers = [],
  currentUserNickname,
  onToggleFollow,
  onSelectUser,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const cleanTarget = normalizeHandle(targetNickname);
  const cleanCurrentUser = normalizeHandle(currentUserNickname);

  const followers = useMemo(() => {
    return getFollowersList(cleanTarget, allFollows);
  }, [cleanTarget, allFollows]);

  const following = useMemo(() => {
    return getFollowingList(cleanTarget, allFollows);
  }, [cleanTarget, allFollows]);

  const activeList = activeTab === 'followers' ? followers : following;

  // Resolve user profiles for the list
  const userItems = useMemo(() => {
    return activeList.map((record) => {
      const handle =
        activeTab === 'followers' ? record.followerNickname : record.followingNickname;
      const cleanH = normalizeHandle(handle);
      const userProfile = allUsers.find((u) => normalizeHandle(u.nickname) === cleanH);
      return {
        handle: formatHandle(cleanH),
        cleanHandle: cleanH,
        profile: userProfile,
        createdAt: record.createdAt,
      };
    });
  }, [activeList, activeTab, allUsers]);

  return (
    <div className="fixed inset-0 z-80 w-full h-full bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in duration-150">
      <div className="w-full h-full max-w-3xl mx-auto bg-white dark:bg-slate-900 flex flex-col shadow-2xl sm:border-x sm:border-slate-200 dark:sm:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 font-bold text-xs sm:text-sm cursor-pointer"
              title="Return to previous page"
            >
              <ArrowLeft size={18} />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users size={16} className="text-teal-600 dark:text-teal-400" />
                <span>{formatHandle(cleanTarget)}</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Connection Directory</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            onClick={() => setActiveTab('followers')}
            className={`py-3 text-xs font-black transition-all border-b-2 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'followers'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <span>Followers</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-700 font-extrabold">
              {followers.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('following')}
            className={`py-3 text-xs font-black transition-all border-b-2 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'following'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <span>Following</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-700 font-extrabold">
              {following.length}
            </span>
          </button>
        </div>

        {/* List Content */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-2.5 flex-1 min-h-[220px]">
          {userItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 dark:text-slate-500">
              <Users size={32} className="mb-2 opacity-50 stroke-1" />
              <p className="text-sm font-semibold">
                {activeTab === 'followers'
                  ? 'No followers yet'
                  : 'Not following anyone yet'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeTab === 'followers'
                  ? 'When users follow this account, they will appear here.'
                  : 'Accounts followed by this user will appear here.'}
              </p>
            </div>
          ) : (
            userItems.map((item) => {
              const badgeInfo = getUserBadgeInfo(item.handle, item.profile || null);
              const isMe = cleanCurrentUser && item.cleanHandle === cleanCurrentUser;
              const amIFollowing = isUserFollowing(cleanCurrentUser, item.cleanHandle, allFollows);

              return (
                <div
                  key={item.cleanHandle}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 transition-all"
                >
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => {
                      if (onSelectUser) {
                        onSelectUser(item.handle);
                        onClose();
                      }
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                      <AvatarIcon
                        avatarKey={item.profile?.avatarKey || 'user'}
                        avatarUrl={item.profile?.avatarUrl}
                        sizeClassName="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {item.handle}
                        </span>
                        <VerificationBadge
                          isVerified={badgeInfo.isVerified}
                          badgeType={badgeInfo.badgeType}
                          title={badgeInfo.badgeTitle}
                          showTitle={false}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.profile?.department || 'FUHSI Member'}
                      </p>
                    </div>
                  </div>

                  {/* Follow/Following Button for other users */}
                  {!isMe && cleanCurrentUser && onToggleFollow && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFollow(item.handle);
                      }}
                      className={`shrink-0 px-3 py-1 text-xs font-black rounded-xl transition-all border flex items-center gap-1 cursor-pointer active:scale-95 ${
                        amIFollowing
                          ? 'bg-slate-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 border-slate-200'
                          : 'bg-teal-700 hover:bg-teal-800 text-white border-teal-700 shadow-2xs'
                      }`}
                    >
                      {amIFollowing ? (
                        <>
                          <UserCheck size={12} />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={12} />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
