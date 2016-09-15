///<reference path="../typings/index.d.ts" />
////<reference path="../types.d.ts" />
import crypto = require('crypto');
import querystring = require('querystring');
import request = require('request');
import PublicClient from './Public';
import {Options as Options} from './Public';


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

  protected request(method: string, uriParts: (string | number)[], opts: Options, callback: RequestCallback): Promise<Result> {
    opts = opts || {};
    //removed behavior: throw on no callback (unnecessary)
    opts.method = method.toUpperCase()

    var relativeURI = this.makeRelativeURI(uriParts)
    opts.uri = this.makeAbsoluteURI(relativeURI);

    this.addHeaders(opts, this.getSignature(method, relativeURI, opts));
    return new Promise(function (resolve, reject) {
      request(<request.OptionsWithUri>opts, function (err: any, response: any, data: any) {
        try {
          data = JSON.parse(data);
        } catch (e) {
          data = null;
        }
        if (callback) {
          callback(err, response, data);
        }

        if (err) {
          reject({ err: err, response: response, data: data });
        } else {
          resolve({ err: err, response: response, data: data });
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

  getAccounts(callback?: RequestCallback): Promise<Result> {
    return this.get(['accounts'], null, callback);
  }

  getAccount(accountID: ID, callback?: RequestCallback): Promise<Result> {
    return this.get(['accounts', accountID], null, callback);
  }

  getAccountHistory(accountID: ID, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<Result> {
    var args = argsOrCallback || {}

    if (!callback && (typeof argsOrCallback === 'function')) {
      callback = argsOrCallback;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['accounts', accountID, 'ledger'], opts, callback);
  }

  getAccountHolds(accountID: ID, argsOrCallback?: any, callback?: RequestCallback): Promise<Result> {

    var args = argsOrCallback || {}
    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['accounts', accountID, 'holds'], opts, callback);
  }

  private placeOrder(params: buySellParams & { side: string }, callback?: RequestCallback): Promise<Result> {
    var requiredParams = ['size', 'side', 'product_id'];

    if (params.type !== 'market') {
      requiredParams.push('price');
    }

    requiredParams.forEach(param => {
      if (params[param] === undefined) { throw "`opts` must include param `" + param + "`"; }
    });

    var opts = { 'body': params };
    return this.post(['orders'], opts, callback);
  }

  buy(params: buySellParams, callback?: RequestCallback): Promise<Result> {
    (<buySellParams & { side: string }>params).side = 'buy';
    return this.placeOrder(<buySellParams & { side: string }>params, callback);
  }

  sell(params: buySellParams, callback?: RequestCallback): Promise<Result> {
    (<buySellParams & { side: string }>params).side = 'sell';
    return this.placeOrder(<buySellParams & { side: string }>params, callback);
  }

  cancelOrder(orderID: ID, callback?: RequestCallback): Promise<Result> {

    if (!callback && (typeof orderID === 'function')) {
      (<any>orderID)(new Error('must provide an orderID or consider cancelOrders'));
      return Promise.reject<Result>({ err: new Error('must provide an orderID or consider cancelOrders'), response: null, data: null });
    }

    return this.delete(['orders', orderID], null, callback);
  }

  cancelOrders(callback?: RequestCallback): Promise<Result> {
    return this.delete(['orders'], null, callback);
  }

  //this function api should probably be changed
  getProductOrderBook(args: any, productId: string | RequestCallback, callback?: RequestCallback): Promise<Result> {
    var args: any = args || {}

    var opts = { 'qs': args };

    if (typeof productId !== 'string') {
      var err = new Error('need to specify a productId!');
      callback(err);
      return Promise.reject<Result>({ err: err });
    } else {
      return this.get(['products', productId, 'book'], opts, callback);
    }
  }

  cancelAllOrders(argsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<Result> {
    var deletedOrders: any[] = [];
    var query = true;
    var response: any;

    var args: any = argsOrCallback || {}
    if (!callback && (typeof argsOrCallback === 'function')) {
      callback = argsOrCallback;
      args = {};
    }

    var opts = { 'qs': args };

    return this.delete(['orders'], opts, null)
      .then(loopIfNotFinished.bind(this));

    function loopIfNotFinished(result: Result) {
      if (result.err) { callback(result.err); throw result.err; }
      if ((result.response && result.response.statusCode !== 200) || !result.data) {
        result.err = new Error('Failed to cancel all orders');
        callback(result.err);
        throw result.err;
      }
      if (result.data.length > 0) {
        deletedOrders = deletedOrders.concat(result.data);
        response = result.response;
        return this.delete(['orders'], opts, null).then(loopIfNotFinished.bind(this));
      } else {
        callback(null, response, deletedOrders);
        return {
          err: null,
          response: response,
          data: deletedOrders
        };
      }
    }
  }

  getOrders(argsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<Result> {

    var args = argsOrCallback || {}
    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['orders'], opts, callback);
  }

  getOrder(orderID: ID, callback?: RequestCallback): Promise<Result> {
    if (!callback && (typeof orderID === 'function')) {
      (<any>orderID)(new Error('You must provide an orderID'));
      return Promise.reject<Result>({ err: new Error('You must provide an orderID') })
    }
    return this.get(['orders', orderID], null, callback);
  }

  getFills(args?: any | RequestCallback, callback?: RequestCallback): Promise<Result> {

    args = args || {}
    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['fills'], opts, callback);
  }

  deposit(params: any, callback?: RequestCallback): Promise<Result> {
    params.type = 'deposit';
    return this.transferFunds(params, callback);
  }

  withdraw(params: any, callback?: RequestCallback): Promise<Result> {
    params.type = 'withdraw';
    return this.transferFunds(params, callback);
  }

  private transferFunds(params: any, callback: RequestCallback) {
    ['type', 'amount', 'coinbase_account_id'].forEach(function (param) {
      if (params[param] === undefined) {
        throw "`opts` must include param `" + param + "`";
      }
    });
    var opts = { 'body': params };
    return this.post(['transfers'], opts, callback);
  }
}

export interface RequestCallback {
  (err: any, response?: any, data?: any): void
}

export interface buySellParams {
  price: string,
  size: string,
  product_id: string,
  type: string,
  [index: string]: string
}

export interface Result { err: any, response: any, data: any }

export type ID = string | number;
