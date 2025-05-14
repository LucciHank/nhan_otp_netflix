require('dotenv').config();
// Sử dụng sequelize từ cấu hình
const sequelize = require('../db-config');
const MailAccount = require('./mailAccount')(sequelize);
const Otp = require('./otp')(sequelize);

// Quan hệ nếu cần
Otp.belongsTo(MailAccount);

module.exports = { sequelize, MailAccount, Otp };
