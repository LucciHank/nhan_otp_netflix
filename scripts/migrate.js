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
  
  // Thêm timeout cho connection
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      connectTimeout: 10000 // 10 giây timeout
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 10000,  // 10 giây timeout cho kết nối pool
      idle: 10000     // 10 giây idle timeout
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
    
    // Thêm timeout cho promise authenticate
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Kết nối timeout sau 15 giây')), 15000);
    });
    
    // Race giữa kết nối và timeout
    await Promise.race([sequelize.authenticate(), timeoutPromise]);
    
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
    } else if (error.message && error.message.includes('timeout')) {
      console.error('\n======== HƯỚNG DẪN XỬ LÝ LỖI TIMEOUT ========');
      console.error('Kết nối đến Supabase đã timeout. Vui lòng kiểm tra:');
      console.error('1. URL kết nối có chính xác không?');
      console.error('2. Supabase có đang hoạt động không?');
      console.error('3. Có firewall hoặc network restriction nào không?');
      console.error('4. Database có bị quá tải không?');
      console.error('==========================================\n');
    } else if (error.message && error.message.includes('password authentication failed')) {
      console.error('\n======== HƯỚNG DẪN XỬ LÝ LỖI XÁC THỰC ========');
      console.error('Xác thực với Supabase thất bại. Vui lòng kiểm tra:');
      console.error('1. Username và password trong connection string có đúng không?');
      console.error('2. Người dùng database có quyền truy cập không?');
      console.error('==========================================\n');
    }
    
    // Bỏ qua lỗi kết nối database để tiếp tục build process
    if (process.env.VERCEL) {
      console.log('Bỏ qua lỗi database trong quá trình build...');
      console.log('Ứng dụng sẽ tiếp tục build nhưng có thể không kết nối được database.');
      console.log('Bạn có thể cấu hình lại các biến môi trường sau khi deploy.');
      process.exit(0); // Exit with success code để không chặn build process
    } else {
      process.exit(1);
    }
  }
}

migrate(); 