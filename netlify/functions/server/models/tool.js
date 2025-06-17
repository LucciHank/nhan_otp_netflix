const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Tool extends Model {
    static associate(models) {
      // define association here
    }
  }
  
  Tool.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true
    },
    badge: {
      type: DataTypes.STRING,
      allowNull: true
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'Tool',
  });
  
  return Tool;
}; 