// scripts/vercel-config.js
// Script này chạy trước khi build để kiểm tra môi trường
// và đảm bảo Vercel đã được cấu hình đúng

const fs = require('fs');
require('dotenv').config();

function verifyConfig() {
  console.log('Đang kiểm tra cấu hình Vercel và Supabase...');
  
  // Kiểm tra DATABASE_URL
  if (!process.env.DATABASE_URL) {
    if (process.env.POSTGRES_URL_NON_POOLING) {
      console.log('Đang sử dụng POSTGRES_URL_NON_POOLING làm DATABASE_URL');
      process.env.DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING;
    } else if (process.env.POSTGRES_URL) {
      console.log('Đang sử dụng POSTGRES_URL làm DATABASE_URL');
      process.env.DATABASE_URL = process.env.POSTGRES_URL;
    } else if (process.env.VERCEL) {
      console.error('CẢNH BÁO: Biến DATABASE_URL chưa được cấu hình trên Vercel!');
      console.error('Hãy thêm DATABASE_URL trong phần Environment Variables của dự án Vercel.');
      console.error('Xem hướng dẫn: https://vercel.com/docs/concepts/projects/environment-variables');
    } else {
      console.log('Đang chạy trong môi trường local, sẽ sử dụng cấu hình database local.');
    }
  } else {
    console.log('Cấu hình DATABASE_URL: OK');
  }
  
  // Kiểm tra SESSION_SECRET
  if (!process.env.SESSION_SECRET) {
    console.warn('CẢNH BÁO: SESSION_SECRET chưa được cấu hình. Sẽ sử dụng giá trị mặc định.');
    process.env.SESSION_SECRET = 'default_secret_' + Math.random().toString(36).substring(2);
  } else {
    console.log('Cấu hình SESSION_SECRET: OK');
  }
  
  console.log('Kiểm tra cấu hình hoàn tất.');
}

// Tự động chạy kiểm tra
verifyConfig(); 