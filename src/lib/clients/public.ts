///<reference path="../typings/index.d.ts" />
var request = require('request');
var Readable = require('stream').Readable;

var API_LIMIT = 100;

export default class PublicClient {
  productID: string;
  apiURI: string;

  constructor(productID: string, apiURI: string) {
    this.productID = productID || 'BTC-USD';
    this.apiURI = apiURI || 'https://api.gdax.com';
  }

  private addHeaders(obj: any, additional?: any) {
    obj.headers = obj.headers || {};
    obj['User-Agent'] = 'gdax-node-client';
    obj['Accept'] = 'application/json';
    obj['Content-Type'] = 'application/json';
    Object.assign(obj, additional || {});
    return obj;
  }

  private makeRelativeURI(parts: string[]) {
    return '/' + parts.join('/');
  }

  private makeAbsoluteURI(relativeURI: string) {
    return this.apiURI + relativeURI;
  }

  private request(method: string, uriParts: string[], optsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<any> {
    var opts = optsOrCallback || {};
    if (!callback && (typeof optsOrCallback === 'function')) {
      callback = optsOrCallback;
      opts = {};
    }
    //removed behavior: throw on no callback (unnecessary)
    opts.method = method.toUpperCase()
    opts.uri = this.makeAbsoluteURI(this.makeRelativeURI(uriParts));

    this.addHeaders(opts);

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

  private get(uriParts: string[], optsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<any> { return this.request('get', uriParts, optsOrCallback, callback); }
  private post(uriParts: string[], optsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<any> { return this.request('ppst', uriParts, optsOrCallback, callback); }
  private put(uriParts: string[], optsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<any> { return this.request('put', uriParts, optsOrCallback, callback); }
  private delete(uriParts: string[], optsOrCallback?: any | RequestCallback, callback?: RequestCallback): Promise<any> { return this.request('delete', uriParts, optsOrCallback, callback); }

  getProducts(callback?: (err: any, response: any, data: any) => {}): Promise<any> {
    return this.get(['products'], callback);
  }

  getProductOrderBook(args: any | RequestCallback, callback?: RequestCallback): Promise<any> {
    args = args || {}

    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    return this.get(['products', this.productID, 'book'], { 'qs': args }, callback);
  }

  getProductTicker(callback?: RequestCallback): Promise<any> {
    return this.get(['products', this.productID, 'ticker'], callback);
  }

  getProductTrades(args: any | RequestCallback, callback?: RequestCallback): Promise<any> {
    args = args || {}

    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['products', this.productID, 'trades'], opts, callback);
  }

  private fetchTrades(stream : any, tradesFrom: number, tradesTo: number, shouldStop ?: (trade : any) => boolean) {
    var after = tradesFrom + API_LIMIT + 1;
    var loop = true;

    if (tradesTo && tradesTo <= after) {
      after = tradesTo;
      loop = false;
    }

    var opts = { before: tradesFrom, after: after, limit: API_LIMIT };

    this.getProductTrades(opts, function (err: any, resp: any, data: any) {
      if (err) {
        stream.emit('error', err);
        return;
      }

      if (resp.statusCode === 429) {
        // rate-limited, try again
        setTimeout(function () {
          this.fetchTrades(stream, tradesFrom, tradesTo, shouldStop);
        }, 900);
        return;
      }

      if (resp.statusCode !== 200) {
        stream.emit('error', new Error('Encountered status code ' + resp.statusCode));
      }

      for (var i = data.length - 1; i >= 0; i--) {
        if (shouldStop && shouldStop(data[i])) {
          stream.push(null);
          return;
        }

        stream.push(data[i]);
      }

      if (!loop) {
        stream.push(null);
        return;
      }

      this.fetchTrades(stream, tradesFrom + API_LIMIT, tradesTo, shouldStop);
    });
  }

  getProductTradeStream(tradesFrom : number, tradesTo : number | ((trade : any)=>boolean)): Promise<any> {
    var shouldStop : (trade : any)=>boolean = null;

    if (typeof tradesTo === 'function') {
      //not sure why TS isn't correctly inferring the type guard
      shouldStop = <(trade : any) => boolean> tradesTo;
      tradesTo = null;
    }

    var rs = new Readable({ objectMode: true });
    var started = false;

    rs._read = function () {
      if (!started) {
        started = true;
        this.fetchTrades(rs, tradesFrom, tradesTo, shouldStop, 0);
      }
    };

    return rs;
  }

  getProductHistoricRates(args: any | RequestCallback, callback?: RequestCallback): Promise<any> {
    args = args || {}

    if (!callback && (typeof args === 'function')) {
      callback = args;
      args = {};
    }

    var opts = { 'qs': args };
    return this.get(['products', this.productID, 'candles'], opts, callback);
  }

  getProduct24HrStats(callback?: RequestCallback): Promise<any> {
    return this.get(['products', this.productID, 'stats'], callback);
  }

  getCurrencies(callback?: RequestCallback): Promise<any> {
    return this.get(['currencies'], callback);
  }

  getTime(callback?: RequestCallback): Promise<any> {
    return this.get(['time'], callback);
  }
}



export interface RequestCallback {
  (err: any, response: any, data: any): void
}