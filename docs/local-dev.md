# Aura — Local Development

## Quick Setup

### Prerequisites
- Node.js (LTS recommended)
- Docker (optional, for containerized deployment)

### Method 1: Direct Run

```bash
# Start the signaling server
cd server
npm install
npm start
# Server runs on port 3000

# Serve the frontend (in a separate terminal)
npx serve . -p 8080
```

Now point your browser to `http://localhost:8080`.

### Method 2: Docker Compose

```bash
docker-compose up -d
```

- To restart: `docker-compose restart`
- To stop: `docker-compose stop`  
- To view server logs: `docker logs <container-name>`

## Testing PWA Features

PWAs require a trusted TLS endpoint. The nginx container auto-generates certificates.

1. Set your FQDN in `docker/fqdn.env`
2. Download the CA certificate from `http://<Your FQDN>:8080/ca.crt`
3. Install to your OS trust store:
   - **Windows**: Install to `Trusted Root Certification Authorities`
   - **macOS**: Double-click in Keychain Access → Trust → Always Trust for SSL
   - **Firefox**: Navigate to the cert URL and select "Trust this CA to identify websites"
   - **Chrome**: Restart Chrome after installing (`chrome://restart`), then clear storage

The site is served on `https://<Your FQDN>:443`.

## Architecture Notes

- The signaling server listens on port **3000** by default (configurable via `PORT` env var)
- The client expects the signaling server at `http(s)://your.domain/server`
- When behind a reverse proxy, ensure `X-Forwarded-For` header is set
- See `docker/nginx/default.conf` for nginx proxy configuration

[← Back](/README.md)
