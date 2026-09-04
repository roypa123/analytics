# Dev-server image (Vite, not a static nginx build) — matches how this
# project is actually run locally throughout development. The compose file
# bind-mounts the source over this for live-reload; the COPY below only
# matters for a standalone `docker build` with no mount.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host is required for the dev server to be reachable from outside the
# container (Vite binds 127.0.0.1 by default).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
