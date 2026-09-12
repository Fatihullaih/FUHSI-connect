import React from 'react';
import { Rss, Trophy, Store, Shield, User } from 'lucide-react';

export const DynamicFeedIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <Rss className={className} />
);

export const LeaderboardIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <Trophy className={className} />
);

export const StorefrontIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <Store className={className} />
);

export const ShieldIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <Shield className={className} />
);

export const BadgeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <User className={className} />
);
