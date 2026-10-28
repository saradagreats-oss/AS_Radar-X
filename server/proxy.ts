import { fetch as undiciFetch, ProxyAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import type { ProxySettings } from './storage/database.js';

const originalDispatcher = getGlobalDispatcher();
let activeDispatcher: ProxyAgent | null = null;

function buildProxyUrl(config: ProxySettings): string {
  const protocol = config.protocol === 'socks5' ? 'socks5' : 'http';
  const host = String(config.host || '').trim();
  const port = Number(config.port);
  if (!host || /[\s/@]/.test(host)) throw new Error('Enter a valid proxy host or IP address.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Proxy port must be between 1 and 65535.');
  const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const auth = config.username
    ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password || '')}@`
    : '';
  return `${protocol}://${auth}${normalizedHost}:${port}`;
}

/** Applies the saved proxy to Node's global fetch/Undici requests used by collectors and Gemini. */
export function applyProxySettings(config: ProxySettings): void {
  if (activeDispatcher) {
    const previous = activeDispatcher;
    activeDispatcher = null;
    void previous.close().catch(() => undefined);
  }

  if (!config.enabled) {
    setGlobalDispatcher(originalDispatcher);
    return;
  }

  const dispatcher = new ProxyAgent(buildProxyUrl(config));
  activeDispatcher = dispatcher;
  setGlobalDispatcher(dispatcher);
}

export async function testProxyConnection(config: ProxySettings): Promise<{ status: number; latencyMs: number }> {
  const proxyUrl = buildProxyUrl({ ...config, enabled: true });
  const dispatcher = new ProxyAgent(proxyUrl);
  const startedAt = Date.now();
  try {
    const response = await undiciFetch('https://clients3.google.com/generate_204', {
      dispatcher,
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Proxy connected but destination returned HTTP ${response.status}.`);
    }
    return { status: response.status, latencyMs: Date.now() - startedAt };
  } catch (error: any) {
    throw new Error(error?.message || 'Could not reach the internet through this proxy. Check that V2Ray is running and the host/port are correct.');
  } finally {
    await dispatcher.close().catch(() => undefined);
  }
}
