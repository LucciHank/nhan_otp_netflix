FROM node:16

WORKDIR /app

COPY package.json ./

# Sử dụng npm install thay vì npm ci
RUN npm install

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"] 