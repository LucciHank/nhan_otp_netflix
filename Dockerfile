FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Thiết lập biến môi trường mặc định
ENV SESSION_SECRET=tomoi_netflix_otp_secure_secret_key
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"] 