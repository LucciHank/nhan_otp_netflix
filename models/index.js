require('dotenv').config();
const { Sequelize } = require('sequelize');

// Cấu hình kết nối dựa trên biến môi trường
let sequelize;

try {
  if (process.env.DATABASE_URL) {
    // Sử dụng URL kết nối PostgreSQL trong môi trường production
    console.log('Kết nối tới PostgreSQL thông qua DATABASE_URL');
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      logging: process.env.NODE_ENV !== 'production'
    });
  } else if (process.env.DB_HOST) {
    // Sử dụng cấu hình PostgreSQL local
    console.log('Kết nối tới PostgreSQL local');
    sequelize = new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      logging: false
    });
  } else {
    // Fallback về SQLite cho môi trường local nếu không cấu hình PostgreSQL
    console.log('Fallback về SQLite local');
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: './data.sqlite',
      logging: false
    });
  }
} catch (error) {
  console.error('Lỗi khi tạo kết nối database:', error);
  // Fallback về SQLite nếu có lỗi
  console.log('Đang sử dụng SQLite thay thế do lỗi kết nối');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './data.sqlite',
    logging: false
  });
}

const MailAccount = require('./mailAccount')(sequelize);
const Otp = require('./otp')(sequelize);

// Quan hệ nếu cần
Otp.belongsTo(MailAccount);

module.exports = { sequelize, MailAccount, Otp };
