# CLOUT - Self-Hosting Guide

## Overview

CLOUT is a real multi-user app with an Express backend and SQLite database. This guide covers hosting it on your own server and exposing it via Cloudflare Tunnel.

**What you need:**
- A server (Raspberry Pi, old laptop, VPS, anything running Linux)
- A Cloudflare account (free)
- A domain name pointed to Cloudflare DNS

---

## Part 1: Set Up the Server

### 1. Install Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Verify
node -v   # should be v20+
npm -v
```

### 2. Clone and Build

```bash
cd ~
git clone <your-repo-url> clout
cd clout
npm install
npm run build
```

### 3. Configure

```bash
cp .env.example .env
nano .env
```

Set these values:
- `JWT_SECRET` — change to a long random string (e.g. `openssl rand -hex 32`)
- `CAT_NAME` — the gatekeeper answer for registration (default: `Basil`)
- `PORT` — server port (default: `3001`)
- `DB_PATH` — database file location (default: `./data/clout.db`)

### 4. Start the Server

```bash
npm start
```

This starts Express which serves both the API and the built frontend on one port. The SQLite database auto-creates at `./data/clout.db`.

### 5. Keep It Running (systemd)

```bash
sudo tee /etc/systemd/system/clout.service << 'UNIT'
[Unit]
Description=CLOUT App
After=network.target

[Service]
Type=simple
User=<YOUR_USER>
WorkingDirectory=/home/<YOUR_USER>/clout
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
EnvironmentFile=/home/<YOUR_USER>/clout/.env

[Install]
WantedBy=multi-user.target
UNIT
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable clout
sudo systemctl start clout
```

Verify:

```bash
curl http://localhost:3001
```

---

## Part 2: Cloudflare Tunnel

This lets you access CLOUT from anywhere (e.g. `clout.yourdomain.com`) without opening any ports.

### 1. Install cloudflared

```bash
# Debian/Ubuntu
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser. Pick the domain you want to use.

### 3. Create the Tunnel

```bash
cloudflared tunnel create clout
```

Note the **Tunnel ID** it prints.

### 4. Configure the Tunnel

```bash
mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config.yml << 'YML'
tunnel: <TUNNEL_ID>
credentials-file: /home/<YOUR_USER>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: clout.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
YML
```

Replace `<TUNNEL_ID>`, `<YOUR_USER>`, and `clout.yourdomain.com` with your values.

### 5. Add DNS Record

```bash
cloudflared tunnel route dns clout clout.yourdomain.com
```

### 6. Run the Tunnel

```bash
cloudflared tunnel run clout
```

Visit `https://clout.yourdomain.com` — it should load.

### 7. Install as a Service (auto-start on boot)

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## Part 3: Updating the App

```bash
cd ~/clout
git pull
npm install
npm run build
sudo systemctl restart clout
```

---

## Quick Reference

| What | Command |
|---|---|
| Start app | `sudo systemctl start clout` |
| Stop app | `sudo systemctl stop clout` |
| View logs | `journalctl -u clout -f` |
| Tunnel status | `sudo systemctl status cloudflared` |
| Tunnel logs | `journalctl -u cloudflared -f` |
| Rebuild | `npm run build` |
| Check locally | `curl http://localhost:3001` |

---

## Troubleshooting

**App not loading?**
- Check `curl http://localhost:3001` on the server
- Check `sudo systemctl status clout`

**Tunnel says "connection refused"?**
- Make sure the app is running on port 3001
- Check the port in `config.yml` matches your `.env`

**Database issues?**
- Database lives at `./data/clout.db` by default
- To reset: stop the server, delete `data/clout.db`, restart

**HTTPS?**
- Cloudflare Tunnel handles this automatically. Free HTTPS.
