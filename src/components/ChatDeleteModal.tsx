import React from 'react';
import { DirectMessage } from '../types';
import { normalizeNickname } from '../utils/messagingUtils';
import { Trash2, X, AlertTriangle } from 'lucide-react';

interface ChatDeleteModalProps {
  message: DirectMessage | null;
  myNickname: string;
  onClose: () => void;
  onDeleteForMe: (messageId: string) => void;
  onDeleteForEveryone: (messageId: string) => void;
}

export const ChatDeleteModal: React.FC<ChatDeleteModalProps> = ({
  message,
  myNickname,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
}) => {
  if (!message) return null;

  const isMe = normalizeNickname(message.senderNickname) === normalizeNickname(myNickname);

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
            <Trash2 size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">Delete Message?</h3>
            <p className="text-[11px] text-slate-500 font-medium">Choose how you want to delete this message</p>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
          <p className="text-xs text-slate-700 italic truncate font-medium">
            &ldquo;{message.text}&rdquo;
          </p>
        </div>

        <div className="space-y-2 pt-1">
          {/* Delete for everyone (only available if user is the sender) */}
          {isMe && (
            <button
              type="button"
              onClick={() => {
                onDeleteForEveryone(message.id);
                onClose();
              }}
              className="w-full py-2.5 px-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer text-center"
            >
              Delete for everyone
            </button>
          )}

          {/* Delete for me */}
          <button
            type="button"
            onClick={() => {
              onDeleteForMe(message.id);
              onClose();
            }}
            className="w-full py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer text-center"
          >
            Delete for me
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-3.5 text-slate-500 hover:text-slate-800 text-xs font-bold transition-colors cursor-pointer text-center"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
