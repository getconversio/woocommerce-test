'use strict';

require('ssl-root-cas').inject();

const app = require('./lib/app'),
  config = require('./lib/config');

app.listen(config.port, config.ip, () => console.log(`App listening at http://${config.ip}:${config.port}`));
