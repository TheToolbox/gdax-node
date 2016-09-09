///<reference path="../typings/index.d.ts" />
import crypto = require('crypto');
import querystring = require('querystring');
import request = require('request');
import PublicClient from './Public';


export default class AuthenticatedClient extends PublicClient {
  key: string;
  b64secret: string;
  passphrase: string;

  constructor(key: string, b64secret: string, passphrase: string, apiURI?: string) {
    super('', apiURI);
    this.key = key;
    this.b64secret = b64secret;
    this.passphrase = passphrase;
  }

  protected request(method: string, uriParts: string[], optsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<any> {
    var opts = optsOrCallback || {};
    if (!callback && (typeof optsOrCallback === 'function')) {
      callback = optsOrCallback;
      opts = {};
    }
    //removed behavior: throw on no callback (unnecessary)
    opts.method = method.toUpperCase()

    var relativeURI = this.makeRelativeURI(uriParts)
    opts.uri = this.makeAbsoluteURI(relativeURI);

    this.addHeaders(opts, this.getSignature(method, relativeURI, opts));

    return new Promise(function (resolve, reject) {
      request(opts, function (err: any, response: any, data: any) {
        try {
          data = JSON.parse(data);
        } catch (e) {
          data = null;
        }

        if (callback) {
          callback(err, response, data);
        }

        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  private getSignature(method: string, relativeURI: string, opts: any) {
    var body = '';

    if (opts.body && typeof opts.body === 'object') {
      body = JSON.stringify(opts.body);
      opts.body = body;
    } else if (opts.qs && Object.keys(opts.qs).length !== 0) {
      body = '?' + querystring.stringify(opts.qs);
    }

    var timestamp = Date.now() / 1000;
    var what = timestamp + method + relativeURI + body;
    var key = new Buffer(this.b64secret, 'base64');
    var hmac = crypto.createHmac('sha256', key);
    var signature = hmac.update(what).digest('base64');
    return {
      'CB-ACCESS-KEY': this.key,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      'CB-ACCESS-PASSPHRASE': this.passphrase,
    };
  }

  getAccounts(callback: RequestCallback): Promise<any> {
    return this.get(['accounts'], callback);
  }

  getAccount(accountID: string, callback: RequestCallback): Promise<any> {
    return this.get(['accounts', accountID], callback);
  }

  getAccountHistory(accountID: string, args: any, callback: RequestCallback): Promise<any> {
    args = args || {}

    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['accounts', accountID, 'ledger'], opts, callback);
  }

  getAccountHolds(accountID : string, args : any, callback: RequestCallback) : Promise<any> {
    var self = this;

    args = args || {}
    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['accounts', accountID, 'holds'], opts, callback);
  }
}


prototype.;

prototype._placeOrder = function (params, callback) {
  var self = this;

  var requiredParams = ['size', 'side', 'product_id'];

  if (params.type !== 'market') {
    requiredParams.push('price');
  }

  _.forEach(requiredParams, function (param) {
    if (params[param] === undefined) {
      throw "`opts` must include param `" + param + "`";
    }
  });
  var opts = { 'body': params };
  return prototype.post.call(self, ['orders'], opts, callback);
};

prototype.buy = function (params, callback) {
  var self = this;
  params.side = 'buy';
  return self._placeOrder(params, callback);
};

prototype.sell = function (params, callback) {
  var self = this;
  params.side = 'sell';
  return self._placeOrder(params, callback);
};

prototype.cancelOrder = function (orderID, callback) {
  var self = this;

  if (!callback && (typeof orderID === 'function')) {
    callback = orderID;
    callback(new Error('must provide an orderID or consider cancelOrders'));
    return;
  }

  return prototype.delete.call(self, ['orders', orderID], callback);
};

prototype.cancelOrders = function (callback) {
  var self = this;
  return prototype.delete.call(self, ['orders'], callback);
};

// temp over ride public call to get Product Orderbook
prototype.getProductOrderBook = function (args, productId, callback) {
  var self = this;

  args = args || {}
  if (!callback && (typeof args === 'function')) {
    callback = args;
    args = {};
  }

  var opts = { 'qs': args };
  return prototype.get.call(self, ['products', productId, 'book'], opts, callback);
};


prototype.cancelAllOrders = function (args, callback) {
  var self = this;
  var currentDeletedOrders = [];
  var totalDeletedOrders = [];
  var query = true;
  var response;

  args = args || {}
  if (!callback && (typeof args === 'function')) {
    callback = args;
    args = {};
  }

  var opts = { 'qs': args };

  async.doWhilst(
    deleteOrders,
    untilEmpty,
    completed
  );

  function deleteOrders(done) {
    prototype.delete.call(self, ['orders'], opts, function (err, resp, data) {

      if (err) {
        done(err);
        return;
      }

      if ((resp && resp.statusCode != 200) || !data) {
        var err = new Error('Failed to cancel all orders');
        query = false;
        done(err);
        return;
      }

      currentDeletedOrders = data;
      totalDeletedOrders = totalDeletedOrders.concat(currentDeletedOrders);
      response = resp;

      done();
    });
  }

  function untilEmpty() {
    return (currentDeletedOrders.length > 0 && query)
  }

  function completed(err) {
    callback(err, response, totalDeletedOrders);
  }
};

prototype.getOrders = function (args, callback) {
  var self = this;

  args = args || {}
  if (!callback && (typeof args === 'function')) {
    callback = args;
    args = {};
  }

  var opts = { 'qs': args };
  return prototype.get.call(self, ['orders'], opts, callback);
};

prototype.getOrder = function (orderID, callback) {
  var self = this;

  if (!callback && (typeof orderID === 'function')) {
    callback = orderID;
    callback(new Error('must provide an orderID or consider getOrders'));
    return;
  }

  return prototype.get.call(self, ['orders', orderID], callback);
};

prototype.getFills = function (args, callback) {
  var self = this;

  args = args || {}
  if (!callback && (typeof args === 'function')) {
    callback = args;
    args = {};
  }

  var opts = { 'qs': args };
  return prototype.get.call(self, ['fills'], opts, callback);
};

prototype.deposit = function (params, callback) {
  var self = this;
  params.type = 'deposit';
  return self._transferFunds(params, callback);
};

prototype.withdraw = function (params, callback) {
  var self = this;
  params.type = 'withdraw';
  return self._transferFunds(params, callback);
};

prototype._transferFunds = function (params, callback) {
  var self = this;
  _.forEach(['type', 'amount', 'coinbase_account_id'], function (param) {
    if (params[param] === undefined) {
      throw "`opts` must include param `" + param + "`";
    }
  });
  var opts = { 'body': params };
  return prototype.post.call(self, ['transfers'], opts, callback);
};

});

module.exports = exports = AuthenticatedClient;

export interface RequestCallback {
  (err: any, response: any, data: any): void
}