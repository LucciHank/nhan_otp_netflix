# Hệ Thống Nhận OTP Netflix

Hệ thống tự động nhận và hiển thị mã OTP từ email xác thực của Netflix với giao diện hiện đại và sang trọng.

## Tính năng

- Nhận và hiển thị mã OTP từ email Netflix
- Hỗ trợ các email xác thực hộ gia đình và mã truy cập tạm thời
- Giao diện người dùng hiện đại theo phong cách Apple
- Hiển thị thời gian hết hạn chính xác của mã OTP
- Hỗ trợ nhiều tài khoản email

## Cài đặt và Chạy

### Yêu cầu

- Node.js (phiên bản 14 trở lên)
- npm hoặc yarn

### Cài đặt

1. Clone repository:
   ```
   git clone https://github.com/yourusername/nhan_otp_netflix.git
   cd nhan_otp_netflix
   ```

2. Cài đặt các dependencies:
   ```
   npm install
   ```

3. Tạo file .env từ file example.env:
   ```
   cp example.env .env
   ```

4. Chỉnh sửa file .env với các thông tin cấu hình của bạn.

### Chạy ứng dụng

- Chạy ở môi trường development:
  ```
  npm run dev
  ```

- Chạy ở môi trường production:
  ```
  npm start
  ```

## Triển khai lên Netlify

### Chuẩn bị

1. Đăng ký tài khoản Netlify tại [netlify.com](https://www.netlify.com)

2. Cài đặt Netlify CLI:
   ```
   npm install -g netlify-cli
   ```

3. Đăng nhập vào Netlify:
   ```
   netlify login
   ```

### Triển khai

1. Khởi tạo dự án Netlify:
   ```
   netlify init
   ```

2. Cấu hình các biến môi trường trong Netlify:
   - Truy cập vào trang quản lý dự án trên Netlify
   - Vào phần "Site settings" > "Environment variables"
   - Thêm các biến môi trường từ file .env của bạn

3. Triển khai lên Netlify:
   ```
   netlify deploy --prod
   ```

### Cấu hình Build trên Netlify

- **Base directory**: Thư mục gốc của dự án
- **Build command**: `npm install`
- **Publish directory**: `public`
- **Functions directory**: `netlify/functions`

## Cấu trúc dự án

```
nhan_otp_netflix/
├── models/           # Các model Sequelize
├── netlify/          # Cấu hình Netlify Functions
│   └── functions/    # Các hàm serverless
├── public/           # Tài nguyên tĩnh (CSS, JS, hình ảnh)
├── routes/           # Các route Express
├── services/         # Các dịch vụ (email scanner, etc.)
├── views/            # Các template EJS
├── .env.example      # File mẫu cho biến môi trường
├── index.js          # Entry point cho môi trường development
├── netlify.toml      # Cấu hình Netlify
├── package.json      # Dependencies và scripts
└── README.md         # Tài liệu dự án
```

## Giấy phép

© 2024 TomOi.vn - Hệ thống nhận OTP Netflix hộ gia đình 