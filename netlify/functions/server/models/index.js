require('dotenv').config();
const { Sequelize } = require('sequelize');
const path = require('path');

let sequelize;

// Sử dụng thông tin kết nối Supabase
const supabaseConnectionString = 'postgresql://postgres:Hoanganh2004@@db.zbjpqzuokipnqooukxkc.supabase.co:5432/postgres';

// Ưu tiên sử dụng DATABASE_URL từ biến môi trường nếu có
if (process.env.DATABASE_URL) {
  console.log('Sử dụng DATABASE_URL từ biến môi trường');
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });
} else {
  // Sử dụng thông tin kết nối Supabase cố định
  console.log('Sử dụng thông tin kết nối Supabase cố định');
  sequelize = new Sequelize(supabaseConnectionString, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });
}

console.log('Đã thiết lập kết nối đến PostgreSQL database');

// Định nghĩa các models
const MailAccount = require('./mailAccount')(sequelize);
const Otp = require('./otp')(sequelize);
const Tool = require('./tool')(sequelize);

// Quan hệ giữa các models
Otp.belongsTo(MailAccount);

module.exports = { sequelize, MailAccount, Otp, Tool };
