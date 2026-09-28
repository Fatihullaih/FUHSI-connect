import React from 'react';
import { ExternalLink, MessageSquare } from 'lucide-react';

/**
 * Robust extraction of post ID from various URL formats:
 * - https://fuhsi-connect.vercel.app/?post=post_12345
 * - https://fuhsi-connect.vercel.app/post/post_12345
 * - fuhsi-connect.vercel.app/?post=post_12345
 * - fuhsi-connect.vercel.app/post/post_12345
 * - /post/post_12345
 * - ?post=post_12345 or ?postId=post_12345
 * - #post/post_12345 or #/post/post_12345
 */
export function extractPostIdFromUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();

  // 1. Direct query parameter: ?post=... or ?postId=...
  const queryMatch = trimmed.match(/[?&](?:post|postId)=([a-zA-Z0-9_-]+)/i);
  if (queryMatch) return decodeURIComponent(queryMatch[1]);

  // 2. Relative or path: /post/... or post/...
  const pathMatch = trimmed.match(/(?:^|\/|\b)post\/([a-zA-Z0-9_-]+)/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);

  // 3. Hash: #post/... or #/post/...
  const hashMatch = trimmed.match(/#\/?post[/=]([a-zA-Z0-9_-]+)/i);
  if (hashMatch) return decodeURIComponent(hashMatch[1]);

  return null;
}

/**
 * Look up post information from cached localStorage to show friendly thread preview in links
 */
function getCachedPostSnippet(postId: string): { authorNickname?: string; content?: string } | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('fuhsi_posts_db');
    if (raw) {
      const posts: any[] = JSON.parse(raw);
      const found = posts.find((p) => p.id === postId);
      if (found) {
        return {
          authorNickname: found.authorNickname,
          content: found.content || found.text || '',
        };
      }
    }
  } catch (e) {
    // Ignore cache lookup errors
  }
  return null;
}

export interface LinkToken {
  type: 'text' | 'link';
  content?: string;
  url?: string;
}

/**
 * Tokenizes string into alternating text and URL tokens.
 * Handles protocol (http/https), www, common domain TLDs, and /post/ or ?post= links.
 */
export function tokenizeTextForLinks(text: string): LinkToken[] {
  if (!text) return [];

  const urlPattern =
    /(https?:\/\/[^\s<>()"'\`]+|www\.[^\s<>()"'\`]+|(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|edu|gov|io|co|me|ng|app|dev|xyz|ai|info|tv|cc|vercel\.app|edu\.ng|gov\.ng|org\.ng|ac\.ng)(?::\d+)?(?:\/[^\s<>()"'\`]*)?|\/post\/[a-zA-Z0-9_-]+|\?post=[a-zA-Z0-9_-]+|#\/?post\/[a-zA-Z0-9_-]+)/gi;

  const results: LinkToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(text)) !== null) {
    const matchedUrl = match[0];
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      results.push({ type: 'text', content: text.substring(lastIndex, matchIndex) });
    }

    // Clean trailing punctuation attached to end of URL
    let cleanUrl = matchedUrl;
    let trailing = '';
    while (
      cleanUrl.length > 0 &&
      ['.', ',', '!', '?', ';', ':', ')', ']', '"', "'", '>'].includes(cleanUrl[cleanUrl.length - 1])
    ) {
      trailing = cleanUrl[cleanUrl.length - 1] + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
    }

    results.push({ type: 'link', url: cleanUrl });
    if (trailing) {
      results.push({ type: 'text', content: trailing });
    }

    lastIndex = matchIndex + matchedUrl.length;
  }

  if (lastIndex < text.length) {
    results.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return results;
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

  const tokens = tokenizeTextForLinks(text);

  const handleInternalPostClick = (e: React.MouseEvent, postId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenPostById) {
      onOpenPostById(postId);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_open_post_modal', { detail: { postId } }));
    }
  };

  const handleExternalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <span className={`${preserveNewlines ? 'whitespace-pre-line' : ''} ${className}`}>
      {tokens.map((token, index) => {
        if (token.type === 'text') {
          return <React.Fragment key={index}>{token.content}</React.Fragment>;
        }

        const url = token.url || '';
        const internalPostId = extractPostIdFromUrl(url);

        // Internal Post / Thread Link
        if (internalPostId) {
          const cachedSnippet = getCachedPostSnippet(internalPostId);

          return (
            <span
              key={index}
              role="button"
              tabIndex={0}
              onClick={(e) => handleInternalPostClick(e, internalPostId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleInternalPostClick(e as any, internalPostId);
                }
              }}
              className="inline-flex items-center gap-1.5 text-teal-800 hover:text-teal-950 font-bold bg-teal-50 hover:bg-teal-100/90 active:scale-[0.98] px-2.5 py-1 rounded-xl border border-teal-300/80 transition-all cursor-pointer shadow-2xs text-left align-baseline my-1 break-all select-text max-w-full group"
              title={`Click to open thread discussion (${internalPostId})`}
            >
              <MessageSquare size={13} className="text-teal-600 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate max-w-[220px] sm:max-w-md text-xs">
                {cachedSnippet?.authorNickname ? (
                  <>
                    <span className="text-teal-900 font-extrabold">{cachedSnippet.authorNickname}: </span>
                    <span className="text-slate-600 font-normal">
                      {cachedSnippet.content ? cachedSnippet.content.slice(0, 45) + (cachedSnippet.content.length > 45 ? '...' : '') : 'Discussion Thread'}
                    </span>
                  </>
                ) : (
                  <span className="text-teal-900 font-semibold">{url}</span>
                )}
              </span>
              <span className="text-[10px] uppercase font-black tracking-wider text-teal-700 bg-white/95 px-1.5 py-0.5 rounded-md border border-teal-200/80 shrink-0 shadow-2xs group-hover:bg-teal-700 group-hover:text-white transition-colors">
                Thread ↗
              </span>
            </span>
          );
        }

        // External Web Link
        const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalClick}
            className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold underline decoration-sky-300 hover:decoration-sky-600 break-all cursor-pointer transition-colors align-baseline mx-0.5"
            title={`Open link in new tab (${href})`}
          >
            <span>{url}</span>
            <ExternalLink size={12} className="inline opacity-75 shrink-0" />
          </a>
        );
      })}
    </span>
  );
};
