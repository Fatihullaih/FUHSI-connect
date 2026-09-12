import React from 'react';
import { X, Download, Camera, User, CheckCircle2 } from 'lucide-react';
import { AvatarIcon } from './AvatarIcon';

interface ProfilePictureModalProps {
  nickname: string;
  avatarUrl?: string;
  avatarKey?: string;
  isOwner?: boolean;
  onClose: () => void;
  onUploadClick?: () => void;
}

export const ProfilePictureModal: React.FC<ProfilePictureModalProps> = ({
  nickname,
  avatarUrl,
  avatarKey = 'caduceus',
  isOwner = false,
  onClose,
  onUploadClick,
}) => {
  const handleDownload = () => {
    if (avatarUrl) {
      // Download actual image
      const link = document.createElement('a');
      link.href = avatarUrl;
      link.download = `${nickname.replace(/[^a-zA-Z0-9]/g, '_')}_profile_picture.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Trigger browser download or alert
      alert('Default avatar icon active. Upload a custom photo to enable direct high-res image download.');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-lg w-full text-white shadow-2xl space-y-5 relative overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <User size={18} className="text-teal-400" />
            <div>
              <h3 className="font-extrabold text-sm text-slate-100">{nickname}</h3>
              <p className="text-[10px] text-slate-400">Profile Picture Preview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Close Preview"
          >
            <X size={18} />
          </button>
        </div>

        {/* Large Profile Picture Canvas */}
        <div className="flex items-center justify-center py-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 min-h-[260px] relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${nickname}'s Profile`}
              className="max-h-[340px] max-w-full object-contain rounded-2xl shadow-xl ring-2 ring-teal-500/30"
            />
          ) : (
            <div className="w-40 h-40 rounded-full bg-teal-950/80 border-4 border-teal-500/40 flex items-center justify-center shadow-xl">
              <AvatarIcon avatarKey={avatarKey} size={80} sizeClassName="w-20 h-20 text-teal-400" />
            </div>
          )}
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {isOwner && onUploadClick && (
            <button
              onClick={() => {
                onClose();
                onUploadClick();
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <Camera size={15} />
              <span>Change Photo</span>
            </button>
          )}

          <button
            onClick={handleDownload}
            className="flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <Download size={16} />
            <span>Download Profile Picture</span>
          </button>
        </div>
      </div>
    </div>
  );
};
