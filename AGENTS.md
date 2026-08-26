# OpenCode - Kalıcı Hafıza (Obsidian Vault)

## Vault Konumu
`~/Documents/Obsidian Vault/`

## Kurallar

1. **Her oturum başında** vault'u oku:
   - `Sessions/` klasöründeki son oturumları gözden geçir
   - `Projects/` klasöründeki aktif projeleri incele
   - `MOC/📋 Ana Sayfa.md` dosyasını kontrol et

2. **Her oturum sonunda** vault'a yaz:
   - Yeni bir otomatik oturum notu oluştur (`Sessions/YYYY-MM-DD_HH-mm.md`)
   - Yapılanları, kararları ve takip gerekenleri kaydet
   - İlgili notlara `[[wiki link]]` ekle

3. **Proje bilgileri**:
   - Yeni bir proje başladığında `Projects/` altına not ekle
   - Proje durumunu güncelle
   - MOC/Projeler.md dosyasını güncelle

4. **Deployment**:
   - Her kod değişikliğinde `deploy.sh` scriptini kullan
   - Backend: `./deploy.sh backend "mesaj"`
   - Frontend: `./deploy.sh frontend "mesaj"` (Vercel otomatik)
   - Her iki taraf: `./deploy.sh all "mesaj"`

## Dosya Yapısı

```
Obsidian Vault/
├── Inbox/                    # Yeni notlar (hızlı erişim)
├── Sessions/                 # Otomatik oturum kayıtları
│   └── YYYY-MM-DD_HH-mm.md
├── Projects/                 # Proje bilgileri
│   └── proje-adi.md
├── MOC/                      # Map of Content (indeksler)
│   ├── 📋 Ana Sayfa.md
│   ├── Oturumlar.md
│   └── Projeler.md
├── Templates/                # Şablonlar
│   ├── Günlük.md
│   ├── Oturum.md
│   └── Proje.md
├── Assets/Attachments/       # Dosya ekleri
├── Daily Notes/              # Günlük notlar
├── Archive/                  # Arşiv
└── deploy.sh                 # Deployment scripti
```

## Oturum Kaydı Formatı

Her otomatik oturum sonunda şu formatta bir dosya oluştur:

```markdown
---
type: oturum
date: YYYY-MM-DD HH:mm
tags: [oturum]
project: "[[Projects/proje-adi]]"
---

# YYYY-MM-DD HH:mm Oturum

## Konu
Kullanıcının istediği konu

## Yapılanlar
- İşlem 1
- İşlem 2

## Kararlar / Sonuçlar
- Karar 1

## Takip Gerekenler
- [ ] Takip 1

## İlgili Notlar
- [[önceki oturum|🔗 Önceki]]
- [[MOC/📋 Ana Sayfa|📋 Ana Sayfa]]

## Notlar
Ek bilgiler
```

## Deployment Workflow

### Backend (Cloudflare Workers)
```bash
cd ~/news-platform-v2-backend
git add . && git commit -m "mesaj" && git push
wrangler deploy
```

### Frontend (Vercel - otomatik)
```bash
cd ~/news-platform-v2-frontend
git add . && git commit -m "mesaj" && git push
# Vercel otomatik deploy eder (~1 dk)
```

### Hızlı Deployment
```bash
./deploy.sh all "mesaj"
```
