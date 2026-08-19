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
  } = params;

  const categoryName = category || 'Gündem';

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

  // News email template
  const imageSection = imageUrl
    ? `<tr><td style="padding:0">
        <img src="${imageUrl}" alt="${title}" style="width:100%;height:auto;display:block;max-height:320px;object-fit:cover" />
      </td></tr>`
    : '';

  const categorySection = category
    ? `<span style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">${categoryName}</span>`
    : '';

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" style="border-collapse:collapse">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" style="max-width:600px;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);padding:24px 32px">
          <a href="${siteUrl}" style="text-decoration:none">
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px">${siteName}</h1>
          </a>
        </td></tr>

        <!-- Image -->
        ${imageSection}

        <!-- Content -->
        <tr><td style="padding:32px">
          ${categorySection}
          <h2 style="color:#1e293b;margin:16px 0 12px;font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.3px">
            <a href="${articleUrl}" style="color:#1e293b;text-decoration:none">${title}</a>
          </h2>
          ${excerpt ? `<p style="color:#64748b;font-size:15px;line-height:1.7;margin:0 0 24px">${excerpt}</p>` : ''}
          <a href="${articleUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 4px 12px rgba(99,102,241,0.4)">Haberi Oku →</a>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0" /></td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 32px;text-align:center">
          <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 8px">
            Bu e-postayı "${categoryName}" kategorisine abone olduğunuz için aldınız.
          </p>
          <a href="${unsubscribeUrl}" style="color:#ef4444;text-decoration:none;font-size:13px;font-weight:500">Aboneliği İptal Et</a>
          <p style="color:#cbd5e1;font-size:12px;margin:16px 0 0">
            <a href="${siteUrl}" style="color:#6366f1;text-decoration:none">${siteName}</a> © ${new Date().getFullYear()}
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
