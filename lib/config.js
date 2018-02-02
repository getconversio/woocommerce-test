'use strict';

module.exports = {
  port: process.env.PORT || 9009,
  ip: process.env.IP || '0.0.0.0',
  redis: {
    connectionString: process.env.REDIS_CONNECTION_STRING || ''
  },
  enforceHttps: String(process.env.ENFORCE_HTTPS) === 'true'
};

module.exports.baseUrl = process.env.BASE_URL || `http://${module.exports.ip}:${module.exports.port}`;
