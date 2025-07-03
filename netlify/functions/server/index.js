const app = require('./app');
const PORT = process.env.PORT || 3000;

// Chỉ khởi động server khi chạy trực tiếp, không phải khi được import
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
  });
}

module.exports = app; 