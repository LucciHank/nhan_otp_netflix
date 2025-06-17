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
app.use(express.json());

// EJS setup
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));


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

        this.responseResolver = (response) => {
          clearTimeout(connectTimer);
          if (response.startsWith('+OK')) {
            this.connected = true;
            resolve(response);
          } else {
            reject(new Error(response));
          }
        };
      } catch (err) {
        clearTimeout(connectTimer);
        reject(err);
      }
    });
  }

  async _sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('Không có kết nối'));
      }

      const operationTimer = setTimeout(() => {
        reject(new Error('Lệnh POP3 timed out sau ' + (this.operationTimeout/1000) + 's: ' + command));
      }, this.operationTimeout);

      this.responseResolver = (response) => {
        clearTimeout(operationTimer);
        if (response.startsWith('+OK')) {
          resolve(response);
        } else {
          reject(new Error(response));
        }
      };
      
      this.socket.write(command + '\r\n');
    });
  }

  async _sendCommandMultiLine(command) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('Không có kết nối'));
      }

      const operationTimer = setTimeout(() => {
        reject(new Error('Lệnh POP3 timed out sau ' + (this.operationTimeout/1000) + 's: ' + command));
      }, this.operationTimeout);

      let multiLineResponse = '';
      let isMultiLine = true;
      
      this.responseResolver = (response) => {
        if (isMultiLine) {
          if (response.startsWith('+OK')) {
            isMultiLine = false; // Đã nhận được dòng đầu tiên, giờ chờ nội dung
            this.buffer = ''; // Xóa buffer để nhận nội dung multil-line
            
            // Cập nhật resolver để xử lý nội dung multil-line
            this.responseResolver = (data) => {
              multiLineResponse += data;
              if (multiLineResponse.endsWith('\r\n.\r\n')) {
                clearTimeout(operationTimer);
                resolve(multiLineResponse.slice(0, -5)); // Bỏ dấu kết thúc
              }
            };
            
          } else {
            clearTimeout(operationTimer);
            reject(new Error(response));
          }
        }
      };
      
      // Xử lý lại buffer nếu nó đã chứa dữ liệu
      const tempBuffer = this.buffer;
      this.buffer = '';
      this.socket.emit('data', tempBuffer);
      
      this.socket.write(command + '\r\n');
    });
  }

  async USER(username) {
    await this._sendCommand(`USER ${username}`);
  }

  async PASS(password) {
    await this._sendCommand(`PASS ${password}`);
  }

  async STAT() {
    const response = await this._sendCommand('STAT');
    const parts = response.split(' ');
    return { count: parseInt(parts[1], 10), size: parseInt(parts[2], 10) };
  }

  async RETR(msgNum) {
    return this._sendCommandMultiLine(`RETR ${msgNum}`);
  }
  
  async DELE(msgNum) {
    await this._sendCommand(`DELE ${msgNum}`);
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

// Hàm mask email
function maskEmail(email) {
  if (!email || !email.includes('@')) {
    return email;
  }
  const [name, domain] = email.split('@');
  const maskedName = name.length > 3 ? name.substring(0, 3) + '***' : name.substring(0, 1) + '***';
  return `${maskedName}@${domain}`;
}

// Helper function để kiểm tra đăng nhập
function requireLogin(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Router
app.get('/', async (req, res) => {
  try {
    const tools = await Tool.findAll({ where: { enabled: true }, order: [['name', 'ASC']] });
    if (tools.length === 1) {
      // Nếu chỉ có 1 tool, chuyển hướng thẳng đến trang home của tool đó
      return res.render('home', {
        title: 'Hệ Thống Nhận OTP Netflix',
        error: req.session.error || null,
        req
      });
    }
    res.render('tools', { tools, title: 'Danh Sách Công Cụ', req });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách công cụ:', error);
    res.status(500).send('Lỗi máy chủ');
  }
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

app.post('/search', (req, res) => {
  const { email } = req.body;
  req.session.searchEmail = email;
  req.session.error = null;
  res.redirect('/results');
});

// Admin routes
app.get('/login', (req, res) => {
  res.render('login', { title: 'Đăng Nhập Quản Trị', error: null, layout: 'layouts/main' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPassHash = process.env.ADMIN_PASS_HASH || bcrypt.hashSync('toilavu', 10);
  
  if (username === adminUser && bcrypt.compareSync(password, adminPassHash)) {
    req.session.user = { username };
    res.redirect('/admin/dashboard');
  } else {
    res.render('login', { title: 'Đăng Nhập Quản Trị', error: 'Tên đăng nhập hoặc mật khẩu không đúng', layout: 'layouts/main' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/admin/dashboard', requireLogin, (req, res) => {
  res.render('dashboard', { title: 'Dashboard', layout: 'layouts/main' });
});

// Trang quản lý tài khoản
app.get('/admin/accounts', requireLogin, async (req, res) => {
  const accounts = await MailAccount.findAll({ order: [['email', 'ASC']] });
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

// Xóa tài khoản
app.post('/admin/accounts/delete/:id', requireLogin, async (req, res) => {
  try {
    await MailAccount.destroy({ where: { id: req.params.id } });
    res.redirect('/admin/accounts');
  } catch (e) {
    const accounts = await MailAccount.findAll();
    res.render('accounts', { accounts, err: e.message, success: null, title: 'Quản Lý Tài Khoản Mail' });
  }
});

// Route hiển thị form sửa
app.get('/admin/accounts/edit/:id', requireLogin, async (req, res) => {
  try {
    const account = await MailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).send('Không tìm thấy tài khoản');
    }
    res.render('edit-account', { account, title: 'Sửa Tài Khoản Mail' });
  } catch (error) {
    res.status(500).send('Lỗi máy chủ');
  }
});

// Route xử lý cập nhật
app.post('/admin/accounts/edit/:id', requireLogin, async (req, res) => {
  try {
    const account = await MailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).send('Không tìm thấy tài khoản');
    }
    await account.update(req.body);
    res.redirect('/admin/accounts');
  } catch (error) {
    const account = await MailAccount.findByPk(req.params.id); // Lấy lại account để render lại form
    res.render('edit-account', { account, error: error.message, title: 'Sửa Tài Khoản Mail' });
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

// Admin tools routes
app.get('/admin/tools', requireLogin, async (req, res) => {
  try {
    const tools = await Tool.findAll({ order: [['name', 'ASC']] });
    res.render('admin-tools', { tools, title: 'Quản Lý Công Cụ' });
  } catch (error) {
    res.status(500).send('Lỗi máy chủ');
  }
});

app.post('/admin/tools', requireLogin, async (req, res) => {
  try {
    await Tool.create(req.body);
    res.redirect('/admin/tools');
  } catch (error) {
    const tools = await Tool.findAll();
    res.render('admin-tools', { tools, error: error.message, title: 'Quản Lý Công Cụ' });
  }
});

app.post('/admin/tools/edit/:id', requireLogin, async (req, res) => {
  try {
    const tool = await Tool.findByPk(req.params.id);
    await tool.update(req.body);
    res.redirect('/admin/tools');
  } catch (error) {
    const tools = await Tool.findAll();
    res.render('admin-tools', { tools, error: error.message, title: 'Quản Lý Công Cụ' });
  }
});

app.post('/admin/tools/delete/:id', requireLogin, async (req, res) => {
  try {
    await Tool.destroy({ where: { id: req.params.id } });
    res.redirect('/admin/tools');
  } catch (error) {
    const tools = await Tool.findAll();
    res.render('admin-tools', { tools, error: error.message, title: 'Quản Lý Công Cụ' });
  }
});

// Hàm lấy email từ 1 tài khoản
async function fetchFromAccount(account) {
  console.log(`===== Bắt đầu quét email cho tài khoản ${account.user} =====`);
  
  const pop3Config = {
    host: account.host,
    port: account.port,
    user: account.user,
    password: account.pass,
    tls: account.port === 995,
  };
  
  // Xác định nhà cung cấp dịch vụ email
  const isGmail = account.host.includes('gmail');
  const isOutlook = account.host.includes('outlook');
  
  if (isGmail) {
    console.log(`Phát hiện tài khoản Gmail: ${account.user}`);
    console.log(`LƯU Ý: Đối với Gmail, hãy đảm bảo:`);
    console.log(`1. Đã bật POP3 trong cài đặt Gmail: https://mail.google.com/mail/u/0/#settings/fwdandpop`);
    console.log(`2. Đã tạo mật khẩu ứng dụng: https://myaccount.google.com/apppasswords`);
    console.log(`3. Sử dụng mật khẩu ứng dụng thay vì mật khẩu Gmail thông thường`);
    console.log(`4. Các email có thể mất vài phút để xuất hiện trong POP3 với Gmail`);
  }
  
  const client = new Pop3Command(pop3Config);
  
  try {
    console.log(`Đang kết nối đến máy chủ ${pop3Config.host}:${pop3Config.port}`);
    await client.connect();
    console.log(`Đã kết nối thành công đến ${pop3Config.host}`);

    console.log(`Đang đăng nhập với tài khoản ${account.user}`);
    await client.USER(account.user);
    await client.PASS(account.password);
    console.log(`Đăng nhập thành công với tài khoản ${account.user}`);

    const stat = await client.STAT();
    console.log(`Tìm thấy ${stat.count} email trong hộp thư của ${account.user}`);
    
    if (stat.count === 0) return;

    for (let i = 1; i <= stat.count; i++) {
      try {
        const emailContent = await client.RETR(i);
        const parsed = await simpleParser(emailContent);

        // Chỉ xử lý email từ Netflix
        if (!parsed.from.text.includes('netflix.com')) {
          continue;
        }

        const subject = parsed.subject;
        const html = parsed.html;
        const text = parsed.text;

        console.log(`[${account.user}] - Email #${i} - Subject: ${subject}`);

        let otpData = {
          email: account.email,
          from: parsed.from.text,
          receivedAt: parsed.date || new Date(),
          MailAccountId: account.id, // Liên kết với MailAccount
        };

        // 1. Cập nhật Hộ gia đình Netflix (Đúng, đây là tôi)
        if (subject.includes('Cập nhật Hộ gia đình Netflix của bạn')) {
          const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*id="household-update-btn"[^>]*>/;
          const match = html.match(linkRegex);
          if (match && match[1]) {
            otpData.type = 'Xác minh hộ gia đình';
            otpData.verificationLink = match[1];
            otpData.buttonLabel = 'Đúng, đây là tôi';

            // Trích xuất profile
            const profileRegex = /được xem bởi hồ sơ\s+<strong>([^<]+)<\/strong>/i;
            const profileMatch = html.match(profileRegex);
            if (profileMatch && profileMatch[1]) {
              otpData.profile = profileMatch[1].trim();
            }

            // Trích xuất thời gian hết hạn
            const expiryRegex = /liên kết này sẽ hết hạn sau\s+<strong>(\d+)\s+phút<\/strong>/i;
            const expiryMatch = html.match(expiryRegex);
            if (expiryMatch && expiryMatch[1]) {
              otpData.note = `Liên kết hết hạn sau ${expiryMatch[1]} phút`;
            }
            
            console.log(`  -> Đã nhận diện: Xác minh hộ gia đình`);
            await Otp.create(otpData);
          }
        }
        // 2. Mã truy cập tạm thời (Nhận mã)
        else if (subject.includes('mã truy cập tạm thời')) {
          const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*style="[^"]*background-color:\s*#e50914[^"]*">Nhận mã<\/a>/;
          const match = html.match(linkRegex);
          if (match && match[1]) {
            otpData.type = 'Mã truy cập tạm thời';
            otpData.verificationLink = match[1];
            otpData.buttonLabel = 'Nhận mã';

            // Trích xuất profile
            const profileRegex = /Hồ sơ:\s+<strong>([^<]+)<\/strong>/i;
            const profileMatch = html.match(profileRegex);
            if (profileMatch && profileMatch[1]) {
              otpData.profile = profileMatch[1].trim();
            }
            
            console.log(`  -> Đã nhận diện: Mã truy cập tạm thời`);
            await Otp.create(otpData);
          }
        }
        // Bỏ qua các loại email khác
        else {
          console.log(`  -> Bỏ qua email với chủ đề: "${subject}"`);
        }

        // Đánh dấu email là đã đọc (bằng cách xóa nó khỏi server POP3)
        await client.DELE(i);

      } catch (emailError) {
        console.error(`Lỗi khi xử lý email #${i} của ${account.user}:`, emailError.message);
      }
    }
  } catch (error) {
    console.error(`Lỗi khi quét email cho ${account.user}:`, error.message);
    throw error;
  } finally {
    await client.QUIT();
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

// Khởi tạo và chạy server
async function initialize() {
  try {
    // Không đồng bộ hóa database tự động
    console.log('Khởi tạo server...');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server đang chạy trên cổng ${PORT}`);
    });
  } catch (error) {
    console.error('Không thể khởi tạo ứng dụng:', error);
    process.exit(1);
  }
}

// Chỉ chạy initialize khi không ở trong môi trường serverless (vd: local dev)
if (process.env.NODE_ENV !== 'production') {
  initialize();
}

// Xuất app cho serverless handler
module.exports = app; 