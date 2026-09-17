import React from 'react';
import { UserProfile, PrivacyMode } from '../types';
import { isGuestAccount } from '../utils/userDbUtils';
import { AvatarIcon } from './AvatarIcon';
import { 
  MessageSquare, 
  Building2, 
  Trophy, 
  ShieldCheck, 
  User, 
  Award, 
  Sparkles,
  Eye,
  EyeOff,
  UserCheck,
  CheckCircle2
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'feed' | 'hub' | 'leaderboard' | 'moderation' | 'profile';
  setActiveTab: (tab: 'feed' | 'hub' | 'leaderboard' | 'moderation' | 'profile') => void;
  user: UserProfile;
  pendingReportsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  user,
  pendingReportsCount
}) => {
  const getPrivacyBadge = (mode: PrivacyMode) => {
    switch (mode) {
      case 'Anonymous':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
            <EyeOff size={12} />
            Anon Mode
          </span>
        );
      case 'Nickname':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
            <Sparkles size={12} />
            {user.nickname}
          </span>
        );
      case 'Public':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            <UserCheck size={12} />
            Public
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div 
            onClick={() => setActiveTab('feed')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-teal-500/20 group-hover:scale-105 transition-transform">
              <span className="font-extrabold text-xl tracking-tight">F</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-teal-800 to-emerald-700 bg-clip-text text-transparent">
                  FUHSI Connect
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                  Ila-Orangun
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">Campus Student Network & Medical Hub</p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('feed')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transform-gpu transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                activeTab === 'feed'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <MessageSquare size={18} />
              Feed
            </button>

            {!isGuestAccount(user) && (
              <button
                onClick={() => setActiveTab('hub')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transform-gpu transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                  activeTab === 'hub'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Building2 size={18} />
                Campus Hub
              </button>
            )}

            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transform-gpu transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                activeTab === 'leaderboard'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Trophy size={18} />
              Leaderboard
            </button>

            {user.isAdmin && (
              <button
                onClick={() => setActiveTab('moderation')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transform-gpu transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer relative ${
                  activeTab === 'moderation'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShieldCheck size={18} />
                Moderation
                {pendingReportsCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center -mr-1">
                    {pendingReportsCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          {/* User Profile Summary */}
          <div className="flex items-center gap-3">

            {/* Reputation Badge */}
            <div 
              onClick={() => setActiveTab('leaderboard')}
              className="hidden lg:flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-amber-800 text-xs font-bold cursor-pointer hover:bg-amber-100 transition-colors"
              title="Campus Reputation Points"
            >
              <Award size={15} className="text-amber-600" />
              <span>{user.reputationPoints} pts</span>
            </div>

            {/* Privacy Badge & User Button */}
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border transition-all ${
                activeTab === 'profile'
                  ? 'bg-teal-50 border-teal-300 ring-2 ring-teal-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center border border-teal-200 overflow-hidden">
                <AvatarIcon avatarId={user.avatarId} avatarKey={user.avatarKey} avatarUrl={user.avatarUrl} size={18} sizeClassName="w-full h-full object-cover" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-slate-800 leading-tight">
                  {user.privacyMode === 'Anonymous' ? 'Anonymous Student' : user.nickname}
                </div>
                <div className="mt-0.5">{getPrivacyBadge(user.privacyMode || 'Public')}</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 px-2 py-1.5 flex justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium transform-gpu transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer ${
            activeTab === 'feed' ? 'text-teal-700 font-bold scale-105' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <MessageSquare size={20} />
          Feed
        </button>

        {!isGuestAccount(user) && (
          <button
            onClick={() => setActiveTab('hub')}
            className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium transform-gpu transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer ${
              activeTab === 'hub' ? 'text-teal-700 font-bold scale-105' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Building2 size={20} />
            Campus Hub
          </button>
        )}

        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium transform-gpu transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer ${
            activeTab === 'leaderboard' ? 'text-teal-700 font-bold scale-105' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Trophy size={20} />
          Leaderboard
        </button>

        {user.isAdmin && (
          <button
            onClick={() => setActiveTab('moderation')}
            className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium transform-gpu transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer relative ${
              activeTab === 'moderation' ? 'text-teal-700 font-bold scale-105' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldCheck size={20} />
            Moderation
            {pendingReportsCount > 0 && (
              <span className="absolute top-0 right-2 w-4 h-4 bg-rose-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {pendingReportsCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium transform-gpu transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer ${
            activeTab === 'profile' ? 'text-teal-700 font-bold scale-105' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <User size={20} />
          Profile
        </button>
      </div>
    </header>
  );
};
