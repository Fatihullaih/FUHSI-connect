import { HelpDeskInquiry } from '../types';
import { pushServerDbSync } from './apiSync';
import { 
  saveHelpDeskInquiryToFirestore, 
  updateHelpDeskInquiryStatus as updateFirestoreHelpDeskStatus,
  subscribeHelpDeskInquiries as subscribeFirestoreHelpDesk
} from '../lib/firestoreSync';

export const HELPDESK_STORAGE_KEY = 'fuhsi_helpdesk_inquiries';

export const INITIAL_HELPDESK_INQUIRIES: HelpDeskInquiry[] = [];

/**
 * Retrieve all stored helpdesk inquiries from local storage (empty by default, no fake notifications)
 */
export function getStoredHelpDeskInquiries(): HelpDeskInquiry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    localStorage.removeItem(HELPDESK_STORAGE_KEY);
    return [];
  } catch (err) {
    return [];
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
