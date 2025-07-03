const serverless = require('serverless-http');
const app = require('./server/app');

const handler = serverless(app);
exports.handler = handler;
module.exports.handler = handler; 