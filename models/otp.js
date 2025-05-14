const { DataTypes } = require('sequelize');
module.exports = (sequelize) => {
  return sequelize.define('Otp', {
    code: { type: DataTypes.STRING, allowNull: false },
    from: { type: DataTypes.STRING },
    type: { 
      type: DataTypes.ENUM('Hộ gia đình', 'Mã đăng nhập', 'Xác minh hộ gia đình', 'Xác minh đăng nhập', 'Đặt lại mật khẩu'), 
      defaultValue: 'Hộ gia đình',
      allowNull: false 
    },
    receivedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    verificationLink: { type: DataTypes.TEXT, allowNull: true }
  });
};
