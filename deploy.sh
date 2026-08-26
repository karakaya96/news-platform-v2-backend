#!/bin/bash

# News Platform v2 - Deploy Script
# Kullanım: ./deploy.sh [backend|frontend|all] [mesaj]

set -e

BACKEND_DIR="$HOME/news-platform-v2-backend"
FRONTEND_DIR="$HOME/news-platform-v2-frontend"
COMMIT_MSG="${2:-update: $(date +%Y-%m-%d\ %H:%M)}"

deploy_backend() {
    echo "🚀 Backend deploy ediliyor..."
    cd "$BACKEND_DIR"
    
    git add .
    git commit -m "$COMMIT_MSG" || echo "Değişiklik yok"
    git push origin main
    
    echo "📦 Wrangler deploy başlatılıyor..."
    wrangler deploy
    
    echo "✅ Backend deploy tamamlandı!"
}

deploy_frontend() {
    echo "🚀 Frontend deploy ediliyor..."
    cd "$FRONTEND_DIR"
    
    git add .
    git commit -m "$COMMIT_MSG" || echo "Değişiklik yok"
    git push origin main
    
    echo "✅ Frontend push tamamlandı! Vercel otomatik deploy edecek."
}

case "${1:-all}" in
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all)
        deploy_backend
        deploy_frontend
        echo ""
        echo "🎉 Tüm deploy'lar tamamlandı!"
        echo "   Backend: https://news-platform-v2-backend.workers.dev"
        echo "   Frontend: https://newshaberglobal.vercel.app"
        ;;
    *)
        echo "Kullanım: $0 [backend|frontend|all] [mesaj]"
        exit 1
        ;;
esac
