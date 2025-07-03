require('dotenv').config();
const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const { sequelize } = require('./models');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Thiết lập EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
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

// Đồng bộ database
sequelize.sync({ alter: true })
  .then(() => {
    console.log('Database đã được đồng bộ hóa');
  })
  .catch(err => {
    console.error('Lỗi đồng bộ database:', err);
  });

// Các routes
app.get('/', (req, res) => {
  res.render('home', { title: 'Trang Chủ' });
});

// Thêm các routes khác ở đây

// Xử lý lỗi 404
app.use((req, res) => {
  res.status(404).render('home', { title: 'Không tìm thấy trang' });
});

module.exports = app; 