/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BackAction {
  id: string;
  priority: number; // Higher priority executed first (e.g., 100 for dialogs, 80 for detail view, 50 for screens)
  onBack: () => boolean | void;
}

class NavigationService {
  private stack: BackAction[] = [];
  private historyDepth = 0;
  private isBackPressActive = false;
  private isProgrammaticPop = false;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    // Listen to hardware / browser back button via popstate
    window.addEventListener('popstate', this.handlePopState);
  }

  private handlePopState = () => {
    // If popstate was triggered by our own window.history.back() to clean up an on-screen dismiss
    if (this.isProgrammaticPop) {
      this.isProgrammaticPop = false;
      return;
    }

    // The browser has decremented its history entry
    this.historyDepth = Math.max(0, this.historyDepth - 1);

    if (this.stack.length === 0) {
      // At root screen - allow native back to exit the app
      return;
    }

    // Mark back press as actively executing
    this.isBackPressActive = true;
    try {
      // Find the highest priority action (if equal, the most recently registered)
      let highestIdx = this.stack.length - 1;
      let highestPriority = this.stack[highestIdx].priority;

      for (let i = this.stack.length - 2; i >= 0; i--) {
        if (this.stack[i].priority > highestPriority) {
          highestPriority = this.stack[i].priority;
          highestIdx = i;
        }
      }

      const action = this.stack[highestIdx];
      if (action && typeof action.onBack === 'function') {
        action.onBack();
      }
    } finally {
      // Allow synchronous unmount/unregister callbacks to complete before resetting
      setTimeout(() => {
        this.isBackPressActive = false;
        if (this.stack.length > 0 && this.historyDepth === 0) {
          try {
            window.history.pushState({ lotusxBackSentinel: true }, '');
            this.historyDepth = 1;
          } catch {
            // Ignore history push limits in iframe contexts
          }
        }
      }, 0);
    }
  };

  /**
   * Registers a back-button action when a modal, drawer, or sub-screen opens
   */
  public register(action: BackAction): void {
    if (typeof window === 'undefined') return;

    // If an action with this ID already exists, update it
    const existingIdx = this.stack.findIndex((item) => item.id === action.id);
    if (existingIdx >= 0) {
      this.stack[existingIdx] = action;
      return;
    }

    const wasEmpty = this.stack.length === 0;
    this.stack.push(action);

    // Push a single sentinel history state only when transitioning from root to non-root
    if (wasEmpty && this.historyDepth === 0) {
      try {
        window.history.pushState({ lotusxBackSentinel: true }, '');
        this.historyDepth = 1;
      } catch {
        // Ignore history push limits in iframe contexts
      }
    }
  }

  /**
   * Updates an existing registered action (e.g., when callbacks change without remounting)
   */
  public update(id: string, partial: Partial<BackAction>): void {
    const existingIdx = this.stack.findIndex((item) => item.id === id);
    if (existingIdx >= 0) {
      this.stack[existingIdx] = {
        ...this.stack[existingIdx],
        ...partial,
      };
    }
  }

  /**
   * Unregisters an action when a modal, drawer, or sub-screen closes
   */
  public unregister(id: string): void {
    if (typeof window === 'undefined') return;

    const existingIdx = this.stack.findIndex((item) => item.id === id);
    if (existingIdx < 0) return;

    this.stack.splice(existingIdx, 1);
  }

  /**
   * Returns current stack depth
   */
  public getDepth(): number {
    return this.stack.length;
  }

  /**
   * Cleans up listener
   */
  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.handlePopState);
    }
  }
}

export const navigationService = new NavigationService();
