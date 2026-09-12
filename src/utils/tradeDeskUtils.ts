import { pushServerDbSync } from './apiSync';

export type TransactionStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED_LIVE'
  | 'REJECTED'
  | 'BUYER_REQUEST_LOGGED'
  | 'IN_NEGOTIATION'
  | 'MEETUP_SCHEDULED'
  | 'COMPLETED_SOLD'
  | 'RETURNED_DISPUTED';

export interface MarketplaceTransaction {
  id: string;
  itemId: string;
  itemTitle: string;
  itemCategory: string;
  itemPrice: number;
  sellerNickname: string;
  sellerPhone: string;
  buyerNickname?: string;
  buyerPhone?: string;
  status: TransactionStatus;
  meetupPoint: string;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
  hasComplaint?: boolean;
  complaintReason?: string;
  complaintStatus?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
}

const TRADE_DESK_STORAGE_KEY = 'fuhsi_admin_trade_desk_transactions';

export const DEFAULT_SAMPLE_TRANSACTIONS: MarketplaceTransaction[] = [];

/**
 * Get saved transactions from local storage, or initialize defaults
 */
export function getStoredTransactions(): MarketplaceTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(TRADE_DESK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out legacy sample transactions
        const realTx = parsed.filter((tx: MarketplaceTransaction) => 
          tx.id && !tx.id.startsWith('tx_steth_') && !tx.id.startsWith('tx_labcoat_') && !tx.id.startsWith('tx_pathbook_') && !tx.id.startsWith('tx_oximeter_') && !tx.id.startsWith('tx_sample_')
        );
        return realTx;
      }
    }
  } catch (e) {
    console.error('Error reading trade desk transactions:', e);
  }
  return [];
}


/**
 * Save transactions permanently to local storage and push sync to server
 */
export function saveStoredTransactions(transactions: MarketplaceTransaction[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TRADE_DESK_STORAGE_KEY, JSON.stringify(transactions));
    pushServerDbSync({ tradeDeskTransactions: transactions });
  } catch (e) {
    console.error('Error saving trade desk transactions:', e);
  }
}

/**
 * Add or update a transaction
 */
export function upsertTransaction(updatedTx: MarketplaceTransaction): MarketplaceTransaction[] {
  const current = getStoredTransactions();
  const index = current.findIndex((t) => t.id === updatedTx.id);
  let nextList: MarketplaceTransaction[];
  if (index >= 0) {
    nextList = [...current];
    nextList[index] = { ...updatedTx, updatedAt: new Date().toISOString() };
  } else {
    nextList = [{ ...updatedTx, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...current];
  }
  saveStoredTransactions(nextList);
  return nextList;
}

/**
 * Helper to update transaction status
 */
export function updateTransactionStatus(
  txId: string,
  newStatus: TransactionStatus,
  adminNotes?: string
): MarketplaceTransaction[] {
  const current = getStoredTransactions();
  const nextList = current.map((t) => {
    if (t.id === txId) {
      return {
        ...t,
        status: newStatus,
        adminNotes: adminNotes !== undefined ? adminNotes : t.adminNotes,
        updatedAt: new Date().toISOString(),
      };
    }
    return t;
  });
  saveStoredTransactions(nextList);
  return nextList;
}
