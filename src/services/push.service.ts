import type { Bindings } from '../types';
import type { PushSubscription } from '@block65/webcrypto-web-push';

interface PushMessage {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export class PushService {
  constructor(private env: Bindings) {}

  /**
   * Send a push notification to a single browser subscription
   */
  async sendPush(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    message: PushMessage
  ): Promise<{ success: boolean; error?: string }> {
    const publicKey = this.env.VAPID_PUBLIC_KEY;
    const privateKey = this.env.VAPID_PRIVATE_KEY;
    const subject = this.env.VAPID_SUBJECT || 'mailto:admin@newshaberglobal.com';

    if (!publicKey || !privateKey) {
      return { success: false, error: 'VAPID keys not configured' };
    }

    try {
      const { buildPushPayload } = await import('@block65/webcrypto-web-push');

      const payload = await buildPushPayload(
        {
          data: {
            title: message.title,
            body: message.body,
            url: message.url || 'https://newshaberglobal.vercel.app',
            icon: message.icon || '/icons/icon-192.png',
            badge: message.badge || '/icons/icon-192.png',
            tag: message.tag || 'news',
            requireInteraction: message.requireInteraction ?? true,
          },
          options: {
            ttl: 60 * 60 * 24, // 24 hours
            urgency: 'normal' as const,
          },
        },
        subscription as PushSubscription,
        { publicKey, privateKey, subject }
      );

      const bodyBuffer = payload.body as unknown as ArrayBuffer;

      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'authorization': payload.headers['authorization'] as string,
          'crypto-key': payload.headers['crypto-key'] as string,
          'encryption': payload.headers['encryption'] as string,
          'content-encoding': 'aesgcm',
          'content-type': 'application/octet-stream',
          'content-length': bodyBuffer.byteLength.toString(),
          'ttl': (payload.headers['ttl'] as string) || '86400',
          ...(payload.headers['topic'] ? { 'topic': payload.headers['topic'] as string } : {}),
        },
        body: bodyBuffer,
      });

      if (response.ok || response.status === 201) {
        return { success: true };
      }

      // 410 = subscription expired, 404 = subscription not found
      if (response.status === 410 || response.status === 404) {
        return { success: false, error: 'subscription_expired' };
      }

      const errorText = await response.text();
      return { success: false, error: `push_error_${response.status}: ${errorText}` };
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown push error' };
    }
  }

  /**
   * Send push notifications to multiple subscriptions
   * Returns count of successful sends and list of expired subscriptions
   */
  async sendBulkPush(
    subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
    message: PushMessage
  ): Promise<{ sent: number; failed: number; expiredEndpoints: string[] }> {
    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.sendPush(sub, message))
    );

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          sent++;
        } else {
          failed++;
          if (result.value.error === 'subscription_expired') {
            expiredEndpoints.push(subscriptions[idx].endpoint);
          }
        }
      } else {
        failed++;
      }
    });

    return { sent, failed, expiredEndpoints };
  }
}
