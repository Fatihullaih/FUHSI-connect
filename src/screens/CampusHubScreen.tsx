import React, { useState, useEffect, useMemo } from 'react';
import { MarketplaceItem, UserProfile, MarketplaceReport } from '../types';
import { 
  ShoppingBag, 
  MapPin, 
  Eye, 
  Plus, 
  Camera, 
  AlertCircle, 
  Clock, 
  Lock, 
  Upload, 
  Trash2, 
  Search, 
  User, 
  X, 
  ArrowLeft,
  CheckCircle2, 
  SlidersHorizontal, 
  MessageCircle, 
  Tag,
  ShieldAlert,
  Flag,
  Ban,
  Home,
  Check,
  AlertTriangle,
  PhoneCall,
  Sparkles
} from 'lucide-react';
import { checkIsUserVerified } from '../utils/verificationUtils';
import { compressImageFile } from '../utils/imageUtils';
import { VerificationModal } from '../components/VerificationModal';
import { 
  generateWhatsAppTradeUrl, 
  saveMarketplaceReport, 
  MARKETPLACE_REPORT_REASONS 
} from '../utils/marketplaceUtils';
import { blockUser, getBlockedUsers, isUserBlocked } from '../utils/blockUtils';
import { isGuestAccount } from '../utils/userDbUtils';

interface CampusHubScreenProps {
  userProfile: UserProfile | null;
  approvedMarketplaceItems: MarketplaceItem[];
  pendingMarketplaceItems?: MarketplaceItem[];
  onSubmitMarketplaceItem: (itemData: {
    title: string;
    category: string;
    askingPrice: number;
    conditionTag: string;
    description: string;
    sellerPhone: string;
    meetupPoint: string;
    imageUrls: string[];
    isHousing?: boolean;
    propertyLocation?: string;
    rentDuration?: string;
    roomType?: string;
  }) => void;
  onRecordDmBuyIntent?: (itemId: string) => void;
  onMarkAsSold: (itemId: string, ratingStars: number, ratingTag: string) => void;
  onDeleteMarketplaceItem?: (itemId: string) => void;
  onApplyVerificationWithFee?: () => void;
  onAuthorClick?: (post: any) => void;
  onOpenAdminConsole?: () => void;
}

// Category definitions with icons
const CATEGORY_OPTIONS = [
  { id: 'All', label: 'All', icon: '📦' },
  { id: 'Textbooks', label: 'Textbooks', icon: '📚' },
  { id: 'Rooms & Housing', label: 'Rooms & Housing', icon: '🏠' },
  { id: 'Electronics', label: 'Electronics', icon: '💻' },
  { id: 'Phones', label: 'Phones', icon: '📱' },
  { id: 'Fashion', label: 'Fashion', icon: '👕' },
  { id: 'Medical Equipment', label: 'Medical Equipment', icon: '🩺' },
  { id: 'Food & Snacks', label: 'Food & Snacks', icon: '🍲' },
  { id: 'Services', label: 'Services', icon: '🛠️' },
  { id: 'Other', label: 'Other', icon: '🏷️' },
];

// Room / Housing Types
const HOUSING_ROOM_TYPES = [
  'Single Room',
  'Self Contain',
  'Roommate (Needed)',
  'Shared Bedspace',
  '2-Bedroom Flat',
  'Hostel Bedspace',
  'Mini Flat / Studio',
  'Other Accommodation',
];

const ROOMMATE_CURRENT_ROOM_TYPES = [
  'Single Room',
  'Self Contain',
  'Shared Bedspace',
  '2-Bedroom Flat',
  'Hostel Bedspace',
  'Mini Flat / Studio',
  'Other Accommodation',
];

// Rent Durations
const RENT_DURATIONS = [
  'Per Month',
  'Per Annual',
  'Per Academic Session',
  'Per Semester',
];

// Nigerian WhatsApp Phone Number Validator (11 digits, valid prefixes)
export const validateNigerianWhatsApp = (phone: string): { isValid: boolean; error?: string; cleanPhone?: string } => {
  if (!phone || !phone.trim()) {
    return { isValid: false, error: 'Please enter your WhatsApp Number.' };
  }
  const digits = phone.replace(/\D/g, '');
  let standard11 = '';
  if (digits.length === 11 && digits.startsWith('0')) {
    standard11 = digits;
  } else if (digits.length === 13 && digits.startsWith('234')) {
    standard11 = '0' + digits.substring(3);
  } else if (digits.length === 10 && !digits.startsWith('0')) {
    standard11 = '0' + digits;
  } else {
    return { isValid: false, error: 'WhatsApp number must be exactly 11 digits.' };
  }

  const validPrefixes = ['080', '081', '070', '090', '091', '071'];
  const prefix = standard11.substring(0, 3);
  if (!validPrefixes.includes(prefix)) {
    return { isValid: false, error: `WhatsApp number must start with a valid Nigerian mobile network prefix (${validPrefixes.join(', ')}).` };
  }

  return { isValid: true, cleanPhone: standard11 };
};

// Safe Meetup Locations around FUHSI
const MEETUP_LOCATIONS = [
  'FUHSI School Main Gate',
  'School Market',
  'Matriculation Pavillion',
  'Owuoluwa Junction',
  'Just-Love Kitchen',
  'College High School Junction',
  'School Hostel (Male/Female)',
  'Ayeka Main Road',
  'Okitipupa Town Center'
];

export const formatPriceShort = (price: number): string => {
  if (!price && price !== 0) return '₦0';
  if (price >= 1000000) {
    const m = price / 1000000;
    return `₦${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (price >= 1000) {
    const k = price / 1000;
    return `₦${k % 1 === 0 ? k : k.toFixed(1)}K`;
  }
  return `₦${price.toLocaleString()}`;
};

/**
 * Calculates human-readable sold status and 7-day auto-purge expiration
 */
export function getSoldStatusInfo(item: MarketplaceItem): {
  isSold: boolean;
  soldBadgeText: string;
  isExpired: boolean;
  daysAgo: number;
} {
  if (item.status !== 'SOLD') {
    return { isSold: false, soldBadgeText: '', isExpired: false, daysAgo: -1 };
  }

  const soldTimestamp = item.soldAt ? new Date(item.soldAt).getTime() : Date.now();
  const diffMs = Date.now() - soldTimestamp;
  const daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (daysAgo > 7) {
    return { isSold: true, soldBadgeText: 'Expired', isExpired: true, daysAgo };
  }

  if (daysAgo === 0) {
    return { isSold: true, soldBadgeText: 'Sold today', isExpired: false, daysAgo: 0 };
  } else if (daysAgo === 1) {
    return { isSold: true, soldBadgeText: 'Sold 1 day ago', isExpired: false, daysAgo: 1 };
  } else {
    return { isSold: true, soldBadgeText: `Sold ${daysAgo} days ago`, isExpired: false, daysAgo };
  }
}

export const CampusHubScreen: React.FC<CampusHubScreenProps> = ({
  userProfile,
  approvedMarketplaceItems = [],
  pendingMarketplaceItems = [],
  onSubmitMarketplaceItem,
  onRecordDmBuyIntent,
  onMarkAsSold,
  onDeleteMarketplaceItem,
  onAuthorClick,
}) => {
  if (isGuestAccount(userProfile)) {
    return null;
  }

  // Navigation & filter state
  const [activeView, setActiveView] = useState<'listings' | 'my_listings'>('listings');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Item Details Preview Modal State
  const [detailsModalItem, setDetailsModalItem] = useState<MarketplaceItem | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);

  // Sell / Post Listing Modal State
  const [showSellModal, setShowSellModal] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Textbooks');
  const [askingPrice, setAskingPrice] = useState<number | ''>('');
  const [conditionTag, setConditionTag] = useState('Fairly Used');
  const [description, setDescription] = useState('');
  const [sellerPhone, setSellerPhone] = useState(userProfile?.emergencyHomePhone || (userProfile as any)?.phone || '');
  const [meetupPoint, setMeetupPoint] = useState('FUHSI School Main Gate');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [sellSuccessMsg, setSellSuccessMsg] = useState(false);
  const [formError, setFormError] = useState('');

  // Housing specific fields
  const [roomType, setRoomType] = useState('Single Room');
  const [roommateRoomType, setRoommateRoomType] = useState('Single Room');
  const [rentDuration, setRentDuration] = useState('Per Annual');
  const [propertyLocation, setPropertyLocation] = useState('');

  // Reporting Modal State
  const [reportingItem, setReportingItem] = useState<MarketplaceItem | null>(null);
  const [reportReason, setReportReason] = useState<string>('Fraud/scam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSuccessToast, setReportSuccessToast] = useState<string | null>(null);

  // Block confirmation modal state
  const [blockingSeller, setBlockingSeller] = useState<string | null>(null);
  const [blockToast, setBlockToast] = useState<string | null>(null);

  // Blocked users tracker state
  const [blockedUsersList, setBlockedUsersList] = useState<string[]>(() => 
    getBlockedUsers(userProfile?.nickname)
  );

  // Verification & Sold Modals
  const [showMarketplaceLockModal, setShowMarketplaceLockModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [soldModalItem, setSoldModalItem] = useState<MarketplaceItem | null>(null);
  const [soldSuccessNotify, setSoldSuccessNotify] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<MarketplaceItem | null>(null);

  const isVerifiedUser = checkIsUserVerified(userProfile?.nickname, userProfile);

  // Listen for block updates
  useEffect(() => {
    const handleBlockUpdate = () => {
      setBlockedUsersList(getBlockedUsers(userProfile?.nickname));
    };
    window.addEventListener('fuhsi_blocks_updated', handleBlockUpdate);
    return () => window.removeEventListener('fuhsi_blocks_updated', handleBlockUpdate);
  }, [userProfile?.nickname]);

  // Popstate listener for back button navigation
  useEffect(() => {
    const handlePopState = () => {
      if (detailsModalItem) {
        setDetailsModalItem(null);
        return;
      }
      if (reportingItem) {
        setReportingItem(null);
        return;
      }
      if (showSellModal) {
        setShowSellModal(false);
        return;
      }
      if (soldModalItem) {
        setSoldModalItem(null);
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [detailsModalItem, reportingItem, showSellModal, soldModalItem]);

  // Is category housing?
  const isHousingCategory = 
    category === 'Rooms & Housing' || 
    category.toLowerCase().includes('housing') || 
    category.toLowerCase().includes('room');

  // Filter listings based on category, search query, blocked users, and 7-DAY AUTO-PURGE
  const filteredListings = useMemo(() => {
    return approvedMarketplaceItems.filter((item) => {
      // 1. Hide items by blocked sellers
      if (userProfile?.nickname && isUserBlocked(userProfile.nickname, item.sellerNickname)) {
        return false;
      }

      // 2. Hide items that were explicitly removed by admin or seller
      if (item.status === 'REMOVED' || item.status === 'REJECTED') {
        return false;
      }

      // 3. 7-day auto purge for sold items (never show >7 days)
      const soldInfo = getSoldStatusInfo(item);
      if (soldInfo.isExpired) {
        return false;
      }

      // 4. Category matching
      const catLower = item.category?.toLowerCase() || '';
      const selectedLower = selectedCategory.toLowerCase();
      
      let matchesCat = selectedCategory === 'All';
      if (!matchesCat) {
        if (selectedCategory === 'Rooms & Housing') {
          matchesCat = catLower.includes('housing') || catLower.includes('room') || catLower.includes('hostel') || Boolean(item.isHousing);
        } else if (selectedCategory === 'Textbooks') {
          matchesCat = catLower.includes('book') || catLower.includes('textbook') || catLower.includes('study');
        } else if (selectedCategory === 'Electronics') {
          matchesCat = catLower.includes('electron') || catLower.includes('gadget') || catLower.includes('laptop');
        } else if (selectedCategory === 'Phones') {
          matchesCat = catLower.includes('phone') || catLower.includes('tecno') || catLower.includes('iphone') || catLower.includes('samsung');
        } else if (selectedCategory === 'Medical Equipment') {
          matchesCat = catLower.includes('medic') || catLower.includes('lab') || catLower.includes('stethoscope') || catLower.includes('scrub');
        } else if (selectedCategory === 'Food & Snacks') {
          matchesCat = catLower.includes('food') || catLower.includes('snack') || catLower.includes('meal') || catLower.includes('drink');
        } else if (selectedCategory === 'Services') {
          matchesCat = catLower.includes('service') || catLower.includes('skill') || catLower.includes('repair');
        } else if (selectedCategory === 'Fashion') {
          matchesCat = catLower.includes('fashion') || catLower.includes('cloth') || catLower.includes('shoe') || catLower.includes('wear');
        } else {
          matchesCat = catLower === selectedLower;
        }
      }

      // 5. Search query matching
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.title?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.sellerNickname?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.meetupPoint?.toLowerCase().includes(q) ||
        item.propertyLocation?.toLowerCase().includes(q);

      return matchesCat && matchesSearch;
    });
  }, [approvedMarketplaceItems, selectedCategory, searchQuery, userProfile?.nickname, blockedUsersList]);

  // Handle Photo upload (Pictures only, no video)
  const handlePhotosFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    
    // Filter out non-image files
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length < files.length) {
      setFormError('Please select valid picture formats (JPG, PNG, WEBP).');
    }

    const remainingSlots = 6 - uploadedPhotos.length;
    if (remainingSlots <= 0) return;

    const filesToProcess = imageFiles.slice(0, remainingSlots);
    for (const file of filesToProcess) {
      try {
        const compressed = await compressImageFile(file, 900, 900, 0.78);
        setUploadedPhotos((prev) => [...prev, compressed]);
      } catch (err) {
        console.error('Photo compression error:', err);
      }
    }
    e.target.value = '';
  };

  const handleRemoveUploadedPhoto = (index: number) => {
    setUploadedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Listing Handler
  const handleSellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('Please enter a descriptive title.');
      return;
    }
    const priceVal = typeof askingPrice === 'number' ? askingPrice : 0;
    if (!askingPrice || priceVal <= 0) {
      setFormError('Please enter a valid price (in ₦).');
      return;
    }
    const phoneCheck = validateNigerianWhatsApp(sellerPhone);
    if (!phoneCheck.isValid) {
      setFormError(phoneCheck.error || 'Please enter a valid 11-digit WhatsApp number.');
      return;
    }
    if (isHousingCategory) {
      if (!propertyLocation.trim()) {
        setFormError('Property location is required.');
        return;
      }
      if (!description.trim()) {
        setFormError('Property Features & Amenities is required.');
        return;
      }
    } else {
      if (!description.trim()) {
        setFormError('Item description is required.');
        return;
      }
    }
    if (uploadedPhotos.length < 1) {
      setFormError('Please select at least 1 clear photo from your device.');
      return;
    }

    const resolvedRoomType = isHousingCategory
      ? (roomType === 'Roommate (Needed)' ? `Roommate Needed (${roommateRoomType})` : roomType)
      : undefined;

    onSubmitMarketplaceItem({
      title: title.trim(),
      category,
      askingPrice: priceVal,
      conditionTag: isHousingCategory ? (resolvedRoomType || 'Accommodation') : conditionTag,
      description: description.trim(),
      sellerPhone: phoneCheck.cleanPhone || sellerPhone.trim(),
      meetupPoint: isHousingCategory ? propertyLocation.trim() : meetupPoint,
      imageUrls: uploadedPhotos,
      isHousing: isHousingCategory,
      propertyLocation: isHousingCategory ? propertyLocation.trim() : undefined,
      rentDuration: isHousingCategory ? rentDuration : undefined,
      roomType: resolvedRoomType,
    });

    // Reset filters so the newly posted item is immediately visible
    setSelectedCategory('All');
    setSearchQuery('');
    setActiveView('listings');

    setSellSuccessMsg(true);
    setTimeout(() => {
      setSellSuccessMsg(false);
      setShowSellModal(false);
      setTitle('');
      setAskingPrice('');
      setDescription('');
      setUploadedPhotos([]);
      setFormError('');
    }, 1200);
  };

  /**
   * Direct WhatsApp Contact Initiation
   * Opens WhatsApp directly with pre-filled message:
   * > Hello, I saw your item "[Item Title]" on FUHSI Connect and I'm interested in it. Is it still available?
   */
  const handleContactOnWhatsApp = (item: MarketplaceItem) => {
    if (onRecordDmBuyIntent) {
      onRecordDmBuyIntent(item.id);
    }
    const waUrl = generateWhatsAppTradeUrl(item);
    if (waUrl) {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      alert('The seller has not provided a valid WhatsApp contact number.');
    }
  };

  // Submit Listing / Seller Report
  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingItem) return;

    const report: MarketplaceReport = {
      id: `mreport_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'LISTING',
      itemId: reportingItem.id,
      itemTitle: reportingItem.title,
      sellerNickname: reportingItem.sellerNickname,
      reporterNickname: userProfile?.nickname || 'Anonymous Student',
      reason: reportReason,
      details: reportDetails.trim(),
      timestamp: new Date().toISOString(),
      status: 'PENDING',
    };

    saveMarketplaceReport(report);
    setReportSuccessToast(`Report submitted successfully. "${reportingItem.title}" will be reviewed.`);
    setReportingItem(null);
    setReportDetails('');
    setTimeout(() => setReportSuccessToast(null), 5000);
  };

  // Block Seller
  const handleConfirmBlockSeller = () => {
    if (!blockingSeller || !userProfile?.nickname) return;
    blockUser(userProfile.nickname, blockingSeller);
    setBlockToast(`Blocked @${blockingSeller.replace(/^@/, '')}. Their listings and posts are now hidden.`);
    setBlockingSeller(null);
    if (detailsModalItem && detailsModalItem.sellerNickname === blockingSeller) {
      setDetailsModalItem(null);
    }
    setTimeout(() => setBlockToast(null), 4500);
  };

  // Confirm Mark as Sold
  const handleConfirmSold = () => {
    if (soldModalItem) {
      onMarkAsSold(soldModalItem.id, 5, 'Verified Sold');
      setSoldSuccessNotify(true);
      setTimeout(() => {
        setSoldSuccessNotify(false);
        setSoldModalItem(null);
        if (detailsModalItem && detailsModalItem.id === soldModalItem.id) {
          setDetailsModalItem({
            ...detailsModalItem,
            status: 'SOLD',
            soldAt: new Date().toISOString(),
          });
        }
      }, 800);
    }
  };

  // Confirm Delete Item
  const handleConfirmDelete = () => {
    if (deleteConfirmItem) {
      if (onDeleteMarketplaceItem) {
        onDeleteMarketplaceItem(deleteConfirmItem.id);
      }
      setDeleteConfirmItem(null);
      if (detailsModalItem && detailsModalItem.id === deleteConfirmItem.id) {
        setDetailsModalItem(null);
      }
    }
  };

  // Normalized clean user nickname for comparison
  const cleanUserNick = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '').trim();

  // My items
  const myItems = approvedMarketplaceItems.filter((item) => {
    const sNick = (item.sellerNickname || '').toLowerCase().replace(/^@/, '').trim();
    return Boolean(cleanUserNick && sNick === cleanUserNick);
  });
  const myPending = (pendingMarketplaceItems || []).filter((item) => {
    const sNick = (item.sellerNickname || '').toLowerCase().replace(/^@/, '').trim();
    return Boolean(cleanUserNick && sNick === cleanUserNick);
  });

  return (
    <div className="max-w-2xl mx-auto pb-28 px-3 sm:px-4 pt-2 space-y-4">
      {/* Toast Notifications */}
      {reportSuccessToast && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{reportSuccessToast}</span>
        </div>
      )}

      {blockToast && (
        <div className="p-3.5 bg-slate-900 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <Ban className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{blockToast}</span>
        </div>
      )}

      {/* 1. GREEN HEADER BANNER */}
      <div className="bg-[#0a6627] text-white rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-black text-xl sm:text-2xl tracking-tight flex items-center gap-2">
              <span>FUHSI MARKETPLACE</span>
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/95 mt-0.5 font-medium">
              Buy, sell, and rent rooms directly with verified campus peers.
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setActiveView(activeView === 'listings' ? 'my_listings' : 'listings')}
              className={`px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border cursor-pointer ${
                activeView === 'my_listings'
                  ? 'bg-white text-[#0a6627] border-white shadow-sm'
                  : 'bg-emerald-800/80 hover:bg-emerald-800 text-white border-emerald-600/50'
              }`}
              title="Toggle My Listings"
            >
              <SlidersHorizontal size={14} />
              <span>{activeView === 'listings' ? 'My Listings' : 'All Listings'}</span>
              {(myItems.length > 0 || myPending.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Search Items Input Bar */}
        <div className="relative mt-3.5">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search textbooks, electronics, rooms for rent, services..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white text-slate-900 text-xs sm:text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: MAIN MARKETPLACE LISTINGS */}
      {activeView === 'listings' && (
        <div className="space-y-4">
          {/* 2. BROWSE CATEGORIES */}
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-600 mb-2 px-1">
              Browse Categories
            </h2>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0a6627] text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. LATEST LISTINGS */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-xs sm:text-sm font-bold text-slate-600 flex items-center gap-1.5">
                <span>Latest Campus Listings</span>
                <span className="text-[11px] font-normal text-slate-400">
                  ({filteredListings.length} available)
                </span>
              </h2>
              {selectedCategory !== 'All' && (
                <button
                  onClick={() => setSelectedCategory('All')}
                  className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  Clear filter ({selectedCategory})
                </button>
              )}
            </div>

            <div className="space-y-3">
              {filteredListings.map((item) => {
                const soldInfo = getSoldStatusInfo(item);
                const isSold = soldInfo.isSold;
                const isOwner = Boolean(cleanUserNick && (item.sellerNickname || '').toLowerCase().replace(/^@/, '').trim() === cleanUserNick);
                const mainPhoto = item.imageUrls?.[0] || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=400';
                const priceVal = item.adminApprovedPrice ?? item.askingPrice ?? 0;
                const priceFormatted = formatPriceShort(priceVal);
                const isHousing = item.isHousing || item.category?.toLowerCase().includes('housing') || item.category?.toLowerCase().includes('room');
                const locationText = item.propertyLocation || item.meetupPoint?.replace(/^📍\s*/, '') || 'Ayeka, Ondo State';

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setDetailsModalItem(item);
                      setActivePhotoIdx(0);
                    }}
                    className={`bg-white rounded-2xl border p-3 sm:p-4 shadow-xs hover:shadow-md transition-all flex items-start gap-3 sm:gap-4 cursor-pointer group relative ${
                      isSold 
                        ? 'border-rose-200/90 bg-rose-50/20 hover:border-rose-300' 
                        : 'border-slate-200/90 hover:border-emerald-500/50'
                    }`}
                  >
                    {/* Left Thumbnail Photo with Sold Overlay */}
                    <div className="w-22 h-22 sm:w-26 sm:h-26 rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200/80 relative">
                      <img
                        src={mainPhoto}
                        alt={item.title}
                        className={`w-full h-full object-cover transition-transform duration-300 ${
                          isSold ? 'grayscale-[30%] opacity-90' : 'group-hover:scale-105'
                        }`}
                        loading="lazy"
                      />
                      {isHousing && (
                        <div className="absolute top-1 left-1 bg-blue-600/90 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <Home size={10} />
                          <span>HOUSING</span>
                        </div>
                      )}
                      {isSold && (
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px] flex flex-col items-center justify-center p-1 text-center">
                          <span className="text-[10px] font-black text-white px-2 py-0.5 rounded-full bg-rose-600 shadow-sm uppercase tracking-wider">
                            SOLD
                          </span>
                          <span className="text-[9px] font-bold text-rose-100 mt-0.5 leading-tight">
                            {soldInfo.soldBadgeText}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right Listing Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                      <div>
                        {/* Title & Price Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-[#0a6627] transition-colors">
                              {item.title}
                            </h3>
                            {/* Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="inline-block text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                {item.conditionTag || item.category}
                              </span>
                              {item.rentDuration && (
                                <span className="inline-block text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                                  {item.rentDuration}
                                </span>
                              )}
                              {isSold && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded-md">
                                  <span>🏷️</span>
                                  <span>{soldInfo.soldBadgeText}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`font-extrabold text-sm sm:text-base ${
                              isSold ? 'text-slate-500 line-through' : 'text-[#0a6627]'
                            }`}>
                              {priceFormatted}
                            </span>
                            {isHousing && item.rentDuration && (
                              <span className="block text-[9px] font-bold text-slate-400">
                                {item.rentDuration.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Author Nickname & Location */}
                        <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium mt-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onAuthorClick) {
                                onAuthorClick({
                                  id: `seller_${item.id}`,
                                  authorNickname: item.sellerNickname,
                                  timeAgo: 'Marketplace',
                                  categoryTag: 'Trade',
                                  text: `Seller of ${item.title}`,
                                });
                              }
                            }}
                            className="flex items-center gap-1 text-slate-900 font-bold hover:text-emerald-700 transition-colors"
                          >
                            <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{item.sellerNickname || 'FUHSI Student'}</span>
                          </button>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1 text-slate-500 line-clamp-1">
                            <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{locationText}</span>
                          </span>
                        </div>

                        {/* Description snippet */}
                        <p className="text-[11px] sm:text-xs text-slate-600 mt-1 line-clamp-1">
                          {item.description || `${item.conditionTag} • ${item.category}`}
                        </p>
                      </div>

                      {/* Action buttons (View Details & Direct WhatsApp / Mark Sold) */}
                      <div
                        className="flex items-center gap-2 mt-2.5 pt-1 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setDetailsModalItem(item);
                            setActivePhotoIdx(0);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors cursor-pointer"
                        >
                          View Details
                        </button>

                        {!isSold ? (
                          <>
                            {!isOwner ? (
                              <button
                                onClick={() => handleContactOnWhatsApp(item)}
                                className="px-3.5 py-1.5 bg-[#25D366] hover:bg-[#1ebd5a] text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                                title="Chat on WhatsApp"
                              >
                                <MessageCircle size={14} className="fill-white/20" />
                                <span>WhatsApp</span>
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setSoldModalItem(item)}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-colors cursor-pointer"
                                >
                                  Mark Sold
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmItem(item)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Listing"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                              <CheckCircle2 size={13} />
                              <span>{soldInfo.soldBadgeText}</span>
                            </div>
                            {isOwner && (
                              <button
                                onClick={() => setDeleteConfirmItem(item)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Listing Permanently"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredListings.length > 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 font-medium">
                  End of listings
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto text-xl">
                    🛍️
                  </div>
                  <p className="font-bold text-slate-700 text-sm">No items found matching your filter</p>
                  <p className="text-xs text-slate-500">
                    {searchQuery ? `No results for "${searchQuery}"` : 'Be the first student to post an item or house listing in this category!'}
                  </p>
                  <button
                    onClick={() => {
                      if (isVerifiedUser) {
                        setShowSellModal(true);
                      } else {
                        setShowMarketplaceLockModal(true);
                      }
                    }}
                    className="px-4 py-2 bg-[#0a6627] hover:bg-[#08521f] text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} /> Post an Item or Room
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: MY LISTINGS VIEW */}
      {activeView === 'my_listings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-[#0a6627]" />
                <span>My Active Listings ({myItems.length})</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage your posted items, mark them as sold, or remove old listings.
              </p>
            </div>
            <button
              onClick={() => setActiveView('listings')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Back to Browse
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            {myItems.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl text-xs space-y-2">
                <p className="font-bold text-slate-700 text-sm">You haven't posted any listings yet.</p>
                <p className="text-slate-500 text-xs">
                  Sell your textbooks, gadgets, room slots, or skills directly to fellow FUHSI students with 0% commission!
                </p>
                <button
                  onClick={() => {
                    if (isVerifiedUser) {
                      setShowSellModal(true);
                    } else {
                      setShowMarketplaceLockModal(true);
                    }
                  }}
                  className="mt-2 px-4 py-2 bg-[#0a6627] hover:bg-[#08521f] text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} /> Post an Item Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myItems.map((item) => {
                  const soldInfo = getSoldStatusInfo(item);
                  return (
                    <div key={item.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        {item.imageUrls?.[0] && (
                          <img src={item.imageUrls[0]} alt={item.title} className="w-14 h-14 rounded-xl object-cover border border-slate-300 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-slate-900 text-sm line-clamp-1">{item.title}</h4>
                          <p className="text-xs text-slate-600 font-semibold">
                            ₦{item.askingPrice.toLocaleString()} • {item.category}
                          </p>
                          <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md mt-1 ${
                            soldInfo.isSold ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-900'
                          }`}>
                            {soldInfo.isSold ? `✓ ${soldInfo.soldBadgeText}` : '● LIVE & ACTIVE'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!soldInfo.isSold && (
                          <button
                            onClick={() => setSoldModalItem(item)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer"
                          >
                            Mark Sold
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirmItem(item)}
                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-rose-100 hover:text-rose-700 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                          title="Delete Listing"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. FLOATING ACTION BUTTON (FAB) FOR "POST ITEM" */}
      <button
        onClick={() => {
          if (isVerifiedUser) {
            setShowSellModal(true);
          } else {
            setShowMarketplaceLockModal(true);
          }
        }}
        className="fixed bottom-20 sm:bottom-8 right-5 sm:right-8 z-40 bg-[#0a6627] hover:bg-[#08521f] text-white rounded-full p-3.5 sm:px-5 sm:py-3.5 shadow-2xl shadow-emerald-950/40 flex items-center gap-2 border-2 border-white/90 active:scale-95 transition-all cursor-pointer group"
        title="Post Item or Housing for Rent"
      >
        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
        <span className="font-extrabold text-xs sm:text-sm tracking-wide hidden sm:inline">
          Post Item
        </span>
      </button>

      {/* 5. "VIEW DETAILS" MODAL */}
      {detailsModalItem && (() => {
        const soldInfo = getSoldStatusInfo(detailsModalItem);
        const isSold = soldInfo.isSold;
        const itemPrice = detailsModalItem.adminApprovedPrice ?? detailsModalItem.askingPrice ?? 0;
        const isOwner = Boolean(cleanUserNick && (detailsModalItem.sellerNickname || '').toLowerCase().replace(/^@/, '').trim() === cleanUserNick);
        const isHousing = detailsModalItem.isHousing || detailsModalItem.category?.toLowerCase().includes('housing') || detailsModalItem.category?.toLowerCase().includes('room');

        return (
          <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
            <div className="w-full h-full max-w-3xl mx-auto bg-white flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 z-10">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setDetailsModalItem(null)}
                    className="p-1.5 -ml-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                    title="Return to previous page"
                  >
                    <ArrowLeft size={18} />
                    <span>Back</span>
                  </button>
                  <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-black text-slate-800 text-xs sm:text-sm tracking-wider uppercase">
                      ITEM DETAILS
                    </h2>
                    {isHousing && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-extrabold text-[10px] flex items-center gap-1">
                        <Home size={11} /> Housing & Rent
                      </span>
                    )}
                    {isSold && (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[10px]">
                        {soldInfo.soldBadgeText}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setDetailsModalItem(null)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">

              {/* Large Photo Preview (Picture Only, No Video) */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 w-full h-64 sm:h-72">
                <img
                  src={
                    detailsModalItem.imageUrls?.[activePhotoIdx] ||
                    detailsModalItem.imageUrls?.[0] ||
                    'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600'
                  }
                  alt={detailsModalItem.title}
                  className={`w-full h-full object-contain bg-slate-900/5 ${
                    isSold ? 'grayscale-[20%]' : ''
                  }`}
                />

                {isSold && (
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center">
                    <span className="px-4 py-1.5 rounded-full bg-rose-600 text-white font-black text-xs sm:text-sm tracking-wider shadow-lg">
                      ✓ {soldInfo.soldBadgeText.toUpperCase()}
                    </span>
                    <p className="text-rose-100 text-[11px] font-bold mt-1.5 max-w-xs">
                      Deal Completed on Campus.
                    </p>
                  </div>
                )}
              </div>

              {/* Photo Thumbnails selector */}
              {detailsModalItem.imageUrls && detailsModalItem.imageUrls.length > 1 && (
                <div className="flex gap-2 justify-center overflow-x-auto py-1">
                  {detailsModalItem.imageUrls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActivePhotoIdx(idx)}
                      className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        activePhotoIdx === idx
                          ? 'border-[#0a6627] ring-2 ring-emerald-400 scale-105'
                          : 'border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="thumbnail" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Title & Price Row */}
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 text-lg sm:text-xl leading-tight">
                    {detailsModalItem.title}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {detailsModalItem.conditionTag || detailsModalItem.category}
                    </span>
                    {detailsModalItem.roomType && (
                      <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        {detailsModalItem.roomType}
                      </span>
                    )}
                    {detailsModalItem.rentDuration && (
                      <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        {detailsModalItem.rentDuration}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`font-black text-xl sm:text-2xl ${
                    isSold ? 'text-slate-400 line-through' : 'text-[#0a6627]'
                  }`}>
                    ₦{itemPrice.toLocaleString()}
                  </span>
                  {isHousing && detailsModalItem.rentDuration && (
                    <span className="block text-[10px] font-bold text-slate-500">
                      {detailsModalItem.rentDuration}
                    </span>
                  )}
                </div>
              </div>

              {/* Sub-row: 👤 Nickname, 📍 Location, 👁️ Views */}
              <div className="flex items-center gap-3 text-xs text-slate-600 font-medium flex-wrap">
                <button
                  onClick={() => {
                    if (onAuthorClick) {
                      onAuthorClick({
                        id: `seller_${detailsModalItem.id}`,
                        authorNickname: detailsModalItem.sellerNickname,
                        timeAgo: 'Marketplace',
                        categoryTag: 'Trade',
                        text: `Seller of ${detailsModalItem.title}`,
                      });
                      setDetailsModalItem(null);
                    }
                  }}
                  className="flex items-center gap-1 text-slate-900 font-bold hover:text-emerald-700 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{detailsModalItem.sellerNickname || 'FUHSI Student'}</span>
                </button>

                <span className="flex items-center gap-1 text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>
                    {detailsModalItem.propertyLocation || 
                     detailsModalItem.meetupPoint?.replace(/^📍\s*/, '') || 
                     'FUHSI Campus / Ayeka'}
                  </span>
                </span>

                <span className="flex items-center gap-1 text-slate-500 ml-auto">
                  <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{detailsModalItem.viewCount || 28}</span>
                </span>
              </div>

              {/* Description Section */}
              <div className="space-y-1 pt-1 text-xs">
                <p className="font-bold text-slate-900 text-xs">
                  Description & Details:
                </p>
                <p className="text-slate-700 leading-relaxed font-normal whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {detailsModalItem.description || 'No additional description provided.'}
                </p>
              </div>

              {/* Primary Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {!isSold ? (
                  <>
                    {!isOwner ? (
                      <div className="space-y-2">
                        {/* WhatsApp Button */}
                        <button
                          onClick={() => handleContactOnWhatsApp(detailsModalItem)}
                          className="w-full py-3.5 bg-[#25D366] hover:bg-[#1ebd5a] text-white font-extrabold text-xs sm:text-sm rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                        >
                          <MessageCircle className="w-5 h-5 fill-white/20" />
                          <span>WhatsApp</span>
                        </button>

                        {/* Safety Actions: Report & Block */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              setReportingItem(detailsModalItem);
                            }}
                            className="flex-1 py-2 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 font-semibold text-[11px] rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-200"
                          >
                            <Flag size={13} className="text-amber-600" />
                            <span>Report Listing</span>
                          </button>

                          <button
                            onClick={() => {
                              setBlockingSeller(detailsModalItem.sellerNickname);
                            }}
                            className="flex-1 py-2 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-800 font-semibold text-[11px] rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-200"
                          >
                            <Ban size={13} className="text-rose-600" />
                            <span>Block Seller</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSoldModalItem(detailsModalItem)}
                          className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 size={16} />
                          <span>Mark as Sold</span>
                        </button>
                        <button
                          onClick={() => setDeleteConfirmItem(detailsModalItem)}
                          className="px-4 py-3 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                          title="Delete Listing"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <button
                      disabled
                      className="w-full py-3 bg-slate-100 text-slate-500 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200"
                    >
                      <span>✓ Item Sold ({soldInfo.soldBadgeText})</span>
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => setDeleteConfirmItem(detailsModalItem)}
                        className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 border border-rose-200"
                      >
                        <Trash2 size={15} />
                        <span>Delete Listing Permanently</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6. MODAL: POST ITEM FORM */}
      {showSellModal && (
        <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
          <div className="w-full h-full max-w-3xl mx-auto bg-white flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 z-10">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowSellModal(false)}
                  className="p-1.5 -ml-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                  title="Return to previous page"
                >
                  <ArrowLeft size={18} />
                  <span>Back</span>
                </button>
                <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">Post Item</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    List an item or accommodation for verified campus students
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowSellModal(false)} 
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {sellSuccessMsg ? (
              <div className="p-6 bg-emerald-50 text-emerald-900 rounded-2xl text-center space-y-2">
                <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
                <h4 className="font-extrabold text-sm">Listing Published!</h4>
                <p className="text-xs text-emerald-700">
                  Your listing is now live on the FUHSI Marketplace. Interested buyers can reach you directly on WhatsApp.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSellSubmit} className="space-y-3.5">
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isHousingCategory ? 'Property / Room Title' : 'Item / Product Title'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={isHousingCategory ? "e.g. Spacious Self Contain Room at Owuoluwa" : "e.g. TECNO Spark 8 (64GB) / Macleod Clinical Examination"}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {CATEGORY_OPTIONS.filter((c) => c.id !== 'All').map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isHousingCategory ? 'Rent Amount (₦)' : 'Asking Price (₦)'} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={askingPrice}
                      onChange={(e) => setAskingPrice(Number(e.target.value) || '')}
                      placeholder={isHousingCategory ? "120000" : "15000"}
                      className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>

                {/* Housing Specific Inputs */}
                {isHousingCategory ? (
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2.5">
                    <p className="text-[11px] font-extrabold text-blue-900 flex items-center gap-1.5">
                      <Home size={13} className="text-blue-700" />
                      <span>Property & Accommodation Details</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Room / Property Type</label>
                        <select
                          value={roomType}
                          onChange={(e) => setRoomType(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-200 p-2 text-slate-800 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {HOUSING_ROOM_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Rent Duration</label>
                        <select
                          value={rentDuration}
                          onChange={(e) => setRentDuration(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-200 p-2 text-slate-800 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {RENT_DURATIONS.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Roommate prompt if Roommate (Needed) is selected */}
                    {roomType === 'Roommate (Needed)' && (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Current Room / Apartment Type</label>
                        <select
                          value={roommateRoomType}
                          onChange={(e) => setRoommateRoomType(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-200 p-2 text-slate-800 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {ROOMMATE_CURRENT_ROOM_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Property Location <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={propertyLocation}
                        onChange={(e) => setPropertyLocation(e.target.value)}
                        placeholder="e.g. Owuoluwa Junction, Ayeka"
                        className="w-full text-xs rounded-xl border border-slate-200 p-2 text-slate-800 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Condition Tag</label>
                      <select
                        value={conditionTag}
                        onChange={(e) => setConditionTag(e.target.value)}
                        className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="New">Brand New</option>
                        <option value="Newly used">Newly Used</option>
                        <option value="Fairly Used">Fairly Used</option>
                        <option value="Refurbished / Working">Refurbished / Working</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Campus Meetup Spot</label>
                      <select
                        value={meetupPoint}
                        onChange={(e) => setMeetupPoint(e.target.value)}
                        className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {MEETUP_LOCATIONS.map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* WhatsApp Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    WhatsApp Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <MessageCircle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600" />
                    <input
                      type="tel"
                      value={sellerPhone}
                      onChange={(e) => setSellerPhone(e.target.value)}
                      placeholder="08012345678"
                      className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-200 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isHousingCategory ? 'Property Features & Amenities' : 'Description & Specs'} <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      isHousingCategory 
                        ? "Describe room condition, running water, electricity, security, tile floor, fenced compound..."
                        : "Describe item condition, accessories included, reason for selling..."
                    }
                    rows={3}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    required
                  />
                </div>

                {/* Pictures Upload Section (Picture only, not video) */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Camera size={15} className="text-emerald-600" />
                      <span>{isHousingCategory ? 'Property Pictures (1–6 Clear Photos)' : 'Item Pictures (1–6 Clear Photos)'}</span>
                    </label>
                    <span className="text-[10px] font-extrabold text-slate-500">
                      {uploadedPhotos.length} / 6 selected
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    Select clear pictures to showcase your listing.
                  </p>

                  {uploadedPhotos.length < 6 && (
                    <label className="flex items-center justify-center gap-2 p-3 bg-emerald-50 border-2 border-dashed border-emerald-300 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors">
                      <Upload size={16} className="text-emerald-700" />
                      <span className="text-xs font-bold text-emerald-800">
                        Select Photos from Device
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotosFileUpload}
                        className="hidden"
                      />
                    </label>
                  )}

                  {uploadedPhotos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                      {uploadedPhotos.map((photo, idx) => (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square group">
                          <img src={photo} alt={`Item ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveUploadedPhoto(idx)}
                            className="absolute top-1 right-1 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-rose-700 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl bg-[#0a6627] hover:bg-[#08521f] text-white font-extrabold text-xs sm:text-sm transition-colors cursor-pointer shadow-md active:scale-95"
                >
                  Publish Listing to Marketplace
                </button>
              </form>
            )}
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: REPORT LISTING OR SELLER */}
      {reportingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <Flag size={16} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Report Listing / Seller</h3>
                  <p className="text-[10px] text-slate-500 font-medium">{reportingItem.title}</p>
                </div>
              </div>
              <button onClick={() => setReportingItem(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
            </div>

            <form onSubmit={handleSubmitReport} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Reason for Report</label>
                <div className="space-y-1.5">
                  {MARKETPLACE_REPORT_REASONS.map((reason) => (
                    <label 
                      key={reason} 
                      className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        reportReason === reason 
                          ? 'border-rose-500 bg-rose-50 text-rose-950 font-bold' 
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report_reason"
                        value={reason}
                        checked={reportReason === reason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Additional Details (Optional)</label>
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Provide context on what happened or why this listing/seller is problematic..."
                  rows={3}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReportingItem(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: BLOCK SELLER CONFIRMATION */}
      {blockingSeller && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <Ban size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-sm">Block @{blockingSeller.replace(/^@/, '')}?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                You will no longer see items, housing listings, or posts from this seller in your feed or marketplace.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setBlockingSeller(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBlockSeller}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
              >
                Yes, Block Seller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: MARK AS SOLD CONFIRMATION */}
      {soldModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-900 text-sm">Mark as Sold</h3>
              <button onClick={() => setSoldModalItem(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
            </div>

            {soldSuccessNotify ? (
              <div className="p-4 bg-emerald-50 text-emerald-900 rounded-2xl text-center space-y-1">
                <CheckCircle2 size={24} className="text-emerald-600 mx-auto" />
                <p className="font-black text-sm">Item Marked as Sold!</p>
                <p className="text-xs text-emerald-700">Tagged as "Sold today".</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-700 leading-relaxed">
                  Are you sure you want to mark <strong className="text-slate-900 font-bold">"{soldModalItem.title}"</strong> as sold?
                </p>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSoldModalItem(null)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSold}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                  >
                    Yes, Mark as Sold
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10. MODAL: DELETE CONFIRMATION */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <Trash2 size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-sm">Delete Listing Permanently?</h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to permanently remove <strong className="text-slate-900">"{deleteConfirmItem.title}"</strong>? This will permanently delete it across all devices, the marketplace feed, and the admin directory.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. MODAL: VERIFICATION LOCK */}
      {showMarketplaceLockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Lock size={22} />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Verification Required</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              To keep the marketplace secure and scam-free, only verified FUHSI students can post items for sale or rooms for rent.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowMarketplaceLockModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowMarketplaceLockModal(false);
                  setShowVerificationModal(true);
                }}
                className="flex-1 py-2.5 bg-[#0a6627] hover:bg-[#08521f] text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification modal instance */}
      {showVerificationModal && (
        <VerificationModal
          userProfile={userProfile}
          onClose={() => setShowVerificationModal(false)}
          onSubmitVerification={() => {
            setShowVerificationModal(false);
          }}
        />
      )}
    </div>
  );
};
