/**
 * FUHSI Connect - Hierarchical Global Navigation & Back Coordinator
 *
 * Ensures multi-level, step-by-step back navigation across all sections,
 * subpages, sub-modals, and tabs of the application.
 *
 * Prevents abrupt jumps directly to Feed when navigating back from:
 * - Profile -> Account Settings -> Edit Profile (and other subpages)
 * - Campus Hub -> My Listings / Details -> Adjust Listing Details (and other modals)
 * - Chats -> Conversation -> Info/Report
 * - Moderation -> Student / Verification Modals
 * - Post Details & Image Previews
 */

import { useEffect, useRef } from 'react';

export interface BackHandler {
  id: string;
  priority: number;
  action: () => boolean | void;
  timestamp: number;
}

// Global registry of back handlers
const backHandlers: BackHandler[] = [];
let isCoordinatorInitialized = false;
let isExecutingPopState = false;

// Priority constants for clean hierarchy
export const NAV_PRIORITY = {
  SUBMODAL: 50,      // Deepest submodals (e.g. crop image, adjust listing modal, photo zoom)
  SUBPAGE: 40,       // Subpages (e.g. Edit Profile, Display Mode, Privacy, Item Details, Sell Modal)
  SCREEN_OVERLAY: 30,// Screen overlays (e.g. Account Settings menu, Active Chat conversation)
  SECTION_VIEW: 25,  // Section views (e.g. Hub 'my_listings' view)
  PRIMARY_MODAL: 20, // App-level modal stack (PostDetailModal, ProfileModal, CreatePostModal)
  MAIN_TAB: 10,      // Main tabs navigation (Feed, Search, Hub, Chats, Leaderboard, Moderation)
};

/**
 * Register a back handler in the hierarchy.
 * Returns an unregister cleanup function.
 */
export function registerBackHandler(
  id: string,
  priority: number,
  action: () => boolean | void
): () => void {
  // Remove existing with same id if any
  const existingIdx = backHandlers.findIndex((h) => h.id === id);
  if (existingIdx !== -1) {
    backHandlers.splice(existingIdx, 1);
  }

  const handler: BackHandler = {
    id,
    priority,
    action,
    timestamp: Date.now(),
  };

  backHandlers.push(handler);

  return () => {
    const idx = backHandlers.findIndex((h) => h.id === id);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
    }
  };
}

/**
 * Execute the topmost back handler.
 * Returns true if a handler was found and handled the event.
 */
export function executeTopBackHandler(): boolean {
  if (backHandlers.length === 0) return false;

  // Sort by priority DESCENDING, then timestamp DESCENDING (newest first)
  const sorted = [...backHandlers].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.timestamp - a.timestamp;
  });

  for (const handler of sorted) {
    try {
      const res = handler.action();
      // If action returned false explicitly, try next handler; otherwise consider handled
      if (res !== false) {
        return true;
      }
    } catch (e) {
      console.error(`[NavigationStack] Error in back handler "${handler.id}":`, e);
    }
  }

  return false;
}

/**
 * Programmatic back trigger (invoked by in-app Back/Cancel buttons or gesture).
 * If browser history was pushed for this state, triggers window.history.back().
 * Fallbacks to executing the topmost handler directly.
 */
export function navigateBack(): void {
  try {
    // If we have history entries that can be popped, trigger history.back()
    // This keeps browser forward/back buttons in exact lockstep
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
  } catch (e) {
    console.error('[NavigationStack] history.back error:', e);
  }

  // Fallback direct execution
  executeTopBackHandler();
}

/**
 * Push a navigation step onto window.history safely.
 */
export function pushNavState(state: Record<string, any>, title = ''): void {
  try {
    if (typeof window !== 'undefined') {
      window.history.pushState(
        {
          ...state,
          _fuhsi_nav: true,
          _time: Date.now(),
        },
        title
      );
    }
  } catch (e) {
    console.error('[NavigationStack] pushNavState error:', e);
  }
}

/**
 * Initialize single authoritative global popstate listener.
 */
export function initNavigationCoordinator(): void {
  if (isCoordinatorInitialized || typeof window === 'undefined') return;
  isCoordinatorInitialized = true;

  window.addEventListener('popstate', (event) => {
    if (isExecutingPopState) return;
    isExecutingPopState = true;

    try {
      const handled = executeTopBackHandler();
      if (!handled) {
        // If nothing in the app handled it, let default browser behavior occur
      }
    } finally {
      setTimeout(() => {
        isExecutingPopState = false;
      }, 50);
    }
  });
}

/**
 * React hook to register a back action for any component or modal.
 *
 * @param id Unique identifier for this handler
 * @param priority Numerical priority (use NAV_PRIORITY constants)
 * @param enabled Whether this handler is currently active (e.g. modal is open)
 * @param onBack Function to call when user navigates back. Return false to yield to next handler.
 * @param pushStateOnEnable Optional state object to push to window.history when enabled becomes true
 */
export function useBackHandler(
  id: string,
  priority: number,
  enabled: boolean,
  onBack: () => boolean | void,
  pushStateOnEnable?: Record<string, any>
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Track whether we pushed a state so we know whether cleanup should neutralize it
  const didPushRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      didPushRef.current = false;
      return;
    }

    if (pushStateOnEnable && !didPushRef.current) {
      pushNavState(pushStateOnEnable);
      didPushRef.current = true;
    }

    const unregister = registerBackHandler(id, priority, () => {
      didPushRef.current = false;
      return onBackRef.current();
    });

    return () => {
      unregister();
    };
  }, [id, priority, enabled]);
}
