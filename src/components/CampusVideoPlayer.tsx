import React, { useState } from 'react';
import { Download, Lock, ShieldCheck, Video, Check } from 'lucide-react';
import { UserProfile } from '../types';
import { checkIsUserVerified } from '../utils/verificationUtils';
import { VerificationModal } from './VerificationModal';

interface CampusVideoPlayerProps {
  videoUri: string;
  userProfile?: UserProfile | null;
  className?: string;
}

export const CampusVideoPlayer: React.FC<CampusVideoPlayerProps> = ({
  videoUri,
  userProfile,
  className = '',
}) => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const isCurrentUserVerified = checkIsUserVerified(userProfile?.nickname, userProfile);

  const handleDownload = () => {
    if (!isCurrentUserVerified) {
      setShowDownloadModal(true);
      return;
    }

    try {
      const a = document.createElement('a');
      a.href = videoUri;
      a.download = `fuhsi_campus_video_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (e) {
      console.error('Download error:', e);
    }
  };

  return (
    <div className={`rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 relative shadow-md ${className}`}>
      {/* Protected Content Watermark Overlay */}
      <div className="absolute top-2.5 left-2.5 z-10 select-none pointer-events-none bg-slate-900/80 backdrop-blur-md text-slate-200 text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5 shadow-sm">
        <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
        <span>FUHSI Connect • Protected Media</span>
      </div>

      {/* Video Element */}
      <video
        src={videoUri}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className="w-full max-h-96 object-contain bg-black select-none"
      />

      {/* Save / Download Video Bar */}
      <div className="p-2.5 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800/80">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 px-1">
          <Video size={15} className="text-teal-400 shrink-0" />
          <span>Campus Video Thread</span>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            isCurrentUserVerified
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          }`}
          title={isCurrentUserVerified ? 'Save / Download Video to Device' : 'Save Video (Verified Feature)'}
        >
          {isCurrentUserVerified ? (
            <>
              {downloadSuccess ? <Check size={14} className="text-emerald-200" /> : <Download size={14} />}
              <span>{downloadSuccess ? 'Downloaded!' : 'Save Video'}</span>
            </>
          ) : (
            <>
              <Lock size={13} className="text-amber-400 shrink-0" />
              <span>Save Video</span>
              <span className="text-[9px] font-extrabold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 ml-0.5">
                Verified
              </span>
            </>
          )}
        </button>
      </div>

      {/* Save Video Lock Modal for Unverified Users */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs border border-amber-200">
              <Lock size={24} />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">Save Video — Verified Feature</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Downloading and saving campus video threads to your device is exclusive to Verified accounts on FUHSI Connect to protect student media content.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-left text-xs space-y-1.5 text-slate-800 font-medium">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <ShieldCheck size={16} />
                <span>Get Verified to unlock:</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-700 font-medium">
                <li className="flex items-center gap-1.5">✓ Save & download campus video threads</li>
                <li className="flex items-center gap-1.5">✓ Upload any video posts (up to 1m 30s)</li>
                <li className="flex items-center gap-1.5">✓ Live editing of published threads</li>
                <li className="flex items-center gap-1.5">✓ Verified checkmark badge across FUHSI Connect</li>
              </ul>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDownloadModal(false);
                  setShowVerificationModal(true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <ShieldCheck size={14} />
                <span>Get Verified</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerificationModal && (
        <VerificationModal
          userProfile={userProfile || null}
          onClose={() => setShowVerificationModal(false)}
          onSubmitVerification={() => setShowVerificationModal(false)}
        />
      )}
    </div>
  );
};
