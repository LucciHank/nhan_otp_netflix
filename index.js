require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const cron = require('node-cron');
const { simpleParser } = require('mailparser');
const expressLayouts = require('express-ejs-layouts');
const { sequelize, MailAccount, Otp } = require('./models');
const nodemailer = require('nodemailer');
const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Setup express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false
}));

// Class POP3 đơn giản để đọc email
class Pop3Command extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.buffer = '';
    this.responseResolver = null;
    this.connectTimeout = 30000; // 30 giây timeout cho kết nối
    this.operationTimeout = 60000; // 60 giây timeout cho các lệnh
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const connectTimer = setTimeout(() => {
        reject(new Error('Kết nối POP3 timed out sau ' + (this.connectTimeout/1000) + 's'));
        if (this.socket) {
          this.socket.destroy();
        }
      }, this.connectTimeout);

      try {
        if (this.config.tls) {
          this.socket = tls.connect({
            host: this.config.host,
            port: this.config.port || 995,
            rejectUnauthorized: false, // Cho phép self-signed certificate
            timeout: this.connectTimeout
          });
        } else {
          this.socket = net.createConnection({
            host: this.config.host,
            port: this.config.port || 110,
            timeout: this.connectTimeout
          });
        }

        this.socket.on('timeout', () => {
          clearTimeout(connectTimer);
          reject(new Error('Socket connection timed out'));
          this.socket.destroy();
        });

        this.socket.on('data', (data) => {
          this.buffer += data.toString();
          if (this.buffer.endsWith('\r\n') && this.responseResolver) {
            const response = this.buffer;
            this.buffer = '';
            this.responseResolver(response);
          }
        });

        this.socket.on('error', (err) => {
          clearTimeout(connectTimer);
          console.error('POP3 socket error:', err.message);
          reject(err);
        });

        this.socket.on('end', () => {
          console.log('POP3 connection closed by server');
          this.connected = false;
        });

        this.socket.on('connect', async () => {
          // Đợi thông báo chào từ server
          try {
            const greeting = await this._getResponse();
            clearTimeout(connectTimer);
            if (greeting.startsWith('+OK')) {
              this.connected = true;
              resolve(greeting);
            } else {
              reject(new Error('Kết nối POP3 không thành công: ' + greeting));
            }
          } catch (error) {
            clearTimeout(connectTimer);
            reject(error);
          }
        });
      } catch (err) {
        clearTimeout(connectTimer);
        reject(err);
      }
    });
  }

  async _getResponse() {
    return new Promise((resolve, reject) => {
      const responseTimer = setTimeout(() => {
        this.responseResolver = null;
        reject(new Error('POP3 response timed out sau ' + (this.operationTimeout/1000) + 's'));
      }, this.operationTimeout);

      // Nếu đã có dữ liệu trong buffer
      if (this.buffer.endsWith('\r\n')) {
        clearTimeout(responseTimer);
        const response = this.buffer;
        this.buffer = '';
        resolve(response);
        return;
      }

      // Đợi dữ liệu mới
      this.responseResolver = (response) => {
        clearTimeout(responseTimer);
        resolve(response);
      };
    });
  }

  async _sendCommand(command) {
    if (!this.connected) {
      throw new Error('Not connected to POP3 server');
    }
    
    try {
      this.socket.write(command + '\r\n');
      return await this._getResponse();
    } catch (error) {
      console.error(`Lỗi khi gửi lệnh "${command}":`, error.message);
      throw error;
    }
  }

  async USER(username) {
    const response = await this._sendCommand(`USER ${username}`);
    return response.startsWith('+OK');
  }

  async PASS(password) {
    const response = await this._sendCommand(`PASS ${password}`);
    if (response.startsWith('+OK')) {
      this.authenticated = true;
      return true;
    }
    return false;
  }

  async STAT() {
    const response = await this._sendCommand('STAT');
    if (response.startsWith('+OK')) {
      const [_, count, size] = response.match(/\+OK (\d+) (\d+)/);
      return { count: parseInt(count), size: parseInt(size) };
    }
    throw new Error('STAT command failed: ' + response);
  }

  async LIST() {
    const response = await this._sendCommand('LIST');
    let result = [];
    
    if (response.startsWith('+OK')) {
      let lines = response.split('\r\n');
      // Bỏ dòng đầu tiên (+OK...)
      lines.shift();
      // Bỏ dòng cuối cùng (rỗng hoặc .)
      lines.pop();
      
      result = lines.map(line => {
        const [num, size] = line.split(' ');
        return { num: parseInt(num), size: parseInt(size) };
      });
    }
    
    return result;
  }

  async UIDL() {
    const response = await this._sendCommand('UIDL');
    let result = [];
    
    if (response.startsWith('+OK')) {
      let lines = response.split('\r\n');
      // Bỏ dòng đầu tiên (+OK...)
      lines.shift();
      // Bỏ dòng cuối cùng (rỗng hoặc .)
      if (lines[lines.length - 1] === '.') {
        lines.pop();
      }
      
      result = lines;
    }
    
    return result;
  }

  async RETR(messageNumber) {
    const response = await this._sendCommand(`RETR ${messageNumber}`);
    if (response.startsWith('+OK')) {
      // Tách nội dung email từ response
      const parts = response.split('\r\n');
      parts.shift(); // Bỏ dòng đầu tiên (+OK...)
      
      // Kết hợp các dòng lại thành nội dung email, loại bỏ dòng cuối nếu là dấu chấm đơn
      let emailContent = parts.join('\r\n');
      if (emailContent.endsWith('\r\n.\r\n')) {
        emailContent = emailContent.slice(0, -5);
      }
      
      return emailContent;
    }
    
    throw new Error('RETR command failed: ' + response);
  }

  async QUIT() {
    try {
      if (this.connected) {
        await this._sendCommand('QUIT');
      }
    } catch (error) {
      console.error('Error during QUIT:', error.message);
    } finally {
      try {
        if (this.socket) {
          this.socket.end();
          this.socket.destroy();
        }
      } catch (e) {
        console.error('Error destroying socket:', e.message);
      }
      this.connected = false;
      this.authenticated = false;
    }
  }
}

// Hàm để che giấu email (mask email)
function maskEmail(email) {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  
  const name = parts[0];
  const domain = parts[1];
  
  if (name.length <= 5) {
    // If name is too short, just show first character
    return name.charAt(0) + '***@' + domain;
  } else {
    // Show first 3 chars and last 2 chars
    return name.substring(0, 3) + '***' + name.substring(name.length-2) + '@' + domain;
  }
}

// Auth middleware
function requireLogin(req, res, next) {
  if (req.session.user === process.env.ADMIN_USER) return next();
  res.redirect('/admin/login');
}

// Trang chủ công khai - Form nhập email
app.get('/', async (req, res) => {
  res.render('home', { 
    title: 'Hệ Thống Nhận OTP Netflix Hộ Gia Đình TomOi.vn',
    error: null,
    success: null
  });
});

// Xử lý form tìm kiếm OTP từ email
app.post('/search', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.render('home', { 
      error: 'Vui lòng nhập địa chỉ email', 
      success: null 
    });
  }
  
  // Lưu email vào session để tìm kiếm
  req.session.searchEmail = email;
  
  // REDIRECT trực tiếp đến trang kết quả thay vì qua trang loading
  res.redirect('/results');
});

// Giữ lại API này cho AJAX nếu cần
app.get('/check-otp', async (req, res) => {
  if (!req.session.searchEmail) {
    return res.json({ found: false, error: 'Không tìm thấy email trong session' });
  }
  
  const email = req.session.searchEmail;
  
  // Tìm OTP mới nhất cho email này (trong 30 phút qua)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  try {
    const otps = await Otp.findAll({ 
      where: {
        receivedAt: { [require('sequelize').Op.gte]: thirtyMinutesAgo }
        // Bỏ điều kiện lọc theo from để có thể tìm từ tất cả các địa chỉ Netflix
      },
      include: [{
        model: MailAccount,
        where: { email: email }
      }],
      order: [['receivedAt', 'DESC']],
      limit: 1
    });
    
    if (otps.length === 0) {
      return res.json({ found: false });
    }
    
    // Chuẩn bị dữ liệu trả về tùy theo loại (OTP hoặc xác minh)
    const otp = otps[0];
    const isVerification = otp.type === 'Xác minh hộ gia đình';
    
    return res.json({ 
      found: true,
      otp: {
        code: otp.code,
        type: otp.type,
        receivedAt: otp.receivedAt,
        isVerification: isVerification,
        verificationLink: isVerification ? otp.verificationLink : null
      }
    });
  } catch (error) {
    console.error('Lỗi khi kiểm tra OTP:', error);
    return res.json({ found: false, error: error.message });
  }
});

// Route lấy kết quả 
app.get('/results', async (req, res) => {
  if (!req.session.searchEmail) {
    return res.redirect('/');
  }
  
  const email = req.session.searchEmail;
  const maskedEmail = maskEmail(email);
  
  // Tìm OTP mới nhất cho email này (trong 30 phút qua)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  try {
  const otps = await Otp.findAll({ 
    where: {
      receivedAt: { [require('sequelize').Op.gte]: thirtyMinutesAgo }
        // Bỏ điều kiện lọc theo from để có thể tìm từ tất cả các địa chỉ Netflix
    },
    include: [{
      model: MailAccount,
      where: { email: email }
    }],
    order: [['receivedAt', 'DESC']]
  });
  
  if (otps.length === 0) {
    return res.render('result', { 
      title: 'Kết Quả Tìm Kiếm OTP', 
      error: 'Không tìm thấy mã OTP cho email này trong 30 phút qua',
      email: maskedEmail,
      otps: []
    });
  }
  
  res.render('result', { 
    title: 'Kết Quả Tìm Kiếm OTP',
    error: null,
    email: maskedEmail,
    otps: otps
  });
  } catch (error) {
    console.error('Lỗi khi tìm OTP:', error);
    return res.render('result', { 
      title: 'Kết Quả Tìm Kiếm OTP', 
      error: 'Đã xảy ra lỗi khi tìm kiếm OTP: ' + error.message,
      email: maskedEmail,
      otps: []
    });
  }
});

// Route cho phép kiểm tra lại với email đã nhập trước đó
app.get('/check-again', (req, res) => {
  if (!req.session.searchEmail) {
    return res.redirect('/');
  }
  
  // Redirect trực tiếp đến trang kết quả
  res.redirect('/results');
});

// ======= ADMIN ROUTES =======
// Đăng nhập admin
app.get('/admin/login', (req, res) => res.render('login', { err: null, title: 'Đăng Nhập Quản Trị' }));
app.post('/admin/login', async (req, res) => {
  const { user, pass } = req.body;
  if (user===process.env.ADMIN_USER && bcrypt.compareSync(pass, process.env.ADMIN_PASS_HASH)) {
    req.session.user = user;
    return res.redirect('/admin/accounts');
  }
  res.render('login', { err: 'Sai thông tin đăng nhập!', title: 'Đăng Nhập Quản Trị' });
});

// Admin dashboard
app.get('/admin', requireLogin, async (req, res) => {
  res.redirect('/admin/dashboard');
});

app.get('/admin/dashboard', requireLogin, async (req, res) => {
  const otps = await Otp.findAll({ order: [['receivedAt', 'DESC']], limit: 100 });
  res.render('dashboard', { otps, title: 'Quản Trị - Dashboard OTP' });
});

// Quản lý tài khoản mail
app.get('/admin/accounts', requireLogin, async (req, res) => {
  const accounts = await MailAccount.findAll();
  res.render('accounts', { accounts, err: null, success: null, title: 'Quản Lý Tài Khoản Mail' });
});

// Thêm tài khoản mới
app.post('/admin/accounts', requireLogin, async (req, res) => {
  try {
    await MailAccount.create(req.body);
    const accounts = await MailAccount.findAll();
    res.render('accounts', { 
      accounts, 
      err: null, 
      success: 'Đã thêm tài khoản thành công!', 
      title: 'Quản Lý Tài Khoản Mail' 
    });
  } catch (e) {
    const accounts = await MailAccount.findAll();
    res.render('accounts', { 
      accounts, 
      err: e.message, 
      success: null,
      title: 'Quản Lý Tài Khoản Mail' 
    });
  }
});

// Sửa tài khoản
app.get('/admin/accounts/edit/:id', requireLogin, async (req, res) => {
  try {
    const account = await MailAccount.findByPk(req.params.id);
    if (!account) {
      return res.redirect('/admin/accounts');
    }
    
    res.render('edit-account', {
      account,
      err: null,
      title: 'Chỉnh Sửa Tài Khoản Email'
    });
  } catch (e) {
    res.redirect('/admin/accounts');
  }
});

app.post('/admin/accounts/edit/:id', requireLogin, async (req, res) => {
  try {
    const account = await MailAccount.findByPk(req.params.id);
    if (!account) {
      return res.redirect('/admin/accounts');
    }
    
    await account.update(req.body);
    
    const accounts = await MailAccount.findAll();
    res.render('accounts', { 
      accounts, 
      err: null, 
      success: 'Cập nhật tài khoản thành công!', 
      title: 'Quản Lý Tài Khoản Mail' 
    });
  } catch (e) {
    const account = await MailAccount.findByPk(req.params.id);
    res.render('edit-account', {
      account,
      err: e.message,
      title: 'Chỉnh Sửa Tài Khoản Email'
    });
  }
});

// Xóa tài khoản
app.post('/admin/accounts/delete/:id', requireLogin, async (req, res) => {
  try {
    const account = await MailAccount.findByPk(req.params.id);
    if (account) {
      await account.destroy();
    }
    
    const accounts = await MailAccount.findAll();
    res.render('accounts', { 
      accounts, 
      err: null, 
      success: 'Đã xóa tài khoản thành công!', 
      title: 'Quản Lý Tài Khoản Mail' 
    });
  } catch (e) {
    const accounts = await MailAccount.findAll();
    res.render('accounts', { 
      accounts, 
      err: e.message, 
      success: null,
      title: 'Quản Lý Tài Khoản Mail' 
    });
  }
});

// Route để kiểm tra tài khoản mail trực tiếp
app.post('/admin/accounts/test/:id', requireLogin, async (req, res) => {
  try {
    const account = await MailAccount.findByPk(req.params.id);
    if (!account) {
      return res.json({ success: false, error: 'Không tìm thấy tài khoản' });
    }
    
    // Tạo bản ghi log để lưu dữ liệu
    let logs = [];
    const originalConsoleLog = console.log;
    console.log = function() {
      const args = Array.from(arguments).join(' ');
      logs.push(args);
      originalConsoleLog.apply(console, arguments);
    };
    
    // Thực hiện kiểm tra kết nối
    try {
      await fetchFromAccount(account);
      console.log = originalConsoleLog;
      
      return res.json({ 
        success: true, 
        message: 'Kết nối và quét email thành công',
        logs: logs
      });
    } catch (error) {
      console.log = originalConsoleLog;
      return res.json({ 
        success: false, 
        error: 'Lỗi khi kiểm tra tài khoản: ' + error.message,
        logs: logs
      });
    }
  } catch (e) {
    return res.json({ success: false, error: e.message });
  }
});

// Thêm hàm utility để tìm kiếm URL từ email HTML
function extractUrlsFromHtml(html, patterns) {
  if (!html) return null;

  // Loại bỏ các ký tự xuống dòng để dễ tìm kiếm
  const normalizedHtml = html.replace(/\n/g, ' ').replace(/\r/g, '');
  
  // Thử từng pattern cho đến khi tìm thấy URL
  for (const pattern of patterns) {
    const match = normalizedHtml.match(pattern);
    if (match && match[1]) {
      // Thay thế các ký tự đặc biệt trong URL
      let url = match[1].replace(/&amp;/g, '&')
                         .replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>')
                         .replace(/&quot;/g, '"')
                         .replace(/&#39;/g, "'");
      
      console.log(`Tìm thấy URL với pattern: ${pattern}`);
      console.log(`URL: ${url.substring(0, 50)}...`);
      return url;
    }
  }
  
  return null;
}

// Hàm fetch OTP từ 1 tài khoản với POP3
async function fetchFromAccount(acc) {
  console.log(`===== Bắt đầu quét email cho tài khoản ${acc.email} =====`);
  
  // Xử lý đặc biệt cho Gmail
  let popConfig = {
      user: acc.user,
      password: acc.pass,
      host: acc.host,
    port: acc.port || 995,
      tls: true
  };

  // Xác định nếu là Gmail và thay đổi cấu hình nếu cần
  const isGmail = acc.host.includes('gmail') || acc.email.includes('gmail.com');
  if (isGmail) {
    console.log(`Phát hiện tài khoản Gmail: ${acc.email}`);
    
    // Đối với Gmail, đảm bảo đang sử dụng cài đặt đúng
    if (acc.host !== 'pop.gmail.com') {
      console.log(`Cài đặt host không đúng cho Gmail, đang chuyển từ ${acc.host} thành pop.gmail.com`);
      popConfig.host = 'pop.gmail.com';
    }
    
    if (acc.port !== 995) {
      console.log(`Cài đặt port không đúng cho Gmail, đang chuyển từ ${acc.port} thành 995`);
      popConfig.port = 995;
    }
    
    console.log(`LƯU Ý: Đối với Gmail, hãy đảm bảo:
1. Đã bật POP3 trong cài đặt Gmail: https://mail.google.com/mail/u/0/#settings/fwdandpop
2. Đã tạo mật khẩu ứng dụng: https://myaccount.google.com/apppasswords
3. Sử dụng mật khẩu ứng dụng thay vì mật khẩu Gmail thông thường
4. Các email có thể mất vài phút để xuất hiện trong POP3 với Gmail`);
  }
  
  const pop3 = new Pop3Command(popConfig);

  try {
    // Kết nối đến server POP3
    console.log(`Đang kết nối đến máy chủ ${popConfig.host}:${popConfig.port}`);
    await pop3.connect();
    console.log(`Đã kết nối thành công đến ${popConfig.host}`);
    
    // Đăng nhập
    console.log(`Đang đăng nhập với tài khoản ${popConfig.user}`);
    if (!(await pop3.USER(popConfig.user))) {
      throw new Error('USER command failed');
    }
    
    if (!(await pop3.PASS(popConfig.password))) {
      throw new Error('PASS command failed - Sai thông tin đăng nhập');
    }
    console.log(`Đăng nhập thành công với tài khoản ${popConfig.user}`);
    
    // Lấy thông tin hộp thư
    const mailboxStats = await pop3.STAT();
    console.log(`Tìm thấy ${mailboxStats.count} email trong hộp thư của ${acc.email}`);
    
    if (mailboxStats.count === 0) {
      await pop3.QUIT();
      return;
    }
    
    // Lấy danh sách tin nhắn
    console.log(`Đang lấy danh sách email...`);
    const messageList = await pop3.LIST();
    console.log(`Đã lấy danh sách ${messageList.length} email`);
    
    // Lấy nhiều email hơn để đảm bảo không bỏ sót
    const emailsToGet = 15; // Tăng số lượng email lấy về để kiểm tra kỹ hơn
    const messagesToFetch = messageList.slice(-emailsToGet);
    console.log(`Đang lấy ${messagesToFetch.length} email mới nhất`);
    
    for (const msg of messagesToFetch) {
      try {
        console.log(`Đang lấy nội dung email #${msg.num}...`);
        const emailContent = await pop3.RETR(msg.num);
        console.log(`Đã lấy nội dung email #${msg.num}, đang phân tích...`);
        
        const parsed = await simpleParser(emailContent);
      const emailText = parsed.text || '';
        const emailHtml = parsed.html || '';
      const emailSubject = parsed.subject || '';
      
        // Xác định người gửi email
        let fromEmail = '';
        if (parsed.from) {
          fromEmail = parsed.from.text || '';
          // Nếu có thể lấy địa chỉ cụ thể từ đối tượng from
          if (parsed.from.value && parsed.from.value.length > 0 && parsed.from.value[0].address) {
            fromEmail = parsed.from.value[0].address;
          }
        }
        
        console.log(`Email #${msg.num} từ: ${fromEmail}`);
        console.log(`Tiêu đề: ${emailSubject}`);
        
        // Mở rộng bộ lọc để chấp nhận nhiều định dạng email từ Netflix
        const isNetflixEmail = 
          fromEmail.toLowerCase().includes('netflix') || 
          emailSubject.toLowerCase().includes('netflix') ||
          emailText.toLowerCase().includes('netflix code') ||
          emailText.toLowerCase().includes('mã netflix') ||
          emailText.toLowerCase().includes('đúng, đây là tôi') ||
          emailText.toLowerCase().includes('nhập mã này để đăng nhập') ||
          emailText.toLowerCase().includes('đặt lại mật khẩu') ||
          (emailHtml && emailHtml.toLowerCase().includes('netflix'));
        
        if (isNetflixEmail) {
          console.log(`Tìm thấy email liên quan đến Netflix: ${fromEmail}, Tiêu đề: ${emailSubject}`);
          
          // Xác định loại email
        let otpType = 'Hộ gia đình';
          let verificationLink = null;
          let otpCode = null;

          // 1. Kiểm tra email có chứa mã đăng nhập không
          if (
            emailSubject.toLowerCase().includes('mã xác minh') ||
            emailSubject.toLowerCase().includes('verification code') ||
            emailText.toLowerCase().includes('nhập mã này để đăng nhập') ||
            emailText.toLowerCase().includes('enter this code to sign in')
          ) {
            otpType = 'Mã đăng nhập Netflix';
            // Tìm mã OTP 4-6 số (Netflix sử dụng cả 4 và 6 số)
            const otpMatch = emailText.match(/\b(\d{4,6})\b/);
            if (otpMatch) {
              otpCode = otpMatch[1];
              console.log(`Tìm thấy mã đăng nhập: ${otpCode}`);
            }
          }
          // 2. Kiểm tra email có phải là đặt lại mật khẩu không
          else if (
            emailSubject.toLowerCase().includes('đặt lại mật khẩu') ||
            emailSubject.toLowerCase().includes('reset password') ||
            emailText.toLowerCase().includes('đặt lại mật khẩu') ||
            emailText.toLowerCase().includes('reset password')
          ) {
            otpType = 'Đặt lại mật khẩu';
            
            // Tạo mảng các pattern để tìm URL đặt lại mật khẩu
            const resetPasswordPatterns = [
              // Pattern 1: Tìm tag <a> với text "Đặt lại mật khẩu"
              /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:đặt lại mật khẩu|reset password|đặt lại|reset)[^<]*?<\/a>/i,
              
              // Pattern 2: Tìm bất kỳ tag <a> nào có href chứa netflix.com/password
              /<a\s+[^>]*href=["']([^"']*?netflix\.com\/password[^"']*)["'][^>]*>/i,
              
              // Pattern 3: Tìm bất kỳ URL nào chứa netflix.com/password
              /href=["']([^"']*?netflix\.com\/password[^"']*)["']/i,
              
              // Pattern 4: Tìm thuộc tính href trong thẻ <a> có style chứa màu chữ trắng (thường là nút)
              /<a\s+[^>]*href=["']([^"']+)["'][^>]*style=["'][^"']*color\s*:\s*(?:rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\)|#ffffff|#fff|white)[^"']*["'][^>]*>/i,
              
              // Pattern 5: Tìm href trong bất kỳ thẻ <a> nào có target="_blank"
              /<a\s+[^>]*href=["']([^"']+)["'][^>]*target=["']_blank["'][^>]*>/i
            ];
            
            // Sử dụng hàm trích xuất URL
            verificationLink = extractUrlsFromHtml(emailHtml, resetPasswordPatterns);
            
            if (verificationLink) {
              console.log(`Đã tìm thấy URL đặt lại mật khẩu: ${verificationLink.substring(0, 50)}...`);
              // Đảm bảo không sử dụng số ngẫu nhiên từ email làm mã OTP
              otpCode = null;
            } else {
              console.log('Không tìm thấy URL đặt lại mật khẩu trong email');
            }
          }
          // 3. Kiểm tra email có phải là xác minh hộ gia đình không
          else if (
            emailSubject.toLowerCase().includes('hộ gia đình') ||
            emailSubject.toLowerCase().includes('household') ||
            emailText.toLowerCase().includes('cập nhật hộ gia đình') ||
            emailText.toLowerCase().includes('update household')
          ) {
            otpType = 'Xác minh hộ gia đình';
        
            // Tạo mảng các pattern để tìm URL xác minh hộ gia đình
            const householdVerificationPatterns = [
              // Pattern 1: Tìm tag <a> với text "Đúng, đây là tôi"
              /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:Đúng|Yes|Confirm|Xác nhận|Verify)[^<]*?(?:tôi|me)[^<]*?<\/a>/i,
              
              // Pattern 2: Tìm bất kỳ tag <a> nào có href chứa update-primary-location
              /<a\s+[^>]*href=["']([^"']*?update-primary-location[^"']*)["'][^>]*>/i,
              
              // Pattern 3: Tìm bất kỳ URL nào chứa update-primary-location
              /href=["']([^"']*?update-primary-location[^"']*)["']/i,
              
              // Pattern 4: Tìm thuộc tính href trong thẻ <a> có style chứa màu chữ trắng (thường là nút)
              /<a\s+[^>]*href=["']([^"']+)["'][^>]*style=["'][^"']*color\s*:\s*(?:rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\)|#ffffff|#fff|white)[^"']*["'][^>]*>/i
            ];
            
            // Sử dụng hàm trích xuất URL
            verificationLink = extractUrlsFromHtml(emailHtml, householdVerificationPatterns);
            
            if (verificationLink) {
              console.log(`Đã tìm thấy URL xác minh hộ gia đình: ${verificationLink.substring(0, 50)}...`);
            } else {
              console.log('Không tìm thấy URL xác minh hộ gia đình trong email');
            }
          }
          // 4. Kiểm tra xem có phải là xác minh đăng nhập không
          else if (
            emailSubject.toLowerCase().includes('sign-in') ||
            emailSubject.toLowerCase().includes('đăng nhập') ||
            emailText.toLowerCase().includes('sign in') ||
            emailText.toLowerCase().includes('đăng nhập')
        ) {
            otpType = 'Xác minh đăng nhập';
            
            // Đầu tiên tìm OTP (nếu có)
            const otpMatch = emailText.match(/\b(\d{4,6})\b/);
            if (otpMatch) {
              otpCode = otpMatch[1];
              console.log(`Tìm thấy mã xác minh đăng nhập: ${otpCode}`);
            }
            
            // Sau đó tìm link (nếu có)
            if (emailHtml) {
              // Tạo mảng các pattern để tìm URL xác minh đăng nhập
              const loginVerificationPatterns = [
                // Pattern 1: Tìm tag <a> với text "Xác nhận đăng nhập"
                /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:Xác nhận|Confirm|Verify|Yes|Đúng)[^<]*<\/a>/i,
                
                // Pattern 2: Tìm bất kỳ tag <a> nào trong email có href chứa netflix.com
                /<a\s+[^>]*href=["']([^"']*?netflix\.com[^"']*)["'][^>]*>/i,
                
                // Pattern 3: Tìm bất kỳ URL nào trong email 
                /href=["']([^"']*?netflix\.com[^"']*)["']/i
              ];
              
              // Sử dụng hàm trích xuất URL
              verificationLink = extractUrlsFromHtml(emailHtml, loginVerificationPatterns);
              
              if (verificationLink) {
                console.log(`Đã tìm thấy URL xác minh đăng nhập: ${verificationLink.substring(0, 50)}...`);
              } else {
                console.log('Không tìm thấy URL xác minh đăng nhập trong email');
              }
            }
          }
          // 5. Kiểm tra các trường hợp còn lại
          else {
            // Tìm mã OTP nếu có
            const otpMatch = emailText.match(/\b(\d{4,6})\b/);
            if (otpMatch) {
              otpCode = otpMatch[1];
              console.log(`Tìm thấy mã OTP: ${otpCode}`);
            }
            
            // Tìm URL nếu có
            if (emailHtml) {
              const verifyUrlRegex = /href=["'](https:\/\/[^"']*?(?:netflix\.com|netflix)[^"']*?)["']/i;
              const verifyMatch = emailHtml.match(verifyUrlRegex);
              
              if (verifyMatch && verifyMatch[1]) {
                verificationLink = verifyMatch[1].replace(/&amp;/g, '&');
                console.log(`Tìm thấy URL Netflix: ${verificationLink.substring(0, 50)}...`);
              }
            }
        }
        
        // Lưu vào database
          if (otpCode || verificationLink) {
            // Với email đặt lại mật khẩu, luôn đảm bảo dùng mã VERIFY (không dùng số ngẫu nhiên)
            const finalCode = otpType === 'Đặt lại mật khẩu' ? 'VERIFY' : (otpCode || 'VERIFY');
            
        await Otp.create({
              code: finalCode,
              from: fromEmail,
          type: otpType,
          receivedAt: parsed.date,
              MailAccountId: acc.id,
              verificationLink: verificationLink
        });
        
            console.log(`Đã lưu thông tin email Netflix - Loại: ${otpType}, Email: ${acc.email}, Từ: ${fromEmail}`);
          } else {
            console.log(`Email từ Netflix nhưng không tìm thấy OTP hoặc liên kết xác minh`);
          }
        } else {
          console.log(`Bỏ qua email không liên quan đến Netflix: ${fromEmail}`);
        }
      } catch (emailError) {
        console.error(`Lỗi khi xử lý email #${msg.num}:`, emailError.message);
        // Tiếp tục xử lý email tiếp theo nếu có lỗi
        continue;
      }
    }
    
    // Đóng kết nối
    console.log(`Đang đóng kết nối...`);
    await pop3.QUIT();
    console.log(`===== Kết thúc quét email cho tài khoản ${acc.email} =====`);
  } catch (error) {
    console.error(`Lỗi khi kết nối đến ${acc.email}:`, error.message);
    if (error.stack) {
      console.error(`Stack trace:`, error.stack);
    }
    try {
      // Đảm bảo đóng kết nối nếu có lỗi
      await pop3.QUIT();
    } catch (e) {
      // Bỏ qua lỗi khi đóng kết nối nếu đã bị ngắt
    }
  }
}

// Cron job: mỗi P giây quét 1 lần
const interval = parseInt(process.env.POLL_INTERVAL)||60;
cron.schedule(`*/${interval} * * * * *`, async () => {
  const accounts = await MailAccount.findAll();
  for (let acc of accounts) {
    try { await fetchFromAccount(acc); }
    catch(e){ console.error('Lỗi fetch', acc.email, e); }
  }
});

// Khởi động
(async () => {
  await sequelize.sync();
  app.listen(process.env.PORT||3000, ()=>{
    console.log(`Server chạy tại http://localhost:${process.env.PORT||3000}`);
  });
})();
