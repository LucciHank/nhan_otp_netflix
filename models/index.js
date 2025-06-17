require('dotenv').config();
const { Sequelize } = require('sequelize');
const path = require('path');

let sequelize;

// Kiểm tra xem có biến môi trường DATABASE_URL không (trên Render)
if (process.env.DATABASE_URL) {
  // Sử dụng PostgreSQL trên Render
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Cần thiết cho Render
      }
    },
    logging: false
  });
  console.log('Kết nối đến PostgreSQL database');
} else {
  // Sử dụng SQLite cho môi trường phát triển
  const dbPath = path.join(__dirname, '../data/database.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
  });
  console.log('Kết nối đến SQLite database');
}

const MailAccount = require('./mailAccount')(sequelize);
const Otp = require('./otp')(sequelize);
const Tool = require('./tool')(sequelize);

// Quan hệ nếu cần
Otp.belongsTo(MailAccount);

module.exports = { sequelize, MailAccount, Otp, Tool };
