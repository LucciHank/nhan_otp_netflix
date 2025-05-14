require('dotenv').config();
require('./vercel-config'); // Chạy kiểm tra cấu hình trước

const { Sequelize } = require('sequelize');

// Log thông tin kết nối (ẩn mật khẩu)
function logConnectionInfo() {
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    // Ẩn thông tin nhạy cảm
    const sanitizedUrl = url.replace(/:[^:@]+@/, ':****@');
    console.log(`Kết nối đến: ${sanitizedUrl}`);
  } else {
    console.log(`Kết nối đến: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}`);
  }
}

// Định nghĩa lại sequelize để đảm bảo không dùng model hiện tại (có thể tham chiếu đến SQLite)
let sequelize;
if (process.env.DATABASE_URL) {
  console.log('Sử dụng DATABASE_URL từ biến môi trường (Supabase)...');
  logConnectionInfo();
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: console.log
  });
} else {
  console.log('Sử dụng cấu hình database local...');
  sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'netflix_otp',
    logging: console.log
  });
}

// Định nghĩa lại models
const defineModels = () => {
  // Định nghĩa model MailAccount
  const MailAccount = sequelize.define('MailAccount', {
    email: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    password: {
      type: Sequelize.STRING,
      allowNull: false
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    }
  });

  // Định nghĩa model OTP
  const Otp = sequelize.define('Otp', {
    code: {
      type: Sequelize.STRING,
      allowNull: false
    },
    receivedAt: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    emailFrom: {
      type: Sequelize.STRING,
      allowNull: true
    },
    isUsed: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    }
  });

  // Định nghĩa mối quan hệ
  Otp.belongsTo(MailAccount);

  return { MailAccount, Otp };
};

async function migrate() {
  try {
    console.log('Đang kết nối database...');
    await sequelize.authenticate();
    console.log('Kết nối thành công!');

    console.log('Đang định nghĩa models...');
    const { MailAccount, Otp } = defineModels();
    console.log('Định nghĩa models thành công!');

    console.log('Đang đồng bộ các models...');
    // Sử dụng alter: true để không xóa dữ liệu hiện có
    await sequelize.sync({ alter: true });
    console.log('Đồng bộ thành công!');
    
    console.log('Migration hoàn tất!');
    
    if (process.env.VERCEL) {
      console.log('Đã chuẩn bị database cho Vercel deployment!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Lỗi trong quá trình migration:');
    console.error(error);
    
    if (error.message && error.message.includes('ECONNREFUSED')) {
      console.error('\n======== HƯỚNG DẪN XỬ LÝ LỖI ========');
      console.error('Không thể kết nối tới PostgreSQL. Vui lòng kiểm tra:');
      console.error('1. Nếu bạn đang chạy trên Vercel:');
      console.error('   - Đã tạo Vercel Postgres Database chưa?');
      console.error('   - Đã thêm biến DATABASE_URL vào Environment Variables chưa?');
      console.error('   Xem hướng dẫn: https://vercel.com/docs/storage/vercel-postgres');
      console.error('2. Nếu bạn đang chạy trên local:');
      console.error('   - PostgreSQL đã được cài đặt và chạy chưa?');
      console.error('   - Thông tin kết nối trong .env đã chính xác chưa?');
      console.error('==========================================\n');
    }
    
    process.exit(1);
  }
}

migrate(); 