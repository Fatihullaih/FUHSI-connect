import React, { useState, useMemo, useRef } from 'react';
import { UserProfile, ChatGroup } from '../types';
import { AvatarIcon } from './AvatarIcon';
import { VerificationBadge } from './VerificationBadge';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { normalizeNickname, clearConversationHistoryForUser } from '../utils/messagingUtils';
import { optimizeAvatarImage } from '../utils/imageUtils';
import { 
  isUserGroupAdmin, 
  isUserGroupCreator, 
  updateGroupInfo, 
  removeGroupMember, 
  toggleGroupAdmin, 
  leaveGroup, 
  deleteChatGroup,
  addGroupMembers
} from '../utils/groupUtils';
import { 
  Users, 
  X, 
  Search, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Crown, 
  UserMinus, 
  UserPlus, 
  Edit3, 
  Camera, 
  Check, 
  LogOut, 
  Trash2, 
  MoreVertical,
  Info
} from 'lucide-react';

interface GroupInfoModalProps {
  group: ChatGroup;
  myNickname: string;
  allUsers: UserProfile[];
  onClose: () => void;
  onGroupUpdated: (updatedGroup: ChatGroup) => void;
  onGroupLeftOrDeleted: (groupId: string) => void;
  onOpenProfile?: (nickname: string) => void;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  group,
  myNickname,
  allUsers,
  onClose,
  onGroupUpdated,
  onGroupLeftOrDeleted,
  onOpenProfile,
}) => {
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editDescription, setEditDescription] = useState(group.description || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(group.avatarUrl || '');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberForAction, setSelectedMemberForAction] = useState<string | null>(null);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [newMembersSelected, setNewMembersSelected] = useState<string[]>([]);
  const [addMembersSearch, setAddMembersSearch] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cleanMyNickname = normalizeNickname(myNickname);
  const isAdmin = isUserGroupAdmin(group, myNickname);
  const isCreator = isUserGroupCreator(group, myNickname);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Group members with profiles
  const memberList = useMemo(() => {
    const list = (group.memberNicknames || []).map((nick) => {
      const clean = normalizeNickname(nick);
      const user = allUsers.find((u) => normalizeNickname(u.nickname) === clean || u.id === clean);
      const isMemberAdmin = (group.adminNicknames || []).some((a) => normalizeNickname(a) === clean);
      const isMemberCreator = normalizeNickname(group.createdBy) === clean;
      const isMe = clean === cleanMyNickname;

      return {
        nickname: nick.startsWith('@') ? nick : `@${nick}`,
        cleanNickname: clean,
        user,
        isAdmin: isMemberAdmin,
        isCreator: isMemberCreator,
        isMe,
        badge: getUserBadgeInfo(nick),
      };
    });

    // Sort: Creator first, then Admins, then me, then alphabetically
    list.sort((a, b) => {
      if (a.isCreator) return -1;
      if (b.isCreator) return 1;
      if (a.isAdmin && !b.isAdmin) return -1;
      if (!a.isAdmin && b.isAdmin) return 1;
      if (a.isMe) return -1;
      if (b.isMe) return 1;
      return a.cleanNickname.localeCompare(b.cleanNickname);
    });

    if (!memberSearch.trim()) return list;
    const q = memberSearch.toLowerCase().replace(/^@/, '');
    return list.filter((m) => m.cleanNickname.includes(q) || (m.user?.department || '').toLowerCase().includes(q));
  }, [group, allUsers, cleanMyNickname, memberSearch]);

  // Students that are NOT in the group and can be added
  const availableStudentsToAdd = useMemo(() => {
    const currentMemberSet = new Set((group.memberNicknames || []).map((m) => normalizeNickname(m)));
    const q = addMembersSearch.toLowerCase().replace(/^@/, '').trim();

    return allUsers.filter((u) => {
      if (!u || !u.nickname) return false;
      const nick = normalizeNickname(u.nickname);
      if (currentMemberSet.has(nick)) return false;
      if (nick === 'yi' || nick === '@yi') return false;
      if (u.isDeclined || u.verificationStatus === 'declined') return false;

      if (!q) return true;
      return (
        nick.includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.realName || '').toLowerCase().includes(q)
      );
    }).slice(0, 25);
  }, [allUsers, group.memberNicknames, addMembersSearch]);

  // Photo change handler
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file must be under 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      try {
        const cropped = await optimizeAvatarImage(result, 400, 0.85);
        setEditAvatarUrl(cropped);
        if (!isEditingInfo) {
          const updated = updateGroupInfo(group.id, { avatarUrl: cropped }, myNickname);
          if (updated) {
            onGroupUpdated(updated);
            showToast('Group photo updated', 'success');
          }
        }
      } catch {
        setEditAvatarUrl(result);
        if (!isEditingInfo) {
          try {
            const updated = updateGroupInfo(group.id, { avatarUrl: result }, myNickname);
            if (updated) {
              onGroupUpdated(updated);
              showToast('Group photo updated', 'success');
            }
          } catch (err: any) {
            showToast(err?.message || 'Failed to update photo', 'error');
          }
        }
      }
    };
    reader.readAsDataURL(file);
    if (e.target) {
      e.target.value = '';
    }
  };

  // Clear Chat History for current user only
  const handleClearHistory = () => {
    if (!confirm('Clear all messages in this group on your device? Other group members will still keep their chat history.')) return;
    try {
      clearConversationHistoryForUser(group.id, myNickname);
      showToast('Group chat history cleared on your device', 'success');
    } catch (err: any) {
      showToast('Failed to clear chat history', 'error');
    }
  };

  // Save Name & Description edit
  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      showToast('Group name cannot be empty', 'error');
      return;
    }

    try {
      const updated = updateGroupInfo(
        group.id,
        {
          name: editName.trim(),
          description: editDescription.trim(),
          avatarUrl: editAvatarUrl,
        },
        myNickname
      );

      if (updated) {
        onGroupUpdated(updated);
        setIsEditingInfo(false);
        showToast('Group info updated successfully', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to update group info', 'error');
    }
  };

  // Toggle Admin status
  const handleToggleAdmin = (targetNickname: string, makeAdmin: boolean) => {
    try {
      const updated = toggleGroupAdmin(group.id, targetNickname, myNickname, makeAdmin);
      if (updated) {
        onGroupUpdated(updated);
        setSelectedMemberForAction(null);
        showToast(
          makeAdmin
            ? `${targetNickname} is now a Group Admin`
            : `${targetNickname} was removed as Admin`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(err?.message || 'Operation failed', 'error');
    }
  };

  // Remove member
  const handleRemoveMember = (targetNickname: string) => {
    if (!confirm(`Are you sure you want to remove ${targetNickname} from the group?`)) return;

    try {
      const updated = removeGroupMember(group.id, targetNickname, myNickname);
      if (updated) {
        onGroupUpdated(updated);
        setSelectedMemberForAction(null);
        showToast(`${targetNickname} removed from group`, 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove member', 'error');
    }
  };

  // Add selected members to group
  const handleAddMembersSubmit = () => {
    if (newMembersSelected.length === 0) return;

    try {
      const updated = addGroupMembers(group.id, newMembersSelected, myNickname);
      if (updated) {
        onGroupUpdated(updated);
        setShowAddMembersModal(false);
        setNewMembersSelected([]);
        showToast(`Added ${newMembersSelected.length} student(s) to the group`, 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to add members', 'error');
    }
  };

  // Leave Group
  const handleLeaveGroup = () => {
    if (!confirm('Are you sure you want to leave this group? You will no longer receive its messages.')) return;

    try {
      leaveGroup(group.id, myNickname);
      onGroupLeftOrDeleted(group.id);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to leave group', 'error');
    }
  };

  // Delete Group (Creator only)
  const handleDeleteGroup = () => {
    if (!confirm(`Permanently delete group "${group.name}"? This action cannot be undone.`)) return;

    try {
      deleteChatGroup(group.id, myNickname);
      onGroupLeftOrDeleted(group.id);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete group', 'error');
    }
  };

  const currentDisplayAvatar = editAvatarUrl || group.avatarUrl;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Toast alert */}
        {toastMsg && (
          <div
            className={`p-2.5 text-xs font-bold flex items-center justify-between z-20 ${
              toastMsg.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="p-1 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Modal Top Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
              <Users size={16} />
            </div>
            <h3 className="text-sm font-black text-slate-900">Group Information</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Group Header Card */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left relative">
            
            {/* Group Picture & Admin Upload Trigger */}
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-slate-200 border-2 border-slate-300 flex items-center justify-center overflow-hidden shadow-xs">
                {currentDisplayAvatar ? (
                  <img
                    src={currentDisplayAvatar}
                    alt={group.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-teal-700 to-emerald-800 flex flex-col items-center justify-center text-white">
                    <Users size={32} />
                  </div>
                )}
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl shadow-md border-2 border-white cursor-pointer transition-all hover:scale-105"
                  title="Change Group Picture"
                >
                  <Camera size={13} />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>

            {/* Info details / Inline Edit */}
            <div className="flex-1 min-w-0 space-y-1">
              {isEditingInfo ? (
                <form onSubmit={handleSaveInfo} className="space-y-2">
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-xs font-black bg-white border border-teal-500 rounded-xl px-3 py-2 text-slate-900 outline-none"
                    placeholder="Group name"
                  />
                  <textarea
                    rows={2}
                    maxLength={200}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full text-xs font-medium bg-white border border-teal-500 rounded-xl px-3 py-1.5 text-slate-800 outline-none resize-none"
                    placeholder="Group description"
                  />
                  <div className="flex items-center gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditName(group.name);
                        setEditDescription(group.description || '');
                        setIsEditingInfo(false);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-[11px] font-black text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer shadow-2xs"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h2 className="text-base font-black text-slate-900 leading-snug">{group.name}</h2>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setIsEditingInfo(true)}
                        className="p-1 text-slate-400 hover:text-teal-700 hover:bg-white rounded-lg transition-colors cursor-pointer"
                        title="Edit name and description"
                      >
                        <Edit3 size={13} />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    {group.description || <span className="italic text-slate-400">No description provided yet.</span>}
                  </p>

                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 text-[10px] text-slate-400 font-bold flex-wrap">
                    <span>Created by <strong className="text-slate-700 font-extrabold">{group.createdBy}</strong></span>
                    <span>•</span>
                    <span>{group.memberNicknames?.length || 0} members</span>
                    <span>•</span>
                    <span>{group.adminNicknames?.length || 0} admin(s)</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Members List Header & Add Members Button */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users size={15} className="text-slate-500" />
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Group Members ({group.memberNicknames?.length || 0})
                </h4>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddMembersModal(true)}
                  className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/80 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                >
                  <UserPlus size={13} />
                  <span>Add Members</span>
                </button>
              )}
            </div>

            {/* Member Search filter */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Filter members by nickname..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100/70 border border-transparent focus:border-teal-500 focus:bg-white rounded-xl outline-none font-medium text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Members List Cards */}
            <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-60 overflow-y-auto bg-white">
              {memberList.map((m) => {
                const canManageThisMember =
                  isAdmin &&
                  !m.isMe &&
                  (!m.isCreator) &&
                  (!m.isAdmin || isCreator);

                return (
                  <div
                    key={m.cleanNickname}
                    className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <div
                      onClick={() => onOpenProfile && onOpenProfile(m.cleanNickname)}
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-teal-900 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                        <AvatarIcon
                          avatarKey={m.user?.avatarKey}
                          avatarUrl={m.user?.avatarUrl}
                          sizeClassName="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 leading-tight">
                          <span className="text-xs font-black text-slate-900 truncate group-hover:text-teal-700 transition-colors">
                            {m.nickname}
                          </span>
                          {m.isMe && (
                            <span className="text-[9px] font-extrabold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-md">
                              You
                            </span>
                          )}
                          <VerificationBadge
                            isVerified={m.badge.isVerified}
                            badgeType={m.badge.badgeType as any}
                            size={12}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold truncate">
                          {m.user?.department || 'FUHSI Student'} {m.user?.level ? `• ${m.user.level}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Roles Badges & Admin Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.isCreator ? (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black flex items-center gap-1">
                          <Crown size={11} className="text-amber-600" />
                          <span>Creator</span>
                        </span>
                      ) : m.isAdmin ? (
                        <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-black flex items-center gap-1">
                          <ShieldCheck size={11} className="text-teal-600" />
                          <span>Admin</span>
                        </span>
                      ) : null}

                      {/* Admin Controls Menu */}
                      {canManageThisMember && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedMemberForAction(
                                selectedMemberForAction === m.cleanNickname ? null : m.cleanNickname
                              )
                            }
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                            title="Member options"
                          >
                            <MoreVertical size={14} />
                          </button>

                          {selectedMemberForAction === m.cleanNickname && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                              {/* Make / Dismiss Admin */}
                              {m.isAdmin ? (
                                isCreator && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAdmin(m.nickname, false)}
                                    className="w-full px-3 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-2 cursor-pointer"
                                  >
                                    <Shield size={13} className="text-slate-500" />
                                    <span>Dismiss as Admin</span>
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleAdmin(m.nickname, true)}
                                  className="w-full px-3 py-1.5 text-left text-xs font-bold text-teal-700 hover:bg-teal-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <ShieldCheck size={13} className="text-teal-600" />
                                  <span>Make Group Admin</span>
                                </button>
                              )}

                              {/* Remove Member */}
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(m.nickname)}
                                className="w-full px-3 py-1.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                              >
                                <UserMinus size={13} className="text-rose-500" />
                                <span>Remove from Group</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group Actions: Clear History / Leave Group / Delete Group */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={handleClearHistory}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Trash2 size={14} className="text-slate-500" />
              <span>Clear Chat History (My end only)</span>
            </button>

            <button
              type="button"
              onClick={handleLeaveGroup}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut size={14} className="text-slate-500" />
              <span>Leave Group</span>
            </button>

            {isCreator && (
              <button
                type="button"
                onClick={handleDeleteGroup}
                className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 size={13} className="text-rose-600" />
                <span>Delete Group Permanently</span>
              </button>
            )}
          </div>
        </div>

        {/* Add Members Sub-Modal */}
        {showAddMembersModal && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">Add Members</h4>
                  <p className="text-[10px] text-slate-400 font-bold">Select students to add to {group.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddMembersModal(false);
                  setNewMembersSelected([]);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={addMembersSearch}
                  onChange={(e) => setAddMembersSearch(e.target.value)}
                  placeholder="Search students..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100/70 border border-transparent focus:border-teal-500 focus:bg-white rounded-xl outline-none font-medium text-slate-800"
                />
              </div>
            </div>

            {/* List of eligible students to add */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {availableStudentsToAdd.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                  No other students found to add.
                </div>
              ) : (
                availableStudentsToAdd.map((u) => {
                  const nick = u.nickname.startsWith('@') ? u.nickname : `@${u.nickname}`;
                  const clean = normalizeNickname(nick);
                  const isSelected = newMembersSelected.some((n) => normalizeNickname(n) === clean);

                  return (
                    <div
                      key={u.id || nick}
                      onClick={() => {
                        setNewMembersSelected((prev) =>
                          isSelected
                            ? prev.filter((n) => normalizeNickname(n) !== clean)
                            : [...prev, nick]
                        );
                      }}
                      className={`p-2.5 flex items-center justify-between gap-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors ${
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
                              isVerified={Boolean(u.isVerified || u.verificationStatus === 'approved')}
                              badgeType={u.badgeType as any}
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

            {/* Footer with confirmation */}
            <div className="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs font-bold text-slate-600">
                {newMembersSelected.length} student{newMembersSelected.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMembersModal(false);
                    setNewMembersSelected([]);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={newMembersSelected.length === 0}
                  onClick={handleAddMembersSubmit}
                  className="px-4 py-1.5 text-xs font-black text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-xl shadow-xs cursor-pointer"
                >
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
