import crypto from 'node:crypto';

export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  images: Array<{ src: string; alt: string; width: number; height: number }>;
  tables: string[][];
  passwordFieldCount: number;
  verificationHint: boolean;
  capturedAt: string;
}

export interface BrowserCapture {
  snapshot: BrowserSnapshot;
  screenshotBase64?: string;
  screenshotMimeType?: string;
  sensitive: boolean;
}

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingRequest>();
const ipcProcess = process as any;

if (typeof ipcProcess.send === 'function' && typeof ipcProcess.on === 'function') {
  ipcProcess.on('message', (message: any) => {
    if (!message || message.type !== 'as-radar-browser-response' || !message.requestId) return;
    const request = pending.get(String(message.requestId));
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(String(message.requestId));
    if (message.ok) request.resolve(message.result);
    else request.reject(new Error(String(message.error || 'Browser operation failed.')));
  });
}

export const browserBridge = {
  get available(): boolean {
    return typeof ipcProcess.send === 'function';
  },

  request<T = any>(method: string, args: Record<string, any> = {}, timeoutMs = 30000): Promise<T> {
    if (typeof ipcProcess.send !== 'function') {
      return Promise.reject(new Error('The embedded research browser is available only in the Windows desktop application.'));
    }
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`The embedded browser "${method}" request did not respond within ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try {
        ipcProcess.send({
          type: 'as-radar-browser-request',
          requestId,
          method,
          args
        });
      } catch (error: any) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  async show(url?: string) {
    return this.request('show', { url }, 10000);
  },

  async hide() {
    return this.request('hide', {}, 10000);
  },

  async setTakeover(enabled: boolean) {
    return this.request('takeover', { enabled }, 10000);
  },

  async capture(): Promise<BrowserCapture> {
    return this.request('capture', {}, 75000);
  },

  async execute(action: string, args: Record<string, any>) {
    return this.request('action', { action, args }, 20000);
  },

  async status() {
    return this.request('status', {}, 10000);
  }
};
