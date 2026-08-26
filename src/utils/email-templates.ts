interface EmailTemplateParams {
  title: string;
  excerpt?: string | null;
  imageUrl?: string | null;
  articleUrl: string;
  category?: string | null;
  siteUrl: string;
  siteName?: string;
  unsubscribeUrl: string;
  type?: 'news' | 'welcome' | 'unsubscribe';
  publishedAt?: string | null;
  authorName?: string | null;
  timezone?: string;
}

export function buildNewsEmailTemplate(params: EmailTemplateParams): string {
  const {
    title,
    excerpt,
    imageUrl,
    articleUrl,
    category,
    siteUrl,
    siteName = 'NewsHaberGlobal',
    unsubscribeUrl,
    type = 'news',
    publishedAt,
    authorName,
    timezone = 'Europe/Istanbul',
  } = params;

  const categoryName = category || 'Gündem';

  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      })
    : new Date().toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });

  const categorySection = category
    ? `<span style="display:inline-block;background:#dc2626;color:#fff;padding:5px 14px;border-radius:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-family:-apple-system,sans-serif">${categoryName}</span>`
    : '';

  if (type === 'welcome') {
    return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" style="border-collapse:collapse">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" style="max-width:600px;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);padding:40px 32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px">${siteName}</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">Güvenilir Haber Kaynağınız</p>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center">
          <div style="width:64px;height:64px;background:#ecfdf5;border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:32px">✅</div>
          <h2 style="color:#1e293b;margin:0 0 16px;font-size:22px;font-weight:600">Aboneliğiniz Onaylandı!</h2>
          <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">Artık yeni haberler yayınlandığında e-posta ile bilgilendirileceksiniz.</p>
          <a href="${siteUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 4px 12px rgba(99,102,241,0.4)">Siteyi Ziyaret Et →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center">
          <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:none;font-size:13px">Aboneliği İptal Et</a>
          <p style="color:#cbd5e1;font-size:12px;margin:12px 0 0">${siteName} © ${new Date().getFullYear()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  if (type === 'unsubscribe') {
    return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" style="border-collapse:collapse">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" style="max-width:600px;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);padding:40px 32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px">${siteName}</h1>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center">
          <div style="width:64px;height:64px;background:#fef2f2;border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:32px">👋</div>
          <h2 style="color:#1e293b;margin:0 0 16px;font-size:22px;font-weight:600">Aboneliğiniz İptal Edildi</h2>
          <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">E-posta bildirimleriniz başarıyla devre dışı bırakıldı.</p>
          <p style="color:#94a3b8;font-size:13px;margin:0">Tekrar abone olmak isterseniz <a href="${siteUrl}/subscribe" style="color:#6366f1">buraya tıklayın</a>.</p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="color:#cbd5e1;font-size:12px;margin:0">${siteName} © ${new Date().getFullYear()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  // Breaking news badge
  const breakingBadge = `<td style="padding:0">
    <table role="presentation" width="100%" style="border-collapse:collapse">
      <tr>
        <td style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 50%,#f97316 100%);padding:12px 32px;text-align:center">
          <span style="color:#fff;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase">⚡ SON DAKİKA</span>
          <span style="color:rgba(255,255,255,0.7);font-size:12px;margin:0 8px">|</span>
          <span style="color:rgba(255,255,255,0.9);font-size:12px;font-weight:500">${formattedDate}</span>
        </td>
      </tr>
    </table>
  </td>`;

  // Hero image with gradient overlay and category badge
  const heroImageSection = imageUrl
    ? `<tr><td style="padding:0;position:relative">
    <table role="presentation" width="100%" style="border-collapse:collapse">
      <tr>
        <td style="position:relative;padding:0;background:#1e293b">
          <img src="${imageUrl}" alt="${title}" style="width:100%;height:auto;display:block;max-height:340px;object-fit:cover" />
          <table role="presentation" style="position:absolute;bottom:0;left:0;right:0;border-collapse:collapse">
            <tr>
              <td style="background:linear-gradient(transparent,rgba(0,0,0,0.7));padding:24px 32px 16px">
                ${categorySection}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>`
    : '';

  // Category badge (standalone for no-image case)
  const categoryBadgeStandalone = !imageUrl && category
    ? `<tr><td style="padding:24px 32px 0">
    ${categorySection}
  </td></tr>`
    : '';

  // Meta row (author + date)
  const metaRow = `<tr><td style="padding:${imageUrl ? '16px 32px 0' : '8px 32px 0'}">
    <table role="presentation" style="border-collapse:collapse">
      <tr>
        ${authorName ? `<td style="padding-right:16px">
          <span style="color:#64748b;font-size:13px;font-weight:500">✍️ ${authorName}</span>
        </td>` : ''}
        <td>
          <span style="color:#94a3b8;font-size:13px">📅 ${formattedDate}</span>
        </td>
      </tr>
    </table>
  </td></tr>`;

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Georgia,'Times New Roman',serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" style="border-collapse:collapse">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" style="max-width:600px;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 25px 65px rgba(0,0,0,0.3),0 4px 20px rgba(0,0,0,0.15)">

        <!-- Brand Header -->
        <tr><td style="background:#fff;padding:20px 32px;border-bottom:3px solid #dc2626">
          <table role="presentation" width="100%" style="border-collapse:collapse">
            <tr>
              <td>
                <a href="${siteUrl}" style="text-decoration:none">
                  <span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.5px">${siteName}</span>
                </a>
              </td>
              <td align="right">
                <span style="font-family:-apple-system,sans-serif;font-size:12px;color:#94a3b8;font-weight:500">${formattedDate}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Breaking News Banner -->
        ${!imageUrl ? breakingBadge : ''}

        <!-- Hero Image -->
        ${heroImageSection}

        <!-- Content -->
        <tr><td style="padding:${imageUrl ? '24px 32px 32px' : '24px 32px 32px'}">

          ${categoryBadgeStandalone}

          <!-- Title -->
          <h1 style="font-family:Georgia,serif;color:#0f172a;margin:${imageUrl ? '16px 0 12px' : '12px 0 12px'};font-size:26px;font-weight:700;line-height:1.25;letter-spacing:-0.3px">
            <a href="${articleUrl}" style="color:#0f172a;text-decoration:none">${title}</a>
          </h1>

          <!-- Meta Row -->
          ${metaRow}

          <!-- Excerpt -->
          ${excerpt ? `<p style="font-family:-apple-system,sans-serif;color:#475569;font-size:15px;line-height:1.7;margin:0 0 24px;font-style:italic;border-left:3px solid #dc2626;padding-left:16px">${excerpt}</p>` : ''}

          <!-- CTA Button -->
          <table role="presentation" style="border-collapse:collapse">
            <tr>
              <td style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);border-radius:12px;box-shadow:0 4px 14px rgba(220,38,38,0.4)">
                <a href="${articleUrl}" style="display:inline-block;padding:16px 40px;font-family:-apple-system,sans-serif;color:#fff;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.3px">HABERİ OKU →</a>
              </td>
            </tr>
          </table>

        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px">
          <div style="border-top:1px solid #e2e8f0"></div>
        </td></tr>

        <!-- Social Proof -->
        <tr><td style="padding:20px 32px;text-align:center">
          <p style="font-family:-apple-system,sans-serif;color:#94a3b8;font-size:12px;margin:0;line-height:1.6">
            Bu haberi ${siteName} aboneleri olarak sizin için seçtik.<br>
            Tüm haberleri takip etmek için <a href="${siteUrl}" style="color:#dc2626;text-decoration:none;font-weight:600">sitemizi ziyaret edin</a>.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="font-family:-apple-system,sans-serif;color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 12px">
            Bu e-postayı "${categoryName}" kategorisine abone olduğunuz için aldınız.
          </p>
          <a href="${unsubscribeUrl}" style="font-family:-apple-system,sans-serif;color:#ef4444;text-decoration:none;font-size:13px;font-weight:600">Aboneliği İptal Et</a>
          <p style="font-family:-apple-system,sans-serif;color:#cbd5e1;font-size:11px;margin:16px 0 0">
            © ${new Date().getFullYear()} <a href="${siteUrl}" style="color:#6366f1;text-decoration:none">${siteName}</a>. Tüm hakları saklıdır.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

interface ConfirmationEmailParams {
  email: string;
  siteUrl: string;
  siteName?: string;
  categories?: string[];
  unsubscribeUrl: string;
}

export function buildConfirmationEmailTemplate(params: ConfirmationEmailParams): string {
  const { email, siteUrl, siteName = 'NewsHaberGlobal', categories, unsubscribeUrl } = params;

  const categoryText = categories && categories.length > 0 ? categories.join(', ') : 'Tümü';

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" style="border-collapse:collapse">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" style="max-width:600px;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);padding:40px 32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px">${siteName}</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">Güvenilir Haber Kaynağınız</p>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center">
          <div style="width:64px;height:64px;background:#ecfdf5;border-radius:50%;margin:0 auto 24px;display:inline-flex;align-items:center;justify-content:center;font-size:32px">✅</div>
          <h2 style="color:#1e293b;margin:0 0 16px;font-size:22px;font-weight:600">Aboneliğiniz Onaylandı!</h2>
          <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">Merhaba, ${siteName} e-posta bildirim aboneliğiniz başarıyla oluşturuldu.</p>
          <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;text-align:left">
            <p style="color:#475569;font-size:14px;margin:0 0 8px"><strong>📬 E-posta:</strong> ${email}</p>
            <p style="color:#475569;font-size:14px;margin:0"><strong>📂 Kategoriler:</strong> ${categoryText}</p>
          </div>
          <a href="${siteUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 4px 12px rgba(99,102,241,0.4)">Siteyi Ziyaret Et →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center">
          <a href="${unsubscribeUrl}" style="color:#ef4444;text-decoration:none;font-size:13px;font-weight:500">Aboneliği İptal Et</a>
          <p style="color:#cbd5e1;font-size:12px;margin:12px 0 0">${siteName} © ${new Date().getFullYear()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
