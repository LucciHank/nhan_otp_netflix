require('dotenv').config();
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './data.sqlite',
  logging: false
});
const MailAccount = require('./mailAccount')(sequelize);
const Otp = require('./otp')(sequelize);

// Quan hệ nếu cần
Otp.belongsTo(MailAccount);

module.exports = { sequelize, MailAccount, Otp };
