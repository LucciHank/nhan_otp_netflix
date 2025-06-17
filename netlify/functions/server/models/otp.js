const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Otp extends Model {
    static associate(models) {
      // define association here
      Otp.belongsTo(models.MailAccount);
    }
  }
  
  Otp.init({
    email: {
      type: DataTypes.STRING,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Mã xác minh'
    },
    from: {
      type: DataTypes.STRING,
      allowNull: true
    },
    verificationLink: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    buttonLabel: {
      type: DataTypes.STRING,
      allowNull: true
    },
    profile: {
      type: DataTypes.STRING,
      allowNull: true
    },
    note: {
      type: DataTypes.STRING,
      allowNull: true
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'Otp',
  });
  
  return Otp;
};
