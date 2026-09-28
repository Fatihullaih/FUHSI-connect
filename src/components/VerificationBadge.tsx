import React from 'react';
import { Check } from 'lucide-react';

export interface VerificationBadgeProps {
  isVerified?: boolean;
  badgeType?: 'BLUE' | 'GREEN' | 'GOLD' | 'ORANGE' | 'PURPLE' | 'VERIFIED' | 'NONE' | string;
  title?: string;
  showTitle?: boolean;
  className?: string;
  size?: number;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  isVerified,
  badgeType = 'BLUE',
  title,
  showTitle = false,
  className = '',
  size = 14,
}) => {
  if (!isVerified) return null;

  const normalizedType = (badgeType || 'BLUE').toUpperCase();

  // Distinct, dedicated badge styles for Blue, Green, Orange, Purple, Gold
  let badgeStyle = {
    badgeBg: 'bg-sky-500',
    pillBg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800/80',
    label: 'Verified (Blue)',
  };

  if (normalizedType === 'GREEN') {
    badgeStyle = {
      badgeBg: 'bg-emerald-500',
      pillBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
      label: 'Campus Leader (Green)',
    };
  } else if (normalizedType === 'ORANGE') {
    badgeStyle = {
      badgeBg: 'bg-orange-500',
      pillBg: 'bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-300 border-orange-200 dark:border-orange-800/80',
      label: 'Representative (Orange)',
    };
  } else if (normalizedType === 'PURPLE') {
    badgeStyle = {
      badgeBg: 'bg-purple-600',
      pillBg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/80',
      label: 'Scholar (Purple)',
    };
  } else if (normalizedType === 'GOLD') {
    badgeStyle = {
      badgeBg: 'bg-amber-500',
      pillBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
      label: 'Executive (Gold)',
    };
  }

  const rawTitle = title && title.trim() ? title.trim() : '';
  const isDeclinedOrInternal =
    rawTitle.toLowerCase().includes('decline') ||
    rawTitle.toLowerCase().includes('pending') ||
    rawTitle.toLowerCase().includes('reject');

  // Badge icon dimensions
  const iconSize = Math.max(10, Math.round(size * 0.7));

  // Render standalone colored checkmark circle
  const renderIconBadge = () => (
    <span
      className={`inline-flex items-center justify-center rounded-full ${badgeStyle.badgeBg} text-white shadow-2xs shrink-0 select-none`}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label={badgeStyle.label}
    >
      <Check size={iconSize} strokeWidth={3.5} className="text-white drop-shadow-2xs" />
    </span>
  );

  // If a specific custom title was assigned and showTitle is enabled, display badge + title
  if (showTitle && rawTitle && !isDeclinedOrInternal) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border ${badgeStyle.pillBg} ${className} shadow-2xs`}
        title={`Verified Account: ${rawTitle} (${badgeStyle.label})`}
      >
        {renderIconBadge()}
        <span className="truncate max-w-[150px] leading-none">{rawTitle}</span>
      </span>
    );
  }

  // Otherwise, render ONLY the standalone colored verification badge
  return (
    <span
      className={`inline-flex items-center shrink-0 ${className}`}
      title={rawTitle && !isDeclinedOrInternal ? `Verified Account: ${rawTitle} (${badgeStyle.label})` : `Verified Account (${badgeStyle.label})`}
    >
      {renderIconBadge()}
    </span>
  );
};
