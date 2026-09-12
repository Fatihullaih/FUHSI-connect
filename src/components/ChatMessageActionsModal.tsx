import React from 'react';
import { DirectMessage } from '../types';
import { normalizeNickname } from '../utils/messagingUtils';
import { 
  Reply, 
  Copy, 
  Forward, 
  Trash2, 
  X 
} from 'lucide-react';

interface ChatMessageActionsModalProps {
  message: DirectMessage | null;
  myNickname: string;
  onClose: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: DirectMessage) => void;
  onCopy: (text: string) => void;
  onForward: (message: DirectMessage) => void;
  onDeleteRequest: (message: DirectMessage) => void;
}

export const ChatMessageActionsModal: React.FC<ChatMessageActionsModalProps> = ({
  message,
  myNickname,
  onClose,
  onReact,
  onReply,
  onCopy,
  onForward,
  onDeleteRequest,
}) => {
  if (!message) return null;

  const isMe = normalizeNickname(message.senderNickname) === normalizeNickname(myNickname);
  const isDeleted = Boolean(message.isDeletedForEveryone || message.text === '🚫 This message was deleted');

  const emojis = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥'];

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Grab Handle for mobile */}
        <div className="pt-2 sm:hidden flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Message Snippet Preview */}
        <div className="p-3.5 px-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold text-teal-700 uppercase tracking-wider block">
              Message from {message.senderNickname}
            </span>
            <p className="text-xs text-slate-700 font-medium truncate italic mt-0.5">
              &ldquo;{message.text}&rdquo;
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Emoji Reactions Bar */}
        {!isDeleted && (
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-around gap-1">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(message.id, emoji);
                  onClose();
                }}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-2xs hover:scale-125 active:scale-95 transition-transform flex items-center justify-center text-lg cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Actions List */}
        <div className="p-2 space-y-1">
          {!isDeleted && (
            <>
              {/* Reply */}
              <button
                type="button"
                onClick={() => {
                  onReply(message);
                  onClose();
                }}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-teal-50/80 text-slate-800 hover:text-teal-900 text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                  <Reply size={15} />
                </div>
                <span>Reply / Quote</span>
              </button>

              {/* Copy */}
              <button
                type="button"
                onClick={() => {
                  onCopy(message.text);
                  onClose();
                }}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Copy size={15} />
                </div>
                <span>Copy Text</span>
              </button>

              {/* Forward */}
              <button
                type="button"
                onClick={() => {
                  onForward(message);
                  onClose();
                }}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-indigo-50/80 text-slate-800 hover:text-indigo-900 text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <Forward size={15} />
                </div>
                <span>Forward Message</span>
              </button>
            </>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={() => {
              onDeleteRequest(message);
              onClose();
            }}
            className="w-full px-3 py-2.5 rounded-xl hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 size={15} />
            </div>
            <span>Delete Message...</span>
          </button>
        </div>
      </div>
    </div>
  );
};
