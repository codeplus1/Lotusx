/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { navigationService } from '../services/NavigationService';

export interface UseBackHandlerOptions {
  id: string;
  enabled?: boolean;
  priority?: number;
  onBack: () => boolean | void;
}

/**
 * Registers an Android system back button handler for modals, dialogs, drawers, and screen transitions.
 * When Android hardware or gesture back button is triggered, the highest priority handler is invoked first.
 * Only when all handlers have finished and the user is on the root screen does the app exit.
 */
export function useBackHandler({
  id,
  enabled = true,
  priority = 0,
  onBack,
}: UseBackHandlerOptions): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;

    navigationService.register({
      id,
      priority,
      onBack: () => onBackRef.current(),
    });

    return () => {
      navigationService.unregister(id);
    };
  }, [id, enabled, priority]);
}
