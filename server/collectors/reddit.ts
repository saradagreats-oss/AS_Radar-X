import { BaseCollector, CollectorResult } from './base.js';
import { storage } from '../storage/database.js';
import { cleanText, extractTokens } from '../normalization/textNormalizer.js';
import type { RawEvidence, RedditConfig } from '../types.js';

export class RedditCollector extends BaseCollector {
  public readonly name = 'Reddit' as const;

  /**
   * Test connection using provided or stored Reddit credentials.
   */
  public async testConnection(credentials?: {
    clientId?: string;
    clientSecret?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; message: string; details?: any }> {
    const stored = storage.getRedditConfig();
    const clientId = (credentials?.clientId || stored.clientId || '').trim();
    let clientSecret = (credentials?.clientSecret || stored.clientSecret || '').trim();
    if (clientSecret === '••••••••' || clientSecret.includes('••')) {
      clientSecret = stored.clientSecret;
    }
    const userAgent = (credentials?.userAgent || stored.userAgent || 'AS-Radar-X/2.0 (by /u/saradagreats)').trim();

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message: 'Client ID and Client Secret are required to test Reddit API connection.'
      };
    }

    try {
      const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'User-Agent': userAgent,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return {
          success: false,
          message: `Reddit Authentication failed (HTTP ${tokenRes.status}): ${errText || 'Invalid credentials'}`
        };
      }

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return {
          success: false,
          message: `Reddit did not return an access token: ${tokenData.error || 'Unknown error'}`
        };
      }

      // Verify OAuth read capability by querying subreddit metadata
      const verifyRes = await fetch('https://oauth.reddit.com/r/StockPhotography/about', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'User-Agent': userAgent
        }
      });

      if (verifyRes.ok) {
        storage.saveRedditConfig({ connected: true });
        return {
          success: true,
          message: 'Reddit API OAuth connection verified successfully. Access token granted.',
          details: {
            tokenType: tokenData.token_type,
            expiresIn: tokenData.expires_in,
            userAgent
          }
        };
      } else {
        const verifyText = await verifyRes.text();
        return {
          success: false,
          message: `OAuth token obtained, but API request returned HTTP ${verifyRes.status}: ${verifyText.slice(0, 150)}`
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Reddit connection network error: ${err.message || String(err)}`
      };
    }
  }

  /**
   * Helper to obtain an OAuth access token if credentials exist.
   */
  private async getAccessToken(config: RedditConfig): Promise<string | null> {
    if (!config.clientId || !config.clientSecret) return null;
    try {
      const authHeader = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
      const res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'User-Agent': config.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (res.ok) {
        const data = await res.json();
        return data.access_token || null;
      }
    } catch (err) {
      console.warn('Failed obtaining Reddit OAuth access token:', err);
    }
    return null;
  }

  /**
   * Collect raw discussion posts and comments across configured subreddits.
   */
  public async collect(_targetTopics?: string[]): Promise<CollectorResult[]> {
    const config = storage.getRedditConfig();
    const results: CollectorResult[] = [];
    const subreddits = config.subreddits && config.subreddits.length > 0 ? config.subreddits : ['StockPhotography'];
    const timeframeSeconds = config.timeframe === '7d' ? 7 * 86400 : 24 * 3600;
    const cutoffUtc = Math.floor(Date.now() / 1000) - timeframeSeconds;

    const accessToken = await this.getAccessToken(config);
    const hasAuth = !!accessToken;

    let totalCollected = 0;

    for (const rawSub of subreddits) {
      const sub = rawSub.replace(/^r\//i, '').trim();
      if (!sub) continue;

      const subSource = `r/${sub}`;
      const url = hasAuth
        ? `https://oauth.reddit.com/r/${sub}/hot?limit=25`
        : `https://www.reddit.com/r/${sub}/hot.json?limit=25`;

      const headers: Record<string, string> = {
        'User-Agent': config.userAgent || 'AS-Radar-X/2.0 (by /u/saradagreats)'
      };
      if (hasAuth) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errText = await res.text();
          results.push(
            this.makeStatus(
              'Reddit',
              subSource,
              `https://reddit.com/r/${sub}`,
              res.status === 403 || res.status === 429 ? 'BLOCKED' : 'ERROR',
              [],
              {
                error: `HTTP ${res.status}: ${errText.slice(0, 120)}`,
                notes: hasAuth ? 'OAuth rate limit or permission error' : 'Public rate limit. Configure Reddit Client ID & Secret in Settings.'
              }
            )
          );
          continue;
        }

        const data = await res.json();
        const posts = data?.data?.children || [];
        const evidenceItems: RawEvidence[] = [];

        for (const p of posts) {
          const postData = p?.data;
          if (!postData || postData.stickied) continue;

          const createdUtc = postData.created_utc || 0;
          // Timeframe filter (or keep top if window is too quiet)
          const inWindow = createdUtc >= cutoffUtc || posts.indexOf(p) < 4;
          if (!inWindow) continue;

          // Collect post discussion
          if (config.collectPosts) {
            const rawTitle = cleanText(postData.title || '');
            const rawDesc = cleanText(postData.selftext || '');
            const keywords = extractTokens(`${rawTitle} ${rawDesc}`);

            evidenceItems.push({
              source: 'Reddit',
              url: `https://reddit.com${postData.permalink}`,
              collected_at: new Date().toISOString(),
              evidence_type: 'post',
              raw_title: rawTitle,
              raw_description: rawDesc,
              raw_keywords: keywords,
              metadata: {
                subreddit: sub,
                score: postData.score,
                num_comments: postData.num_comments,
                created_utc: createdUtc,
                author: postData.author,
                upvote_ratio: postData.upvote_ratio
              }
            });
          }

          // Collect comment discussions for top posts if enabled
          if (config.collectComments && postData.num_comments > 0 && evidenceItems.length <= 15) {
            try {
              const commentsUrl = hasAuth
                ? `https://oauth.reddit.com/r/${sub}/comments/${postData.id}?limit=10&depth=1`
                : `https://www.reddit.com/r/${sub}/comments/${postData.id}.json?limit=10&depth=1`;

              const cRes = await fetch(commentsUrl, { headers });
              if (cRes.ok) {
                const cData = await cRes.json();
                const commentList = cData?.[1]?.data?.children || [];

                for (const c of commentList) {
                  const comm = c?.data;
                  if (!comm || !comm.body || comm.body === '[deleted]' || comm.body === '[removed]') continue;
                  if (comm.author === 'AutoModerator') continue;

                  const bodyText = cleanText(comm.body);
                  if (bodyText.length < 15) continue;

                  evidenceItems.push({
                    source: 'Reddit',
                    url: `https://reddit.com${comm.permalink || postData.permalink}`,
                    collected_at: new Date().toISOString(),
                    evidence_type: 'comment',
                    raw_title: `r/${sub} discussion on: ${postData.title.slice(0, 70)}`,
                    raw_description: bodyText,
                    raw_keywords: extractTokens(bodyText),
                    metadata: {
                      subreddit: sub,
                      postId: postData.id,
                      postTitle: postData.title,
                      score: comm.score,
                      author: comm.author
                    }
                  });
                }
              }
            } catch {
              // Non-blocking comment fetch
            }
          }
        }

        totalCollected += evidenceItems.length;

        results.push(
          this.makeStatus(
            'Reddit',
            subSource,
            `https://reddit.com/r/${sub}`,
            evidenceItems.length > 0 ? 'AVAILABLE' : 'EMPTY',
            evidenceItems,
            {
              notes: `${evidenceItems.length} discussions collected in ${config.timeframe} window (${hasAuth ? 'OAuth' : 'Public Feed'})`
            }
          )
        );
      } catch (err: any) {
        results.push(
          this.makeStatus(
            'Reddit',
            subSource,
            `https://reddit.com/r/${sub}`,
            'ERROR',
            [],
            {
              error: err.message,
              notes: 'Failed connecting to Reddit API'
            }
          )
        );
      }
    }

    storage.updateRedditStats(totalCollected, results.some((r) => r.status === 'AVAILABLE'));
    return results;
  }
}
