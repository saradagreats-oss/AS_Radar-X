import { BaseCollector, CollectorResult } from './base.js';
import { storage } from '../storage/database.js';
import { cleanText, extractTokens } from '../normalization/textNormalizer.js';
import type { DiscordConfig, DiscordGuildConfig, RawEvidence } from '../types.js';

export class DiscordCollector extends BaseCollector {
  public readonly name = 'Discord' as const;

  /**
   * Test connection using provided or stored Discord Bot Token and verify channel access.
   */
  public async testConnection(credentials?: {
    botToken?: string;
    guilds?: DiscordGuildConfig[];
  }): Promise<{ success: boolean; message: string; botUser?: any; channelsVerified?: any[] }> {
    const stored = storage.getDiscordConfig();
    let token = (credentials?.botToken || stored.botToken || '').trim();
    if (token === '••••••••' || token.includes('••')) {
      token = stored.botToken;
    }
    const guilds = credentials?.guilds || stored.guilds || [];

    if (!token) {
      return {
        success: false,
        message: 'Discord Bot Token is required to test bot connection.'
      };
    }

    const cleanToken = token.replace(/^Bot\s+/i, '').trim();

    try {
      // 1. Verify Bot Identity
      const meRes = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'User-Agent': 'DiscordBot (AS-Radar-X, 2.0)'
        }
      });

      if (!meRes.ok) {
        const errText = await meRes.text();
        return {
          success: false,
          message: `Discord Bot Authentication failed (HTTP ${meRes.status}): ${errText || 'Invalid Bot Token. Check the Discord Developer Portal.'}`
        };
      }

      const botUser = await meRes.json();
      const channelsVerified: Array<{ id: string; name?: string; accessible: boolean; error?: string }> = [];

      // 2. Verify channel access if channels are configured
      for (const guild of guilds) {
        for (const ch of guild.channels || []) {
          const chId = typeof ch === 'string' ? ch : ch.id;
          if (!chId) continue;
          try {
            const chRes = await fetch(`https://discord.com/api/v10/channels/${chId}`, {
              headers: {
                Authorization: `Bot ${cleanToken}`,
                'User-Agent': 'DiscordBot (AS-Radar-X, 2.0)'
              }
            });

            if (chRes.ok) {
              const chData = await chRes.json();
              channelsVerified.push({
                id: chId,
                name: chData.name || 'channel',
                accessible: true
              });
            } else {
              channelsVerified.push({
                id: chId,
                accessible: false,
                error: `HTTP ${chRes.status} (Missing bot permissions in this channel)`
              });
            }
          } catch (e: any) {
            channelsVerified.push({
              id: chId,
              accessible: false,
              error: e.message
            });
          }
        }
      }

      storage.saveDiscordConfig({ connected: true });
      return {
        success: true,
        message: `Connected successfully as Discord Bot: ${botUser.username}#${botUser.discriminator || '0'} (ID: ${botUser.id}).${channelsVerified.length > 0 ? ` ${channelsVerified.filter((c) => c.accessible).length}/${channelsVerified.length} channels verified.` : ' Add Channel IDs below to monitor message discussions.'}`,
        botUser: {
          username: botUser.username,
          id: botUser.id,
          discriminator: botUser.discriminator
        },
        channelsVerified
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Discord connection network error: ${err.message || String(err)}`
      };
    }
  }

  /**
   * Collect raw discussion messages and threads across configured Discord channels.
   */
  public async collect(_targetTopics?: string[]): Promise<CollectorResult[]> {
    const config = storage.getDiscordConfig();
    const results: CollectorResult[] = [];
    const botToken = (config.botToken || '').replace(/^Bot\s+/i, '').trim();

    if (!botToken) {
      return [
        this.makeStatus(
          'Discord',
          'Bot Client',
          'https://discord.com',
          'UNAVAILABLE',
          [],
          {
            notes: 'Discord Bot Token not configured in Settings. Add your Bot Token to collect discussions.'
          }
        )
      ];
    }

    const headers = {
      Authorization: `Bot ${botToken}`,
      'User-Agent': 'DiscordBot (AS-Radar-X, 2.0)'
    };

    const timeframeMs = (config.timeframe === '7d' ? 7 * 86400 : 24 * 3600) * 1000;
    const cutoffTime = Date.now() - timeframeMs;

    let totalCollected = 0;

    // Gather all channels to inspect
    const channelTargets: Array<{ guildId: string; channelId: string; label?: string }> = [];
    for (const g of config.guilds || []) {
      for (const ch of g.channels || []) {
        const chId = typeof ch === 'string' ? ch : ch.id;
        const chName = typeof ch === 'string' ? '' : ch.name;
        if (chId) {
          channelTargets.push({
            guildId: g.id || '',
            channelId: chId,
            label: chName ? `#${chName}` : `channel-${chId}`
          });
        }
      }
    }

    if (channelTargets.length === 0) {
      return [
        this.makeStatus(
          'Discord',
          'Configured Channels',
          'https://discord.com',
          'EMPTY',
          [],
          {
            notes: 'Discord Bot is connected, but no Channel IDs have been added yet in Settings.'
          }
        )
      ];
    }

    for (const target of channelTargets) {
      const subSource = `Discord ${target.label || target.channelId}`;
      const channelUrl = target.guildId
        ? `https://discord.com/channels/${target.guildId}/${target.channelId}`
        : `https://discord.com/channels/@me/${target.channelId}`;

      try {
        const chRes = await fetch(`https://discord.com/api/v10/channels/${target.channelId}/messages?limit=100`, {
          headers
        });

        if (!chRes.ok) {
          const errText = await chRes.text();
          results.push(
            this.makeStatus(
              'Discord',
              subSource,
              channelUrl,
              chRes.status === 403 ? 'BLOCKED' : 'ERROR',
              [],
              {
                error: `HTTP ${chRes.status}: ${errText.slice(0, 120)}`,
                notes: chRes.status === 403 ? 'Bot lacks permission to View Channel / Read Message History' : 'Discord API error'
              }
            )
          );
          continue;
        }

        const messages: any[] = await chRes.json();
        const evidenceItems: RawEvidence[] = [];

        for (const msg of messages) {
          if (!msg || !msg.content || msg.author?.bot) continue;

          const msgTime = Date.parse(msg.timestamp);
          const inWindow = !isNaN(msgTime) && (msgTime >= cutoffTime || messages.indexOf(msg) < 5);
          if (!inWindow) continue;

          const cleanedContent = cleanText(msg.content);
          if (cleanedContent.length < 10) continue;

          if (config.collectMessages) {
            const keywords = extractTokens(cleanedContent);
            evidenceItems.push({
              source: 'Discord',
              url: `${channelUrl}/${msg.id}`,
              collected_at: new Date().toISOString(),
              evidence_type: 'message',
              raw_title: `Discord ${target.label} discussion: ${cleanedContent.slice(0, 75)}`,
              raw_description: cleanedContent,
              raw_keywords: keywords,
              metadata: {
                guildId: target.guildId,
                channelId: target.channelId,
                channelLabel: target.label,
                messageId: msg.id,
                author: msg.author?.username,
                timestamp: msg.timestamp
              }
            });
          }

          // Collect threads if thread exists and enabled
          if (config.collectThreads && msg.thread && evidenceItems.length <= 25) {
            try {
              const threadRes = await fetch(`https://discord.com/api/v10/channels/${msg.thread.id}/messages?limit=25`, {
                headers
              });
              if (threadRes.ok) {
                const threadMessages: any[] = await threadRes.json();
                for (const tMsg of threadMessages) {
                  if (!tMsg.content || tMsg.author?.bot) continue;
                  const tContent = cleanText(tMsg.content);
                  if (tContent.length < 10) continue;

                  evidenceItems.push({
                    source: 'Discord',
                    url: `https://discord.com/channels/${target.guildId}/${msg.thread.id}/${tMsg.id}`,
                    collected_at: new Date().toISOString(),
                    evidence_type: 'thread_message',
                    raw_title: `Discord thread reply: ${tContent.slice(0, 75)}`,
                    raw_description: tContent,
                    raw_keywords: extractTokens(tContent),
                    metadata: {
                      guildId: target.guildId,
                      channelId: target.channelId,
                      threadId: msg.thread.id,
                      author: tMsg.author?.username,
                      timestamp: tMsg.timestamp
                    }
                  });
                }
              }
            } catch {
              // Non-blocking thread fetch
            }
          }
        }

        totalCollected += evidenceItems.length;

        results.push(
          this.makeStatus(
            'Discord',
            subSource,
            channelUrl,
            evidenceItems.length > 0 ? 'AVAILABLE' : 'EMPTY',
            evidenceItems,
            {
              notes: `${evidenceItems.length} messages collected in ${config.timeframe} window`
            }
          )
        );
      } catch (err: any) {
        results.push(
          this.makeStatus(
            'Discord',
            subSource,
            channelUrl,
            'ERROR',
            [],
            {
              error: err.message,
              notes: 'Failed connecting to Discord Channel'
            }
          )
        );
      }
    }

    storage.updateDiscordStats(totalCollected, results.some((r) => r.status === 'AVAILABLE'));
    return results;
  }
}
