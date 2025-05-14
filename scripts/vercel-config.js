// scripts/vercel-config.js
// Script này chạy trước khi build để kiểm tra môi trường
// và đảm bảo Vercel đã được cấu hình đúng

const fs = require('fs');
require('dotenv').config();

function sanitizeConnectionString(url) {
  if (!url) return null;
  
  // Đảm bảo URL có SSL mode
  if (!url.includes('sslmode=require')) {
    const hasQueryParams = url.includes('?');
    url = url + (hasQueryParams ? '&' : '?') + 'sslmode=require';
  }
  
  return url;
}

function verifyConfig() {
  console.log('Đang kiểm tra cấu hình Vercel và Supabase...');
  
  // Kiểm tra DATABASE_URL
  let originalUrl = null;
  if (!process.env.DATABASE_URL) {
    if (process.env.POSTGRES_URL_NON_POOLING) {
      console.log('Đang sử dụng POSTGRES_URL_NON_POOLING làm DATABASE_URL');
      originalUrl = process.env.POSTGRES_URL_NON_POOLING;
      process.env.DATABASE_URL = sanitizeConnectionString(originalUrl);
    } else if (process.env.POSTGRES_URL) {
      console.log('Đang sử dụng POSTGRES_URL làm DATABASE_URL');
      originalUrl = process.env.POSTGRES_URL;
      process.env.DATABASE_URL = sanitizeConnectionString(originalUrl);
    } else if (process.env.VERCEL) {
      console.error('CẢNH BÁO: Biến DATABASE_URL chưa được cấu hình trên Vercel!');
      console.error('Hãy thêm DATABASE_URL trong phần Environment Variables của dự án Vercel.');
      console.error('Xem hướng dẫn: https://vercel.com/docs/concepts/projects/environment-variables');
      
      // Fallback sang SQLite trong trường hợp không có DATABASE_URL
      console.log('Fallback về SQLite trong quá trình build...');
      process.env.USE_SQLITE = 'true';
    } else {
      console.log('Đang chạy trong môi trường local, sẽ sử dụng cấu hình database local.');
    }
  } else {
    console.log('Cấu hình DATABASE_URL: OK');
    // Vẫn cần đảm bảo URL có SSL mode
    originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = sanitizeConnectionString(originalUrl);
  }
  
  if (originalUrl && process.env.DATABASE_URL !== originalUrl) {
    console.log('Đã cập nhật DATABASE_URL với SSL mode');
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