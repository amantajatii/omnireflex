FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV RECORDS_DIR=/app/records
USER node
CMD ["node","src/main.ts"]
