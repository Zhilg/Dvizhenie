FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN apk update && \
    apk add nano && \
    rm -rf /var/cache/apk/* 

RUN npm ci --production && \
    npm cache clean --force

COPY . .

CMD ["npm", "start"]