FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV DATA_DIR=/data RECORDS_DIR=/app/records
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node","src/main.ts"]
