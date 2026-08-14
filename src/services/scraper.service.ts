import { generateSlug } from '../utils/validation';

export interface ScrapedNews {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  image_url: string | null;
  category_id: number;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

// Turkish keywords for category detection
const CATEGORY_KEYWORDS: Record<number, string[]> = {
  4: ['spor', 'futbol', 'basketbol', 'voleybol', 'tenis', 'maç', 'gol', 'şampiyon', 'lig', 'takım', 'fc', 'gs', 'fb', 'bjk'],
  8: ['politika', 'siyaset', 'parti', 'seçim', 'meclis', 'hükümet', 'bakan', 'cumhurbaşkanı', 'milletvekili', 'akp', 'chp', 'hdp', 'mhp'],
  3: ['ekonomi', 'borsa', 'dolar', 'euro', 'faiz', 'enflasyon', 'bütçe', 'ticaret', 'ihracat', 'ithalat'],
  1: ['teknoloji', 'bilgisayar', 'yazılım', 'yapay zeka', 'robot', 'apple', 'samsung', 'microsoft', 'google', 'internet', 'mobil', 'telefon', 'ai', 'blockchain', 'kripto'],
  2: ['dünya', 'uluslararası', 'avrupa', 'abd', 'amerika', 'çin', 'rusya', 'ukrayna', 'israil', 'filistin', 'savaş', 'barış', 'nato', 'bm', 'ab'],
  5: ['bilim', 'keşif', 'uzay', 'nasa', 'mars', 'araştırma', 'buluş'],
  6: ['sağlık', 'hastane', 'doktor', 'hastalık', 'tedavi', 'aşı', 'pandemi', 'virüs', 'kanser'],
  7: ['kültür', 'sanat', 'müzik', 'film', 'sinema', 'tiyatro', 'kitap', 'festival', 'oyuncu', 'şarkı', 'dizi'],
};

// Turkish stop words for keyword extraction
const STOP_WORDS = new Set([
  'bir', 'bu', 'şu', 'ile', 've', 'ama', 'fakat', 'çünkü', 'ki',
  'da', 'de', 'mi', 'mu', 'mı', 'mü', 'için', 'gibi', 'daha',
  'en', 'çok', 'az', 'var', 'yok', 'olan', 'oldu', 'olur',
  'her', 'tüm', 'bütün', 'kendi', 'sadece', 'ancak', 'sonra',
  'önce', 'arasında', 'tarafından', 'nedeniyle', 'göre', 'karşı', 'kadar',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need',
  'and', 'but', 'or', 'not', 'no', 'yes', 'if', 'then', 'else',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'it', 'its', 'he', 'she', 'they', 'them', 'his', 'her', 'their',
  'we', 'our', 'you', 'your', 'me', 'my', 'us',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'about', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'once',
]);

export class ScraperService {
  private abortController: AbortController;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(timeoutMs = 30000) {
    this.abortController = new AbortController();
    this.timeoutId = setTimeout(() => this.abortController.abort(), timeoutMs);
  }

  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  async fetchAndParse(url: string): Promise<ScrapedNews> {
    try {
      const html = await this.fetchPage(url);
      const title = this.extractTitle(html);
      const excerpt = this.extractDescription(html);
      const image_url = this.extractImage(html);
      const content = this.extractContent(html);
      const category_id = this.detectCategory(title, content);
      const seo = this.generateSeo(title, excerpt, content);
      const slug = generateSlug(title);

      return {
        title,
        slug,
        excerpt: excerpt || content.substring(0, 200),
        content,
        image_url,
        category_id,
        seo_title: seo.seo_title,
        seo_description: seo.seo_description,
        seo_keywords: seo.seo_keywords,
      };
    } finally {
      this.cleanup();
    }
  }

  private async fetchPage(url: string): Promise<string> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
    };

    const response = await fetch(url, {
      headers,
      signal: this.abortController.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  private extractTitle(html: string): string {
    // 1. Try <h1> tag
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    if (h1Match) {
      const t = this.cleanText(this.stripHtml(h1Match[1]));
      if (t.length > 10) return t;
    }

    // 2. Try <title> tag
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/s);
    if (titleMatch) {
      const t = this.cleanText(titleMatch[1]);
      const separators = [' | ', ' - ', ' :: ', ' — ', ' – '];
      for (const sep of separators) {
        const parts = t.split(sep);
        if (parts.length >= 2 && parts[0].trim().length > 10) {
          return parts[0].trim();
        }
      }
      if (t.length > 10) return t;
    }

    // 3. Try og:title
    const ogTitle = this.extractMeta(html, 'og:title', 'twitter:title');
    if (ogTitle) return this.cleanText(ogTitle);

    return '';
  }

  private extractDescription(html: string): string {
    const desc = this.extractMeta(html, 'og:description', 'description', 'twitter:description');
    return this.cleanText(desc);
  }

  private extractImage(html: string): string | null {
    const img = this.extractMeta(html, 'og:image', 'twitter:image', 'twitter:image:src');
    if (img) {
      if (img.startsWith('//')) return 'https:' + img;
      return img;
    }
    return null;
  }

  private extractContent(html: string): string {
    // 1. Try JSON-LD
    const jsonLdContent = this.extractFromJsonLd(html);
    if (jsonLdContent && jsonLdContent.length > 100) {
      return jsonLdContent.substring(0, 8000);
    }

    // 2. Try <article> tag
    const articleMatch = html.match(/<article[^>]*>(.*?)<\/article>/s);
    if (articleMatch) {
      const content = this.sanitizeContent(articleMatch[1]);
      if (content.length > 100) return content.substring(0, 8000);
    }

    // 3. Try <p> tags
    const paragraphs = html.match(/<p[^>]*>(.*?)<\/p>/gs) || [];
    const content = paragraphs
      .map(p => this.cleanText(this.stripHtml(p)))
      .filter(p => p.length > 40)
      .join('\n\n');

    return content.substring(0, 8000) || '';
  }

  private extractFromJsonLd(html: string): string {
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gs;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data && data['@type'] === 'NewsArticle' && data.articleBody) {
          return data.articleBody;
        }
      } catch {
        continue;
      }
    }
    return '';
  }

  private extractMeta(html: string, ...keys: string[]): string {
    for (const key of keys) {
      // Property first
      const pattern1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
      const match1 = html.match(pattern1);
      if (match1) return this.unescapeHtml(match1[1]);

      // Content first
      const pattern2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
      const match2 = html.match(pattern2);
      if (match2) return this.unescapeHtml(match2[1]);
    }
    return '';
  }

  private detectCategory(title: string, content: string): number {
    const text = `${title} ${content.substring(0, 1000)}`.toLowerCase();
    const scores: Record<number, number> = {};

    for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        const count = (text.match(new RegExp(kw.toLowerCase(), 'g')) || []).length;
        if (count) {
          score += title.toLowerCase().includes(kw.toLowerCase()) ? count * 3 : count;
        }
      }
      if (score > 0) scores[Number(catId)] = score;
    }

    if (Object.keys(scores).length > 0) {
      return Number(Object.keys(scores).reduce((a, b) => scores[Number(a)] > scores[Number(b)] ? a : b));
    }
    return 2; // Default: World News
  }

  private generateSeo(title: string, excerpt: string, content: string): { seo_title: string; seo_description: string; seo_keywords: string } {
    const seo_title = title.length > 60 ? title.substring(0, 60) : title;

    const descSource = excerpt || content.substring(0, 300);
    const seo_description = descSource.length > 160 ? descSource.substring(0, 160) : descSource;

    const keywords = this.extractKeywords(title, content);

    return {
      seo_title,
      seo_description,
      seo_keywords: keywords.join(', '),
    };
  }

  private extractKeywords(title: string, content: string): string[] {
    const text = `${title} ${content}`.toLowerCase()
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o');

    const words = text.match(/\b[a-zçğıöşü]{3,}\b/g) || [];
    const freq: Record<string, number> = {};

    for (const w of words) {
      if (!STOP_WORDS.has(w) && w.length >= 3) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w);
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '');
  }

  private cleanText(text: string): string {
    return this.unescapeHtml(text).replace(/\s+/g, ' ').trim();
  }

  private unescapeHtml(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#039;/g, "'");
  }

  private sanitizeContent(html: string): string {
    let text = html;

    // Remove script/style tags
    text = text.replace(/<script[^>]*>.*?<\/script>/gs, '');
    text = text.replace(/<style[^>]*>.*?<\/style>/gs, '');

    // Convert <br> to newlines
    text = text.replace(/<br\s*\/?>/g, '\n');

    // Convert <p> to double newlines
    text = text.replace(/<\/p[^>]*>/g, '\n\n');

    // Convert <h1>-<h6> to bold text
    text = text.replace(/<\/h[1-6][^>]*>/g, '\n\n');

    // Convert <li> to bullet points
    text = text.replace(/<li[^>]*>/g, '\n• ');

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = this.unescapeHtml(text);

    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }
}
