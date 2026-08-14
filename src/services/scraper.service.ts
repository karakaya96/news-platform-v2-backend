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

// Skip keywords for content image filtering
const IMAGE_SKIP_KEYWORDS = [
  'logo', 'icon', 'avatar', 'button', 'sprite', 'advert',
  'banner', 'pixel', 'tracker', 'placeholder', 'loading',
  'emoji', 'favicon', 'apple-touch', 'android-chrome',
  'gravatar', 'social', 'share-', 'rating', 'star.',
  'badge', 'arrow', 'close.', 'menu.', 'nav.',
  'thumbnail-small', 'featured-image-small',
];

export class ScraperService {
  private abortController: AbortController;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private baseUrl: string = '';

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
      this.baseUrl = url;
      const html = await this.fetchPage(url);
      const title = this.extractTitle(html);
      const excerpt = this.extractDescription(html);
      const image_url = this.extractImage(html);

      // Extract content images and videos
      const contentImages = this.extractImages(html);
      const videos = this.detectVideos(html);

      // Extract content (preserving HTML)
      let content = this.extractContent(html);

      // Embed images between paragraphs
      if (contentImages.length > 0) {
        content = this.embedImagesInContent(content, contentImages);
      }

      // Append videos at the end
      if (videos.length > 0) {
        const videoHtml = videos.map(v => this.generateVideoEmbed(v)).join('\n\n');
        content = `${content}\n\n${videoHtml}`;
      }

      const category_id = this.detectCategory(title, content);
      const seo = this.generateSeo(title, excerpt, content);
      const slug = generateSlug(title);

      return {
        title,
        slug,
        excerpt: excerpt || this.stripHtml(content).substring(0, 200),
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

  // ── Image extraction ──

  private extractImages(html: string): string[] {
    const allUrls: string[] = [];

    // 1. <img src="..."> tags
    const imgSrcRegex = /<img[^>]+src="([^"]+)"/gi;
    let match;
    while ((match = imgSrcRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1].trim());
      if (url && this.isContentImage(url, html)) {
        allUrls.push(url);
      }
    }

    // 2. srcset (pick largest)
    const imgSrcsetRegex = /<img[^>]+srcset="([^"]+)"/gi;
    while ((match = imgSrcsetRegex.exec(html)) !== null) {
      const parts = match[1].split(',').map(s => s.trim());
      for (const part of parts.reverse()) {
        const urlPart = part.split(/\s+/)[0]?.trim() || '';
        const url = this.resolveUrl(urlPart);
        if (url && this.isContentImage(url, html) && !allUrls.includes(url)) {
          allUrls.push(url);
          break;
        }
      }
    }

    // 3. data-src (lazy loading)
    const dataSrcRegex = /<img[^>]+data-src="([^"]+)"/gi;
    while ((match = dataSrcRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1].trim());
      if (url && this.isContentImage(url, html) && !allUrls.includes(url)) {
        allUrls.push(url);
      }
    }

    // 4. data-original (another lazy pattern)
    const dataOrigRegex = /<img[^>]+data-original="([^"]+)"/gi;
    while ((match = dataOrigRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1].trim());
      if (url && this.isContentImage(url, html) && !allUrls.includes(url)) {
        allUrls.push(url);
      }
    }

    // Deduplicate, max 5
    const seen = new Set<string>();
    const result: string[] = [];
    for (const u of allUrls) {
      if (!seen.has(u)) {
        seen.add(u);
        result.push(u);
      }
      if (result.length >= 5) break;
    }
    return result;
  }

  private isContentImage(url: string, html: string): boolean {
    const urlLower = url.toLowerCase();

    // Skip known non-content patterns
    for (const kw of IMAGE_SKIP_KEYWORDS) {
      if (urlLower.includes(kw)) return false;
    }

    // Skip SVG
    if (urlLower.endsWith('.svg')) return false;

    // Skip data: URIs
    if (urlLower.startsWith('data:')) return false;

    // Check dimensions from URL (e.g., image-80x60.jpg)
    const dimMatch = urlLower.match(/(\d+)x(\d+)/);
    if (dimMatch) {
      const w = parseInt(dimMatch[1], 10);
      const h = parseInt(dimMatch[2], 10);
      if (w < 150 || h < 100) return false;
    }

    // Check valid image extensions
    if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(urlLower)) return false;

    // Check HTML img tag for small dimensions
    const imgTagMatch = html.match(new RegExp(`<img[^>]+src="${this.escapeRegex(url)}"[^>]*>`, 'i'));
    if (imgTagMatch) {
      const tag = imgTagMatch[0];
      const wMatch = tag.match(/width="?(\d+)/);
      const hMatch = tag.match(/height="?(\d+)/);
      if (wMatch && hMatch) {
        const w = parseInt(wMatch[1], 10);
        const h = parseInt(hMatch[1], 10);
        if (w < 120 || h < 80) return false;
      }
      const classMatch = tag.match(/class="([^"]*)"/);
      if (classMatch) {
        const cls = classMatch[1].toLowerCase();
        if (['icon', 'logo', 'avatar', 'thumb', 'small'].some(k => cls.includes(k))) {
          return false;
        }
      }
    }

    return true;
  }

  private embedImagesInContent(content: string, images: string[]): string {
    if (!images.length || !content) return content;

    // Split into paragraphs
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    if (paragraphs.length < 2) {
      // Single paragraph → append at end
      const imgHtml = images
        .map(u => `<img src="${u}" alt="Haber görseli" class="rounded-lg max-w-full my-4" />`)
        .join('\n\n');
      return content + '\n\n' + imgHtml;
    }

    const insertImg = (url: string) =>
      `\n\n<img src="${url}" alt="Haber görseli" class="rounded-lg max-w-full my-4" />\n\n`;

    if (images.length === 1) {
      const pos = Math.max(1, Math.floor(paragraphs.length * 0.4));
      paragraphs.splice(pos, 0, insertImg(images[0]));
    } else if (images.length === 2) {
      const positions = [Math.floor(paragraphs.length * 0.3), Math.floor(paragraphs.length * 0.6)];
      for (let i = 0; i < positions.length; i++) {
        paragraphs.splice(positions[i] + i, 0, insertImg(images[i]));
      }
    } else {
      const step = paragraphs.length / (images.length + 1);
      for (let i = 0; i < images.length; i++) {
        const pos = Math.min(Math.floor(step * (i + 1)) + i, paragraphs.length);
        paragraphs.splice(pos, 0, insertImg(images[i]));
      }
    }

    return paragraphs.join('\n\n');
  }

  // ── Video detection ──

  private detectVideos(html: string): Array<{ type: string; url: string; title: string }> {
    const videos: Array<{ type: string; url: string; title: string }> = [];
    const alreadyHas = (url: string) => videos.some(v => v.url === url);
    const normalize = (u: string) => u.startsWith('//') ? 'https:' + u : u;

    // 1. YouTube iframe
    const ytIframeRegex = /<iframe[^>]*src=["']([^"']*youtube(?:-nocookie)?\.com\/embed\/[^"']*)["'][^>]*>/gi;
    let match;
    while ((match = ytIframeRegex.exec(html)) !== null) {
      const url = normalize(match[1]);
      if (!alreadyHas(url)) videos.push({ type: 'youtube', url, title: '' });
    }

    // YouTube watch link
    const ytWatchRegex = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/g;
    while ((match = ytWatchRegex.exec(html)) !== null) {
      const url = `https://www.youtube.com/watch?v=${match[1]}`;
      if (!alreadyHas(url)) videos.push({ type: 'youtube', url, title: '' });
    }

    // 2. Vimeo iframe
    const vimeoRegex = /<iframe[^>]*src=["']([^"']*player\.vimeo\.com\/video\/[^"']*)["'][^>]*>/gi;
    while ((match = vimeoRegex.exec(html)) !== null) {
      const url = normalize(match[1]);
      if (!alreadyHas(url)) videos.push({ type: 'vimeo', url, title: '' });
    }

    // 3. Dailymotion iframe
    const dmRegex = /<iframe[^>]*src=["']([^"']*dailymotion\.com\/embed\/video\/[^"']*)["'][^>]*>/gi;
    while ((match = dmRegex.exec(html)) !== null) {
      const url = normalize(match[1]);
      if (!alreadyHas(url)) videos.push({ type: 'dailymotion', url, title: '' });
    }

    // 4. <video> tag with src
    const videoTagRegex = /<video[^>]*src="([^"]+)"/gi;
    while ((match = videoTagRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url && !alreadyHas(url)) videos.push({ type: 'mp4', url, title: '' });
    }

    // <source> inside <video>
    const sourceRegex = /<source[^>]+src="([^"]+)"/gi;
    while ((match = sourceRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url && !alreadyHas(url)) videos.push({ type: 'mp4', url, title: '' });
    }

    // 5. data-video-url / video_file / videoUrl (Turkish news sites)
    const dataVideoRegex = /(?:data-video-url|video_file|videoUrl|data-video-src|data-media-url|data-url)=["']([^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/gi;
    while ((match = dataVideoRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url && !alreadyHas(url)) videos.push({ type: 'mp4', url, title: '' });
    }

    // 6. JSON-LD VideoObject
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gs;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data?.['@type'] === 'VideoObject') {
          const url = data.contentUrl || data.embedUrl || '';
          if (url && !alreadyHas(url)) {
            videos.push({ type: 'mp4', url, title: data.name || '' });
          }
        }
      } catch { continue; }
    }

    return videos.slice(0, 3); // max 3 videos
  }

  private generateVideoEmbed(video: { type: string; url: string; title: string }): string {
    const safeUrl = this.escapeHtmlAttr(video.url);
    const safeTitle = this.escapeHtmlAttr(video.title);

    if (video.type === 'mp4') {
      return `<div class="video-embed my-4" style="border-radius:12px;overflow:hidden;"><video controls preload="metadata" style="width:100%;border-radius:12px;"><source src="${safeUrl}" /></video></div>`;
    }

    // iframe-based (youtube, vimeo, dailymotion)
    let embedUrl = safeUrl;
    if (video.type === 'youtube' && safeUrl.includes('watch?v=')) {
      const videoId = safeUrl.split('v=')[1]?.split('&')[0] || '';
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    return `<div class="video-embed my-4" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;background:#0f172a;"><iframe src="${embedUrl}" title="${safeTitle || 'Video'}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }

  // ── Content extraction (preserving HTML) ──

  private extractContent(html: string): string {
    // 1. Try JSON-LD articleBody (plain text, no HTML)
    const jsonLdContent = this.extractFromJsonLd(html);
    if (jsonLdContent && jsonLdContent.length > 100) {
      // JSON-LD is plain text — convert paragraphs to HTML
      return jsonLdContent.split('\n\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('\n\n');
    }

    // 2. Try <article> tag (preserve HTML)
    const articleMatch = html.match(/<article[^>]*>(.*?)<\/article>/s);
    if (articleMatch) {
      const content = this.sanitizeContentHtml(articleMatch[1]);
      if (content.length > 100) return content.substring(0, 8000);
    }

    // 3. Try <p> tags (preserve HTML)
    const paragraphs = html.match(/<p[^>]*>(.*?)<\/p>/gs) || [];
    const content = paragraphs
      .map(p => this.sanitizeContentHtml(p))
      .filter(p => this.stripHtml(p).trim().length > 40)
      .join('\n\n');

    return content.substring(0, 8000) || '';
  }

  private sanitizeContentHtml(html: string): string {
    let text = html;

    // Remove script/style/noscript
    text = text.replace(/<script[^>]*>.*?<\/script>/gs, '');
    text = text.replace(/<style[^>]*>.*?<\/style>/gs, '');
    text = text.replace(/<noscript[^>]*>.*?<\/noscript>/gs, '');

    // Remove comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Remove data-* attributes except video ones
    text = text.replace(/<([a-z]+)[^>]*>/gi, (tag) => {
      return tag.replace(/\s+data-(?!video-)[a-z-]+="[^"]*"/gi, '');
    });

    // Keep: <img>, <iframe>, <video>, <source>, <figure>, <figcaption>
    // Remove: other HTML tags
    const allowedTags = ['img', 'iframe', 'video', 'source', 'figure', 'figcaption', 'picture'];
    text = text.replace(/<\/?([a-z]+)[^>]*>/gi, (fullTag, tagName) => {
      const tag = tagName.toLowerCase();
      if (allowedTags.includes(tag)) return fullTag;
      // Convert <br> to newline
      if (tag === 'br') return '\n';
      // Convert block-level to newlines
      if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        if (fullTag.startsWith('</')) return '\n\n';
        return '\n\n';
      }
      if (tag === 'li') return '\n• ';
      return '';
    });

    // Clean up
    text = this.unescapeHtml(text);
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  // ── Existing helpers ──

  private extractTitle(html: string): string {
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    if (h1Match) {
      const t = this.cleanText(this.stripHtml(h1Match[1]));
      if (t.length > 10) return t;
    }

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
      const pattern1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
      const match1 = html.match(pattern1);
      if (match1) return this.unescapeHtml(match1[1]);

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
    return 2;
  }

  private generateSeo(title: string, excerpt: string, content: string): { seo_title: string; seo_description: string; seo_keywords: string } {
    const seo_title = title.length > 60 ? title.substring(0, 60) : title;
    const descSource = excerpt || this.stripHtml(content).substring(0, 300);
    const seo_description = descSource.length > 160 ? descSource.substring(0, 160) : descSource;
    const keywords = this.extractKeywords(title, content);
    return { seo_title, seo_description, seo_keywords: keywords.join(', ') };
  }

  private extractKeywords(title: string, content: string): string[] {
    const text = `${title} ${this.stripHtml(content)}`.toLowerCase()
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

  // ── Utility ──

  private resolveUrl(src: string): string | null {
    if (!src || src.startsWith('data:')) return null;
    if (src.startsWith('//')) return 'https:' + src;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    if (this.baseUrl) {
      try {
        return new URL(src, this.baseUrl).href;
      } catch {
        return null;
      }
    }
    return null;
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

  private escapeHtmlAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
