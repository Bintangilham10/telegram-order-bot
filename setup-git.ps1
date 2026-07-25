# Script untuk membuat commit bertahap ke GitHub
# Project: Telegram Order Bot (Boslay)

Set-Location "c:\Users\binta\OneDrive\Documents\Coding\TelegramBot-auto-order"

# 1. Init git repo
git init
git remote add origin https://github.com/Bintangilham10/telegram-order-bot.git
git branch -M main

# ===================================================================
# KATEGORI 1: INITIAL SETUP & PROJECT STRUCTURE
# ===================================================================

# Commit 1: Init project
git add package.json
git commit -m "init: initialize monorepo project with npm workspaces"

# Commit 2: Gitignore
git add .gitignore
git commit -m "init: add .gitignore for node_modules, env, and build artifacts"

# Commit 3: Environment config
git add .env.example
git commit -m "config: add environment variable template (.env.example)"

# ===================================================================
# KATEGORI 2: SHARED PACKAGE
# ===================================================================

# Commit 4: Shared constants
git add packages/shared/package.json packages/shared/src/index.js
git commit -m "feat(shared): add shared constants for order, ticket, and wallet status"

# ===================================================================
# KATEGORI 3: DATABASE & SCHEMA
# ===================================================================

# Commit 5: Database schema
git add apps/server/schema.sql
git commit -m "feat(db): create SQLite schema with products, orders, users, and settings tables"

# Commit 6: Database module
git add apps/server/src/db.js
git commit -m "feat(db): implement database module with better-sqlite3 and auto-migration"

# ===================================================================
# KATEGORI 4: SERVER CORE & SERVICES
# ===================================================================

# Commit 7: Security utils
git add apps/server/src/utils/security.js
git commit -m "feat(auth): add session token, HMAC signing, and Telegram initData verification"

# Commit 8: Telegram service
git add apps/server/src/services/telegram.js
git commit -m "feat(telegram): implement Telegram Bot API service with sendMessage, sendPhoto, and webhook"

# Commit 9: Payment service
git add apps/server/src/services/payment.js
git commit -m "feat(payment): add payment image validation and secure file upload handling"

# Commit 10: Server package config
git add apps/server/package.json
git commit -m "config(server): add server package.json with hono, better-sqlite3 dependencies"

# Commit 11: Main server application
git add apps/server/src/index.js
git commit -m "feat(server): implement main bot server with order flow, rate limiting, and admin API"

# ===================================================================
# KATEGORI 5: ADMIN PANEL (FRONTEND)
# ===================================================================

# Commit 12: Admin panel config
git add apps/admin/package.json apps/admin/vite.config.js apps/admin/index.html
git commit -m "config(admin): setup React admin panel with Vite build configuration"

# Commit 13: Admin entry point
git add apps/admin/src/main.jsx
git commit -m "feat(admin): add React entry point with StrictMode rendering"

# Commit 14: Login page component
git add apps/admin/src/components/LoginPage.jsx
git commit -m "feat(admin): create secure login page component for admin authentication"

# Commit 15: API client library
git add apps/admin/src/lib/api.js
git commit -m "feat(admin): implement API client library with full CRUD operations"

# Commit 16: Admin styles
git add apps/admin/src/styles.css
git commit -m "style(admin): add complete admin panel stylesheet with responsive design"

# Commit 17: Admin main app
git add apps/admin/src/App.jsx
git commit -m "feat(admin): build main admin dashboard with product, order, and user management"

# ===================================================================
# KATEGORI 6: TESTING
# ===================================================================

# Commit 18: Payment tests
git add apps/server/test/manual-payment.test.js
git commit -m "test(payment): add unit tests for manual payment validation and proof upload"

# Commit 19: Migration tests
git add apps/server/test/migration.test.js
git commit -m "test(db): add migration tests to verify database schema upgrades"

# ===================================================================
# KATEGORI 7: DEVOPS & DEPLOYMENT
# ===================================================================

# Commit 20: Dockerfile
git add Dockerfile
git commit -m "devops: add multi-stage Dockerfile with Alpine Node.js for production"

# Commit 21: Docker Compose
git add docker-compose.yml .dockerignore
git commit -m "devops: add docker-compose.yml and .dockerignore for container orchestration"

# ===================================================================
# KATEGORI 8: DOCUMENTATION
# ===================================================================

# Commit 22: Setup documentation
git add SETUP.md
git commit -m "docs: add comprehensive setup guide with payment flow and deployment instructions"

# Commit 23: Add any remaining files
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "chore: add remaining project configuration files"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " All commits created successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Total commits:"
git log --oneline | Measure-Object -Line
Write-Host ""
Write-Host "Commit history:"
git log --oneline --graph
Write-Host ""
Write-Host "Ready to push! Run: git push -u origin main"
