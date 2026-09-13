import React, { useState, useRef, memo } from 'react';
import { DirectMessage } from '../types';
import { normalizeNickname, formatMessageTime } from '../utils/messagingUtils';
import { 
  AlertTriangle, 
  CheckCheck, 
  Reply, 
  Smile, 
  Ban,
  Heart
} from 'lucide-react';

interface ChatMessageItemProps {
  msg: DirectMessage;
  isMe: boolean;
  myNickname: string;
  onReply: (msg: DirectMessage) => void;
  onOpenMenu: (msg: DirectMessage) => void;
  onReact: (msgId: string, emoji: string) => void;
  onScrollToMessage?: (messageId: string) => void;
}

const ChatMessageItemComponent: React.FC<ChatMessageItemProps> = ({
  msg,
  isMe,
  myNickname,
  onReply,
  onOpenMenu,
  onReact,
  onScrollToMessage,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [showQuickReactions, setShowQuickReactions] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);

  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const longPressTimerRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const itemRef = useRef<HTMLDivElement>(null);

  const cleanMyNickname = normalizeNickname(myNickname);
  const isSafetyBlocked = msg.isSafetyWarning || msg.text.includes('Contact information cannot be shared');
  const isDeleted = Boolean(msg.isDeletedForEveryone || msg.text === '🚫 This message was deleted');

  // Render centered system notification messages (e.g. group creation, members added/removed)
  if (msg.isSystemMessage) {
    return (
      <div id={`msg-${msg.id}`} className="flex justify-center my-2 select-none px-4">
        <div className="px-3.5 py-1 bg-slate-200/90 border border-slate-300/80 rounded-full text-[11px] font-bold text-slate-700 shadow-2xs flex items-center gap-1.5 max-w-[90%] text-center leading-tight">
          <span>{msg.text}</span>
          <span className="text-[9px] text-slate-500 font-medium whitespace-nowrap">({formatMessageTime(msg.timestamp)})</span>
        </div>
      </div>
    );
  }

  // Cancel long press
  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Start long-press timer with duration
  const startLongPress = (clientX: number, clientY: number) => {
    if (isDeleted || isSafetyBlocked) return;
    touchStartXRef.current = clientX;
    touchStartYRef.current = clientY;
    clearLongPress();
    setIsPressing(true);

    longPressTimerRef.current = setTimeout(() => {
      clearLongPress();
      setIsPressing(false);
      // Trigger haptic vibration if supported
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(35);
        } catch (e) {}
      }
      onOpenMenu(msg);
    }, 420);
  };

  // Touch handlers for mobile swipe-to-reply and long-press
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDeleted || isSafetyBlocked) return;
    const touch = e.touches[0];
    isHorizontalSwipeRef.current = null;
    setIsSwiping(false);
    startLongPress(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDeleted || isSafetyBlocked) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartXRef.current;
    const diffY = touch.clientY - touchStartYRef.current;

    // Movement tolerance for long press (18px allows natural finger wobble)
    if (Math.abs(diffX) > 18 || Math.abs(diffY) > 18) {
      clearLongPress();
      setIsPressing(false);
    }

    // Determine swipe direction
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 12 || Math.abs(diffY) > 12) {
        isHorizontalSwipeRef.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      // Received message: swipe right (diffX > 0)
      if (!isMe && diffX > 0) {
        setIsSwiping(true);
        const clamped = Math.min(diffX * 0.75, 75);
        setTranslateX(clamped);
      }
      // Own message: swipe left (diffX < 0)
      else if (isMe && diffX < 0) {
        setIsSwiping(true);
        const clamped = Math.max(diffX * 0.75, -75);
        setTranslateX(clamped);
      }
    }
  };

  const handleTouchEnd = () => {
    clearLongPress();
    setIsPressing(false);

    // Check for double tap to react with heart
    const now = Date.now();
    if (now - lastTapRef.current < 280 && !isDeleted && !isSafetyBlocked && !isSwiping) {
      onReact(msg.id, '❤️');
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 900);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }

    if (isSwiping) {
      // Threshold for triggering reply is 42px
      if (!isMe && translateX >= 42) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(25); } catch (e) {}
        }
        onReply(msg);
      } else if (isMe && translateX <= -42) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(25); } catch (e) {}
        }
        onReply(msg);
      }
    }

    setIsSwiping(false);
    setTranslateX(0);
    isHorizontalSwipeRef.current = null;
  };

  const handleTouchCancel = () => {
    clearLongPress();
    setIsPressing(false);
    setIsSwiping(false);
    setTranslateX(0);
    isHorizontalSwipeRef.current = null;
  };

  // Mouse handlers for desktop long press / click-and-hold
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left-click
    startLongPress(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!longPressTimerRef.current) return;
    const diffX = e.clientX - touchStartXRef.current;
    const diffY = e.clientY - touchStartYRef.current;
    if (Math.abs(diffX) > 12 || Math.abs(diffY) > 12) {
      clearLongPress();
      setIsPressing(false);
    }
  };

  const handleMouseUp = () => {
    clearLongPress();
    setIsPressing(false);
  };

  const handleMouseLeave = () => {
    clearLongPress();
    setIsPressing(false);
  };

  // Right-click context menu for desktop
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isDeleted) {
      onOpenMenu(msg);
    }
  };

  // Double click for desktop to heart react
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDeleted && !isSafetyBlocked) {
      onReact(msg.id, '❤️');
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 900);
    }
  };

  // Check which emojis user has reacted with
  const reactionsMap = msg.reactions || {};
  const reactionEntries = Object.entries(reactionsMap).filter(([_, users]) => users && users.length > 0);

  const isSwipeTriggerActive = (!isMe && translateX >= 42) || (isMe && translateX <= -42);

  return (
    <div
      id={`msg-${msg.id}`}
      ref={itemRef}
      className={`relative flex flex-col my-1 select-none transition-all duration-300 rounded-2xl ${isMe ? 'items-end' : 'items-start'} group`}
      onContextMenu={handleContextMenu}
    >
      {/* Swipe Indicator Background Icon */}
      {isSwiping && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center transition-all ${
            !isMe ? 'left-2' : 'right-2'
          }`}
          style={{ opacity: Math.min(Math.abs(translateX) / 45, 1) }}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-transform duration-150 ${
              isSwipeTriggerActive
                ? 'bg-teal-600 text-white scale-110'
                : 'bg-slate-200 text-slate-700 scale-90'
            }`}
          >
            <Reply size={16} className={isMe ? 'scale-x-[-1]' : ''} />
          </div>
        </div>
      )}

      {/* Main Message Container with Horizontal Transform */}
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(msg);
        }}
        className={`relative max-w-[85%] sm:max-w-md transition-transform duration-150 ${
          isPressing ? 'scale-[0.97] opacity-90 ring-2 ring-teal-400/40 rounded-2xl' : ''
        }`}
      >
        {/* Double-tap heart burst animation */}
        {showHeartBurst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-in zoom-in-50 fade-in duration-200">
            <Heart size={44} className="text-rose-500 fill-rose-500 drop-shadow-lg animate-bounce" />
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-xs shadow-2xs space-y-1 transition-colors relative ${
            isMe
              ? isSafetyBlocked
                ? 'bg-amber-100 text-amber-950 rounded-br-xs border border-amber-300'
                : isDeleted
                ? 'bg-slate-100 text-slate-500 italic rounded-br-xs border border-slate-200'
                : 'bg-teal-700 text-white rounded-br-xs'
              : isSafetyBlocked
              ? 'bg-amber-50 text-amber-900 rounded-bl-xs border border-amber-200'
              : isDeleted
              ? 'bg-slate-100 text-slate-500 italic rounded-bl-xs border border-slate-200'
              : 'bg-white text-slate-900 rounded-bl-xs border border-slate-200/80'
          }`}
        >
          {/* Group Message Sender Identifier */}
          {msg.isGroupMessage && !isMe && !isDeleted && (
            <div className="flex items-center gap-1.5 pb-0.5 border-b border-slate-100/80 mb-1 select-none">
              <span className="text-[11px] font-black text-teal-800 hover:text-teal-950 transition-colors">
                {msg.senderNickname}
              </span>
            </div>
          )}

          {/* Quoted / Replied Message Header (if any) */}
          {msg.replyToText && !isDeleted && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (msg.replyToMessageId && onScrollToMessage) {
                  onScrollToMessage(msg.replyToMessageId);
                }
              }}
              className={`p-2 rounded-xl mb-1.5 cursor-pointer text-[11px] transition-opacity hover:opacity-90 border-l-[3.5px] ${
                isMe
                  ? 'bg-teal-800/80 border-teal-300 text-teal-100'
                  : 'bg-slate-100 border-teal-600 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1 font-bold text-[10px] text-teal-300 mb-0.5">
                <Reply size={11} />
                <span>{msg.replyToSender || 'Student'}</span>
              </div>
              <p className="line-clamp-2 italic leading-tight text-opacity-90">
                {msg.replyToText}
              </p>
            </div>
          )}

          {/* Message Content */}
          {isSafetyBlocked ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1 font-extrabold text-[11px] text-amber-800">
                <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                <span>⚠️ Contact information cannot be shared.</span>
              </div>
              <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                FUHSI Connect does not allow exchanging personal phone numbers, emails, or social media handles for student security.
              </p>
            </div>
          ) : isDeleted ? (
            <div className="flex items-center gap-1.5 py-0.5 text-slate-400">
              <Ban size={13} className="shrink-0 text-slate-400" />
              <span>This message was deleted</span>
            </div>
          ) : (
            <p className="leading-relaxed whitespace-pre-wrap break-words font-medium">
              {(() => {
                const text = msg.text || '';
                const cleanMe = normalizeNickname(myNickname);
                const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
                return parts.map((part, idx) => {
                  if (part.startsWith('@')) {
                    const cleanMention = normalizeNickname(part);
                    const isMentioningMe = cleanMe && cleanMention === cleanMe;
                    if (isMentioningMe) {
                      return (
                        <span
                          key={idx}
                          className={`inline-block px-1 py-0.2 rounded font-black text-[11px] mx-0.5 ${
                            isMe
                              ? 'bg-amber-300 text-amber-950 ring-1 ring-amber-400/70'
                              : 'bg-amber-200 text-amber-950 ring-1 ring-amber-400 shadow-2xs'
                          }`}
                        >
                          {part}
                        </span>
                      );
                    }
                    // If not mentioned, display as clean standard text without any mention styling or sign
                    return <span key={idx}>{part}</span>;
                  }
                  return part;
                });
              })()}
            </p>
          )}

          {/* Footer: Timestamp & Delivery/Read Receipts */}
          <div
            className={`flex items-center justify-end gap-1.5 text-[9px] font-bold mt-0.5 ${
              isMe
                ? isSafetyBlocked || isDeleted
                  ? 'text-slate-400'
                  : 'text-teal-200'
                : 'text-slate-400'
            }`}
          >
            <span>{formatMessageTime(msg.timestamp)}</span>
            {isMe && !isDeleted && (
              msg.isRead ? (
                <span
                  title="Read"
                  className="flex items-center gap-0.5 text-sky-300 font-black inline-flex drop-shadow-xs"
                >
                  <CheckCheck size={14} className="text-sky-300 stroke-[2.5]" />
                </span>
              ) : (
                <span
                  title="Sent (Delivered)"
                  className="flex items-center gap-0.5 text-slate-300/80 font-medium inline-flex"
                >
                  <CheckCheck size={14} className="text-slate-300/80 stroke-[1.75]" />
                </span>
              )
            )}
          </div>
        </div>

        {/* Reaction Badges / Pills */}
        {reactionEntries.length > 0 && !isDeleted && (
          <div
            className={`flex flex-wrap items-center gap-1 mt-1 ${
              isMe ? 'justify-end' : 'justify-start'
            }`}
          >
            {reactionEntries.map(([emoji, users]) => {
              const hasReacted = users.some((u) => normalizeNickname(u) === cleanMyNickname);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(msg.id, emoji);
                  }}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer ${
                    hasReacted
                      ? 'bg-teal-50 border-teal-300 text-teal-800 ring-1 ring-teal-500/30 font-black'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                  title={`${users.join(', ')}`}
                >
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop Hover Quick Action Bar */}
      {!isDeleted && (
        <div
          className={`hidden md:group-hover:flex items-center gap-1 absolute top-0 ${
            isMe ? 'right-full mr-2' : 'left-full ml-2'
          } bg-white/95 backdrop-blur-xs border border-slate-200 shadow-md rounded-xl p-1 z-20 animate-in fade-in zoom-in-90 duration-150`}
        >
          {/* Quick Reaction Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQuickReactions((prev) => !prev)}
              className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="React"
            >
              <Smile size={14} />
            </button>

            {/* Quick Emoji Picker Popover */}
            {showQuickReactions && (
              <div
                className={`absolute bottom-full mb-1 ${
                  isMe ? 'right-0' : 'left-0'
                } bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 flex items-center gap-1 z-30 animate-in zoom-in-95 duration-100`}
              >
                {['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(msg.id, emoji);
                      setShowQuickReactions(false);
                    }}
                    className="p-1 hover:scale-125 transition-transform text-base cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Reply Button */}
          <button
            type="button"
            onClick={() => onReply(msg)}
            className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Reply"
          >
            <Reply size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export const ChatMessageItem = memo(ChatMessageItemComponent);
