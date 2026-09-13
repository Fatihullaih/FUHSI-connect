import React, { useState, useMemo, useRef } from 'react';
import { UserProfile, ChatGroup } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount } from '../utils/userDbUtils';
import { isDemoUser, isDemoNickname } from '../utils/postGenerator';
import { normalizeNickname } from '../utils/messagingUtils';
import { createChatGroup } from '../utils/groupUtils';
import { optimizeAvatarImage } from '../utils/imageUtils';
import { 
  Users, 
  Camera, 
  X, 
  Search, 
  Check, 
  ShieldCheck, 
  Sparkles,
  Info,
  UserPlus,
  Upload
} from 'lucide-react';

interface CreateGroupModalProps {
  myNickname: string;
  allUsers: UserProfile[];
  onClose: () => void;
  onGroupCreated: (newGroup: ChatGroup) => void;
}

const PRESET_ICONS = [
  { id: '1', label: 'Blue Shield', bg: 'from-blue-600 to-indigo-700' },
  { id: '2', label: 'Teal Pulse', bg: 'from-teal-600 to-emerald-700' },
  { id: '3', label: 'Amber Spark', bg: 'from-amber-500 to-orange-600' },
  { id: '4', label: 'Purple Crown', bg: 'from-purple-600 to-violet-800' },
  { id: '5', label: 'Rose Heart', bg: 'from-rose-500 to-pink-700' },
  { id: '6', label: 'Slate Vault', bg: 'from-slate-700 to-slate-900' },
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  myNickname,
  allUsers,
  onClose,
  onGroupCreated,
}) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarKey, setAvatarKey] = useState('2');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedNicknames, setSelectedNicknames] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cleanMyNickname = normalizeNickname(myNickname);

  // Filter campus students that can be added to the group
  const eligibleStudents = useMemo(() => {
    const q = memberSearch.toLowerCase().replace(/^@/, '').trim();
    return allUsers.filter((u) => {
      if (!u || isDemoUser(u) || isDemoNickname(u.nickname)) return false;
      if (u.isDeclined || u.verificationStatus === 'declined') return false;
      const nick = normalizeNickname(u.nickname);
      if (!nick || nick === cleanMyNickname) return false;
      if (nick === 'yi' || nick === '@yi') return false;

      if (!q) return true;
      const matchesNick = nick.includes(q);
      const matchesDept = (u.department || '').toLowerCase().includes(q);
      const matchesName = (u.realName || '').toLowerCase().includes(q);
      return matchesNick || matchesDept || matchesName;
    }).slice(0, 30);
  }, [allUsers, memberSearch, cleanMyNickname]);

  // Handle local image selection directly (upload picture only, no cropping)
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image file must be under 5MB');
      return;
    }

    setErrorMessage('');
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      try {
        const cropped = await optimizeAvatarImage(result, 400, 0.85);
        setAvatarUrl(cropped);
      } catch {
        setAvatarUrl(result);
      }
    };
    reader.readAsDataURL(file);
    if (e.target) {
      e.target.value = '';
    }
  };

  const toggleSelectMember = (nickname: string) => {
    const formatted = nickname.startsWith('@') ? nickname : `@${nickname}`;
    const clean = normalizeNickname(formatted);

    setSelectedNicknames((prev) => {
      const exists = prev.some((n) => normalizeNickname(n) === clean);
      if (exists) {
        return prev.filter((n) => normalizeNickname(n) !== clean);
      } else {
        return [...prev, formatted];
      }
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = groupName.trim();

    if (!trimmedName) {
      setErrorMessage('Group name is required');
      return;
    }

    if (trimmedName.length < 3) {
      setErrorMessage('Group name must be at least 3 characters');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const newGroup = createChatGroup({
        name: trimmedName,
        description: description.trim(),
        avatarUrl: avatarUrl || undefined,
        avatarKey,
        creatorNickname: myNickname,
        initialMemberNicknames: selectedNicknames,
      });

      onGroupCreated(newGroup);
    } catch (err: any) {
      console.error('Failed to create group:', err);
      setErrorMessage(err?.message || 'Failed to create group. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100 shadow-2xs">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">Create Chat Group</h2>
              <p className="text-[11px] text-slate-500 font-bold">Connect students around classes, topics, or clubs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-center gap-2">
              <Info size={16} className="shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Group Picture & Preset Color */}
          <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
            <div className="relative group cursor-pointer shrink-0" onClick={() => fileInputRef.current?.click()}>
              <div className="w-18 h-18 rounded-2xl bg-slate-200 border-2 border-dashed border-teal-600/50 flex items-center justify-center overflow-hidden shadow-xs hover:border-teal-600 transition-all">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Group Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-tr ${PRESET_ICONS.find(p => p.id === avatarKey)?.bg || 'from-teal-600 to-emerald-700'} flex flex-col items-center justify-center text-white p-1`}>
                    <Users size={24} className="opacity-90" />
                    <span className="text-[9px] font-black uppercase tracking-wider mt-0.5 opacity-90">Group</span>
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center text-white transition-opacity">
                <Camera size={18} />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                className="hidden"
              />
            </div>

            <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
              <div>
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-800">Group Picture</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-1 px-2.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/80 text-[11px] font-black flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Upload size={12} />
                    <span>Upload</span>
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Upload a custom photo or choose a preset badge theme:</p>
              </div>

              {/* Preset Badges Selection */}
              <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
                {PRESET_ICONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setAvatarKey(preset.id);
                      setAvatarUrl('');
                    }}
                    title={preset.label}
                    className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${preset.bg} transition-all cursor-pointer ${
                      avatarKey === preset.id && !avatarUrl
                        ? 'ring-2 ring-teal-600 scale-110 shadow-xs'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Group Name Field */}
          <div>
            <label className="block text-xs font-black text-slate-800 mb-1">
              Group Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={50}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Biochemistry 300L Study Hub"
              className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-400"
            />
          </div>

          {/* Description Field */}
          <div>
            <label className="block text-xs font-black text-slate-800 mb-1">
              Group Description (Optional)
            </label>
            <textarea
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about? Share topics, guidelines, or objectives..."
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-400 resize-none leading-relaxed"
            />
          </div>

          {/* Creator Role Preview Badge */}
          <div className="px-3.5 py-2 bg-teal-50/80 rounded-xl border border-teal-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-teal-700 shrink-0" />
              <div>
                <span className="font-extrabold text-teal-950">Group Admin: </span>
                <span className="font-bold text-teal-800">{myNickname}</span>
                <span className="text-[10px] text-teal-600 block sm:inline sm:ml-1 font-medium">(You are automatically the group creator & admin)</span>
              </div>
            </div>
          </div>

          {/* Members Selection Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-slate-800">
                Add Members ({selectedNicknames.length} selected)
              </label>
              {selectedNicknames.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedNicknames([])}
                  className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Selected Members Chips */}
            {selectedNicknames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-100/70 rounded-xl border border-slate-200/80 max-h-24 overflow-y-auto">
                {selectedNicknames.map((nick) => (
                  <span
                    key={nick}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] font-bold shadow-2xs"
                  >
                    <span>{nick}</span>
                    <button
                      type="button"
                      onClick={() => toggleSelectMember(nick)}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Member Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search students by nickname, department, or name..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100/80 border border-transparent focus:border-teal-500 focus:bg-white rounded-xl outline-none font-medium text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Eligible Students List */}
            <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-48 overflow-y-auto bg-white">
              {eligibleStudents.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 font-medium">
                  {memberSearch ? 'No matching students found' : 'No students available'}
                </div>
              ) : (
                eligibleStudents.map((u) => {
                  const nick = u.nickname.startsWith('@') ? u.nickname : `@${u.nickname}`;
                  const clean = normalizeNickname(nick);
                  const isSelected = selectedNicknames.some((n) => normalizeNickname(n) === clean);
                  const badge = getUserBadgeInfo(nick);

                  return (
                    <div
                      key={u.id || nick}
                      onClick={() => toggleSelectMember(nick)}
                      className={`p-2.5 flex items-center justify-between gap-2.5 hover:bg-slate-50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-teal-50/70' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-teal-900 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                          <AvatarIcon
                            avatarKey={u.avatarKey}
                            avatarUrl={u.avatarUrl}
                            sizeClassName="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 leading-tight">
                            <span className="text-xs font-black text-slate-900 truncate">{nick}</span>
                            <VerificationBadge
                              isVerified={badge.isVerified}
                              badgeType={badge.badgeType as any}
                              size={12}
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold truncate">
                            {u.department || 'FUHSI Student'} {u.level ? `• ${u.level}` : ''}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !groupName.trim()}
              className="px-5 py-2 text-xs font-black text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus size={14} />
              <span>{isSubmitting ? 'Creating...' : 'Create Group'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
