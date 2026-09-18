import React, { useState, useMemo } from 'react';
import { PostCategory, UserProfile } from '../types';
import { compressImageFile } from '../utils/imageUtils';
import { isGuestAccount } from '../utils/userDbUtils';
import { VerificationModal } from './VerificationModal';
import { INITIAL_USER_PROFILE } from '../data/initialData';
import { 
  X, 
  ArrowLeft,
  Sparkles, 
  Send, 
  ShieldCheck, 
  BarChart2, 
  AlertTriangle, 
  Image as ImageIcon, 
  Upload, 
  Trash2, 
  Lock, 
  Plus,
  Globe,
  Users
} from 'lucide-react';

interface CreatePostModalProps {
  userProfile?: UserProfile | null;
  user?: UserProfile | null;
  isOpen?: boolean;
  onClose: () => void;
  onSubmit?: (
    data: {
      content: string;
      department: string;
      targetDepartment?: string;
      category: string;
      imageUrl?: string;
      imageUrls?: string[];
      pollQuestion?: string;
      pollOptions?: string[];
      pollOptA?: string;
      pollOptB?: string;
      audience?: 'everyone' | 'followers';
    }
  ) => void;
  onCreatePost?: (content: string, category: PostCategory, customNickname?: string) => void;
  onOpenVerification?: (data?: any) => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  userProfile,
  user,
  isOpen = true,
  onClose,
  onSubmit,
  onCreatePost,
  onOpenVerification,
}) => {
  const currentUser = userProfile || user || INITIAL_USER_PROFILE;

  const isVerifiedUser = useMemo(() => {
    if (currentUser?.isVerified || currentUser?.verificationStatus === 'approved') return true;
    try {
      const cleanNick = (currentUser?.nickname || '').toLowerCase().replace(/^@/, '');
      const vStr = localStorage.getItem('fuhsi_verifications_db');
      if (vStr) {
        const vList: any[] = JSON.parse(vStr);
        const found = vList.find(
          (req) =>
            req.status === 'APPROVED' &&
            (req.applicantNickname?.toLowerCase().replace(/^@/, '') === cleanNick ||
              req.applicantNickname?.toLowerCase() === (currentUser?.nickname || '').toLowerCase())
        );
        if (found) return true;
      }
      const uStr = localStorage.getItem('fuhsi_users_db');
      if (uStr) {
        const uList: any[] = JSON.parse(uStr);
        const foundU = uList.find(
          (usr) =>
            (usr.nickname || '').toLowerCase().replace(/^@/, '') === cleanNick ||
            usr.id === currentUser?.id
        );
        if (foundU && (foundU.isVerified || foundU.verificationStatus === 'approved')) return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }, [currentUser]);

  const [content, setContent] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [showImageInput, setShowImageInput] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [audience, setAudience] = useState<'everyone' | 'followers'>(
    currentUser?.defaultPostAudience || 'everyone'
  );

  const handleAddPollOption = () => {
    setPollOptions((prev) => [...prev, '']);
  };

  const handleUpdatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemovePollOption = (index: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions((prev) => prev.filter((_, i) => i !== index));
  };

  if (isOpen === false) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const availableSlots = 2 - imageUrls.length;
    if (availableSlots <= 0) return;

    const filesToProcess = files.slice(0, availableSlots);
    const newProcessedImages: string[] = [];

    for (const file of filesToProcess) {
      try {
        const compressedDataUrl = await compressImageFile(file, 900, 900, 0.75);
        newProcessedImages.push(compressedDataUrl);
      } catch (err) {
        console.error('Image compression failed, using direct reader', err);
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newProcessedImages.push(dataUrl);
      }
    }

    setImageUrls((prev) => [...prev, ...newProcessedImages].slice(0, 2));
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVerificationSubmit = (data: any) => {
    try {
      const existingReqs = JSON.parse(localStorage.getItem('fuhsi_verifications_db') || '[]');
      const newReq = {
        id: `verif_req_${Date.now()}`,
        applicantNickname: currentUser.nickname,
        applicantFullName: currentUser.realName || currentUser.nickname,
        applicantEmail: currentUser.studentEmail || 'N/A',
        applicantPhone: currentUser.emergencyHomePhone || 'N/A',
        department: currentUser.department || 'N/A',
        level: currentUser.level || 'N/A',
        category: `${data.accountType || 'Student'} Verification`,
        accountType: data.accountType || 'Student',
        positionTitle: data.positionTitle || '',
        matricNumber: currentUser.matricNumber || 'N/A',
        proofDetails: data.proofDetails || 'Standard Verification Request',
        paymentRef: data.paymentRef || `SQUADCO-${Math.floor(100000 + Math.random() * 900000)}`,
        amountPaid: data.amountPaid || 1500,
        submittedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: 'ELIGIBLE_PENDING_ADMIN',
      };
      localStorage.setItem('fuhsi_verifications_db', JSON.stringify([newReq, ...existingReqs]));

      if (onOpenVerification) {
        onOpenVerification(data);
      }
    } catch (e) {
      console.error(e);
    }
    setShowVerificationModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const validPollOptions = pollOptions.map((opt) => opt.trim()).filter(Boolean);
    const isValidPoll = hasPoll && Boolean(pollQuestion.trim()) && validPollOptions.length >= 2;

    if (onSubmit) {
      onSubmit({
        content: content.trim(),
        department: currentUser?.department || 'General',
        targetDepartment: 'General Campus',
        category: 'General',
        imageUrl: imageUrls[0] || undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        pollQuestion: isValidPoll ? pollQuestion.trim() : undefined,
        pollOptions: isValidPoll ? validPollOptions : undefined,
        pollOptA: isValidPoll ? validPollOptions[0] : undefined,
        pollOptB: isValidPoll ? validPollOptions[1] : undefined,
        audience,
      });
    } else if (onCreatePost) {
      onCreatePost(content.trim(), 'General');
    }

    setContent('');
    setImageUrls([]);
    setPollQuestion('');
    setPollOptions(['', '']);
    setHasPoll(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      <div className="w-full h-full max-w-3xl mx-auto bg-white flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 shadow-2xs z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 -ml-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5 font-bold text-xs sm:text-sm cursor-pointer"
              title="Return to previous page"
            >
              <ArrowLeft size={18} />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">Create Campus Post</h3>
                <p className="text-[11px] text-slate-500">Share updates</p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Post Content Area */}
          <div>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              autoFocus
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white transition-colors resize-none placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* Attachments Actions (Image, Poll) */}
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Image Toggle */}
              <button
                type="button"
                onClick={() => setShowImageInput(!showImageInput)}
                className="text-xs font-bold text-teal-700 flex items-center gap-1.5 hover:underline cursor-pointer"
              >
                <ImageIcon size={16} />
                <span>{imageUrls.length > 0 ? `📷 ${imageUrls.length}/2 Attached` : '+ Attach Image'}</span>
              </button>

              {/* Poll Toggle */}
              <button
                type="button"
                onClick={() => setHasPoll(!hasPoll)}
                className="text-xs font-bold text-teal-700 flex items-center gap-1.5 hover:underline cursor-pointer"
              >
                <BarChart2 size={16} />
                <span>{hasPoll ? 'Remove Poll' : '+ Attach Poll'}</span>
              </button>
            </div>

            {/* Image Input Drawer */}
            {(showImageInput || imageUrls.length > 0) && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-800">
                    Image Attachments <span className="text-teal-700">({imageUrls.length}/2)</span>
                  </span>
                  {imageUrls.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setImageUrls([])}
                      className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {/* File Upload Button */}
                {imageUrls.length < 2 ? (
                  <label className="cursor-pointer bg-teal-600 hover:bg-teal-700 text-white rounded-xl p-3 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors shadow-xs">
                    <Upload size={16} />
                    <span>{imageUrls.length === 0 ? 'Click to Select Image from Device (Max 2)' : '+ Add 2nd Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 text-center">
                    ✓ Maximum 2 images attached
                  </p>
                )}

                {/* Attached Image Previews Grid */}
                {imageUrls.length > 0 && (
                  <div className={`grid ${imageUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 pt-1`}>
                    {imageUrls.map((url, idx) => (
                      <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 h-40 bg-slate-950 flex items-center justify-center group">
                        <img src={url} alt={`Attachment ${idx + 1}`} className="h-full w-full object-cover" />
                        <div className="absolute top-1.5 left-1.5 bg-slate-900/80 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md backdrop-blur-xs">
                          Image {idx + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white p-1 rounded-full shadow-md transition-colors cursor-pointer"
                          title="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Poll Input Section */}
            {hasPoll && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                    Poll Question
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. How many courses are available in FUHSI?"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-medium focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                    Answer Options
                  </label>
                  {pollOptions.map((optText, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Option ${String.fromCharCode(65 + index)} (e.g. ${
                          index === 0 ? 'Option A' : index === 1 ? 'Option B' : 'Option Choice'
                        })`}
                        value={optText}
                        onChange={(e) => handleUpdatePollOption(index, e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium focus:outline-none focus:border-teal-500"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePollOption(index)}
                          className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 rounded-lg transition-colors cursor-pointer"
                          title="Remove option"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddPollOption}
                  className="mt-1 text-xs font-extrabold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200/90 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ Add Option</span>
                </button>
              </div>
            )}
          </div>

          {/* Post Audience / Privacy Selector */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                {audience === 'everyone' ? <Globe size={16} /> : <Users size={16} />}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Audience</p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {audience === 'everyone' ? 'Anyone can see this post' : 'Only your followers can see this'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 self-start sm:self-auto shadow-xs">
              <button
                type="button"
                onClick={() => setAudience('everyone')}
                className={`px-3 py-1.5 rounded-md text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  audience === 'everyone'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Globe size={13} />
                <span>Everyone</span>
              </button>
              <button
                type="button"
                onClick={() => setAudience('followers')}
                className={`px-3 py-1.5 rounded-md text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  audience === 'followers'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Users size={13} />
                <span>Followers only</span>
              </button>
            </div>
          </div>

          {/* Footer Actions: Cancel | Publish Post */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim()}
              className="bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              <Send size={14} />
              <span>Publish Post</span>
            </button>
          </div>
        </form>
      </div>

      {showVerificationModal && (
        <VerificationModal
          userProfile={currentUser}
          onClose={() => setShowVerificationModal(false)}
          onSubmitVerification={handleVerificationSubmit}
        />
      )}
    </div>
  );
};
