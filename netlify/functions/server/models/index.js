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
  // Trên Netlify, sử dụng PostgreSQL hoặc tạo file SQLite trong /tmp
  try {
    const dbPath = path.join('/tmp', 'database.sqlite');
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: dbPath,
      dialectModule: require('better-sqlite3'), // Sử dụng better-sqlite3
      logging: false
    });
    console.log('Kết nối đến SQLite database tại', dbPath);
  } catch (error) {
    console.error('Lỗi kết nối database:', error);
    // Fallback to in-memory SQLite
    sequelize = new Sequelize('sqlite::memory:', {
      dialectModule: require('better-sqlite3'),
      logging: false
    });
    console.log('Fallback: Sử dụng SQLite in-memory');
  }
} else {
  // Môi trường phát triển cục bộ
  const dbPath = path.join(__dirname, '../data/database.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    dialectModule: require('better-sqlite3'), // Sử dụng better-sqlite3
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
