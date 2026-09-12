import React, { useState, useEffect, useRef } from 'react';
import { DirectMessage, UserProfile } from '../types';
import { 
  subscribeDirectMessagesByConversation, 
  saveDirectMessageToFirestore 
} from '../lib/firestoreSync';
import { 
  getStoredDirectMessages, 
  sendDirectMessage, 
  normalizeNickname,
  formatMessageTime 
} from '../utils/messagingUtils';
import { 
  Send, 
  ArrowLeft,
  Shield, 
  ShieldCheck, 
  User, 
  CheckCheck, 
  Clock, 
  Building2, 
  ShoppingBag, 
  MapPin, 
  Tag, 
  Sparkles, 
  AlertCircle, 
  X, 
  MessageSquare,
  ArrowDown
} from 'lucide-react';
import { VerificationBadge } from './VerificationBadge';

interface ChatInterfaceProps {
  conversationId: string;
  currentUser: UserProfile | null;
  recipientNickname?: string;
  recipientTitle?: string;
  contextItem?: {
    id?: string;
    title?: string;
    price?: number;
    meetupPoint?: string;
    status?: string;
  };
  isInline?: boolean;
  onClose?: () => void;
  initialMessageSnippet?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  conversationId,
  currentUser,
  recipientNickname = 'FUHSI Campus Secretariat',
  recipientTitle,
  contextItem,
  isInline = false,
  onClose,
  initialMessageSnippet
}) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const myNickname = currentUser?.nickname || '@Student';
  const isAdminUser = Boolean(currentUser?.isAdmin);
  const isOtherPartyAdmin = recipientNickname.includes('Admin') || recipientNickname.toLowerCase().includes('modula');

  // Load and subscribe in real-time from Firestore
  useEffect(() => {
    if (!conversationId) return;

    // 1. First populate with cached local storage messages for immediate rendering
    const localMsgs = getStoredDirectMessages().filter(
      (m) => m.conversationId === conversationId
    );
    if (localMsgs.length > 0) {
      setMessages(localMsgs);
    }

    // 2. Attach live Firestore real-time listener filtered by conversationId
    const unsubscribe = subscribeDirectMessagesByConversation(
      conversationId,
      (firestoreMsgs) => {
        setIsLiveConnected(true);
        if (firestoreMsgs && firestoreMsgs.length > 0) {
          // Merge unique by message ID
          setMessages((prev) => {
            const map = new Map<string, DirectMessage>();
            prev.forEach((m) => map.set(m.id, m));
            firestoreMsgs.forEach((m) => map.set(m.id, m));
            const merged = Array.from(map.values());
            // Sort chronologically
            merged.sort((a, b) => {
              const timeA = a.id?.includes('dm_') ? Number(a.id.replace(/\D/g, '')) || 0 : 0;
              const timeB = b.id?.includes('dm_') ? Number(b.id.replace(/\D/g, '')) || 0 : 0;
              return timeA - timeB;
            });
            return merged;
          });
        }
      },
      (err) => {
        console.warn('Firestore subscription offline/fallback:', err);
        setIsLiveConnected(false);
      }
    );

    // 3. Listen to internal window events
    const handleLocalUpdate = (e: any) => {
      const updatedMsg: DirectMessage = e.detail;
      if (updatedMsg && updatedMsg.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === updatedMsg.id)) return prev;
          return [...prev, updatedMsg];
        });
      }
    };
    window.addEventListener('fuhsi_direct_message_updated', handleLocalUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener('fuhsi_direct_message_updated', handleLocalUpdate);
    };
  }, [conversationId]);

  // Scroll to bottom smoothly
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [messages.length]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollBottom(isFarFromBottom);
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    const newMsg: DirectMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conversationId,
      senderNickname: isAdminUser ? `${myNickname} (Admin)` : myNickname,
      receiverNickname: recipientNickname,
      text: textToSend,
      timestamp: formatMessageTime(),
      itemId: contextItem?.id,
      itemTitle: contextItem?.title,
      itemPrice: contextItem?.price,
      meetupPoint: contextItem?.meetupPoint,
    };

    // Optimistic UI update
    setMessages((prev) => [...prev, newMsg]);

    // Send through unified dispatcher (syncs local storage + Firestore + recipient notification)
    sendDirectMessage(newMsg);

    setIsSending(false);
    setTimeout(() => scrollToBottom('smooth'), 50);
  };

  // Quick Action Responses
  const adminQuickReplies = [
    '🛡️ Please provide your matric number for verification.',
    '📍 Safe meet-up scheduled at Main Library Entrance at 2 PM.',
    '✅ Verification request reviewed and approved.',
    '⚠️ Please adhere to FUHSI Safety & Respect guidelines.',
    '🔍 Checking item availability with seller now.'
  ];

  const studentQuickReplies = [
    'Yes, this item is still available for purchase.',
    'I will be at the meet-up location on time.',
    'Thank you for the official update!',
    'Can you please assist with my verification status?',
    'What time is the campus trade scheduled?'
  ];

  const activeQuickReplies = isAdminUser ? adminQuickReplies : studentQuickReplies;

  const renderMessageBubble = (msg: DirectMessage) => {
    const isMe = normalizeNickname(msg.senderNickname) === normalizeNickname(myNickname) ||
                 (isAdminUser && (msg.senderNickname.includes('Admin') || msg.senderNickname.includes('Council') || msg.senderNickname.includes('Secretariat')));
    const isMsgFromAdmin = msg.senderNickname.includes('Admin') || msg.senderNickname.includes('Council') || msg.senderNickname.includes('Secretariat') || msg.senderNickname.toLowerCase().includes('modula');

    return (
      <div
        key={msg.id}
        className={`flex flex-col mb-3.5 ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-1`}
      >
        <div className="flex items-center gap-1.5 mb-1 px-1">
          {isMsgFromAdmin ? (
            <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
              <Shield size={11} className="text-amber-700" />
              <span>{isMe ? 'You (Campus Council)' : 'FUHSI Campus Council'}</span>
            </span>
          ) : (
            <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1">
              <User size={11} className="text-slate-400" />
              <span>{isMe ? 'You' : msg.senderNickname}</span>
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-medium">{formatMessageTime(msg.timestamp)}</span>
        </div>

        <div
          className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-xs leading-relaxed font-medium shadow-xs ${
            isMe
              ? 'bg-teal-700 text-white rounded-br-xs'
              : isMsgFromAdmin
              ? 'bg-amber-50/90 text-amber-950 border-2 border-amber-200/80 rounded-bl-xs'
              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
          }`}
        >
          {isMsgFromAdmin && !isMe && (
            <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-800 border-b border-amber-200 pb-1.5 mb-2">
              <ShieldCheck size={13} className="text-amber-700 shrink-0" />
              <span>OFFICIAL CAMPUS COUNCIL NOTICE</span>
            </div>
          )}

          <p className="whitespace-pre-line break-words">{msg.text}</p>

          {/* Trade Item Attached Info */}
          {(msg.itemTitle || msg.meetupPoint) && (
            <div
              className={`mt-2.5 pt-2 border-t text-[11px] rounded-lg p-2 ${
                isMe
                  ? 'bg-teal-800/60 border-teal-600 text-teal-100'
                  : 'bg-white/80 border-slate-200 text-slate-700'
              }`}
            >
              {msg.itemTitle && (
                <div className="font-bold flex items-center gap-1">
                  <ShoppingBag size={12} />
                  <span>Item: {msg.itemTitle} {msg.itemPrice ? `(₦${msg.itemPrice.toLocaleString()})` : ''}</span>
                </div>
              )}
              {msg.meetupPoint && (
                <div className="text-[10px] opacity-90 flex items-center gap-1 mt-0.5">
                  <MapPin size={11} />
                  <span>Meet-up Point: {msg.meetupPoint}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-1 mt-1">
            <span className={`text-[9px] ${isMe ? 'text-teal-200' : 'text-slate-400'}`}>
              {isMe ? 'Sent' : 'Delivered'}
            </span>
            {isMe && <CheckCheck size={11} className="text-teal-200" />}
          </div>
        </div>
      </div>
    );
  };

  const containerContent = (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Chat Header */}
      <div className="bg-white px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-200 flex items-center justify-between shadow-xs shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 -ml-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
              title="Back"
            >
              <ArrowLeft size={18} />
              <span className="hidden xs:inline">Back</span>
            </button>
          )}

          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs font-bold text-sm ${
              isOtherPartyAdmin
                ? 'bg-amber-600 text-white'
                : 'bg-teal-600 text-white'
            }`}
          >
            {isOtherPartyAdmin ? <Shield size={18} /> : <User size={18} />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                {recipientNickname}
              </h3>
              {isOtherPartyAdmin && (
                <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                  COUNCIL
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
              <span className={`w-1.5 h-1.5 rounded-full ${isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{isLiveConnected ? 'Firestore Real-time Active' : 'Synced Channel'}</span>
              <span className="text-slate-300">•</span>
              <span>ID: {conversationId.substring(0, 14)}...</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Close chat"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Trade or Inquiry Context Card (If applicable) */}
      {contextItem && (
        <div className="bg-teal-50/90 border-b border-teal-100 px-4 py-2.5 flex items-center justify-between text-xs text-teal-900 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-teal-200/80 rounded-lg text-teal-800 shrink-0">
              <ShoppingBag size={14} />
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-[11px] truncate">{contextItem.title || 'Marketplace Escrow Request'}</p>
              <p className="text-[10px] text-teal-700 font-semibold">
                {contextItem.price ? `₦${contextItem.price.toLocaleString()} • ` : ''}
                {contextItem.meetupPoint ? `Meet-up: ${contextItem.meetupPoint}` : 'Campus Safe Escrow'}
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-teal-700 text-white rounded-md font-black text-[9px] shrink-0">
            {contextItem.status || 'Active Desk'}
          </span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-1 relative"
      >
        {/* Safety Disclaimer Banner */}
        <div className="mb-4 p-3 bg-indigo-50/80 rounded-2xl border border-indigo-100/80 text-[11px] text-indigo-900 space-y-1">
          <div className="flex items-center gap-1.5 font-extrabold">
            <ShieldCheck size={14} className="text-indigo-700 shrink-0" />
            <span>Official FUHSI Security & Moderation Log</span>
          </div>
          <p className="text-[10px] text-indigo-700 leading-relaxed font-medium">
            All messages in this channel are encrypted and stored in Firestore for student protection. Meet-ups should only take place at designated daytime campus locations.
          </p>
        </div>

        {messages.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto border border-teal-100 shadow-2xs">
              <MessageSquare size={22} />
            </div>
            <h4 className="text-xs font-black text-slate-800">No Messages Yet</h4>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              Start the conversation below. Your messages will sync in real time.
            </p>
          </div>
        ) : (
          messages.map(renderMessageBubble)
        )}
        <div ref={messagesEndRef} />

        {/* Scroll To Bottom Floating Button */}
        {showScrollBottom && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-4 right-4 p-2 rounded-full bg-teal-700 text-white shadow-lg hover:bg-teal-800 transition-all cursor-pointer animate-in fade-in"
          >
            <ArrowDown size={14} />
          </button>
        )}
      </div>

      {/* Quick Action Suggestion Chips */}
      <div className="bg-slate-100/80 border-t border-slate-200/80 px-3 py-2 shrink-0">
        <div className="text-[10px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
          <Sparkles size={11} className="text-teal-600" />
          <span>Quick Responses:</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {activeQuickReplies.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => {
                setInputText(reply);
              }}
              className="px-2.5 py-1 rounded-xl bg-white hover:bg-teal-50 hover:text-teal-800 hover:border-teal-300 text-slate-700 border border-slate-200 text-[10px] font-bold whitespace-nowrap shadow-2xs transition-all cursor-pointer shrink-0"
            >
              {reply}
            </button>
          ))}
        </div>
      </div>

      {/* Composer Input Bar */}
      <div className="bg-white p-3 border-t border-slate-200 shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Message ${recipientNickname}...`}
              rows={1}
              className="w-full text-xs rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium resize-none min-h-[40px] max-h-[100px]"
            />
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Send size={13} />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );

  if (isInline) {
    return (
      <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[450px] sm:h-[500px]">
        {containerContent}
      </div>
    );
  }

  // Render as a full Modal overlay
  return (
    <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      <div className="w-full h-full max-w-3xl mx-auto bg-white flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
        {containerContent}
      </div>
    </div>
  );
};
