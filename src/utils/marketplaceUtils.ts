/**
 * FUHSI Connect - Marketplace & Direct WhatsApp Trade Utilities
 */
import { MarketplaceItem, MarketplaceReport } from '../types';
import { pushServerDbSync } from './apiSync';

export const MARKETPLACE_REPORTS_STORAGE_KEY = 'fuhsi_marketplace_reports_db';

export const MARKETPLACE_REPORT_REASONS = [
  'Fake item',
  'Fraud/scam',
  'Fake transfer',
  'Misleading listing',
  'Item not as described',
  'Seller misconduct',
  'Other marketplace problems'
] as const;

/**
 * Sanitizes phone number to international WhatsApp format (e.g. 2348012345678)
 */
export function sanitizeWhatsAppNumber(phone?: string): string {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, ''); // strip spaces, hyphens, pluses
  if (!clean) return '';

  // 080... -> 23480...
  if (clean.startsWith('0')) {
    clean = '234' + clean.substring(1);
  } else if (!clean.startsWith('234') && clean.length === 10) {
    clean = '234' + clean;
  }
  return clean;
}

/**
 * Generates direct WhatsApp URL with pre-filled buyer message
 * > Hello, I saw your item "[Item Title]" on FUHSI Connect and I'm interested in it. Is it still available?
 */
export function generateWhatsAppTradeUrl(item: MarketplaceItem): string {
  const cleanPhone = sanitizeWhatsAppNumber(item.sellerPhone);
  if (!cleanPhone) return '';

  const isHousing = 
    item.isHousing || 
    item.category?.toLowerCase().includes('housing') || 
    item.category?.toLowerCase().includes('room') || 
    item.category?.toLowerCase().includes('property') ||
    item.category?.toLowerCase().includes('hostel');

  const message = isHousing
    ? `Hello, I saw your room/property listing "${item.title}" on FUHSI Connect and I'm interested in it. Is it still available?`
    : `Hello, I saw your item "${item.title}" on FUHSI Connect and I'm interested in it. Is it still available?`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Stored Marketplace Reports for Admin Review
 */
export function getStoredMarketplaceReports(): MarketplaceReport[] {
  try {
    const stored = localStorage.getItem(MARKETPLACE_REPORTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading marketplace reports:', e);
  }
  return [];
}

export function saveMarketplaceReport(report: MarketplaceReport): void {
  try {
    const existing = getStoredMarketplaceReports();
    const updated = [report, ...existing.filter((r) => r.id !== report.id)];
    localStorage.setItem(MARKETPLACE_REPORTS_STORAGE_KEY, JSON.stringify(updated));
    pushServerDbSync({ marketplaceReports: updated } as any);
    window.dispatchEvent(new CustomEvent('fuhsi_marketplace_report_submitted', { detail: report }));
  } catch (e) {
    console.error('Error saving marketplace report:', e);
  }
}

export function updateMarketplaceReportStatus(
  reportId: string,
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED',
  actionTaken?: string
): void {
  try {
    const existing = getStoredMarketplaceReports();
    const updated = existing.map((r) =>
      r.id === reportId ? { ...r, status, actionTaken: actionTaken || r.actionTaken } : r
    );
    localStorage.setItem(MARKETPLACE_REPORTS_STORAGE_KEY, JSON.stringify(updated));
    pushServerDbSync({ marketplaceReports: updated } as any);
    window.dispatchEvent(new CustomEvent('fuhsi_marketplace_report_updated', { detail: { reportId, status } }));
  } catch (e) {
    console.error('Error updating marketplace report:', e);
  }
}
