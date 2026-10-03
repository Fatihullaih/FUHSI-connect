import React from 'react';
import { Check } from 'lucide-react';
import { normalizeBadgeColor } from '../utils/verificationUtils';

export interface VerificationBadgeProps {
  isVerified?: boolean;
  badgeType?: 'BLUE' | 'GREEN' | 'ORANGE' | 'PURPLE' | 'NONE' | string;
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
  size = 13,
}) => {
  const normalizedRaw = (badgeType || 'BLUE').toUpperCase();
  const effectiveIsVerified = isVerified !== undefined ? isVerified : (normalizedRaw !== 'NONE');
  if (!effectiveIsVerified || normalizedRaw === 'NONE') return null;

  const normalizedColor = normalizeBadgeColor(normalizedRaw);

  // Dedicated badge color styles for BLUE, GREEN, ORANGE, PURPLE
  let badgeStyle = {
    badgeBg: 'bg-sky-500',
    pillBg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800/80',
    label: 'Blue',
  };

  if (normalizedColor === 'GREEN') {
    badgeStyle = {
      badgeBg: 'bg-emerald-500',
      pillBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
      label: 'Green',
    };
  } else if (normalizedColor === 'ORANGE') {
    badgeStyle = {
      badgeBg: 'bg-orange-500',
      pillBg: 'bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-300 border-orange-200 dark:border-orange-800/80',
      label: 'Orange',
    };
  } else if (normalizedColor === 'PURPLE') {
    badgeStyle = {
      badgeBg: 'bg-purple-600',
      pillBg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/80',
      label: 'Purple',
    };
  }

  const rawTitle = title && title.trim() ? title.trim() : '';
  const isDeclinedOrInternal =
    rawTitle.toLowerCase().includes('decline') ||
    rawTitle.toLowerCase().includes('pending') ||
    rawTitle.toLowerCase().includes('reject');

  // Badge icon dimensions (clean standard proportion, not heavy or chunky)
  const iconSize = Math.max(7, Math.round(size * 0.58));

  // Render standalone colored checkmark circle
  const renderIconBadge = () => (
    <span
      className={`inline-flex items-center justify-center rounded-full ${badgeStyle.badgeBg} text-white shadow-2xs shrink-0 select-none`}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label={`Verified (${badgeStyle.label})`}
    >
      <Check size={iconSize} strokeWidth={2.4} className="text-white drop-shadow-2xs" />
    </span>
  );

  // If a specific custom title was assigned and showTitle is enabled, display badge + title
  if (showTitle && rawTitle && !isDeclinedOrInternal) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle.pillBg} ${className} shadow-2xs`}
        title={`Verified: ${rawTitle}`}
      >
        {renderIconBadge()}
        <span className="truncate max-w-[130px] leading-none">{rawTitle}</span>
      </span>
    );
  }

  // Otherwise, render ONLY the standalone colored verification badge
  return (
    <span
      className={`inline-flex items-center shrink-0 ${className}`}
      title={rawTitle && !isDeclinedOrInternal ? `Verified: ${rawTitle}` : `Verified`}
    >
      {renderIconBadge()}
    </span>
  );
};
