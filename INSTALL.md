# Hướng dẫn cài đặt chi tiết

## Yêu cầu hệ thống

- Node.js (v14.x hoặc mới hơn)
- npm (v6.x hoặc mới hơn)
- SQLite (đã được cài sẵn với dependency)

## Bước 1: Clone repository

```bash
git clone https://github.com/yourusername/nhan_otp_netflix.git
cd nhan_otp_netflix
```

## Bước 2: Cài đặt dependencies

```bash
npm install
```

## Bước 3: Cấu hình môi trường

1. Tạo file `.env` từ mẫu:

```bash
cp env.example .env
```

2. Chỉnh sửa file `.env` với thông tin thích hợp:
   - Đặt SESSION_SECRET là một chuỗi ngẫu nhiên phức tạp
   - Cấu hình thông tin email nếu sử dụng tính năng gửi mail
   - Điều chỉnh các cấu hình khác theo nhu cầu

## Bước 4: Khởi tạo database

Database SQLite sẽ được tự động tạo khi chạy ứng dụng lần đầu tiên.

## Bước 5: Chạy ứng dụng

### Cho môi trường phát triển:

```bash
npm run dev
```

### Cho môi trường sản xuất:

```bash
npm start
```

## Bước 6: Truy cập ứng dụng

Mở trình duyệt và truy cập: `http://localhost:3000` (hoặc port bạn đã cấu hình trong .env)

## Xử lý sự cố

### Lỗi kết nối database

Nếu gặp lỗi kết nối database:
- Kiểm tra quyền ghi vào thư mục chứa file database
- Đảm bảo SQLite đã được cài đặt đúng cách

### Lỗi port đã được sử dụng

Nếu port đã bị chiếm:
- Thay đổi port trong file .env
- Kiểm tra và dừng các ứng dụng khác đang sử dụng cùng port

### Lỗi nodemon không hoạt động

Nếu nodemon không hoạt động:
```bash
npx nodemon index.js
```

## Cấu hình nâng cao

### PM2 (Cho môi trường sản xuất)

Để chạy ứng dụng với PM2:

1. Cài đặt PM2:
```bash
npm install -g pm2
```

2. Khởi động ứng dụng:
```bash
pm2 start index.js --name "otp-netflix"
```

3. Cấu hình tự động khởi động:
```bash
pm2 startup
pm2 save
``` 