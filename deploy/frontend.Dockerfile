# Runs the prebuilt Next.js standalone bundle; no install or build on the VPS.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node app/ ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
