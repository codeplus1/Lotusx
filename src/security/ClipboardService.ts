/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ClipboardClearCallback = (remainingSeconds: number) => void;

export class ClipboardService {
  private clearTimer: number | null = null;
  private intervalTimer: number | null = null;
  private remainingSeconds = 0;
  private listeners: Set<ClipboardClearCallback> = new Set();

  /**
   * Copies sensitive text (e.g. password) to clipboard and arms auto-clear countdown
   */
  async copySensitive(text: string, clearAfterSeconds = 30): Promise<boolean> {
    if (!text) return false;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for restricted iframe or older browser context
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      this.armAutoClear(clearAfterSeconds);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Subscribes to clipboard countdown ticks
   */
  onCountdown(callback: ClipboardClearCallback): () => void {
    this.listeners.add(callback);
    callback(this.remainingSeconds);
    return () => {
      this.listeners.delete(callback);
    };
  }

  getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  /**
   * Manually clears the clipboard immediately
   */
  async clearNow(): Promise<void> {
    this.cancelTimers();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText('');
      }
    } catch {
      // Ignore if document not focused
    }
    this.notify(0);
  }

  private armAutoClear(seconds: number): void {
    this.cancelTimers();

    if (seconds <= 0) {
      this.notify(0);
      return;
    }

    this.remainingSeconds = seconds;
    this.notify(this.remainingSeconds);

    this.intervalTimer = window.setInterval(() => {
      this.remainingSeconds -= 1;
      if (this.remainingSeconds <= 0) {
        this.clearNow();
      } else {
        this.notify(this.remainingSeconds);
      }
    }, 1000);
  }

  private cancelTimers(): void {
    if (this.clearTimer !== null) {
      window.clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    if (this.intervalTimer !== null) {
      window.clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.remainingSeconds = 0;
  }

  private notify(sec: number): void {
    this.listeners.forEach((cb) => cb(sec));
  }
}

export const clipboardService = new ClipboardService();
