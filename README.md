# Hệ Thống Nhận OTP Netflix

Hệ thống quản lý và nhận mã OTP tự động cho tài khoản Netflix của gia đình.

## Tổng quan

Hệ thống giúp quản lý tài khoản email, tự động nhận và xử lý mã OTP từ Netflix, và hiển thị kết quả qua giao diện web.

## Tính năng chính

- Đăng nhập và quản lý người dùng
- Quản lý tài khoản email để nhận OTP
- Tự động phân tích email và trích xuất mã OTP
- Hiển thị OTP và thông tin liên quan
- Dashboard quản lý

## Yêu cầu hệ thống

- Node.js (v14 trở lên)
- PostgreSQL (local cho development hoặc Vercel PostgreSQL cho production)

## Cài đặt

1. Clone repository:
```
git clone https://github.com/yourusername/nhan_otp_netflix.git
cd nhan_otp_netflix
```

2. Cài đặt dependencies:
```
npm install
```

3. Tạo file .env với các thông số cấu hình (xem phần Cấu hình)

4. Chạy ứng dụng:
```
npm start
```

Hoặc chạy với chế độ development:
```
npm run dev
```

## Cấu hình

Tạo file .env với các thông số sau:

```
PORT=3000
SESSION_SECRET=yoursessionsecret

# Cấu hình database - PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=netflix_otp

# Cấu hình email (nếu cần)
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=your_username
MAIL_PASSWORD=your_password
```

### Cấu hình cho Vercel

Khi triển khai trên Vercel, bạn cần tạo Vercel Postgres database và thêm biến môi trường `DATABASE_URL`.

## Cấu trúc dự án

- `/models`: Định nghĩa các model dữ liệu
- `/views`: Template EJS cho giao diện người dùng
- `/public`: Asset tĩnh (CSS, JS, hình ảnh)
- `index.js`: File chính khởi động ứng dụng

## Đóng góp

Nếu bạn muốn đóng góp cho dự án, hãy tạo pull request hoặc báo cáo issues.