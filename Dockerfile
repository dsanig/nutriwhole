# --- build static site ---
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Vite build-time PUBLIC vars (come from build args)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .
RUN npm run build

# --- serve with Caddy (no TLS here; Cloudflare handles TLS) ---
FROM caddy:2-alpine AS runner
# Caddy will listen on :8080 (see Caddyfile)
RUN apk add --no-cache wget
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist /usr/share/caddy
EXPOSE 8080
