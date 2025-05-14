require('dotenv').config();
const { sequelize, MailAccount, Otp } = require('../models');

async function migrate() {
  try {
    console.log('Đang kết nối database...');
    await sequelize.authenticate();
    console.log('Kết nối thành công!');

    console.log('Đang đồng bộ các models...');
    // Force: true sẽ xóa và tạo lại bảng. Sử dụng cẩn thận trong production!
    // Trong môi trường production nên sử dụng force: false
    await sequelize.sync({ alter: true });
    console.log('Đồng bộ thành công!');
    
    console.log('Migration hoàn tất!');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi trong quá trình migration:', error);
    process.exit(1);
  }
}

migrate(); 