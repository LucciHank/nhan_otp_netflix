const express = require('express');
const serverless = require('serverless-http');
const path = require('path');

// Tạo một ứng dụng Express mới
const app = express();
const router = express.Router();

// Lấy app từ file app.js
const mainApp = require('./server/app');

// Gắn app chính vào router
router.use(mainApp);

// Thiết lập static files
const staticPath = path.join(__dirname, 'server', 'public');
app.use(express.static(staticPath));

// Sử dụng router cho function
app.use('/.netlify/functions/server', router);

// Xuất handler
module.exports.handler = serverless(app); 