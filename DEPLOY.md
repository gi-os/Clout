# CLOUT - Self-Hosting Guide

## Overview

This guide covers hosting CLOUT on your own server and exposing it to the internet via a Cloudflare Tunnel. No need to open ports on your router or mess with port forwarding.

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

This creates a `dist/` folder with static files. That's your entire app.

### 3. Serve It

**Option A: Simple (serve package)**

```bash
npm install -g serve
serve -s dist -l 3000
```

**Option B: Nginx (recommended for production)**

```bash
sudo apt install -y nginx
```

Create the config:

```bash
sudo tee /etc/nginx/sites-available/clout << 'CONF'
server {
    listen 3000;
    server_name _;
    root /home/<YOUR_USER>/clout/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
CONF
```

Enable and start:

```bash
sudo ln -sf /etc/nginx/sites-available/clout /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Keep It Running (systemd)

If using `serve`, create a service so it survives reboots:

```bash
sudo tee /etc/systemd/system/clout.service << 'UNIT'
[Unit]
Description=CLOUT App
After=network.target

[Service]
Type=simple
User=<YOUR_USER>
WorkingDirectory=/home/<YOUR_USER>/clout
ExecStart=/usr/bin/npx serve -s dist -l 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable clout
sudo systemctl start clout
```

Verify it's running:

```bash
curl http://localhost:3000
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

# Or download directly
# curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
# sudo dpkg -i cloudflared.deb
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser. Pick the domain you want to use. It saves a cert to `~/.cloudflared/`.

### 3. Create the Tunnel

```bash
cloudflared tunnel create clout
```

Note the **Tunnel ID** it prints (e.g. `a1b2c3d4-...`).

### 4. Configure the Tunnel

```bash
mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config.yml << 'YML'
tunnel: <TUNNEL_ID>
credentials-file: /home/<YOUR_USER>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: clout.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
YML
```

Replace:
- `<TUNNEL_ID>` with your tunnel ID
- `<YOUR_USER>` with your Linux username
- `clout.yourdomain.com` with your actual subdomain

### 5. Add DNS Record

```bash
cloudflared tunnel route dns clout clout.yourdomain.com
```

This creates a CNAME record in Cloudflare pointing to your tunnel.

### 6. Run the Tunnel

Test it first:

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

Verify:

```bash
sudo systemctl status cloudflared
```

---

## Part 3: Updating the App

When you make changes:

```bash
cd ~/clout
git pull
npm install
npm run build
# If using serve, restart the service:
sudo systemctl restart clout
# If using nginx, just rebuild — nginx serves static files directly
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
| Check locally | `curl http://localhost:3000` |

---

## Troubleshooting

**App not loading?**
- Check `curl http://localhost:3000` on the server first
- If that works but the tunnel doesn't, check `sudo systemctl status cloudflared`

**Tunnel says "connection refused"?**
- Make sure the app is actually running on port 3000
- Check the port in `config.yml` matches

**DNS not resolving?**
- Verify the CNAME exists: `dig clout.yourdomain.com`
- Can take a few minutes to propagate

**Want HTTPS?**
- Cloudflare Tunnel handles this automatically. Your visitors get HTTPS for free.
