# Pathment — Deployment Guide (Single-Tenant)

> Each company gets its own isolated backend instance and PostgreSQL database.  
> Frontend is deployed on Vercel (one deployment per company).  
> Backend instances run on a single DigitalOcean droplet behind Nginx.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Domain & DNS Setup (Namecheap)](#3-domain--dns-setup-namecheap)
4. [DigitalOcean Droplet Setup](#4-digitalocean-droplet-setup)
5. [PostgreSQL Installation](#5-postgresql-installation)
6. [Node.js & PM2 Installation](#6-nodejs--pm2-installation)
7. [Deploy the First Company (Backend)](#7-deploy-the-first-company-backend)
8. [Nginx Reverse Proxy & SSL](#8-nginx-reverse-proxy--ssl)
9. [Deploy Frontend on Vercel](#9-deploy-frontend-on-vercel)
10. [Onboarding a New Company](#10-onboarding-a-new-company)
11. [Offboarding / Removing a Company](#11-offboarding--removing-a-company)
12. [Maintenance & Operations](#12-maintenance--operations)
13. [Environment Variables Reference](#13-environment-variables-reference)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Architecture Overview

```
                         pathment.me (Namecheap DNS)
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
     acme.pathment.me     globex.pathment.me     wayne.pathment.me
       (Vercel)              (Vercel)              (Vercel)
              │                    │                     │
              └────────┬──────────┴──────────┬──────────┘
                       │   HTTPS (API calls) │
                       ▼                     ▼
              ┌─────────────────────────────────────┐
              │    DigitalOcean Droplet ($6/mo)      │
              │    ┌─────────────┐                   │
              │    │   Nginx     │ :443              │
              │    └──┬──────┬──┘                    │
              │       │      │                       │
              │  :5001│ :5002│  (PM2 processes)      │
              │   ┌───┴┐  ┌─┴───┐                   │
              │   │acme│  │globex│  ← Node.js apps   │
              │   └──┬─┘  └──┬──┘                    │
              │      │       │                       │
              │  ┌───┴───────┴───┐                   │
              │  │  PostgreSQL   │                    │
              │  │ pathment_acme │                    │
              │  │pathment_globex│   ← separate DBs  │
              │  └───────────────┘                    │
              └─────────────────────────────────────┘
```

**URL structure:**

| Component | URL Pattern | Example |
|-----------|------------|---------|
| Marketing Site | `https://pathment.me` | `https://pathment.me` |
| Frontend  | `https://<company>.pathment.me` | `https://acme.pathment.me` |
| Backend API | `https://api-<company>.pathment.me/api` | `https://api-acme.pathment.me/api` |
| WebSocket | `https://api-<company>.pathment.me/socket.io` | `https://api-acme.pathment.me/socket.io` |

---

## 2. Prerequisites

| Item | How to Get (Free) |
|------|-------------------|
| **GitHub Student Developer Pack** | [education.github.com/pack](https://education.github.com/pack) |
| **DigitalOcean $200 credit** | Included in Student Pack — lasts ~33 months on $6 droplet |
| **Namecheap .me domain (free 1 year)** | Included in Student Pack — register `pathment.me` |
| **Vercel account** | Free Hobby plan, unlimited projects |
| **Cloudinary account** | Free tier: 25 credits/month |
| **Email provider** | Gmail SMTP (free, use App Password) or Brevo free tier |
| **Groq API key** | Free tier for LLM features |

---

## 3. Domain & DNS Setup (Namecheap)

### 3.1 Point DNS to DigitalOcean

1. Log in to **Namecheap** → Domain List → `pathment.me` → **Manage**
2. Under **Nameservers**, select **Custom DNS** and enter:
   ```
   ns1.digitalocean.com
   ns2.digitalocean.com
   ns3.digitalocean.com
   ```
3. Save. DNS propagation takes 15-30 minutes (up to 48 hours).

### 3.2 Add Domain in DigitalOcean

1. In DigitalOcean console → **Networking** → **Domains** → Add `pathment.me`
2. Add these DNS records (replace `<DROPLET_IP>` with your droplet's IP):

| Type | Hostname | Value | TTL |
|------|----------|-------|-----|
| A | `@` | `<DROPLET_IP>` | 3600 |
| A | `*` | `<DROPLET_IP>` | 3600 |

> The wildcard `*` record routes all subdomains (`api-acme.pathment.me`, etc.) to your droplet.  
> Vercel subdomains will override this via CNAME — see [Section 9](#9-deploy-frontend-on-vercel).

---

## 4. DigitalOcean Droplet Setup

### 4.1 Create the Droplet

1. **DigitalOcean** → Create → Droplets
2. Settings:
   - **Region:** Choose closest to your target companies
   - **Image:** Ubuntu 24.04 LTS
   - **Size:** Basic → Regular → **$6/mo** (1 vCPU, 1 GB RAM, 25 GB SSD)
   - **Authentication:** SSH key (recommended) or password
   - **Hostname:** `pathment-prod`
3. Create and note the IP address.

### 4.2 Initial Server Setup

```bash
# SSH into your droplet
ssh root@<DROPLET_IP>

# Create a non-root user
adduser pathment
usermod -aG sudo pathment

# Set up SSH for the new user
mkdir -p /home/pathment/.ssh
cp ~/.ssh/authorized_keys /home/pathment/.ssh/
chown -R pathment:pathment /home/pathment/.ssh
chmod 700 /home/pathment/.ssh
chmod 600 /home/pathment/.ssh/authorized_keys

# Configure firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Set up swap (important for 1GB RAM droplet)
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Log out and re-login as pathment user
exit
```

```bash
ssh pathment@<DROPLET_IP>
```

---

## 5. PostgreSQL Installation

```bash
# Install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Verify it's running
sudo systemctl status postgresql

# Secure the postgres superuser
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'CHANGE_THIS_STRONG_PASSWORD';"
```

> **Important:** Replace `CHANGE_THIS_STRONG_PASSWORD` with a real strong password. You'll use this to create per-company databases.

### Create the First Company Database

```bash
# Replace 'acme' with the company slug
sudo -u postgres psql <<SQL
CREATE DATABASE pathment_acme;
CREATE USER pathment_acme_user WITH ENCRYPTED PASSWORD 'GENERATE_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE pathment_acme TO pathment_acme_user;
ALTER DATABASE pathment_acme OWNER TO pathment_acme_user;
\c pathment_acme
GRANT ALL ON SCHEMA public TO pathment_acme_user;
SQL
```

---

## 6. Node.js & PM2 Installation

```bash
# Install Node.js 20 LTS via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm alias default 20
node -v  # should show v20.x.x

# Install PM2 globally
npm install -g pm2

# Set PM2 to auto-start on reboot
pm2 startup
# Run the command it outputs (starts with 'sudo env PATH=...')
```

---

## 7. Deploy the First Company (Backend)

### 7.1 Clone the Repository

```bash
# Create a directory structure for company instances
mkdir -p ~/apps
cd ~/apps

# Clone the repo for this company
git clone https://github.com/YOUR_USERNAME/pathment.git acme
cd acme/server
npm install --production
```

### 7.2 Create the `.env` File

```bash
cat > .env << 'ENVFILE'
# ============================================
# Pathment Server — Company: acme
# ============================================

# Server
NODE_ENV=production
PORT=5001
CLIENT_URL=https://acme.pathment.me

# Database
DATABASE_URL=postgres://pathment_acme_user:YOUR_DB_PASSWORD@localhost:5432/pathment_acme

# JWT — generate unique secrets per company!
JWT_SECRET=GENERATE_WITH_openssl_rand_-hex_64
JWT_REFRESH_SECRET=GENERATE_WITH_openssl_rand_-hex_64
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AI (Groq — shared across companies, free tier)
AI_API_KEY=your_groq_api_key
AI_MODEL=llama-3.1-8b-instant
AI_BASE_URL=https://api.groq.com/openai/v1
AI_PROVIDER=groq

# Email (Gmail SMTP example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_FROM=Pathment <noreply@pathment.me>

# Cloudinary (shared free tier account)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Optional
GAMIFICATION_BOOTSTRAP_DISABLED=false
NOTIFICATION_SCHEDULER_DISABLED=false
ENVFILE
```

**Generate JWT secrets:**

```bash
openssl rand -hex 64  # Run twice — one for JWT_SECRET, one for JWT_REFRESH_SECRET
```

### 7.3 Initialize the Database

```bash
cd ~/apps/acme/server

# Create all tables
npm run db:sync

# Seed the admin user (email: admin@pathment.com, password: Admin@123!ChangeMeNow)
npm run seed:admin
```

> ⚠️ **Change the admin password immediately** after first login via the app.

### 7.4 Start with PM2

```bash
# Start the server process (named by company)
pm2 start src/index.js --name "pathment-acme" --max-memory-restart 200M

# Verify it's running
pm2 status
pm2 logs pathment-acme --lines 20

# Save the PM2 process list so it auto-restarts on reboot
pm2 save
```

### 7.5 Test the API

```bash
curl http://localhost:5001/api/health
# Should return a success response
```

---

## 8. Nginx Reverse Proxy & SSL

### 8.1 Install Nginx & Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 8.2 Create Nginx Config for the Company

```bash
sudo tee /etc/nginx/sites-available/api-acme.pathment.me << 'NGINX'
server {
    listen 80;
    server_name api-acme.pathment.me;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout (for Socket.IO)
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Max upload size (matches Express 10MB limit)
    client_max_body_size 10M;
}
NGINX
```

### 8.3 Enable the Site & Get SSL

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/api-acme.pathment.me /etc/nginx/sites-enabled/

# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Get SSL certificate (auto-configures HTTPS + redirect)
sudo certbot --nginx -d api-acme.pathment.me --non-interactive --agree-tos -m your_email@gmail.com
```

### 8.4 Verify

```bash
curl https://api-acme.pathment.me/
# Should return: {"success":true,"message":"Pathment API Server",...}
```

### 8.5 Auto-Renew SSL

Certbot sets up auto-renewal automatically. Verify with:

```bash
sudo certbot renew --dry-run
```

---

## 9. Deploy Frontend on Vercel

### 9.1 Initial Setup (One-Time)

1. Push your repo to GitHub (if not already).
2. Go to [vercel.com](https://vercel.com) → **Add New Project**.
3. Import the GitHub repo.
4. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `client-interface`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`

### 9.2 Per-Company Frontend Deployment

Each company needs its own Vercel project (or you can use branch-based deployments).

**Option A: Separate Vercel projects (recommended for isolation)**

1. In Vercel, click **Add New Project** → import the same repo.
2. Give it a distinct project name, e.g., `pathment-acme`.
3. Set **Root Directory:** `client-interface`
4. Add environment variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://api-acme.pathment.me/api` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://api-acme.pathment.me` |

5. Deploy.

### 9.3 Custom Domain on Vercel

1. In the Vercel project dashboard → **Settings** → **Domains**.
2. Add: `acme.pathment.me`
3. Vercel will show you a CNAME record to add.
4. In **DigitalOcean DNS** (Networking → Domains → pathment.me), add:

| Type | Hostname | Value | TTL |
|------|----------|-------|-----|
| CNAME | `acme` | `cname.vercel-dns.com.` | 3600 |

> This overrides the wildcard A record for this specific subdomain.

5. Wait for DNS propagation, then verify in Vercel that the domain is active.

### 9.4 Verify End-to-End

1. Open `https://acme.pathment.me` in a browser.
2. You should see the Pathment login page.
3. Log in with `admin@pathment.com` / `Admin@123!ChangeMeNow`.
4. Verify API calls work, WebSocket connects, and pages load.

---

## 10. Onboarding a New Company

When a new company signs up, follow these steps. We'll use **"globex"** as the example company slug.

### Step 1: Create the Database

```bash
ssh pathment@<DROPLET_IP>

# Replace 'globex' and generate a strong password
COMPANY=globex
DB_PASS=$(openssl rand -hex 16)
echo "Save this DB password: $DB_PASS"

sudo -u postgres psql <<SQL
CREATE DATABASE pathment_${COMPANY};
CREATE USER pathment_${COMPANY}_user WITH ENCRYPTED PASSWORD '${DB_PASS}';
GRANT ALL PRIVILEGES ON DATABASE pathment_${COMPANY} TO pathment_${COMPANY}_user;
ALTER DATABASE pathment_${COMPANY} OWNER TO pathment_${COMPANY}_user;
\c pathment_${COMPANY}
GRANT ALL ON SCHEMA public TO pathment_${COMPANY}_user;
SQL
```

### Step 2: Clone & Configure the Backend

```bash
cd ~/apps

# Clone a fresh copy for this company
git clone https://github.com/YOUR_USERNAME/pathment.git $COMPANY
cd $COMPANY/server
npm install --production

# Determine the next available port
NEXT_PORT=$(( $(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
ports = []
for p in procs:
    env = p.get('pm2_env', {}).get('env', {})
    port = env.get('PORT', 0)
    if port: ports.append(int(port))
print(max(ports) + 1 if ports else 5001)
" 2>/dev/null || echo 5001) ))
echo "Using port: $NEXT_PORT"

# Generate JWT secrets
JWT_S=$(openssl rand -hex 64)
JWT_R=$(openssl rand -hex 64)

# Create .env
cat > .env << ENVFILE
NODE_ENV=production
PORT=${NEXT_PORT}
CLIENT_URL=https://${COMPANY}.pathment.me
DATABASE_URL=postgres://pathment_${COMPANY}_user:${DB_PASS}@localhost:5432/pathment_${COMPANY}
JWT_SECRET=${JWT_S}
JWT_REFRESH_SECRET=${JWT_R}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
AI_API_KEY=your_groq_api_key
AI_MODEL=llama-3.1-8b-instant
AI_BASE_URL=https://api.groq.com/openai/v1
AI_PROVIDER=groq
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_FROM=Pathment <noreply@pathment.me>
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
GAMIFICATION_BOOTSTRAP_DISABLED=false
NOTIFICATION_SCHEDULER_DISABLED=false
ENVFILE
```

### Step 3: Initialize Database & Start

```bash
# Create tables
npm run db:sync

# Seed admin user
npm run seed:admin

# Start with PM2
pm2 start src/index.js --name "pathment-${COMPANY}" --max-memory-restart 200M
pm2 save
```

### Step 4: Configure Nginx

```bash
sudo tee /etc/nginx/sites-available/api-${COMPANY}.pathment.me << NGINX
server {
    listen 80;
    server_name api-${COMPANY}.pathment.me;

    location / {
        proxy_pass http://127.0.0.1:${NEXT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    client_max_body_size 10M;
}
NGINX

sudo ln -s /etc/nginx/sites-available/api-${COMPANY}.pathment.me /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get SSL
sudo certbot --nginx -d api-${COMPANY}.pathment.me --non-interactive --agree-tos -m your_email@gmail.com
```

### Step 5: Deploy Frontend on Vercel

1. **Vercel** → Add New Project → import `pathment` repo.
2. Project name: `pathment-<COMPANY>`.
3. Root Directory: `client-interface`.
4. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://api-<COMPANY>.pathment.me/api`
   - `NEXT_PUBLIC_SOCKET_URL` = `https://api-<COMPANY>.pathment.me`
5. Deploy.

### Step 6: Add DNS Records

In **DigitalOcean DNS** for `pathment.me`:

| Type | Hostname | Value |
|------|----------|-------|
| CNAME | `<COMPANY>` | `cname.vercel-dns.com.` |

> The `api-<COMPANY>` subdomain is already covered by the wildcard A record.

### Step 7: Verify

```bash
# Test API
curl https://api-${COMPANY}.pathment.me/

# Test frontend
# Open https://<COMPANY>.pathment.me in browser
```

### Quick Reference: New Company Checklist

- [ ] Database created (`pathment_<company>`)
- [ ] Backend cloned to `~/apps/<company>/`
- [ ] `.env` configured with unique port, DB creds, JWT secrets
- [ ] `npm run db:sync` and `npm run seed:admin` ran successfully
- [ ] PM2 process started (`pathment-<company>`)
- [ ] Nginx site config created and enabled
- [ ] SSL certificate obtained via Certbot
- [ ] Vercel project created with correct env vars
- [ ] CNAME DNS record added for `<company>.pathment.me`
- [ ] End-to-end test passed (login works, API responds, WebSocket connects)

---

## 11. Offboarding / Removing a Company

```bash
COMPANY=globex  # company to remove

# 1. Stop and remove PM2 process
pm2 stop pathment-${COMPANY}
pm2 delete pathment-${COMPANY}
pm2 save

# 2. Remove Nginx config
sudo rm /etc/nginx/sites-enabled/api-${COMPANY}.pathment.me
sudo rm /etc/nginx/sites-available/api-${COMPANY}.pathment.me
sudo nginx -t && sudo systemctl reload nginx

# 3. (Optional) Backup then drop the database
sudo -u postgres pg_dump pathment_${COMPANY} > ~/backups/pathment_${COMPANY}_$(date +%Y%m%d).sql
sudo -u postgres psql -c "DROP DATABASE pathment_${COMPANY};"
sudo -u postgres psql -c "DROP USER pathment_${COMPANY}_user;"

# 4. Remove app files
rm -rf ~/apps/${COMPANY}

# 5. Remove SSL certificate
sudo certbot delete --cert-name api-${COMPANY}.pathment.me

# 6. Remove DNS records (CNAME for frontend, A record is wildcard so stays)
# → DigitalOcean → Networking → Domains → pathment.me → delete the CNAME for <COMPANY>

# 7. Delete Vercel project
# → Vercel dashboard → pathment-<COMPANY> → Settings → Delete Project
```

---

## 12. Maintenance & Operations

### 12.1 Updating Code for All Companies

```bash
# Update all company instances at once
for dir in ~/apps/*/; do
    COMPANY=$(basename "$dir")
    echo "=== Updating ${COMPANY} ==="
    cd "$dir"
    git pull origin main
    cd server
    npm install --production
    pm2 restart "pathment-${COMPANY}"
    cd ~
done
pm2 save
```

### 12.2 Database Migrations

When you add new models or change existing ones:

```bash
COMPANY=acme
cd ~/apps/${COMPANY}/server

# Option 1: Safe sync (creates new tables only, doesn't alter existing)
npm run db:sync

# Option 2: Alter sync (modifies existing tables — review changes first)
npm run db:sync:alter
```

> Run migrations on **each company database** individually.

### 12.3 Monitoring

```bash
# View all running processes
pm2 status

# View logs for a specific company
pm2 logs pathment-acme --lines 50

# Monitor CPU/memory in real-time
pm2 monit

# Check disk usage
df -h

# Check memory usage
free -m

# Check database sizes
sudo -u postgres psql -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname LIKE 'pathment_%';"
```

### 12.4 Backups

```bash
# Create backup directory
mkdir -p ~/backups

# Backup all company databases
for db in $(sudo -u postgres psql -t -c "SELECT datname FROM pg_database WHERE datname LIKE 'pathment_%';"); do
    db=$(echo $db | xargs)  # trim whitespace
    echo "Backing up $db..."
    sudo -u postgres pg_dump "$db" | gzip > ~/backups/${db}_$(date +%Y%m%d).sql.gz
done

# Set up a daily cron job
crontab -e
# Add this line:
# 0 3 * * * /home/pathment/backup.sh >> /home/pathment/backups/backup.log 2>&1
```

### 12.5 Log Rotation

PM2 handles log rotation with the `pm2-logrotate` module:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 12.6 Capacity Planning

On a **$6 droplet** (1 vCPU, 1 GB RAM + 2 GB swap):

| Companies | RAM per Instance | Feasibility |
|-----------|-----------------|-------------|
| 1-3       | ~150-200 MB     | Comfortable |
| 4-5       | ~150-200 MB     | Tight, monitor swap usage |
| 6+        | —               | Upgrade to $12/mo droplet (2 GB RAM) |

Monitor with: `pm2 monit` and `free -m`

---

## 13. Environment Variables Reference

### Backend (`server/.env`)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `production` | Environment mode |
| `PORT` | Yes | `5001` | Unique port per company (5001, 5002, ...) |
| `CLIENT_URL` | Yes | `https://acme.pathment.me` | Frontend URL for CORS |
| `DATABASE_URL` | Yes | `postgres://user:pass@localhost:5432/pathment_acme` | Company database |
| `JWT_SECRET` | Yes | *(64-byte hex)* | Access token signing key |
| `JWT_REFRESH_SECRET` | Yes | *(64-byte hex)* | Refresh token signing key |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token lifetime |
| `AI_API_KEY` | No | `gsk_...` | Groq/OpenAI API key |
| `AI_MODEL` | No | `llama-3.1-8b-instant` | AI model to use |
| `AI_BASE_URL` | No | `https://api.groq.com/openai/v1` | AI API endpoint |
| `AI_PROVIDER` | No | `groq` | AI provider name |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP host |
| `EMAIL_PORT` | No | `587` | SMTP port |
| `EMAIL_SECURE` | No | `false` | Use TLS |
| `EMAIL_USER` | No | `you@gmail.com` | SMTP username |
| `EMAIL_PASSWORD` | No | `app_password` | SMTP password |
| `EMAIL_FROM` | No | `Pathment <noreply@pathment.me>` | Sender address |
| `CLOUDINARY_CLOUD_NAME` | No | `your_cloud` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | `123456` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | `abc123` | Cloudinary secret |
| `GAMIFICATION_BOOTSTRAP_DISABLED` | No | `false` | Skip badge seeding |
| `NOTIFICATION_SCHEDULER_DISABLED` | No | `false` | Skip notification scheduler |

### Frontend (Vercel environment variables)

| Variable | Required | Example |
|----------|----------|---------|
| `NEXT_PUBLIC_API_URL` | Yes | `https://api-acme.pathment.me/api` |
| `NEXT_PUBLIC_SOCKET_URL` | No | `https://api-acme.pathment.me` |

---

## 14. Troubleshooting

### API not responding

```bash
# Check if process is running
pm2 status

# Check logs for errors
pm2 logs pathment-acme --err --lines 50

# Restart the process
pm2 restart pathment-acme
```

### Database connection fails

```bash
# Test connection manually
psql postgres://pathment_acme_user:PASSWORD@localhost:5432/pathment_acme -c "SELECT 1;"

# Check PostgreSQL is running
sudo systemctl status postgresql

# Check PostgreSQL logs
sudo tail -50 /var/log/postgresql/postgresql-*-main.log
```

### Nginx returns 502 Bad Gateway

```bash
# Backend process probably crashed
pm2 status  # check if process is "errored" or "stopped"
pm2 restart pathment-acme
pm2 logs pathment-acme --lines 20

# Check nginx config is pointing to correct port
cat /etc/nginx/sites-available/api-acme.pathment.me | grep proxy_pass
```

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Force renew
sudo certbot renew --force-renewal

# Check nginx has SSL config
sudo nginx -t
```

### WebSocket not connecting

- Verify `proxy_set_header Upgrade` and `Connection "upgrade"` are in Nginx config.
- Verify `CLIENT_URL` in `.env` matches the actual frontend domain (CORS).
- Check browser console for mixed-content errors (HTTP vs HTTPS).

### Out of memory

```bash
# Check memory
free -m

# Check which process uses most memory
pm2 monit

# Reduce PM2 memory limit
pm2 restart pathment-acme --max-memory-restart 150M

# If needed, upgrade droplet (DigitalOcean → Droplet → Resize)
```

### Port conflicts

```bash
# Find what's using a port
sudo lsof -i :5001

# List all PM2 processes and their ports
pm2 describe pathment-acme | grep PORT
```

---

## Port Allocation Registry

Keep track of which company uses which port:

| Company | Port | Database | Status |
|---------|------|----------|--------|
| acme    | 5001 | pathment_acme | active |
| globex  | 5002 | pathment_globex | active |
| wayne   | 5003 | pathment_wayne | active |

> Update this table each time you onboard or offboard a company.
