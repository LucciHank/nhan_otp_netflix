// Công cụ kiểm tra kết nối database
// Chạy: node check-database.js
require('dotenv').config();
const { sequelize } = require('./models');

async function checkDatabase() {
  console.log('Đang kiểm tra kết nối database...');
  try {
    // Thử kết nối
    await sequelize.authenticate();
    console.log('✅ Kết nối thành công! Database đang hoạt động bình thường.');
    
    // Kiểm tra loại database
    const dialect = sequelize.getDialect();
    console.log(`📊 Loại database đang sử dụng: ${dialect.toUpperCase()}`);
    
    // Kiểm tra các bảng
    const [tables] = await sequelize.query(
      dialect === 'postgres' 
        ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        : "SELECT name FROM sqlite_master WHERE type='table'"
    );
    
    console.log(`📋 Danh sách bảng trong database:`);
    tables.forEach((table, index) => {
      const tableName = dialect === 'postgres' ? table.table_name : table.name;
      if (!tableName.startsWith('sqlite_') && tableName !== 'SequelizeMeta') {
        console.log(`   ${index + 1}. ${tableName}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Kết nối thất bại!', error.message);
    console.error('Chi tiết lỗi:', error);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n📌 Gợi ý: Database server không phản hồi hoặc không thể kết nối.');
      console.log('   • Kiểm tra thông tin kết nối trong file .env');
      console.log('   • Kiểm tra xem database server có đang chạy không');
      console.log('   • Kiểm tra cấu hình firewall');
    } else if (error.message.includes('password authentication failed')) {
      console.log('\n📌 Gợi ý: Xác thực database thất bại.');
      console.log('   • Kiểm tra username và password trong chuỗi kết nối');
    }
  } finally {
    process.exit(0);
  }
}

checkDatabase(); 