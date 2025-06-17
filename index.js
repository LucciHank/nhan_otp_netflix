require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const cron = require('node-cron');
const { simpleParser } = require('mailparser');
const expressLayouts = require('express-ejs-layouts');
const { sequelize, MailAccount, Otp, Tool } = require('./models');
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
  secret: process.env.SESSION_SECRET || 'tomoi_netflix_otp_secure_secret_key',
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

// Trang danh sách công cụ (mặc định)
app.get('/', async (req, res) => {
  try {
    const tools = await Tool.findAll({ order: [['id', 'ASC']] });
    res.render('tools', {
      title: 'Danh Sách Công Cụ',
      tools
    });
  } catch (e) {
    console.error('Lỗi khi lấy danh sách tool:', e);
    res.render('tools', { title: 'Danh Sách Công Cụ', tools: [] });
  }
});

// Trang Tool xác minh hộ gia đình (OTP Netflix)
app.get('/netflix-otp', async (req, res) => {
  res.render('home', { 
    title: 'Xác Minh Hộ Gia Đình Netflix',
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
    // Tìm tài khoản mail trước
    const account = await MailAccount.findOne({
      where: { email: email }
    });
    
    if (!account) {
      return res.json({ found: false, error: 'Không tìm thấy tài khoản email này trong hệ thống' });
    }
    
    // Tìm OTP dựa trên tài khoản mail
    const otps = await Otp.findAll({ 
      where: {
        receivedAt: { [require('sequelize').Op.gte]: thirtyMinutesAgo },
        type: 'Xác minh hộ gia đình',
        MailAccountId: account.id
      },
      order: [['receivedAt', 'DESC']],
      limit: 1
    });
    
    if (otps.length === 0) {
      return res.json({ found: false });
    }
    
    // Chuẩn bị dữ liệu trả về
    const otp = otps[0];
    
    return res.json({ 
      found: true,
      otp: {
        code: otp.code,
        type: otp.type,
        receivedAt: otp.receivedAt,
        isVerification: true,
        verificationLink: otp.verificationLink,
        buttonLabel: otp.buttonLabel,
        profile: otp.profile,
        note: otp.note
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
    // Tìm tài khoản mail trước
    const account = await MailAccount.findOne({
      where: { email: email }
    });
    
    if (!account) {
      return res.render('result', { 
        title: 'Kết Quả Tìm Kiếm OTP', 
        error: 'Không tìm thấy tài khoản email này trong hệ thống',
        email: maskedEmail,
        otps: []
      });
    }
    
    // Tìm OTP dựa trên tài khoản mail
    const otps = await Otp.findAll({ 
      where: {
        receivedAt: { [require('sequelize').Op.gte]: thirtyMinutesAgo },
        type: 'Xác minh hộ gia đình',
        MailAccountId: account.id
      },
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
        let emailFrom = '';
        if (parsed.from) {
          emailFrom = parsed.from.text || '';
          // Nếu có thể lấy địa chỉ cụ thể từ đối tượng from
          if (parsed.from.value && parsed.from.value.length > 0 && parsed.from.value[0].address) {
            emailFrom = parsed.from.value[0].address;
          }
        }
        
        console.log(`Email #${msg.num} từ: ${emailFrom}`);
        console.log(`Tiêu đề: ${emailSubject}`);
        
        // Xử lý email từ Netflix
        if (emailFrom.toLowerCase().includes('netflix')) {
          let otpType = null;
          let otpCode = null;
          let verificationLink = null;
          let buttonLabel = null;
          let profile = null;
          let note = null;
          let shouldSave = false;
          
          // Chỉ xử lý 2 loại email xác minh hộ gia đình
          // 1. Email cập nhật hộ gia đình
          if (emailText.toLowerCase().includes('cập nhật hộ gia đình') || 
              emailText.toLowerCase().includes('update household')) {
            
            otpType = 'Xác minh hộ gia đình';
            shouldSave = true;
            
            // Tìm liên kết xác minh
            if (emailHtml) {
              const householdPatterns = [
                /href="([^"]*\/update-primary-location[^"]*?)"/i,
                /href="([^"]*\/account\/update[^"]*?)"/i
              ];
              
              verificationLink = extractUrlsFromHtml(emailHtml, householdPatterns);
              buttonLabel = 'Đúng, đây là tôi';
              
              // Trích xuất thông tin profile (người yêu cầu)
              const profileMatch = emailText.match(/Do\s+(.*?)\s+yêu cầu|Được yêu cầu bởi\s+(.*?)\s+từ/i);
              if (profileMatch) {
                profile = profileMatch[1] || profileMatch[2];
              }
              
              // Trích xuất ghi chú về thời gian hết hạn
              const noteMatch = emailText.match(/\*\s+(.*?hết hạn.*?)\./i);
              if (noteMatch) {
                note = noteMatch[1];
              } else {
                const timeMatch = emailText.match(/Liên kết sẽ hết hạn sau\s+(\d+)\s+phút/i);
                if (timeMatch) {
                  note = `Liên kết sẽ hết hạn sau ${timeMatch[1]} phút`;
                }
              }
            }
          }
          // 2. Email mã truy cập tạm thời
          else if (emailText.toLowerCase().includes('mã truy cập tạm thời') || 
                  emailText.toLowerCase().includes('temporary access code') ||
                  (emailHtml && /\/travel\/verify/i.test(emailHtml))) {
            
            otpType = 'Xác minh hộ gia đình';
            shouldSave = true;
            
            // Tìm liên kết xác minh
            if (emailHtml) {
              const tempAccessPatterns = [
                /href="([^"]*\/travel\/verify[^"]*?)"/i,
                /href="([^"]*\/account\/travel[^"]*?)"/i
              ];
              
              verificationLink = extractUrlsFromHtml(emailHtml, tempAccessPatterns);
              buttonLabel = 'Nhận mã';
              
              // Trích xuất thông tin profile
              const profileMatch = emailText.match(/(\d+)\s+thân mến|Được yêu cầu bởi\s+(.*?)\s+từ/i);
              if (profileMatch) {
                profile = profileMatch[1] || profileMatch[2];
              }
              
              // Trích xuất ghi chú về thời gian hết hạn
              const noteMatch = emailText.match(/\*\s+(.*?hết hạn.*?)\./i);
              if (noteMatch) {
                note = noteMatch[1];
              } else {
                const timeMatch = emailText.match(/Liên kết sẽ hết hạn sau\s+(\d+)\s+phút/i);
                if (timeMatch) {
                  note = `Liên kết sẽ hết hạn sau ${timeMatch[1]} phút`;
                }
              }
            }
          }
          
          // Lưu OTP vào database nếu là email xác minh hộ gia đình
          if (shouldSave && (verificationLink || otpCode)) {
            try {
              await Otp.create({
                MailAccountId: acc.id,
                code: otpCode,
                type: otpType,
                from: emailFrom,
                verificationLink: verificationLink,
                buttonLabel: buttonLabel,
                profile: profile,
                note: note,
                receivedAt: new Date()
              });
              console.log(`Đã lưu ${otpType} từ ${emailFrom}`);
            } catch (e) {
              console.error(`Lỗi khi lưu OTP: ${e.message}`);
            }
          } else {
            console.log(`Bỏ qua email không phải xác minh hộ gia đình từ: ${emailFrom}`);
          }
        } else {
          console.log(`Bỏ qua email không liên quan đến Netflix: ${emailFrom}`);
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

// Quản lý Tools
app.get('/admin/tools', requireLogin, async (req, res) => {
  const tools = await Tool.findAll({ order: [['id', 'ASC']] });
  res.render('admin-tools', { tools, err: null, success: null, title: 'Quản Lý Tools' });
});

// Toggle bật/tắt tool
app.post('/admin/tools/toggle/:id', requireLogin, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    if (tool) {
      await tool.update({ enabled: !tool.enabled });
    }
    res.redirect('/admin/tools');
  } catch (e) {
    const tools = await Tool.findAll();
    res.render('admin-tools', { tools, err: e.message, success: null, title: 'Quản Lý Tools' });
  }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
// Không đồng bộ hóa database tự động
// sequelize.sync({ alter: true }).then(() => {
  app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
  });
// }).catch(err => console.error('Lỗi đồng bộ database:', err));

// Lên lịch chạy cron job để kiểm tra email
// ... existing code ...
