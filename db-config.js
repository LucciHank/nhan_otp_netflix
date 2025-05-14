// db-config.js - Cấu hình database cho nhiều môi trường

const { Sequelize } = require('sequelize');
require('dotenv').config();

// Xác định môi trường đang chạy
const isVercel = process.env.VERCEL === '1';

let sequelize;

if (isVercel) {
  // Sử dụng cơ sở dữ liệu tạm thời trên Vercel
  // Lưu ý: Dữ liệu sẽ bị mất sau mỗi lần serverless function kết thúc
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:', // SQLite in-memory database
    logging: false
  });
  
  // Cảnh báo người dùng
  console.log('CẢNH BÁO: Đang chạy trên Vercel với cơ sở dữ liệu tạm thời. Dữ liệu sẽ bị mất sau mỗi lần chạy!');
  console.log('Để sử dụng ứng dụng với đầy đủ tính năng lưu trữ, vui lòng triển khai trên máy chủ hỗ trợ lưu trữ file.');
} else {
  // Sử dụng cơ sở dữ liệu SQLite bình thường cho môi trường không phải Vercel
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_PATH || './data.sqlite',
    logging: false
  });
}

module.exports = sequelize; 