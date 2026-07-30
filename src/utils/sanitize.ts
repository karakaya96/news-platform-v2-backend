/**
 * Input sanitization utilities — XSS/katman korumasi
 */

/**
 * Plain text sanitize — kullanici adi, yorum gibi text alanlarini temizler.
 * HTML tag'lerini tamamen kaldirir, entity'leri escape eder.
 */
export function sanitizeText(input: string | null | undefined, maxLen: number = 5000): string {
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
  email = email.trim().toLowerCase();

  // Basit email format kontrolu
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return null;

  // Header injection temizlik
  if (email.includes('\\n') || email.includes('\\r')) return null;

  return email;
}

/**
 * URL dogrulama — sadece http(s) ve relative URL'lere izin verir
 */
export function sanitizeUrl(url: string): string | null {
  if (!url) return null;
  url = url.trim();

  // Relative URL'ler izinli
  if (url.startsWith('/') || url.startsWith('#')) {
    return url;
  }

  // Sadece http/https
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
  } catch {
    // invalid URL
  }

  return null;
}
