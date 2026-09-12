import { DEFAULT_USERS_LIST } from '../utils/userDbUtils';
import {
  INITIAL_POSTS,
  INITIAL_COMMENTS,
  INITIAL_MARKETPLACE_ITEMS,
  INITIAL_PENDING_MARKETPLACE_ITEMS,
  INITIAL_VERIFICATION_REQUESTS,
  INITIAL_REPORTS,
  INITIAL_VERIFICATION_CANDIDATES,
} from './initialData';

export const DEFAULT_SERVER_DB = {
  users: DEFAULT_USERS_LIST,
  posts: INITIAL_POSTS,
  comments: INITIAL_COMMENTS,
  marketplaceItems: INITIAL_MARKETPLACE_ITEMS,
  pendingMarketplaceItems: INITIAL_PENDING_MARKETPLACE_ITEMS,
  verificationRequests: INITIAL_VERIFICATION_REQUESTS,
  reports: INITIAL_REPORTS,
  verificationFee: 1500,
  notifications: {},
  verifCandidates: INITIAL_VERIFICATION_CANDIDATES,
  sentEmails: [],
  directMessages: [],
  chatConversations: [],
  chatReports: [],
  chatRestrictions: [],
  follows: [],
};
