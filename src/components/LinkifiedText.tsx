import React from 'react';
import { ExternalLink, MessageSquare } from 'lucide-react';

export function extractPostIdFromUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const trimmed = rawUrl.trim();
    // 1. Check relative /post/:id
    const relMatch = trimmed.match(/^\/?post\/([a-zA-Z0-9_-]+)/i);
    if (relMatch) return decodeURIComponent(relMatch[1]);

    // 2. Full URL parsing
    let parseTarget = trimmed;
    if (trimmed.startsWith('www.')) {
      parseTarget = `https://${trimmed}`;
    }

    if (parseTarget.startsWith('http://') || parseTarget.startsWith('https://')) {
      // Use fallback origin if window is undefined
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fuhsi-connect.vercel.app';
      const parsed = new URL(parseTarget, origin);
      
      // Match pathname /post/:id
      const pathMatch = parsed.pathname.match(/\/post\/([a-zA-Z0-9_-]+)/i);
      if (pathMatch) return decodeURIComponent(pathMatch[1]);

      // Match query ?post=:id or ?postId=:id
      const queryPostId = parsed.searchParams.get('post') || parsed.searchParams.get('postId');
      if (queryPostId) return decodeURIComponent(queryPostId);

      // Match hash #post/:id or #post=:id
      if (parsed.hash) {
        const hashMatch = parsed.hash.match(/post[/=]([a-zA-Z0-9_-]+)/i);
        if (hashMatch) return decodeURIComponent(hashMatch[1]);
      }
    }
  } catch (e) {
    // Fallback regex if URL constructor fails
    const fallbackMatch = rawUrl.match(/\/post\/([a-zA-Z0-9_-]+)/i);
    if (fallbackMatch) return decodeURIComponent(fallbackMatch[1]);
  }
  return null;
}

interface LinkifiedTextProps {
  text: string;
  className?: string;
  onOpenPostById?: (postId: string) => void;
  preserveNewlines?: boolean;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({
  text,
  className = '',
  onOpenPostById,
  preserveNewlines = true,
}) => {
  if (!text) return null;

  // Regex to split by URLs (http, https, www, or /post/...)
  const URL_REGEX = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|\/?post\/[a-zA-Z0-9_-]+)/gi;

  const parts = text.split(URL_REGEX);

  const cleanUrl = (raw: string) => {
    let url = raw;
    let trailing = '';
    while (url.length > 0 && ['.', ',', '!', '?', ';', ':', ')', ']', '"', "'"].includes(url[url.length - 1])) {
      trailing = url[url.length - 1] + trailing;
      url = url.slice(0, -1);
    }
    return { url, trailing };
  };

  const handleInternalPostClick = (e: React.MouseEvent, postId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenPostById) {
      onOpenPostById(postId);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_open_post_modal', { detail: { postId } }));
    }
  };

  const handleExternalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <span className={`${preserveNewlines ? 'whitespace-pre-line' : ''} ${className}`}>
      {parts.map((part, index) => {
        if (!part) return null;

        const isMatch = URL_REGEX.test(part);
        URL_REGEX.lastIndex = 0;

        if (!isMatch) {
          return <React.Fragment key={index}>{part}</React.Fragment>;
        }

        const { url, trailing } = cleanUrl(part);
        const internalPostId = extractPostIdFromUrl(url);

        if (internalPostId) {
          return (
            <React.Fragment key={index}>
              <button
                type="button"
                onClick={(e) => handleInternalPostClick(e, internalPostId)}
                className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-950 font-bold underline decoration-teal-400 hover:decoration-teal-700 bg-teal-50/90 hover:bg-teal-100 px-2 py-0.5 rounded-lg border border-teal-200/70 transition-all cursor-pointer shadow-2xs text-left align-baseline my-0.5 break-all select-text"
                title={`Open thread discussion (${internalPostId})`}
              >
                <MessageSquare size={13} className="text-teal-600 shrink-0" />
                <span className="truncate max-w-[260px] sm:max-w-md">{url}</span>
                <span className="text-[10px] uppercase font-black tracking-wider text-teal-800 bg-white/90 px-1 rounded border border-teal-200/60 shrink-0">
                  Thread ↗
                </span>
              </button>
              {trailing}
            </React.Fragment>
          );
        }

        const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

        return (
          <React.Fragment key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalClick}
              className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold underline decoration-sky-300 hover:decoration-sky-600 break-all cursor-pointer transition-colors align-baseline"
              title={`Open link in new tab (${href})`}
            >
              <span>{url}</span>
              <ExternalLink size={12} className="inline opacity-70 shrink-0" />
            </a>
            {trailing}
          </React.Fragment>
        );
      })}
    </span>
  );
};
