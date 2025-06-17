const { DataTypes } = require('sequelize');
module.exports = (sequelize) => {
  return sequelize.define('MailAccount', {
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    host:  { type: DataTypes.STRING, allowNull: false, defaultValue: 'imap.gmail.com' },
    port:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 993 },
    user:  { type: DataTypes.STRING, allowNull: false },
    pass:  { type: DataTypes.STRING, allowNull: false }  // hãy mã hoá nếu muốn nâng cao
  });
};
