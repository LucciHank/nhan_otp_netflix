// File này dùng để chạy ứng dụng ở môi trường phát triển
// Khi deploy lên Netlify, file netlify/functions/server.js sẽ được sử dụng
const app = require('./netlify/functions/server/app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
}); 