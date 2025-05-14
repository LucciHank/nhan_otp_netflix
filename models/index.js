require('dotenv').config();
const { Sequelize } = require('sequelize');

// Cấu hình kết nối dựa trên biến môi trường
let sequelize;
if (process.env.DATABASE_URL) {
  // Sử dụng URL kết nối trong môi trường production
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
  // Sử dụng cấu hình local trong môi trường development
  sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'netflix_otp',
    logging: false
  });
}

const MailAccount = require('./mailAccount')(sequelize);
const Otp = require('./otp')(sequelize);

// Quan hệ nếu cần
Otp.belongsTo(MailAccount);

module.exports = { sequelize, MailAccount, Otp };
