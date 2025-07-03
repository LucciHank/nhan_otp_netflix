require('dotenv').config();
const { Sequelize } = require('sequelize');
const path = require('path');

let sequelize;

// Kiểm tra xem có biến môi trường DATABASE_URL không (trên Render/Netlify)
if (process.env.DATABASE_URL) {
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
  console.log('Kết nối đến PostgreSQL database');
} else if (process.env.NODE_ENV === 'production') {
  // Trên Netlify, sử dụng PostgreSQL
  // Nếu không có DATABASE_URL, sử dụng in-memory SQLite (chỉ cho testing)
  sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'netflix_otp',
    port: process.env.DB_PORT || 5432,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });
  console.log('Kết nối đến PostgreSQL database');
} else {
  // Môi trường phát triển cục bộ
  const dbPath = path.join(__dirname, '../data/database.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
  });
  console.log('Kết nối đến SQLite database tại', dbPath);
}

const MailAccount = require('./mailAccount')(sequelize);
const Otp = require('./otp')(sequelize);
const Tool = require('./tool')(sequelize);

// Quan hệ nếu cần
Otp.belongsTo(MailAccount);

module.exports = { sequelize, MailAccount, Otp, Tool };
