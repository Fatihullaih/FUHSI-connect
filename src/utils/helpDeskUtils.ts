import { HelpDeskInquiry } from '../types';
import { pushServerDbSync } from './apiSync';
import { 
  saveHelpDeskInquiryToFirestore, 
  updateHelpDeskInquiryStatus as updateFirestoreHelpDeskStatus,
  subscribeHelpDeskInquiries as subscribeFirestoreHelpDesk
} from '../lib/firestoreSync';

export const HELPDESK_STORAGE_KEY = 'fuhsi_helpdesk_inquiries';

export const INITIAL_HELPDESK_INQUIRIES: HelpDeskInquiry[] = [
  {
    id: 'ticket_appeal_101',
    ticketId: 'HD-9842',
    fullName: 'Adeyemi Toluwalase',
    nickname: '@adeyemi_t',
    email: 'adeyemi.t@fuhsi.edu.ng',
    matricNumber: '24/MLS/032',
    department: 'Medical Laboratory Science',
    level: '200L',
    category: 'REGISTRATION_APPEAL',
    categoryLabel: 'Registration Approval Review',
    message: 'Good day Admin, my account has been under pending approval for 48 hours. I submitted my valid matric number 24/MLS/032 and school email. Kindly approve my account.',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'ticket_matric_102',
    ticketId: 'HD-9843',
    fullName: 'Olatunji Praise',
    nickname: '@praise_o',
    email: 'praise.o@fuhsi.edu.ng',
    matricNumber: '24/NUR/109',
    department: 'Nursing Science',
    level: '100L',
    category: 'LOGIN_ISSUE',
    categoryLabel: 'Matric Number Ownership Conflict',
    message: 'Hello Support, when attempting to register, the portal indicated that matric number 24/NUR/109 was already taken. I am the bona fide student and have attached my admission slip.',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

/**
 * Retrieve all stored helpdesk inquiries from local storage with initial fallback
 */
export function getStoredHelpDeskInquiries(): HelpDeskInquiry[] {
  try {
    if (typeof localStorage === 'undefined') return INITIAL_HELPDESK_INQUIRIES;
    const raw = localStorage.getItem(HELPDESK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Initialize with defaults if empty
    localStorage.setItem(HELPDESK_STORAGE_KEY, JSON.stringify(INITIAL_HELPDESK_INQUIRIES));
    return INITIAL_HELPDESK_INQUIRIES;
  } catch (err) {
    console.error('Error reading help desk inquiries:', err);
    return INITIAL_HELPDESK_INQUIRIES;
  }
}

/**
 * Save or submit a new Help Desk inquiry
 */
export function saveHelpDeskInquiry(inquiry: HelpDeskInquiry): void {
  try {
    const existing = getStoredHelpDeskInquiries();
    const updated = [inquiry, ...existing.filter((item) => item.id !== inquiry.id)];
    localStorage.setItem(HELPDESK_STORAGE_KEY, JSON.stringify(updated));

    // Sync to Firestore
    saveHelpDeskInquiryToFirestore(inquiry).catch((err) => console.error(err));

    // Sync to Central Server DB
    pushServerDbSync({ helpDeskInquiries: updated } as any).catch((err) => console.error(err));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_helpdesk_inquiry_submitted', { detail: inquiry }));
    }
  } catch (err) {
    console.error('Error saving help desk inquiry:', err);
  }
}

/**
 * Update Help Desk ticket status & optional notes/reply
 */
export function updateHelpDeskInquiryStatus(
  inquiryId: string,
  status: 'PENDING' | 'RESOLVED' | 'UNDER_REVIEW',
  adminReply?: string,
  adminNotes?: string
): void {
  try {
    const existing = getStoredHelpDeskInquiries();
    const updated = existing.map((item) => {
      if (item.id === inquiryId) {
        return {
          ...item,
          status,
          ...(adminReply !== undefined ? { adminReply } : {}),
          ...(adminNotes !== undefined ? { adminNotes } : {}),
          resolvedAt: status === 'RESOLVED' ? new Date().toISOString() : item.resolvedAt,
        };
      }
      return item;
    });

    localStorage.setItem(HELPDESK_STORAGE_KEY, JSON.stringify(updated));

    // Sync to Firestore
    updateFirestoreHelpDeskStatus(inquiryId, status, adminNotes || adminReply).catch((err) => console.error(err));

    // Sync to Central Server DB
    pushServerDbSync({ helpDeskInquiries: updated } as any).catch((err) => console.error(err));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fuhsi_helpdesk_inquiry_updated', {
          detail: { inquiryId, status, adminReply, adminNotes },
        })
      );
    }
  } catch (err) {
    console.error('Error updating help desk inquiry status:', err);
  }
}

/**
 * Delete a Help Desk ticket permanently
 */
export function deleteHelpDeskInquiry(inquiryId: string): void {
  try {
    const existing = getStoredHelpDeskInquiries();
    const updated = existing.filter((item) => item.id !== inquiryId);
    localStorage.setItem(HELPDESK_STORAGE_KEY, JSON.stringify(updated));
    pushServerDbSync({ helpDeskInquiries: updated } as any).catch((err) => console.error(err));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_helpdesk_inquiry_updated', { detail: { inquiryId, deleted: true } }));
    }
  } catch (err) {
    console.error('Error deleting help desk inquiry:', err);
  }
}
