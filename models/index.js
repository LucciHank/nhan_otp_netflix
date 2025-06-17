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
  // Trên Netlify, sử dụng SQLite trong thư mục /tmp
  const dbPath = path.join('/tmp', 'database.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
  });
  console.log('Kết nối đến SQLite database tại', dbPath);
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
