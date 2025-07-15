FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --production && \
    npm cache clean --force

COPY . .

CMD ["npm", "start"]