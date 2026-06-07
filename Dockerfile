FROM node:22-alpine

WORKDIR /app
COPY . .

# persistent data (db + KYC uploads) lives on a mounted volume
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/caribe.db \
    UPLOAD_DIR=/data/uploads

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "--no-warnings", "server/server.js"]
