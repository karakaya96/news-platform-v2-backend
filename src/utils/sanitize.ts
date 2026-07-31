/**
 * Input sanitization utilities — XSS/katman korumasi
 */

/**
 * Plain text sanitize — kullanici adi, yorum gibi text alanlarini temizler.
 * HTML tag'lerini tamamen kaldirir, entity'leri escape eder.
 */
export function sanitizeText(input: string | null | undefined, maxLen = 5000): string {
  if (!input) return '';

  // 1. HTML tag'lerini tamamen strip et
  let text = input.replace(/<[^>]*>/g, '');

  // 2. Zarali karakterleri escape et
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // 3. Null byte temizlik
  text = text.replace(/\\0/g, '');

  // 4. Maksimum uzunluk
  return text.substring(0, maxLen);
}

/**
 * Email dogrulama ve temizleme
 */
export function sanitizeEmail(email: string): string | null {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  // Basit email format kontrolu
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) return null;

  // Header injection temizlik
  if (cleanEmail.includes('\n') || cleanEmail.includes('\r')) return null;

  return cleanEmail;
}

/**
 * URL dogrulama — sadece http(s) ve relative URL'lere izin verir
 */
export function sanitizeUrl(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();

  // Relative URL'ler izinli
  if (cleanUrl.startsWith('/') || cleanUrl.startsWith('#')) {
    return cleanUrl;
  }

  // Sadece http/https
  try {
    const u = new URL(cleanUrl);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
  } catch {
    // invalid URL
    return null;
  }
  return null;
}
