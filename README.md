# Netflix OTP System

Hệ thống nhận OTP Netflix cho gia đình TomOi.vn

## Cài đặt

```bash
npm install
```

## Chạy ứng dụng

```bash
npm run dev
```

## Deploy lên Netlify

1. Tạo một database PostgreSQL (có thể sử dụng Heroku, Supabase, hoặc bất kỳ dịch vụ nào khác)
2. Cấu hình biến môi trường trên Netlify:
   - `NODE_ENV`: production
   - `DATABASE_URL`: URL kết nối đến PostgreSQL database
   - `SESSION_SECRET`: Một chuỗi bí mật bất kỳ

3. Deploy lên Netlify bằng cách kết nối repository với Netlify

## Cấu trúc thư mục

- `index.js`: File chính để chạy ứng dụng ở môi trường phát triển
- `netlify/functions/server.js`: Entry point cho Netlify Functions
- `netlify/functions/server/app.js`: Ứng dụng Express
- `netlify/functions/server/models`: Các model của ứng dụng
- `netlify/functions/server/views`: Các template EJS
- `netlify/functions/server/public`: Các file tĩnh (CSS, JS, images)

## Lưu ý

- Ứng dụng sử dụng PostgreSQL trên môi trường production (Netlify)
- Ứng dụng sử dụng SQLite trên môi trường phát triển cục bộ 