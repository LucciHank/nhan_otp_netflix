require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const { sequelize } = require('./models');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Thiết lập EJS
app.set('view engine', 'ejs');
// Tính toán đường dẫn tới thư mục views một cách linh hoạt
let viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) {
  // Khi chạy dưới dạng Netlify Function, __dirname có thể là netlify/functions
  viewsDir = path.join(__dirname, 'server', 'views');
}
app.set('views', viewsDir);
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Thiết lập thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Thiết lập session
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Kiểm tra kết nối database
sequelize.authenticate()
  .then(() => {
    console.log('Kết nối đến database thành công.');
    
    // Đồng bộ database
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log('Database đã được đồng bộ hóa');
  })
  .catch(err => {
    console.error('Lỗi kết nối database:', err);
  });

// Các routes
app.get('/', (req, res) => {
  res.render('home', { title: 'Trang Chủ' });
});

// API endpoint để kiểm tra kết nối
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server đang hoạt động' });
});

// Thêm các routes khác ở đây

// Xử lý lỗi 404
app.use((req, res) => {
  res.status(404).render('home', { title: 'Không tìm thấy trang' });
});

module.exports = app; 