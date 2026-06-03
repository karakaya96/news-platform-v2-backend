#!/usr/bin/env python3
"""
news_fetcher.py — Haber Otomatik Çıkarma ve Paylaşma Aracı

Kullanım:
  python3 news_fetcher.py <haber-linki> [--category <kategori-id>] [--video] [--dry-run]

Örnek:
  python3 news_fetcher.py https://www.bbc.com/turkce/haberler-12345678
  python3 news_fetcher.py https://www.bbc.com/turkce/haberler-12345678 --category 3 --video
"""

import argparse
import base64
import json
import re
import ssl
import sys
import urllib.request
import urllib.error
import urllib.parse
import html as html_lib
import os
import warnings
from pathlib import Path

# SSL/TLS deprecation ve insecure request uyarılarını sustur
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*TLSv1.*")
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", message=".*Unverified HTTPS.*")

try:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    pass

# ─────────────────────────────────────────────
# .ENV YÜKLEME
# ─────────────────────────────────────────────
def load_env():
    """Script ile aynı dizindeki .env dosyasını yükler."""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

load_env()

# ─────────────────────────────────────────────
# SSL CONTEXT (ISP proxy / WiFi quirks)
# ─────────────────────────────────────────────
_SSL_CTX = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE
# ISP'ler TLS version downgrade yapıyor olabilir - tüm versiyonlara izin ver
_SSL_CTX.minimum_version = ssl.TLSVersion.TLSv1
_SSL_CTX.maximum_version = ssl.TLSVersion.MAXIMUM_SUPPORTED
# Cipher'ları da aç
_SSL_CTX.set_ciphers('DEFAULT:@SECLEVEL=0')

# ─────────────────────────────────────────────
# YAPILANDIRMA
# ─────────────────────────────────────────────

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────
# SABİT YAPILANDIRMA
# ─────────────────────────────────────────────
# Env var ile override edilebilir
API_BASE_URL = os.environ.get(
    "NEWS_API_URL", "https://news-v2-api.karakaya-mk96.workers.dev"
)
AUTH_TOKEN = os.environ.get("NEWS_AUTH_TOKEN", "")
SITE_URL = os.environ.get(
    "NEWS_SITE_URL", "https://news-site.karakaya-mk96.workers.dev"
)

# ─────────────────────────────────────────────
# 1. WEB SCRAPING
# ─────────────────────────────────────────────

def fetch_page(url: str, timeout: int = 30) -> str:
    """URL'den HTML içerik çeker."""
    import requests as req_lib

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
    }
    try:
        resp = req_lib.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return resp.text
    except req_lib.exceptions.SSLError as e:
        print(f"  ⚠️ SSL Hatası: {e}", file=sys.stderr)
        print("  → verify=False ile yeniden deneniyor...", file=sys.stderr)
        try:
            resp = req_lib.get(url, headers=headers, timeout=timeout, verify=False)
            resp.raise_for_status()
            return resp.text
        except Exception as e2:
            print(f"  ⚠️ Tekrar deneme de başarısız: {e2}", file=sys.stderr)
            raise
    except req_lib.exceptions.ConnectionError as e:
        print(f"  ⚠️ Bağlantı hatası: {e}", file=sys.stderr)
        if "WRONG_VERSION_NUMBER" in str(e):
            print("  → ISP/Proxy SSL sorunu. verify=False ile yeniden deneniyor...", file=sys.stderr)
            try:
                resp = req_lib.get(url, headers=headers, timeout=timeout, verify=False)
                resp.raise_for_status()
                return resp.text
            except Exception as e2:
                print(f"  ⚠️ Tekrar deneme de başarısız: {e2}", file=sys.stderr)
                raise
        raise
    except req_lib.exceptions.HTTPError as e:
        print(f"  ⚠️ HTTP {e.response.status_code}: {e.response.reason}", file=sys.stderr)
        if e.response.status_code == 403:
            print("  → Site bot koruması var. --dry-run ile test edebilirsin.", file=sys.stderr)
        raise
    except Exception as e:
        print(f"  ⚠️ Beklenmeyen hata: {type(e).__name__}: {e}", file=sys.stderr)
        raise


def info_charset(headers) -> str | None:
    """Content-Type header'ndan charset çıkarır."""
    ct = headers.get_content_charset()
    if ct:
        return ct
    ct_header = headers.get("Content-Type", "")
    m = re.search(r"charset=([^\s;]+)", ct_header, re.IGNORECASE)
    return m.group(1).strip('"\'') if m else None


def extract_meta(html: str, *keys: str) -> str:
    """HTML'den meta tag değeri çıkarır (og: veya name=)."""
    for key in keys:
        # Open Graph
        pattern = rf'<meta[^>]+(?:property|name)=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']*)["\']'
        m = re.search(pattern, html, re.IGNORECASE)
        if m:
            return html_lib.unescape(m.group(1))
        # Ters sıralı
        pattern = rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']{re.escape(key)}["\']'
        m = re.search(pattern, html, re.IGNORECASE)
        if m:
            return html_lib.unescape(m.group(1))
    return ""


def extract_title(html: str) -> str:
    """Haber başlığı çıkarır — h1 > title tag > og:title sırasıyla."""
    # 1. <h1> tag (en doğru)
    h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.DOTALL | re.IGNORECASE)
    if h1_m:
        t = clean_text(re.sub(r"<[^>]+>", "", h1_m.group(1)))
        if len(t) > 10:
            return t

    # 2. <title> tag
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    if m:
        t = clean_text(m.group(1))
        for sep in [" | ", " - ", " :: ", " — ", " – "]:
            parts = t.split(sep)
            if len(parts) >= 2:
                candidate = parts[0].strip()
                if len(candidate) > 10:
                    return candidate
        if len(t) > 10:
            return t

    # 3. og:title (fallback)
    title = extract_meta(html, "og:title", "twitter:title")
    if title:
        return clean_text(title)

    return ""


def extract_description(html: str) -> str:
    """Haber özeti çıkarır."""
    desc = extract_meta(html, "og:description", "description", "twitter:description")
    return clean_text(desc)


def extract_image(html: str) -> str | None:
    """Ana görsel URL'si çıkarır."""
    img = extract_meta(html, "og:image", "twitter:image", "twitter:image:src")
    if img:
        if img.startswith("//"):
            img = "https:" + img
        return img
    return None


def extract_images(html: str, base_url: str = "") -> list[str]:
    """Sayfadaki anlamlı içerik fotoğraflarını çıkarır.
    
    Küçük icon, logo, avatar gibi öğeleri filtreler.
    Birden fazla bulursa en büyük olanları döndürür (max 5).
    """
    all_urls: list[str] = []

    # 1. Tüm <img src="..."> tag'lerini bul
    for m in re.finditer(r'<img[^>]+src="([^"]+)"', html, re.IGNORECASE):
        url = _resolve_url(m.group(1).strip(), base_url)
        if url and _is_content_image(url, html):
            all_urls.append(url)

    # 2. srcset içinden en büyük URL'yi al
    for m in re.finditer(r'<img[^>]+srcset="([^"]+)"', html, re.IGNORECASE):
        parts = [s.strip() for s in m.group(1).split(",")]
        for part in reversed(parts):
            url_part = part.split()[0].strip() if part.split() else ""
            url = _resolve_url(url_part, base_url)
            if url and _is_content_image(url, html) and url not in all_urls:
                all_urls.append(url)
                break

    # 3. data-src (lazy loading)
    for m in re.finditer(r'<img[^>]+data-src="([^"]+)"', html, re.IGNORECASE):
        url = _resolve_url(m.group(1).strip(), base_url)
        if url and _is_content_image(url, html) and url not in all_urls:
            all_urls.append(url)

    # 4. data-original (başka lazy loading pattern)
    for m in re.finditer(r'<img[^>]+data-original="([^"]+)"', html, re.IGNORECASE):
        url = _resolve_url(m.group(1).strip(), base_url)
        if url and _is_content_image(url, html) and url not in all_urls:
            all_urls.append(url)

    # Duplikat kaldır ve max 5 döndür
    seen: list[str] = []
    for u in all_urls:
        if u not in seen:
            seen.append(u)
        if len(seen) >= 5:
            break

    return seen


def _resolve_url(src: str, base_url: str) -> str | None:
    """Relative URL'yi absolute'a çevirir."""
    if not src or src.startswith("data:"):
        return None
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("http://") or src.startswith("https://"):
        return src
    if base_url:
        from urllib.parse import urljoin
        return urljoin(base_url, src)
    return None


def _is_content_image(url: str, html: str = "") -> bool:
    """URL'nin içerik fotoğrafı olup olmadığını kontrol eder."""
    url_lower = url.lower()

    # Hariç tutulan pattern'lar
    skip_keywords = [
        "logo", "icon", "avatar", "button", "sprite", "advert",
        "banner", "pixel", "tracker", "placeholder", "loading",
        "emoji", "favicon", "apple-touch", "android-chrome",
        "gravatar", "social", "share-", "rating", "star.",
        "badge", "arrow", "close.", "menu.", "nav.",
        "featured-image-small", "thumbnail-small",
    ]
    for kw in skip_keywords:
        if kw in url_lower:
            return False

    # SVG genelde icon
    if url_lower.endswith(".svg"):
        return False

    # URL'den boyut kontrolü (örn: image-800x600.jpg)
    dim_match = re.search(r"(\d+)x(\d+)", url_lower)
    if dim_match:
        w, h = int(dim_match.group(1)), int(dim_match.group(2))
        if w < 150 or h < 100:
            return False

    # Geçerli image uzantıları
    if not re.search(r"\.(jpg|jpeg|png|webp|gif)(\?|$)", url_lower):
        return False

    # HTML'den img tag boyut kontrolü
    if html:
        img_tag_match = re.search(
            r'<img[^>]+src="' + re.escape(url) + r'"[^>]*>',
            html, re.IGNORECASE
        )
        if img_tag_match:
            tag = img_tag_match.group(0)
            w_m = re.search(r'width="?(\d+)', tag)
            h_m = re.search(r'height="?(\d+)', tag)
            if w_m and h_m:
                w, h = int(w_m.group(1)), int(h_m.group(1))
                if w < 120 or h < 80:
                    return False
            class_m = re.search(r'class="([^"]*)"', tag)
            if class_m:
                cls = class_m.group(1).lower()
                if any(k in cls for k in ["icon", "logo", "avatar", "thumb", "small"]):
                    return False

    return True


def _embed_images_in_content(content: str, images: list[str]) -> str:
    """İçerik fotoğraflarını metin paragrafları arasına yerleştirir.
    
    Fotoğrafları metnin uzunluğuna göre eşit aralıklarla dağıtır.
    Her fotoğraf <img> HTML tag'i olarak eklenir.
    """
    if not images or not content:
        return content

    # Paragraflara böl
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    if len(paragraphs) < 2:
        # Tek paragraf varsa sonuna ekle
        img_html = "\n\n".join(
            f'<img src="{u}" alt="Haber görseli" style="max-width:100%;border-radius:8px;margin:16px 0;" />'
            for u in images
        )
        return content + "\n\n" + img_html

    # Fotoğrafları paragraflar arasına dağıt
    num_images = len(images)
    num_paragraphs = len(paragraphs)

    # Eşit aralıklarla yerleştir
    if num_images == 1:
        # Tek fotoğraf → %40 noktasına
        insert_pos = max(1, int(num_paragraphs * 0.4))
        img_html = f'\n\n<img src="{images[0]}" alt="Haber görseli" style="max-width:100%;border-radius:8px;margin:16px 0;" />\n\n'
        paragraphs.insert(insert_pos, img_html)
    elif num_images == 2:
        # İki fotoğraf → %30 ve %60
        positions = [int(num_paragraphs * 0.3), int(num_paragraphs * 0.6)]
        for i, pos in enumerate(positions):
            img_html = f'\n\n<img src="{images[i]}" alt="Haber görseli" style="max-width:100%;border-radius:8px;margin:16px 0;" />\n\n'
            paragraphs.insert(pos + i, img_html)  # +i çünkü önceki ekleme offset yaratır
    else:
        # 3+ fotoğraf → eşit dağıtım
        step = num_paragraphs / (num_images + 1)
        for i in range(num_images):
            pos = int(step * (i + 1)) + i  # +i offset
            pos = min(pos, len(paragraphs))
            img_html = f'\n\n<img src="{images[i]}" alt="Haber görseli" style="max-width:100%;border-radius:8px;margin:16px 0;" />\n\n'
            paragraphs.insert(pos, img_html)

    return "\n\n".join(paragraphs)


def extract_content(html: str, url: str = "") -> str:

    # 1. Readability ile dene (en stabil)
    try:
        doc = Document(html, url=url)
        summary = doc.summary()
        # HTML temizle
        text = clean_html(summary)
        text = re.sub(r'\n{3,}', '\n\n', text).strip()
        if len(text.strip()) > 100:
            return text[:8000]
    except Exception:
        pass

    # 2. JSON-LD fallback
    content = ""
    for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(m.group(1))
            if isinstance(data, dict) and data.get("@type") in ("NewsArticle", "Article"):
                body = data.get("articleBody", "")
                if body and len(body.strip()) > 100:
                    content = body
                    break
        except json.JSONDecodeError:
            continue

    # 3. <article> tag fallback
    if not content:
        article_m = re.search(r"<article[^>]*>(.*?)</article>", html, re.DOTALL | re.IGNORECASE)
        if article_m:
            content = article_m.group(1)

    # 4. <p> tagları fallback
    if not content:
        paragraphs = re.findall(r"<p[^>]*>(.*?)</p>", html, re.DOTALL | re.IGNORECASE)
        content = "\n\n".join(p for p in paragraphs if len(clean_html(p).strip()) > 40)

    content = clean_html(content)
    content = re.sub(r'\n{3,}', '\n\n', content).strip()
    return content[:8000]


def detect_videos(html: str, base_url: str = "") -> list[dict]:
    """Sayfadaki video embed kodlarını algılar.

    Desteklenen formatlar:
    - YouTube iframe / watch link
    - Vimeo iframe
    - Dailymotion iframe
    - Bloomberg embed iframe
    - Milliyet / Hürriyet / CNN Türk embed iframe
    - <video> tag (src ve <source> ile)
    - Sondakika: data-video-url, video_file, videoUrl
    - Ensonhaber: data-src attribute
    - Genel data-* attribute'ları (data-video-src, data-media-url, data-url)
    - JSON-LD VideoObject (contentUrl, embedUrl)
    - Genel .mp4/.webm/.m3u8 linkleri
    """
    videos = []
    _add = lambda v: videos.append(v)  # kısa yol

    def _already_has(url: str) -> bool:
        return any(v["url"] == url for v in videos)

    def _normalize(url: str) -> str:
        if url.startswith("//"):
            return "https:" + url
        return url

    # ══════════════════════════════════════════════
    # 1. YouTube iframe
    # ══════════════════════════════════════════════
    for src in re.findall(
        r'<iframe[^>]*src=["\']([^"\']*youtube(?:-nocookie)?\.com/embed/[^"\']*)["\'][^>]*>',
        html, re.IGNORECASE
    ):
        _add({"type": "youtube_iframe", "url": _normalize(src)})

    # YouTube watch link
    for vid in re.findall(
        r'https?://(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]+)', html
    ):
        if not any(v["url"].find(vid) != -1 for v in videos):
            _add({"type": "youtube_link", "url": f"https://www.youtube.com/watch?v={vid}"})

    # YouTube nocookie link
    for vid in re.findall(
        r'https?://(?:www\.)?youtube-nocookie\.com/embed/([a-zA-Z0-9_-]+)', html
    ):
        if not any(v["url"].find(vid) != -1 for v in videos):
            _add({"type": "youtube_iframe", "url": f"https://www.youtube-nocookie.com/embed/{vid}"})

    # ══════════════════════════════════════════════
    # 2. Vimeo iframe
    # ══════════════════════════════════════════════
    for src in re.findall(
        r'<iframe[^>]*src=["\']([^"\']*player\.vimeo\.com/video/[^"\']*)["\'][^>]*>',
        html, re.IGNORECASE
    ):
        _add({"type": "vimeo_iframe", "url": _normalize(src)})

    # ══════════════════════════════════════════════
    # 3. Dailymotion iframe
    # ══════════════════════════════════════════════
    for src in re.findall(
        r'<iframe[^>]*src=["\']([^"\']*dailymotion\.com/embed/video/[^"\']*)["\'][^>]*>',
        html, re.IGNORECASE
    ):
        _add({"type": "dailymotion_iframe", "url": _normalize(src)})

    # Dailymotion short URL (dai.ly/xxxxx)
    for daid in re.findall(r'https?://(?:www\.)?dai\.ly/([a-zA-Z0-9]+)', html):
        url = f"https://www.dailymotion.com/embed/video/{daid}"
        if not _already_has(url):
            _add({"type": "dailymotion_iframe", "url": url})

    # ══════════════════════════════════════════════
    # 4. Bloomberg embed iframe
    # ══════════════════════════════════════════════
    for src in re.findall(
        r'<iframe[^>]*src=["\']([^"\']*bloomberg\.com/api/embed/iframe[^"\']*)["\'][^>]*>',
        html, re.IGNORECASE
    ):
        _add({"type": "bloomberg_iframe", "url": _normalize(src)})

    # ══════════════════════════════════════════════
    # 5. Türk siteleri embed iframe'leri
    #    Milliyet, Hürriyet, CNN Türk, DHA, TRT Haber, AA, NTV
    # ══════════════════════════════════════════════
    tr_embed_patterns = [
        # Milliyet: milliyet.com.tr/video/embed/?vid=XXXXX
        r'<iframe[^>]*src=["\']([^"\']*milliyet\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # Hürriyet: hurriyet.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*hurriyet\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # CNN Türk: cnnturk.com/video/embed/?vid=XXXXX
        r'<iframe[^>]*src=["\']([^"\']*cnnturk\.com/video/embed/[^"\']*)["\'][^>]*>',
        # DHA: dha.com.tr/video/embed/?vid=XXXXX
        r'<iframe[^>]*src=["\']([^"\']*dha\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # TRT Haber: trthaber.com/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*trthaber\.com/video/embed/[^"\']*)["\'][^>]*>',
        # AA: aa.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*aa\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # NTV: ntv.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*ntv\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # Habertürk: haberturk.com/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*haberturk\.com/video/embed/[^"\']*)["\'][^>]*>',
        # Sözcü: sozcu.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*sozcu\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # Cumhuriyet: cumhuriyet.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*cumhuriyet\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # BirGün: birgun.net/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*birgun\.net/video/embed/[^"\']*)["\'][^>]*>',
        # T24: t24.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*t24\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # Mynet: mynet.com/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*mynet\.com/video/embed/[^"\']*)["\'][^>]*>',
        # Sabah: sabah.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*sabah\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # Yeni Şafak: yenisafak.com/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*yenisafak\.com/video/embed/[^"\']*)["\'][^>]*>',
        # Gazete Duvar: gazeteduvar.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*gazeteduvar\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # Diken: diken.com.tr/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*diken\.com\.tr/video/embed/[^"\']*)["\'][^>]*>',
        # Haberler.com: haberler.com/video/embed/...
        r'<iframe[^>]*src=["\']([^"\']*haberler\.com/video/embed/[^"\']*)["\'][^>]*>',
    ]
    for pattern in tr_embed_patterns:
        for src in re.findall(pattern, html, re.IGNORECASE):
            _add({"type": "tr_site_iframe", "url": _normalize(src)})

    # ══════════════════════════════════════════════
    # 6. <video> tag — <source> içinden
    # ══════════════════════════════════════════════
    for src in re.findall(
        r'<source[^>]+src=["\']([^"\']+)["\'][^>]*type=["\']video/',
        html, re.IGNORECASE
    ):
        if not _already_has(src):
            _add({"type": "direct_video", "url": src})

    # <video> tag'inin kendisindeki src
    for src in re.findall(
        r'<video[^>]+src=["\']([^"\']+)["\']', html, re.IGNORECASE
    ):
        if not _already_has(src):
            _add({"type": "direct_video", "url": src})

    # ══════════════════════════════════════════════
    # 7. Sondakika: data-video-url, video_file, videoUrl
    # ══════════════════════════════════════════════
    for src in re.findall(
        r'(?:data-video-url|video_file|videoUrl)["\s:=]+["\']([^"\']+)["\']',
        html, re.IGNORECASE
    ):
        if not _already_has(src):
            _add({"type": "direct_video", "url": src})

    # ══════════════════════════════════════════════
    # 8. Ensonhaber ve diğer siteler: data-src attribute
    #    (JavaScript ile yüklenen videolar)
    # ══════════════════════════════════════════════
    for src in re.findall(
        r'data-src=["\']([^"\']*\.(?:mp4|webm|flv|m3u8)[^"\']*)["\']',
        html, re.IGNORECASE
    ):
        if not _already_has(src):
            _add({"type": "direct_video", "url": src})

    # ══════════════════════════════════════════════
    # 9. Genel data-* attribute'ları
    # ══════════════════════════════════════════════
    data_attrs = [
        "data-video-src", "data-media-url", "data-url",
        "data-video-url", "data-file", "data-stream",
        "data-mp4", "data-hls", "data-video",
    ]
    for attr in data_attrs:
        for src in re.findall(
            rf'{attr}=["\']([^"\']*\.(?:mp4|webm|flv|m3u8|mov)[^"\']*)["\']',
            html, re.IGNORECASE
        ):
            if not _already_has(src):
                _add({"type": "direct_video", "url": src})

    # ══════════════════════════════════════════════
    # 10. JSON-LD VideoObject
    # ══════════════════════════════════════════════
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    ):
        try:
            data = json.loads(m.group(1))
            # Tek VideoObject
            if isinstance(data, dict) and data.get("@type") == "VideoObject":
                content_url = data.get("contentUrl", "")
                embed_url = data.get("embedUrl", "")
                if content_url and not _already_has(content_url):
                    _add({"type": "direct_video", "url": content_url})
                if embed_url and not _already_has(embed_url):
                    _add({"type": "jsonld_iframe", "url": embed_url})
            # @graph içinde VideoObject
            if isinstance(data, dict) and "@graph" in data:
                for item in data["@graph"]:
                    if isinstance(item, dict) and item.get("@type") == "VideoObject":
                        content_url = item.get("contentUrl", "")
                        embed_url = item.get("embedUrl", "")
                        if content_url and not _already_has(content_url):
                            _add({"type": "direct_video", "url": content_url})
                        if embed_url and not _already_has(embed_url):
                            _add({"type": "jsonld_iframe", "url": embed_url})
        except (json.JSONDecodeError, TypeError):
            continue

    # ══════════════════════════════════════════════
    # 11. Genel .mp4/.webm/.m3u8 linkleri (JavaScript içinden)
    # ══════════════════════════════════════════════
    for ext in ["mp4", "webm", "flv", "m3u8", "mov"]:
        for src in re.findall(
            rf'["\'](https?://[^"\']*\.{ext}[^"\']*)["\']',
            html, re.IGNORECASE
        ):
            if not _already_has(src):
                _add({"type": "direct_video", "url": src})

    return videos


def _video_key(url: str) -> str:
    """Video URL'sinden benzersiz anahtar çıkarır (duplikat önleme).
    Aynı videonun farklı domain/protokollerden servis edilmesini yakalar."""
    from urllib.parse import urlparse
    p = urlparse(url)
    # Dosya adını al (path'in son kısmı, uzantısız)
    filename = p.path.rsplit("/", 1)[-1] if "/" in p.path else p.path
    # Uzantıyı çıkar (m3u8 → mp4 normalize)
    name = filename.rsplit(".", 1)[0] if "." in filename else filename
    return name.lower()


def deduplicate_videos(videos: list[dict]) -> list[dict]:
    """Aynı videonun farklı URL'lerini tek'e indirir."""
    seen: set[str] = []
    result = []
    for v in videos:
        key = _video_key(v["url"])
        # Kısa hash kullan: ilk 20 karakter
        short_key = key[:30]
        if short_key not in seen:
            seen.append(short_key)
            result.append(v)
    return result


def generate_video_embed(video: dict) -> str:
    """Video için HTML embed kodu oluşturur.

    Desteklenen tipler:
    - youtube_iframe / youtube_link → YouTube embed iframe
    - vimeo_iframe → Vimeo embed iframe
    - dailymotion_iframe → Dailymotion embed iframe
    - bloomberg_iframe → Bloomberg embed iframe
    - tr_site_iframe → Türk siteleri embed iframe (Milliyet, Hürriyet, CNN Türk, vs.)
    - jsonld_iframe → JSON-LD'den gelen embed URL
    - direct_video → HTML5 <video> tag
    """
    vtype = video["type"]
    url = video["url"]

    # YouTube iframe (zaten embed URL)
    if vtype == "youtube_iframe":
        return (
            f'<div class="video-embed" style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:24px 0;">'
            f'<iframe src="{url}" style="position:absolute;top:0;left:0;width:100%;'
            f'height:100%;border:0;" allowfullscreen allow="accelerometer; autoplay; '
            f'clipboard-write; encrypted-media; gyroscope; picture-in-picture">'
            f'</iframe></div>'
        )

    # YouTube watch link → embed URL'ye çevir
    if vtype == "youtube_link":
        video_id = url.split("v=")[-1].split("&")[0]
        embed_url = f"https://www.youtube.com/embed/{video_id}"
        return (
            f'<div class="video-embed" style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:24px 0;">'
            f'<iframe src="{embed_url}" style="position:absolute;top:0;left:0;width:100%;'
            f'height:100%;border:0;" allowfullscreen allow="accelerometer; autoplay; '
            f'clipboard-write; encrypted-media; gyroscope; picture-in-picture">'
            f'</iframe></div>'
        )

    # Vimeo
    if vtype == "vimeo_iframe":
        return (
            f'<div class="video-embed" style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:24px 0;">'
            f'<iframe src="{url}" style="position:absolute;top:0;left:0;width:100%;'
            f'height:100%;border:0;" allowfullscreen></iframe></div>'
        )

    # Dailymotion
    if vtype == "dailymotion_iframe":
        return (
            f'<div class="video-embed" style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:24px 0;">'
            f'<iframe src="{url}" style="position:absolute;top:0;left:0;width:100%;'
            f'height:100%;border:0;" allowfullscreen></iframe></div>'
        )

    # Bloomberg
    if vtype == "bloomberg_iframe":
        return (
            f'<div class="video-embed" style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:24px 0;">'
            f'<iframe src="{url}" style="position:absolute;top:0;left:0;width:100%;'
            f'height:100%;border:0;" allowfullscreen></iframe></div>'
        )

    # Türk siteleri embed iframe (Milliyet, Hürriyet, CNN Türk, DHA, TRT Haber, AA, NTV, Habertürk, vs.)
    if vtype == "tr_site_iframe":
        return (
            f'<div class="video-embed" style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:24px 0;">'
            f'<iframe src="{url}" style="position:absolute;top:0;left:0;width:100%;'
            f'height:100%;border:0;" allowfullscreen></iframe></div>'
        )

    # JSON-LD iframe
    if vtype == "jsonld_iframe":
        return (
            f'<div class="video-embed" style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:24px 0;">'
            f'<iframe src="{url}" style="position:absolute;top:0;left:0;width:100%;'
            f'height:100%;border:0;" allowfullscreen></iframe></div>'
        )

    # Doğrudan video dosyası (mp4, webm, flv, m3u8)
    if vtype == "direct_video":
        # HLS stream (m38u8) için hls.js desteği
        if url.endswith(".m3u8"):
            return (
                f'<div class="video-embed" style="margin:24px 0;border-radius:12px;overflow:hidden;">'
                f'<video controls style="width:100%;" playsinline>'
                f'<source src="{url}" type="application/x-mpegURL">'
                f'Tarayıcınız video desteklemiyor.</video></div>'
            )
        # WebM
        if url.endswith(".webm"):
            return (
                f'<div class="video-embed" style="margin:24px 0;border-radius:12px;overflow:hidden;">'
                f'<video controls style="width:100%;" playsinline>'
                f'<source src="{url}" type="video/webm">'
                f'Tarayıcınız video desteklemiyor.</video></div>'
            )
        # FLV (tarayıcı desteği yok, uyarı)
        if url.endswith(".v"):
            return (
                f'<div class="video-embed" style="margin:24px 0;border-radius:12px;overflow:hidden;'
                f'background:#1a1a2e;padding:20px;text-align:center;">'
                f'<p style="color:#fff;margin:0 0 12px;">🎬 Video dosyası (FLV format)</p>'
                f'<a href="{url}" target="_blank" rel="noopener" '
                f'style="color:#4fc3f7;text-decoration:underline;">Videoyu indir/izle</a>'
                f'</div>'
            )
        # MP4 / MOV / diğer (en yaygın)
        mime = "video/mp4"
        if url.endswith(".mov"):
            mime = "video/quicktime"
        return (
            f'<div class="video-embed" style="margin:24px 0;border-radius:12px;overflow:hidden;">'
            f'<video controls style="width:100%;" playsinline>'
            f'<source src="{url}" type="{mime}">'
            f'Tarayıcınız video desteklemiyor.</video></div>'
        )

    # Bilinmeyen tip → link olarak göster
    return f'<p><a href="{url}" target="_blank">Video izle</a></p>'


# ─────────────────────────────────────────────
# 2. SEO OTOMATİK OLUŞTURMA
# ─────────────────────────────────────────────

def generate_seo(title: str, excerpt: str, content: str) -> dict[str, str]:
    """Başlık ve içerikten SEO meta verileri oluşturur."""
    # SEO Title: 50-60 karakter ideal
    seo_title = title[:60] if len(title) > 60 else title

    # SEO Description: 150-160 karakter
    desc_source = excerpt if excerpt else content[:300]
    # Noktalama ve fazlalık temizle
    desc_source = re.sub(r'\s+', ' ', desc_source).strip()
    seo_description = desc_source[:160] if len(desc_source) > 160 else desc_source

    # Keywords: Başlık + içerikten en sözcükler
    keywords = extract_keywords(title, content)

    return {
        "seo_title": seo_title,
        "seo_description": seo_description,
        "seo_keywords": ", ".join(keywords),
    }


def extract_keywords(title: str, content: str) -> list[str]:
    """Metinden anahtar kelimeler çıkarır (Türkçe optimize)."""
    # Türkçe stop words
    stop_words = {
        "bir", "bu", "şu", "ile", "ve", "ama", "fakat", "çünkü", "ki",
        "da", "de", "mi", "mu", "mı", "mü", "için", "gibi", "daha",
        "en", "çok", "az", "var", "yok", "olan", "oldu", "olur",
        "her", "tüm", "bütün", "kendi", "sadece", "ancak", "sonra",
        "önce", "arasında", "arası", "üzerine", "tarafından",
        "nedeniyle", "göre", "karşı", "kadar", "beri", "sonra",
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "need",
        "and", "but", "or", "not", "no", "yes", "if", "then", "else",
        "what", "which", "who", "whom", "this", "that", "these", "those",
        "it", "its", "he", "she", "they", "them", "his", "her", "their",
        "we", "our", "you", "your", "me", "my", "us",
        "in", "on", "at", "to", "for", "of", "with", "by", "from",
        "about", "as", "into", "through", "during", "before", "after",
        "above", "below", "between", "under", "again", "further", "once",
    }

    text = f"{title} {content}".lower()
    # Türkçe karakter normalize
    text = text.replace("ı", "i").replace("ğ", "g").replace("ü", "u")
    text = text.replace("ş", "s").replace("ç", "c").replace("ö", "o")

    # Kelimeleri ayır
    words = re.findall(r'\b[a-zçğıöşü]{3,}\b', text)

    # Stop words ve tekrarları filtrele
    freq: dict[str, int] = {}
    for w in words:
        if w not in stop_words and len(w) >= 3:
            freq[w] = freq.get(w, 0) + 1

    # En sık geçen 8 anahtar kelime
    sorted_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    keywords = [w for w, _ in sorted_words[:8]]

    return keywords


# ─────────────────────────────────────────────
# 3. SLUG OLUŞTURMA
# ─────────────────────────────────────────────

def generate_slug(title: str) -> str:
    """Başlıktan URL dostu slug oluşturur."""
    # Manuel çünü str.maketrans duplicate key sorunu yaşıyor (ı iki kez var)
    tr_map = {
        ord('ç'): 'c', ord('ğ'): 'g', ord('ı'): 'i', ord('ö'): 'o',
        ord('ş'): 's', ord('ü'): 'u', ord('Ç'): 'C', ord('Ğ'): 'G',
        ord('İ'): 'I', ord('Ö'): 'O', ord('Ş'): 'S', ord('Ü'): 'U',
        ord(' '): '-',
    }
    slug = title.translate(tr_map)
    # Harf ve tire dışını temizle
    slug = re.sub(r'[^a-zA-Z0-9-]+', '-', slug)
    # Çoklu tireleri tek tireye
    slug = re.sub(r'-+', '-', slug)
    # Baş ve sondaki tireleri kaldır
    slug = slug.strip('-')
    return slug[:200].lower()


# ─────────────────────────────────────────────
# 4. KATEGORİ EŞLEŞTİRME
# ─────────────────────────────────────────────

CATEGORY_KEYWORDS: dict[int, list[str]] = {
    4: ["spor", "futbol", "basketbol", "voleybol", "tenis", "maç", "gol", "sampiyon",
        "lig", "takım", "fc", "gs", "fb", "bjk"],
    8: ["politika", "siyaset", "parti", "seçim", "meclis", "hükümet", "bakan",
        "cumhurbaşkanı", "milletvekili", "akp", "chp", "hdp", "mhp", "iyi parti"],
    3: ["ekonomi", "borsa", "dolar", "euro", "faiz", "enflasyon", "bütçe",
        "ticaret", "ihracat", "ithalat"],
    1: ["teknoloji", "bilgisayar", "yazilim", "yazılım", "yapay zeka", "robot",
        "apple", "samsung", "microsoft", "google", "internet", "mobil", "telefon",
        "ai", "blockchain", "kripto"],
    2: ["dunya", "dünya", "uluslararası", "avrupa", "abd", "amerika", "çin",
        "rusya", "ukrayna", "israil", "filistin", "savaş", "barış", "nato",
        "bm", "ab", "avrupa birliği"],
    5: ["bilim", "keşif", "uzay", "nasa", "mars", "araştırma", "buluş"],
    6: ["saglik", "sağlık", "hastane", "doktor", "hastalık", "tedavi", "aşı",
        "pandemi", "virüs", "kanser"],
    7: ["kultur", "kültür", "sanat", "müzik", "film", "sinema", "tiyatro",
        "kitap", "festival", "oyuncu", "şarkı", "album", "dizi"],
}


def detect_category(title: str, content: str) -> int:
    """Metinden otomatik kategori tahmini yapar."""
    text = f"{title} {content[:1000]}".lower()
    scores: dict[int, int] = {}

    for cat_id, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for kw in keywords:
            count = text.count(kw.lower())
            if count:
                # Başlıkta geçen kelime daha ağırlıklı
                if kw.lower() in title.lower():
                    score += count * 3
                else:
                    score += count
        if score > 0:
            scores[cat_id] = score

    if scores:
        return max(scores, key=scores.get)
    return 2  # Varsayılan: World News


# ─────────────────────────────────────────────
# 5. API İLE HABER OLUŞTURMA
# ─────────────────────────────────────────────

def create_news_via_api(data: dict, token: str) -> dict:
    """Cloudflare Worker API'sine haber gönderir (curl fallback ile)."""
    import subprocess
    import json as json_mod
    import shutil

    url = f"{API_BASE_URL}/api/news"
    payload_json = json_mod.dumps(data)

    # Önce requests dene
    try:
        import requests as req_lib
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        resp = req_lib.post(url, json=data, headers=headers, timeout=30, verify=False)
        resp.raise_for_status()
        return {"success": True, "data": resp.json()}
    except Exception as e:
        print(f"   [DEBUG] requests başarısız ({type(e).__name__}), curl deneniyor...", file=sys.stderr)

    # curl fallback - ISP SSL interception'ı bypass edebilir
    curl_path = shutil.which("curl")
    if not curl_path:
        return {"success": False, "error": "requests başarısız ve curl bulunamadı", "status": 0}

    try:
        result = subprocess.run(
            [
                curl_path, "-s", "-X", "POST",
                url,
                "-H", "Content-Type: application/json",
                "-H", f"Authorization: Bearer {token}",
                "-H", "Accept: application/json",
                "-d", payload_json,
                "--max-time", "30",
                "-w", "\n%{http_code}",
            ],
            capture_output=True, text=True, timeout=35
        )
        output = result.stdout.strip()
        stderr = result.stderr.strip()

        # Son satırda HTTP status var
        lines = output.rsplit("\n", 1)
        if len(lines) == 2:
            body_str, status_str = lines
            http_status = int(status_str) if status_str.isdigit() else 0
        else:
            body_str = output
            http_status = 0

        if stderr:
            print(f"   [DEBUG] curl stderr: {stderr[:200]}", file=sys.stderr)

        try:
            body = json_mod.loads(body_str)
        except json_mod.JSONDecodeError:
            return {"success": False, "error": f"Invalid JSON: {body_str[:200]}", "status": http_status}

        if http_status >= 200 and http_status < 300:
            return {"success": True, "data": body}
        else:
            return {"success": False, "error": body.get("error", body_str[:200]), "status": http_status}

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "curl timeout", "status": 0}
    except Exception as e:
        print(f"   [DEBUG] curl hatası: {type(e).__name__}: {e}", file=sys.stderr)
        return {"success": False, "error": str(e), "status": 0}


# ─────────────────────────────────────────────
# 6. YARDIMCI FONKSİYONLAR
# ─────────────────────────────────────────────

def clean_html(raw: str) -> str:
    """HTML taglarını temizler, bazı blok elementlerini paragrafa çevirir."""
    if not raw:
        return ""

    # <br> ve <br/> → \n
    text = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    # <p> → \n\n
    text = re.sub(r"</p[^>]*>", "\n\n", text, flags=re.IGNORECASE)
    # <h1>-<h6> → \n\n** **\n\n
    text = re.sub(r"</h[1-6][^>]*>", "\n\n", text, flags=re.IGNORECASE)
    # <li> → \n•
    text = re.sub(r"<li[^>]*>", "\n• ", text, flags=re.IGNORECASE)
    # </li> → sil
    text = re.sub(r"</li>", "", text, flags=re.IGNORECASE)
    # HTML decode
    text = html_lib.unescape(text)
    # Tüm kalan HTML taglarını sil
    text = re.sub(r"<[^>]+>", "", text)
    # Çoklu boşluk
    text = re.sub(r"\n{3,}", "\n\n", text)
    # HTML decode tekrar (nesting olabilir)
    text = html_lib.unescape(text)
    return text.strip()


def clean_text(text: str) -> str:
    """HTML entities ve boşlukları temizler."""
    text = html_lib.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def print_banner():
    print("╔══════════════════════════════════════════════════╗")
    print("║   📰 News Fetcher — Otomatik Haber Aracı       ║")
    print("╚══════════════════════════════════════════════════╝")
    print()


def print_field(label: str, value: str, max_len: int = 80):
    """Alan adı ve değeri formatlı yazdırır."""
    if not value:
        print(f"  📌 {label}: <boş>")
        return
    display = value if len(value) <= max_len else value[:max_len] + "..."
    print(f"  📌 {label}: {display}")


# ─────────────────────────────────────────────
# ANA AKIŞ
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Haber linkinden otomatik içerik çıkar ve paylaş",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Örnekler:
  python3 news_fetcher.py https://www.bbc.com/turkce/haberler-12345678
  python3 news_fetcher.py https://www.ntv.com.tr/... --category 3
  python3 news_fetcher.py https://... --video --dry-run
  python3 news_fetcher.py https://... --status draft
        """,
    )
    parser.add_argument("url", help="Haber sayfasının URL'si")
    parser.add_argument("--category", "-c", type=int, help="Kategori ID (otomatik algılanır)")
    parser.add_argument("--video", "-v", action="store_true", help="Sayfadaki videoları içeriğe ekle")
    parser.add_argument("--video-url", help="Elle video URL'si ekle (otomatik bulunamadıysa)")
    parser.add_argument("--dry-run", "-d", action="store_true", help="Sadece çıkar, API'ye gönderme")
    parser.add_argument("--status", "-s", default="draft", choices=["draft", "published", "archived"],
                        help="Haber durumu (varsayılan: draft)")
    parser.add_argument("--featured", "-f", action="store_true", help="Öne çıkan haber olarak işaretle")
    parser.add_argument("--breaking", "-b", action="store_true", help="Son dakika haberi olarak işaretle")
    parser.add_argument("--token", "-t", help="Auth token (NEWS_AUTH_TOKEN env var'dan da okunur)")
    parser.add_argument("--yes", "-y", action="store_true", help="Onay sorma, direkt gönder")

    args = parser.parse_args()

    print_banner()

    # Token
    token = args.token or AUTH_TOKEN
    if not args.dry_run and not token:
        print("❌ Auth token bulunamadı!")
        print("   Çözümler:")
        print("   1. NEWS_AUTH_TOKEN ortam değişkeni ayarla")
        print("   2. --token <TOKEN> parametresi ile ver")
        sys.exit(1)

    # ── Adım 1: Sayfayı çek ──
    print(f"🔗 URL: {args.url}")
    print("⏳ Sayfa indiriliyor...")

    try:
        html = fetch_page(args.url)
    except Exception as e:
        print(f"❌ Sayfa indirilemedi!")
        print(f"   Hata: {type(e).__name__}: {e}")
        sys.exit(1)

    print(f"   ✅ {len(html):,} karakter indirildi")

    # ── Adım 2: Veri çıkar ──
    print("\n📊 İçerik çıkarılıyor...")

    title = extract_title(html)
    description = extract_description(html)
    image_url = extract_image(html)
    content_images = extract_images(html, base_url=args.url)
    content = extract_content(html, url=args.url)
    videos = detect_videos(html, base_url=args.url)
    videos = deduplicate_videos(videos)

    # İçerik fotoğraflarını metne yerleştir
    if content_images:
        content = _embed_images_in_content(content, content_images)
        print(f"   📸 {len(content_images)} içerik fotoğrafı eklendi")

    # SEO
    seo = generate_seo(title, description, content)

    # Slug
    slug = generate_slug(title)

    # Kategori
    category_id = args.category or detect_category(title, content)

    # Video embed
    video_embed_html = ""
    if args.video_url:
        # Elle girilen video URL
        video = {"type": "direct_video", "url": args.video_url}
        videos.append(video)
        video_embed_html = generate_video_embed(video)
        print(f"   🎬 Video URL eklendi: {args.video_url[:80]}...")
    elif args.video and videos:
        print(f"   🎬 {len(videos)} video bulundu, embed kodları oluşturuluyor...")
        video_embed_html = "\n\n".join(generate_video_embed(v) for v in videos)

    # İçeriğe video ekle
    final_content = content
    if video_embed_html:
        # İçeriğin ortasına veya sonuna ekle
        final_content = f"{content}\n\n{video_embed_html}"

    # Slug'a timestamp ekle (çakışma önle)
    import time
    slug_unique = f"{slug}-{int(time.time())}"

    # Kaynak linki ekle
    source_html = f'\n\n<p><strong>Kaynak:</strong> <a href="{args.url}" target="_blank" rel="noopener">{urllib.parse.urlparse(args.url).netloc}</a></p>'
    final_content += source_html

    # ── Adım 3: Önizleme ──
    print("\n" + "─" * 52)
    print("📋 ÖNİZLEME")
    print("─" * 52)
    print_field("Başlık", title)
    print_field("Slug", slug_unique)
    print_field("Özet", description)
    print_field("Görsel", image_url or "—")
    print_field("Kategori ID", str(category_id))
    print_field("Durum", args.status)
    print_field("SEO Title", seo["seo_title"])
    print_field("SEO Description", seo["seo_description"])
    print_field("SEO Keywords", seo["seo_keywords"])
    print_field("İçerik uzunluğu", f"{len(final_content)} karakter")
    if videos:
        print_field("Videolar", f"{len(videos)} adet")
        for i, v in enumerate(videos, 1):
            print(f"      {i}. {v['type']}: {v['url'][:70]}...")
    print("─" * 52)

    # ── Adım 4: API'ye gönder ──
    if args.dry_run:
        print("\n🔍 DRY-RUN modu — API'ye gönderilmedi.")
        print("   Gerçek paylaşım için --dry-run olmadan çalıştır.")
        return

    # Onay
    if not args.yes:
        try:
            confirm = input("✅ Bu haberi paylaşmak istiyor musun? [e/H]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\n❌ İptal edildi.")
            sys.exit(0)

        if confirm not in ("e", "evet", "y", "yes"):
            print("❌ İptal edildi.")
            sys.exit(0)
    else:
        print("✅ Onay beklendi, --yes ile otomatik gönderiliyor...")

    # API payload
    # Token'dan user ID çıkar (JWT payload)
    import base64
    try:
        token_parts = token.split(".")
        if len(token_parts) == 3:
            payload_b64 = token_parts[1]
            # Padding ekle
            payload_b64 += "=" * (4 - len(payload_b64) % 4)
            decoded = json.loads(base64.urlsafe_b64decode(payload_b64))
            author_id = decoded.get("sub", 1)
        else:
            author_id = 1
    except Exception:
        author_id = 1

    payload = {
        "title": title,
        "slug": slug_unique,
        "excerpt": description or content[:200],
        "content": final_content,
        "image_url": image_url,
        "image_alt": title[:255],
        "category_id": category_id,
        "author_id": author_id,
        "status": args.status,
        "is_featured": args.featured,
        "is_breaking": args.breaking,
        "seo_title": seo["seo_title"],
        "seo_description": seo["seo_description"],
        "seo_keywords": seo["seo_keywords"],
    }

    print("\n📤 API'ye gönderiliyor...")
    print(f"   [DEBUG] Payload keys: {list(payload.keys())}")
    print(f"   [DEBUG] category_id type: {type(category_id).__name__} = {category_id}")
    print(f"   [DEBUG] author_id type: {type(author_id).__name__} = {author_id}")
    payload_json = json.dumps(payload)
    print(f"   [DEBUG] JSON size: {len(payload_json)} bytes")
    print(f"   [DEBUG] is_featured: {payload['is_featured']} (type: {type(payload['is_featured']).__name__})")
    print(f"   [DEBUG] is_breaking: {payload['is_breaking']} (type: {type(payload['is_breaking']).__name__})")
    result = create_news_via_api(payload, token)

    if result["success"]:
        data = result["data"]
        news_id = data.get("data", {}).get("id", "?")
        print(f"\n🎉 Haber başarıyla oluşturuldu!")
        print(f"   ID: {news_id}")
        print(f"   Slug: {slug}")
        print(f"   Durum: {args.status}")
        if args.status == "published":
            print(f"   🔗 {SITE_URL}/news/{slug_unique}")
    else:
        print(f"\n❌ Haber oluşturulamadı!")
        print(f"   Hata: {result.get('error', 'Bilinmeyen hata')}")
        print(f"   HTTP {result.get('status', '?')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
