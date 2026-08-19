export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fromEmail: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
}

export class GmailService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private config: GmailConfig) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail token hatası: ${res.status} - ${err}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      const fromName = params.fromName || 'NewsHaberGlobal';

      const boundary = 'boundary_' + Date.now().toString(36);
      const rawEmail = [
        `From: ${fromName} <${this.config.fromEmail}>`,
        `To: ${params.to}`,
        `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        params.replyTo ? `Reply-To: ${params.replyTo}` : '',
        '',
        params.html,
      ]
        .filter(Boolean)
        .join('\r\n');

      const encodedMessage = btoa(unescape(encodeURIComponent(rawEmail)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedMessage }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Gmail API hatası: ${res.status} - ${err}` };
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Bilinmeyen hata' };
    }
  }
}
