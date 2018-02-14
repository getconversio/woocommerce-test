'use strict';

const bodyParser = require('body-parser'),
  express = require('express'),
  secure = require('express-force-https'),
  expressNunjucks = require('express-nunjucks'),
  fs = require('fs'),
  Redis = require('ioredis'),
  prettyjson = require('prettyjson'),
  querystring = require('querystring'),
  url = require('url'),
  uuid = require('uuid'),
  WooCommerce = require('woocommerce'),
  config = require('./config');

const redis = new Redis(config.redis.connectionString);

const isDev = process.env.NODE_ENV !== 'production';

const app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

if (config.enforceHttps) {
  app.use(secure);
}

app.route('/')
  .get((req, res) => res.render('index'))
  .post(async(req, res) => {
    const wcUrl = url.resolve(req.body.url, 'wc-auth/v1/authorize');

    const userId = uuid.v1();

    await redis.setex(`woocommerce-test:${userId}:url`, 3600, req.body.url);

    const parameters = {
      app_name: 'WooCommerce Rest API test',
      scope: 'read_write',
      return_url: config.baseUrl + '/return',
      callback_url: config.baseUrl + '/callback',
      user_id: userId
    };

    res.redirect(wcUrl + '?' + querystring.stringify(parameters));
  });

app.route('/callback')
  .post(async(req, res) => {
    await redis.setex(`woocommerce-test:${req.body.user_id}:data`, 3600, JSON.stringify(req.body));

    res.sendStatus(200);
  });

app.route('/return')
  .get(async(req, res) => {
    if (req.query.fake) {
      return res.render('results', { results: fs.readFileSync(__dirname + '/fixtures/fake.txt') });
    }

    if (req.query.success !== '1') {
      return res.send('You need to accept the creation of api keys.');
    }

    const url = await redis.get(`woocommerce-test:${req.query.user_id}:url`);

    const data = JSON.parse(await redis.get(`woocommerce-test:${req.query.user_id}:data`));

    const api = new WooCommerce({
      url,
      timeout: 10000,
      apiPath: '/wp-json/wc/v2',
      consumerKey: data.consumer_key,
      secret: data.consumer_secret
    });

    const accesses = {
      settingsGeneral: true,
      settingsEmail: true,
      systemStatus: true,
      couponsRead: true,
      couponsWrite: true
    };

    const errors = [];

    try {
      console.log('General settings', await api.get('/settings/general'));
    } catch (e) {
      accesses.settingsGeneral = false;

      errors.push(e.message);
    }

    try {
      console.log('Email settings', await api.get('/settings/email'));
    } catch (e) {
      accesses.settingsEmail = false;

      errors.push(e.message);
    }

    try {
      console.log('System status', await api.get('/system_status'));
    } catch (e) {
      accesses.systemStatus = false;

      errors.push(e.message);
    }

    try {
      console.log('Coupons read', await api.get('/coupons'));
    } catch (e) {
      accesses.couponsRead = false;

      errors.push(e.message);
    }

    try {
      const writeApi = new WooCommerce({
        url,
        timeout: 10000,
        consumerKey: data.consumer_key,
        secret: data.consumer_secret
      });

      const coupon = {
        coupon: {
          code: `conversio-test-${uuid.v1()}`,
          type: 'percent',
          amount: '10',
          individual_use: true,
          product_ids: [],
          exclude_product_ids: [],
          enable_free_shipping: false,
          product_category_ids: [],
          exclude_product_category_ids: [],
          exclude_sale_items: true,
          minimum_amount: '100.00',
          maximum_amount: '0.00',
          customer_emails: [],
          description: ''
        }
      };

      console.log('Coupons write', await writeApi.post('/coupons', coupon));
    } catch (e) {
      accesses.couponsWrite = false;

      errors.push(e.message);
    }

    res.render('results', { results: prettyjson.render({ url, accesses, errors, data }) });
  });

expressNunjucks(app, { watch: isDev, noCache: isDev });

module.exports = app;
