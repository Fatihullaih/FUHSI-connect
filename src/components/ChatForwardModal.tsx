import React, { useState, useMemo } from 'react';
import { DirectMessage, ChatConversation, UserProfile } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { normalizeNickname, extractPureStudentHandle } from '../utils/messagingUtils';
import { isGuestAccount } from '../utils/userDbUtils';
import { Search, X, Forward, Send } from 'lucide-react';

interface ChatForwardModalProps {
  message: DirectMessage | null;
  conversations: ChatConversation[];
  allUsers: UserProfile[];
  myNickname: string;
  onClose: () => void;
  onForwardTo: (targetNickname: string) => void;
}

export const ChatForwardModal: React.FC<ChatForwardModalProps> = ({
  message,
  conversations,
  allUsers,
  myNickname,
  onClose,
  onForwardTo,
}) => {
  const [search, setSearch] = useState('');
  const cleanMe = normalizeNickname(myNickname);

  // Combine unique contacts from existing conversations and student directory
  const contactList = useMemo(() => {
    const map = new Map<string, {
      nickname: string;
      avatarKey?: string;
      avatarUrl?: string;
      badgeType?: string;
      isVerified?: boolean;
      subtitle?: string;
    }>();

    // Add from conversations first
    conversations.forEach((conv) => {
      const pure = extractPureStudentHandle(conv.otherUserNickname, myNickname);
      const clean = normalizeNickname(pure);
      if (clean && clean !== cleanMe && !map.has(clean)) {
        map.set(clean, {
          nickname: pure,
          avatarKey: conv.otherUserAvatarKey,
          avatarUrl: conv.otherUserAvatarUrl,
          badgeType: conv.otherUserBadgeType as any,
          isVerified: conv.otherUserIsVerified,
          subtitle: 'Recent chat',
        });
      }
    });

    // Add from allUsers
    allUsers.forEach((user) => {
      const clean = normalizeNickname(user.nickname);
      if (clean && clean !== cleanMe && !map.has(clean)) {
        map.set(clean, {
          nickname: user.nickname.startsWith('@') ? user.nickname : `@${user.nickname}`,
          avatarKey: user.avatarKey,
          avatarUrl: user.avatarUrl,
          badgeType: user.badgeType,
          isVerified: Boolean(user.isVerified || user.verificationStatus === 'approved'),
          subtitle: isGuestAccount(user) ? 'Guest' : (user.badgeTitle || 'Student'),
        });
      }
    });

    return Array.from(map.values());
  }, [conversations, allUsers, myNickname, cleanMe]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contactList;
    const q = search.trim().toLowerCase().replace(/^@/, '');
    return contactList.filter((c) => normalizeNickname(c.nickname).includes(q));
  }, [contactList, search]);

  if (!message) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
              <Forward size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Forward Message</h3>
              <p className="text-[10px] text-slate-400 font-bold">Select a contact or conversation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message to Forward Snippet */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
          <p className="text-[11px] text-slate-600 font-medium line-clamp-2 italic bg-white p-2 rounded-xl border border-slate-200">
            &ldquo;{message.text}&rdquo;
          </p>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100/80 border border-transparent focus:border-indigo-500 focus:bg-white rounded-xl outline-none font-medium text-slate-800"
            />
          </div>
        </div>

        {/* Contacts list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50 p-2">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">
              No matching contacts found.
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.nickname}
                onClick={() => {
                  onForwardTo(contact.nickname);
                  onClose();
                }}
                className="p-2.5 px-3 flex items-center justify-between rounded-2xl hover:bg-indigo-50/70 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-900 flex items-center justify-center overflow-hidden border border-slate-200">
                    <AvatarIcon
                      avatarKey={contact.avatarKey}
                      avatarUrl={contact.avatarUrl}
                      sizeClassName="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900 group-hover:text-indigo-800">
                        {contact.nickname}
                      </span>
                      {(() => {
                        const bInfo = getUserBadgeInfo(contact.nickname);
                        return (
                          <VerificationBadge
                            isVerified={bInfo.isVerified}
                            badgeType={bInfo.badgeType as any}
                            size={12}
                          />
                        );
                      })()}
                    </div>
                    {contact.subtitle && (
                      <p className="text-[10px] font-bold text-slate-400">
                        {contact.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                <button 
                  type="button"
                  className="p-2 rounded-xl bg-indigo-600 group-hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
                  title="Forward to this contact"
                >
                  <Send size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
