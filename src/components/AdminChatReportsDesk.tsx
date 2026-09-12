import React, { useState, useEffect } from 'react';
import { ChatReport, UserProfile, DirectMessage } from '../types';
import { 
  getStoredChatReports, 
  updateChatReportStatus, 
  sendDirectMessage,
  formatMessageTime 
} from '../utils/messagingUtils';
import { applyChatRestriction } from '../utils/safetyFilter';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User, 
  FileText, 
  MessageSquare, 
  Send, 
  Eye, 
  EyeOff, 
  Check, 
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface AdminChatReportsDeskProps {
  userProfile?: UserProfile;
}

export const AdminChatReportsDesk: React.FC<AdminChatReportsDeskProps> = () => {
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED' | 'DISMISSED'>('PENDING');
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Modal State for Issuing Warning / Inquiry
  const [warningModalReport, setWarningModalReport] = useState<ChatReport | null>(null);
  const [warningSubject, setWarningSubject] = useState('Official Conduct Warning / In-App Safety Notice');
  const [warningMessage, setWarningMessage] = useState('');

  // Modal State for Applying Chat Restriction
  const [restrictModalReport, setRestrictModalReport] = useState<ChatReport | null>(null);
  const [restrictDays, setRestrictDays] = useState<number>(2);
  const [restrictReason, setRestrictReason] = useState('Violation of community harassment & conduct standards');

  const loadReports = () => {
    const list = getStoredChatReports();
    setReports(list);
  };

  useEffect(() => {
    loadReports();

    const handleUpdate = () => loadReports();
    window.addEventListener('fuhsi_chat_report_submitted', handleUpdate);
    window.addEventListener('fuhsi_chat_report_updated', handleUpdate);

    return () => {
      window.removeEventListener('fuhsi_chat_report_submitted', handleUpdate);
      window.removeEventListener('fuhsi_chat_report_updated', handleUpdate);
    };
  }, []);

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 4000);
  };

  // Format full date & time
  const formatReportFullDateTime = (isoString?: string): string => {
    if (!isoString) return 'Just now';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return formatMessageTime(isoString);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  };

  // Helper to format category
  const formatCategory = (cat: string) => {
    switch (cat) {
      case 'HARASSMENT':
        return 'Harassment & Bullying';
      case 'SEXUAL_HARASSMENT':
        return 'Sexual Harassment & Inappropriate Behavior';
      case 'THREAT':
        return 'Direct Threat & Intimidation';
      case 'CONTACT_INFO_SOLICITING':
        return 'Soliciting Private Contact Info';
      case 'SCAM':
        return 'Scam or Fraudulent Activity';
      case 'OTHER':
        return 'Other Policy Violation';
      default:
        return cat || 'Unspecified Violation';
    }
  };

  // Handle Dismiss
  const handleDismiss = (reportId: string) => {
    updateChatReportStatus(reportId, 'DISMISSED', 'Dismissed by Admin - insufficient evidence / no violation detected.');
    loadReports();
    showToast(`Case ${reportId.slice(-6)} marked as Dismissed.`);
  };

  // Handle Mark Resolved
  const handleResolve = (reportId: string, note?: string) => {
    updateChatReportStatus(reportId, 'RESOLVED', note || 'Resolved by Admin after review.');
    loadReports();
    showToast(`Case ${reportId.slice(-6)} marked as Resolved.`);
  };

  // Submit Official Warning
  const handleSendWarning = (e: React.FormEvent) => {
    e.preventDefault();
    if (!warningModalReport || !warningMessage.trim()) return;

    const targetUser = warningModalReport.reportedNickname;
    const dm: DirectMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: `conv_council_${targetUser.toLowerCase().replace(/^@/, '')}`,
      senderNickname: 'FUHSI Campus Secretariat',
      receiverNickname: targetUser,
      text: `[CAMPUS CONDUCT ADVISORY: ${warningSubject.trim()}]\n\n${warningMessage.trim()}\n\nNote: Please adhere strictly to the FUHSI Connect Community Guidelines to maintain a safe campus environment.`,
      timestamp: new Date().toISOString(),
    };

    sendDirectMessage(dm);
    updateChatReportStatus(
      warningModalReport.id,
      'RESOLVED',
      `Official advisory issued to ${targetUser}.`
    );
    loadReports();
    showToast(`Official advisory dispatched to ${targetUser}. Case resolved.`);
    setWarningModalReport(null);
    setWarningMessage('');
  };

  // Submit Chat Restriction
  const handleApplyRestriction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restrictModalReport) return;

    const targetUser = restrictModalReport.reportedNickname.trim();
    const cleanNick = targetUser.toLowerCase().replace(/^@/, '');
    const now = new Date();
    const restrictedUntil = new Date(now.getTime() + restrictDays * 24 * 60 * 60 * 1000).toISOString();

    applyChatRestriction({
      userNickname: cleanNick,
      isRestricted: true,
      reason: restrictReason,
      restrictedAt: now.toISOString(),
      restrictedUntil,
      durationDays: restrictDays,
    });

    // Also send notice to user's chat
    const dm: DirectMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: `conv_admin_${cleanNick}`,
      senderNickname: '🛡️ FUHSI Security & Moderation',
      receiverNickname: targetUser,
      text: `[ACCOUNT RESTRICTION NOTICE]\n\nYour chat privileges have been restricted for ${restrictDays} day(s) due to reported policy violations:\nReason: ${restrictReason}.\n\nRestriction expires in ${restrictDays} days.`,
      timestamp: new Date().toISOString(),
    };
    sendDirectMessage(dm);

    updateChatReportStatus(
      restrictModalReport.id,
      'RESOLVED',
      `Restricted ${targetUser} from chat for ${restrictDays} day(s).`
    );
    loadReports();
    showToast(`Chat restriction of ${restrictDays} days applied to ${targetUser}. Case resolved.`);
    setRestrictModalReport(null);
  };

  const filteredReports = reports.filter((r) => {
    if (activeFilter === 'PENDING') return r.status === 'PENDING';
    if (activeFilter === 'RESOLVED') return r.status === 'RESOLVED' || r.status === 'ACTION_TAKEN';
    if (activeFilter === 'DISMISSED') return r.status === 'DISMISSED';
    return true;
  });

  const pendingCount = reports.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>Chat Moderation Cases ({reports.length})</span>
          </h2>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-center">
          <button
            onClick={() => setActiveFilter('PENDING')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'PENDING'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setActiveFilter('RESOLVED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'RESOLVED'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Resolved ({reports.filter((r) => r.status === 'RESOLVED' || r.status === 'ACTION_TAKEN').length})
          </button>
          <button
            onClick={() => setActiveFilter('DISMISSED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'DISMISSED'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dismissed ({reports.filter((r) => r.status === 'DISMISSED').length})
          </button>
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Toast Alert */}
      {actionToast && (
        <div className="p-3 bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-between animate-in fade-in">
          <span>{actionToast}</span>
          <button onClick={() => setActionToast(null)} className="text-white/80 hover:text-white cursor-pointer ml-2">✕</button>
        </div>
      )}

      {/* Cases Queue */}
      <div className="space-y-3 pt-1">
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <CheckCircle2 size={24} className="mx-auto text-teal-600 mb-1.5 opacity-60" />
            <p className="font-bold text-slate-700">
              {activeFilter === 'PENDING' ? 'No pending conversation reports!' : 'No conversation reports matching this filter.'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              When a student flags an in-app conversation for policy violations, the case and its preserved evidence snapshot appear here.
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const isExpanded = expandedEvidenceId === report.id;
            const isPending = report.status === 'PENDING';
            const isResolved = report.status === 'RESOLVED' || report.status === 'ACTION_TAKEN';
            const isDismissed = report.status === 'DISMISSED';

            return (
              <div
                key={report.id}
                className={`p-4 rounded-2xl border transition-all space-y-3 ${
                  isPending
                    ? 'bg-rose-50/30 border-rose-200 shadow-2xs'
                    : isResolved
                    ? 'bg-emerald-50/20 border-emerald-200'
                    : 'bg-slate-50/60 border-slate-200'
                }`}
              >
                {/* Case Header Details */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-900 text-white">
                        ID: {report.id.replace('chatreport_', '#CR-')}
                      </span>

                      <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-200">
                        {formatCategory(report.reason)}
                      </span>

                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                        <Clock size={12} />
                        <span>{formatReportFullDateTime(report.timestamp)}</span>
                      </span>
                    </div>

                    {/* Reporter & Reported Info */}
                    <div className="flex items-center gap-3 text-xs pt-1 flex-wrap font-medium">
                      <div>
                        <span className="text-slate-500 text-[11px]">Reporter: </span>
                        <strong className="text-teal-800 font-bold">{report.reporterNickname}</strong>
                      </div>
                      <span className="text-slate-300">•</span>
                      <div>
                        <span className="text-slate-500 text-[11px]">Reported User: </span>
                        <strong className="text-rose-700 font-black">{report.reportedNickname}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0 self-start">
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                        isPending
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : isResolved
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}
                    >
                      {isPending ? '⏳ PENDING REVIEW' : isResolved ? '✅ RESOLVED / ACTION TAKEN' : '⚪ DISMISSED'}
                    </span>
                  </div>
                </div>

                {/* Reporter's Explanation / Notes */}
                <div className="p-3 rounded-xl bg-white border border-slate-200/90 text-xs space-y-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <FileText size={12} className="text-slate-400" />
                    <span>Reporter's Explanation:</span>
                  </span>
                  <p className="text-slate-800 font-medium italic">
                    {report.notes ? `"${report.notes}"` : '(No additional written notes provided by reporter)'}
                  </p>
                </div>

                {/* Action Taken Note (If resolved) */}
                {report.actionNote && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-medium">
                    <span className="font-bold">Moderation Resolution: </span>
                    <span>{report.actionNote}</span>
                  </div>
                )}

                {/* Preserved Evidence Toggle */}
                {report.recentMessages && report.recentMessages.length > 0 && (
                  <div className="border border-slate-200/80 rounded-xl bg-slate-50/50 overflow-hidden">
                    <button
                      onClick={() => setExpandedEvidenceId(isExpanded ? null : report.id)}
                      className="w-full p-2.5 px-3 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 text-teal-800">
                        {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span>
                          {isExpanded ? 'Hide' : 'Inspect'} Preserved Reported Content ({report.recentMessages.length} message{report.recentMessages.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {isExpanded && (
                      <div className="p-3.5 border-t border-slate-200 bg-white space-y-3 text-xs animate-in fade-in">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                          <span>Preserved Chat Log Snapshot ({report.reporterNickname} ↔ {report.reportedNickname})</span>
                          <span>Chronological Order</span>
                        </div>
                        <div className="space-y-3">
                          {report.recentMessages.map((m, idx) => {
                            const isReported = m.sender.toLowerCase().replace(/^@/, '') === report.reportedNickname.toLowerCase().replace(/^@/, '');
                            return (
                              <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                                <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                                  <span className={`font-bold ${isReported ? 'text-rose-700' : 'text-teal-800'}`}>
                                    {m.sender} — {m.time}
                                  </span>
                                  {m.date && (
                                    <span className="text-[10px] text-slate-400 font-medium">{m.date}</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                                  {m.text}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Admin Actions Bar */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Send Official Warning */}
                    <button
                      onClick={() => {
                        setWarningModalReport(report);
                        setWarningSubject(`Formal Warning regarding conduct with ${report.reporterNickname}`);
                        setWarningMessage(`A formal violation report was filed against your recent interaction regarding ${formatCategory(report.reason)}. Please ensure your communications remain safe and respectful.`);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MessageSquare size={13} />
                      <span>Issue Official Warning</span>
                    </button>

                    {/* Apply Chat Restriction */}
                    <button
                      onClick={() => {
                        setRestrictModalReport(report);
                        setRestrictReason(`Reported for ${formatCategory(report.reason)}`);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <AlertTriangle size={13} />
                      <span>Apply Chat Restriction</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {isPending && (
                      <>
                        <button
                          onClick={() => handleResolve(report.id, 'Resolved without further penalty.')}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <CheckCircle2 size={13} />
                          <span>Resolve</span>
                        </button>

                        <button
                          onClick={() => handleDismiss(report.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </>
                    )}

                    {!isPending && (
                      <button
                        onClick={() => handleResolve(report.id, 'Status updated by Admin.')}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                      >
                        Re-evaluate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: ISSUE OFFICIAL WARNING */}
      {warningModalReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center font-bold border border-teal-100">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Issue Official Warning to {warningModalReport.reportedNickname}</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Case: {warningModalReport.id.replace('chatreport_', '#CR-')}</p>
                </div>
              </div>
              <button 
                onClick={() => setWarningModalReport(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendWarning} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject Line</label>
                <input
                  type="text"
                  value={warningSubject}
                  onChange={(e) => setWarningSubject(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Warning Notice Content</label>
                <textarea
                  value={warningMessage}
                  onChange={(e) => setWarningMessage(e.target.value)}
                  rows={5}
                  className="w-full text-xs rounded-xl border border-slate-300 p-3 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                  required
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <Lock size={14} className="text-amber-700 shrink-0 mt-0.5" />
                <span>
                  This official message will be delivered directly to <strong>{warningModalReport.reportedNickname}</strong>'s chat inbox.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setWarningModalReport(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={13} />
                  <span>Dispatch Warning & Resolve</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: APPLY CHAT RESTRICTION */}
      {restrictModalReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold border border-amber-200">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Restrict Chat Access: {restrictModalReport.reportedNickname}</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Temporarily disable outgoing chat capability</p>
                </div>
              </div>
              <button 
                onClick={() => setRestrictModalReport(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyRestriction} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Restriction Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '24 Hours (1 Day)', days: 1 },
                    { label: '48 Hours (2 Days)', days: 2 },
                    { label: '7 Days (1 Week)', days: 7 },
                  ].map((opt) => (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setRestrictDays(opt.days)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        restrictDays === opt.days
                          ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Violation Justification / Reason</label>
                <textarea
                  value={restrictReason}
                  onChange={(e) => setRestrictReason(e.target.value)}
                  rows={3}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRestrictModalReport(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-xs transition-all cursor-pointer"
                >
                  Apply {restrictDays}-Day Restriction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
