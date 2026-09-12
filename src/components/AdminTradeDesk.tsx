import React, { useState, useEffect } from 'react';
import { MarketplaceItem, UserProfile, MarketplaceReport, DirectMessage } from '../types';
import { 
  getStoredMarketplaceReports, 
  updateMarketplaceReportStatus 
} from '../utils/marketplaceUtils';
import { sendDirectMessage } from '../utils/messagingUtils';
import { blockUser } from '../utils/blockUtils';
import { 
  ShieldCheck, 
  Tag, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  User, 
  MapPin, 
  Search, 
  Trash2, 
  ShoppingBag, 
  Flag, 
  Ban, 
  Home, 
  Check, 
  MessageSquare,
  Sparkles
} from 'lucide-react';

interface AdminTradeDeskProps {
  userProfile: UserProfile | null;
  approvedMarketplaceItems: MarketplaceItem[];
  pendingMarketplaceItems?: MarketplaceItem[];
  onAdminApproveMarketplaceItem?: (id: string, approvedPrice: number, note: string) => void;
  onAdminRejectMarketplaceItem?: (id: string, note: string) => void;
  onDeleteMarketplaceItem?: (id: string) => void;
}

export const AdminTradeDesk: React.FC<AdminTradeDeskProps> = ({
  userProfile,
  approvedMarketplaceItems = [],
  pendingMarketplaceItems = [],
  onAdminApproveMarketplaceItem,
  onAdminRejectMarketplaceItem,
  onDeleteMarketplaceItem,
}) => {
  // Guard Check
  if (!userProfile?.isAdmin) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
        <h3 className="font-extrabold text-sm">Access Denied</h3>
        <p className="text-xs">Only authenticated administrators can access Marketplace Management.</p>
      </div>
    );
  }

  // Active Sub-Tab
  const [activeSubTab, setActiveSubTab] = useState<'REPORTS' | 'DIRECTORY' | 'PENDING' | 'MESSAGE'>('REPORTS');

  // Reports state
  const [reports, setReports] = useState<MarketplaceReport[]>(() => getStoredMarketplaceReports());
  const [reportFilter, setReportFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('ALL');

  // Directory Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Direct Message Modal
  const [msgRecipient, setMsgRecipient] = useState('');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [msgToast, setMsgToast] = useState<string | null>(null);

  // Accidental Deletion Protection Modal State
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    title: string;
    sellerNickname?: string;
    askingPrice?: number;
    category?: string;
    reportId?: string;
  } | null>(null);

  // Sync reports
  useEffect(() => {
    const handleUpdate = () => {
      setReports(getStoredMarketplaceReports());
    };
    window.addEventListener('fuhsi_marketplace_report_submitted', handleUpdate);
    window.addEventListener('fuhsi_marketplace_report_updated', handleUpdate);
    return () => {
      window.removeEventListener('fuhsi_marketplace_report_submitted', handleUpdate);
      window.removeEventListener('fuhsi_marketplace_report_updated', handleUpdate);
    };
  }, []);

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    if (reportFilter === 'PENDING') return r.status === 'PENDING';
    if (reportFilter === 'RESOLVED') return r.status === 'RESOLVED' || r.status === 'DISMISSED';
    return true;
  });

  // Filtered directory items
  const filteredItems = approvedMarketplaceItems.filter((item) => {
    const matchesCat = categoryFilter === 'ALL' || item.category?.toLowerCase() === categoryFilter.toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.title?.toLowerCase().includes(q) ||
      item.sellerNickname?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  // Actions
  const handleResolveReport = (reportId: string, actionNote: string) => {
    updateMarketplaceReportStatus(reportId, 'RESOLVED', actionNote);
    setReports(getStoredMarketplaceReports());
  };

  const handleDismissReport = (reportId: string) => {
    updateMarketplaceReportStatus(reportId, 'DISMISSED', 'Dismissed by Admin');
    setReports(getStoredMarketplaceReports());
  };

  const handleRemoveListingFromReport = (report: MarketplaceReport) => {
    if (!report.itemId) {
      handleResolveReport(report.id, `Report resolved (no active listing ID).`);
      return;
    }
    setItemToDelete({
      id: report.itemId,
      title: report.itemTitle || 'Reported Marketplace Item',
      sellerNickname: report.sellerNickname,
      reportId: report.id,
    });
  };

  const handleConfirmPermanentDelete = () => {
    if (!itemToDelete) return;
    if (onDeleteMarketplaceItem) {
      onDeleteMarketplaceItem(itemToDelete.id);
    }
    if (itemToDelete.reportId) {
      handleResolveReport(itemToDelete.reportId, `Listing "${itemToDelete.title}" permanently deleted from marketplace by Admin.`);
    }
    setMsgToast(`✓ Listing "${itemToDelete.title}" permanently deleted from Marketplace across all devices.`);
    setTimeout(() => setMsgToast(null), 4000);
    setItemToDelete(null);
  };

  const handleSuspendSeller = (sellerNickname: string, reportId?: string) => {
    blockUser('Admin', sellerNickname);
    if (reportId) {
      handleResolveReport(reportId, `Seller @${sellerNickname} suspended.`);
    }
    setMsgToast(`Seller @${sellerNickname} has been flagged/suspended.`);
    setTimeout(() => setMsgToast(null), 4000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgRecipient.trim() || !msgContent.trim()) return;

    const dm: DirectMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: `conv_council_${msgRecipient.trim().toLowerCase().replace(/^@/, '')}`,
      senderNickname: 'FUHSI Campus Secretariat',
      receiverNickname: msgRecipient.trim(),
      text: `[CAMPUS DESK NOTICE: ${msgSubject.trim() || 'Marketplace Inquiry'}]\n\n${msgContent.trim()}`,
      timestamp: new Date().toISOString(),
    };
    sendDirectMessage(dm);

    setMsgToast(`Official inquiry sent to @${msgRecipient.replace(/^@/, '')}`);
    setMsgRecipient('');
    setMsgSubject('');
    setMsgContent('');
    setTimeout(() => setMsgToast(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {msgToast && (
        <div className="p-3.5 bg-emerald-900 text-emerald-100 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{msgToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                Admin Marketplace Management
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Monitor campus listings, review fraud reports, manage problem sellers, and oversee peer-to-peer trade safety.
            </p>
          </div>

          <div className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-center shrink-0">
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Live Listings</span>
            <span className="font-extrabold text-base text-emerald-400">{approvedMarketplaceItems.length}</span>
          </div>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-4 border-t border-slate-800/80 mt-4">
          <button
            onClick={() => setActiveSubTab('REPORTS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
              activeSubTab === 'REPORTS'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Flag size={13} />
            <span>Reported Listings & Fraud ({reports.filter((r) => r.status === 'PENDING').length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('DIRECTORY')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
              activeSubTab === 'DIRECTORY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ShoppingBag size={13} />
            <span>Active Marketplace Directory ({approvedMarketplaceItems.length})</span>
          </button>

          {pendingMarketplaceItems.length > 0 && (
            <button
              onClick={() => setActiveSubTab('PENDING')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                activeSubTab === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Tag size={13} />
              <span>Pending Reviews ({pendingMarketplaceItems.length})</span>
            </button>
          )}

          <button
            onClick={() => setActiveSubTab('MESSAGE')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
              activeSubTab === 'MESSAGE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MessageSquare size={13} />
            <span>Message Student Seller/Buyer</span>
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: REPORTED LISTINGS & FRAUD COMPLAINTS */}
      {activeSubTab === 'REPORTS' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-rose-600" />
                <span>Marketplace Fraud & Listing Reports</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review complaints submitted by students regarding fake items, scams, or misleading listings.
              </p>
            </div>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {(['ALL', 'PENDING', 'RESOLVED'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setReportFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    reportFilter === f ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredReports.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <CheckCircle2 size={28} className="text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-700 text-sm">No marketplace reports found</p>
              <p className="text-xs text-slate-400">All student transactions and listings are operating smoothly.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    report.status === 'PENDING'
                      ? 'bg-rose-50/40 border-rose-200'
                      : 'bg-slate-50 border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[10px]">
                          ⚠️ {report.reason}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          Item: {report.itemTitle || 'Marketplace Item'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Reported by: <strong className="text-slate-800">@{report.reporterNickname}</strong> • Seller: <strong className="text-slate-800">@{report.sellerNickname}</strong> • {new Date(report.timestamp).toLocaleDateString()}
                      </p>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                      report.status === 'PENDING' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900'
                    }`}>
                      {report.status}
                    </span>
                  </div>

                  {report.details && (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
                      <span className="font-bold text-slate-900 block mb-0.5">Reporter Notes:</span>
                      {report.details}
                    </div>
                  )}

                  {report.actionTaken && (
                    <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      Resolution: {report.actionTaken}
                    </div>
                  )}

                  {report.status === 'PENDING' && (
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        onClick={() => handleRemoveListingFromReport(report)}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Remove Listing</span>
                      </button>

                      <button
                        onClick={() => {
                          setMsgRecipient(report.sellerNickname);
                          setMsgSubject(`Inquiry regarding report on "${report.itemTitle}"`);
                          setActiveSubTab('MESSAGE');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Send size={13} />
                        <span>Question Seller</span>
                      </button>

                      <button
                        onClick={() => handleSuspendSeller(report.sellerNickname, report.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Ban size={13} />
                        <span>Suspend Seller</span>
                      </button>

                      <button
                        onClick={() => handleDismissReport(report.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer ml-auto"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: ACTIVE MARKETPLACE DIRECTORY */}
      {activeSubTab === 'DIRECTORY' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                <span>Active Campus Listings Directory</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Full list of all items and student housing posted across FUHSI.
              </p>
            </div>

            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items or sellers..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 text-slate-800 font-medium"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.imageUrls?.[0] ? (
                    <img src={item.imageUrls[0]} alt={item.title} className="w-12 h-12 rounded-xl object-cover border border-slate-300 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 font-bold shrink-0">
                      📦
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm line-clamp-1">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-600 font-medium">
                      ₦{item.askingPrice.toLocaleString()} • {item.category} • Seller: <strong>@{item.sellerNickname}</strong>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      WhatsApp: {item.sellerPhone || 'Not set'} • Location: {item.meetupPoint || item.propertyLocation || 'Campus'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setMsgRecipient(item.sellerNickname);
                      setMsgSubject(`Regarding listing "${item.title}"`);
                      setActiveSubTab('MESSAGE');
                    }}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    title="Send Message to Seller"
                  >
                    <MessageSquare size={13} />
                  </button>

                  <button
                    onClick={() => {
                      setItemToDelete({
                        id: item.id,
                        title: item.title,
                        sellerNickname: item.sellerNickname,
                        askingPrice: item.askingPrice,
                        category: item.category,
                      });
                    }}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                    title="Delete this listed item"
                  >
                    <Trash2 size={13} />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: PENDING REVIEWS */}
      {activeSubTab === 'PENDING' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-amber-600" />
            <span>Pending Listings for Review</span>
          </h3>

          <div className="space-y-3">
            {pendingMarketplaceItems.map((item) => (
              <div key={item.id} className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">{item.title}</h4>
                  <p className="text-xs text-slate-600">
                    ₦{item.askingPrice.toLocaleString()} • Seller: @{item.sellerNickname}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAdminApproveMarketplaceItem?.(item.id, item.askingPrice, 'Approved')}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer"
                  >
                    Approve ₦{item.askingPrice.toLocaleString()}
                  </button>
                  <button
                    onClick={() => onAdminRejectMarketplaceItem?.(item.id, 'Does not meet campus policy')}
                    className="px-3 py-1.5 bg-rose-100 text-rose-800 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      setItemToDelete({
                        id: item.id,
                        title: item.title,
                        sellerNickname: item.sellerNickname,
                        askingPrice: item.askingPrice,
                        category: item.category,
                      });
                    }}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    title="Delete listing permanently"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: DIRECT ADMIN MESSAGE DISPATCH */}
      {activeSubTab === 'MESSAGE' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <span>Issue Campus Secretariat Inquiry to Student</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dispatches an official notification to the student's in-app inbox.
            </p>
          </div>

          <form onSubmit={handleSendMessage} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Student Nickname</label>
              <input
                type="text"
                value={msgRecipient}
                onChange={(e) => setMsgRecipient(e.target.value)}
                placeholder="e.g. @john_doe or Nurse_Tola"
                className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Subject / Inquiry Title</label>
              <input
                type="text"
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                placeholder="e.g. Marketplace Listing Clarification / Trade Inquiry"
                className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Message Content</label>
              <textarea
                value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)}
                placeholder="Type the official inquiry or instructions here..."
                rows={4}
                className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 font-medium"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send size={13} />
              <span>Send Official Inquiry</span>
            </button>
          </form>
        </div>
      )}

      {/* CONFIRMATION PROMPT MODAL: ACCIDENTAL DELETION PROTECTION */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-rose-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Delete Marketplace Item?</h3>
                <p className="text-xs text-rose-600 font-bold">Confirmation prompt to prevent accidental deletion</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="text-xs text-slate-500 font-medium">Target Listing:</div>
              <div className="font-extrabold text-slate-900 text-sm">{itemToDelete.title}</div>
              <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                {itemToDelete.askingPrice !== undefined && (
                  <span className="font-bold text-emerald-700">₦{itemToDelete.askingPrice.toLocaleString()}</span>
                )}
                {itemToDelete.category && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                    {itemToDelete.category}
                  </span>
                )}
                {itemToDelete.sellerNickname && (
                  <span className="text-slate-500">
                    Seller: <strong className="text-slate-800">@{itemToDelete.sellerNickname.replace(/^@/, '')}</strong>
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this listing? Once confirmed, this item will be <strong>permanently deleted from the Marketplace across all devices and for all users</strong>.
            </p>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Confirm Deletion</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
