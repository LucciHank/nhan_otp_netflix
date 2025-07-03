const serverless = require('serverless-http');
const app = require('./server/app');

// Export handler trực tiếp
const handler = serverless(app);
module.exports = { handler }; 