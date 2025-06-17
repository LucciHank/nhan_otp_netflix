const express = require('express');
const serverless = require('serverless-http');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const session = require('express-session');
const { Sequelize } = require('sequelize');
const models = require('../../models');

// Khởi tạo ứng dụng Express
const app = express();

// Thiết lập view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../../public')));

// Thiết lập session
app.use(session({
  secret: process.env.SESSION_SECRET || 'netflix-otp-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Import các route
const homeRoutes = require('../../routes/home');
const adminRoutes = require('../../routes/admin');
const toolsRoutes = require('../../routes/tools');

// Sử dụng các route
app.use('/', homeRoutes);
app.use('/admin', adminRoutes);
app.use('/tools', toolsRoutes);

// Xử lý lỗi 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Không tìm thấy trang' });
});

// Xử lý lỗi 500
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Lỗi máy chủ', error: err });
});

// Đối với local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
  });
}

// Khởi động quét email định kỳ
if (process.env.NODE_ENV === 'production') {
  const emailScanner = require('../../services/emailScanner');
  emailScanner.startEmailScanning();
}

// Xuất handler cho serverless function
module.exports.handler = serverless(app); 