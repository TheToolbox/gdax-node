import https = require('https');
import http = require('http');
import qs = require('querystring');
import stream = require('stream');
import crypto = require('crypto');
import {default as WebSocketClient} from './lib/websocket';
import {default as Orderbook} from './lib/orderbook';

const API_LIMIT = 100;

export class Client extends WebSocketClient {

    protected apiHost = 'api.gdax.com';
    protected apiPath = '/';
    //secrets for auth
    private key = '';
    private secret: Buffer = null;
    private passphrase = '';

    book: Orderbook = null;
    private queue: any[] = [];//TODO TYPE
    private sequence = -1;

    constructor(productID?: string, opts?: ConstructorOpts) {
        super(productID, opts);

        if (opts && opts.apiHost) { this.apiHost = opts.apiHost; }
        if (opts && opts.apiPath) { this.apiPath = opts.apiPath; }
        this.syncOrderbook();
    }

    //-----------------------------------------------------------------------------------------------
    //Public endpoints
    //TODO more strictly type the return values
    //TODO more strictly type options
    getProducts() { return this.get(['products']); }
    getProductOrderBook(productID?: string, args?: any) { return this.get(['products', productID || this.productID, 'book'], args); }
    getProductTicker() { return this.get(['products', this.productID, 'ticker']); }
    getProductTrades(args?: any) { return this.get(['products', this.productID, 'trades'], args); }
    getProductHistoricRates(args: any) { return this.get(['products', this.productID, 'candles'], args); }
    getProduct24HrStats() { return this.get(['products', this.productID, 'stats']); }
    getCurrencies() { return this.get(['currencies']); }
    getTime() { return this.get(['time']); }
    getProductTradeStream(tradesFrom: number, tradesTo: number | ((trade: any) => boolean)): stream.Readable {
        var shouldStop: (trade: any) => boolean = null;
        var tradesToNum: number = null;
        if (typeof tradesTo === 'function') {
            //not sure why TS isn't correctly inferring the type guard
            shouldStop = <(trade: any) => boolean>tradesTo;
            tradesTo = null;
        } else {
            tradesToNum = <number>tradesTo;
        }

        var rs = new stream.Readable({ objectMode: true });
        var started = false;

        rs._read = () => {
            if (!started) {
                started = true;
                fetchTrades(rs, tradesFrom, tradesToNum, shouldStop);
            }
        };


        function fetchTrades(stream: any, tradesFrom: number, tradesTo: number, shouldStop?: (trade: any) => boolean) {
            var after = tradesFrom + API_LIMIT + 1;
            var loop = true;

            if (tradesTo && tradesTo <= after) {
                after = tradesTo;
                loop = false;
            }

            var opts = { before: tradesFrom, after: after, limit: API_LIMIT };

            this.getProductTrades(opts)
                .then((data: any) => {

                    for (var i = data.length - 1; i >= 0; i--) {
                        if (shouldStop && shouldStop(data[i])) {
                            stream.push(null); return;
                        }
                        stream.push(data[i]);
                    }
                    if (loop) {
                        fetchTrades(stream, tradesFrom + API_LIMIT, tradesTo, shouldStop);
                    } else {
                        stream.push(null);
                    }
                })
                .catch((err: Error) => {
                    if (err.message.indexOf('429') > -1) {
                        setTimeout(function () {
                            fetchTrades(stream, tradesFrom, tradesTo, shouldStop);
                        }.bind(this), 900);
                        return;
                    }
                    stream.emit('error', err);
                });
        }

        return rs;
    }

    //----------------------------------------------------------------------------------------------------
    //Authenticated endpoints
    //TODO more strictly type the return values
    //TODO more strictly type options
    authenticate(key: string, b64secret: string, passphrase: string) {
        this.key = key;
        this.secret = new Buffer(b64secret, 'base64');
        this.passphrase = passphrase;
    }
    getAccounts(): Promise<any> { return this.get(['accounts']); }
    getAccount(accountID: string): Promise<any> { return this.get(['accounts', accountID]); }
    getAccountHistory(accountID: string, args?: any): Promise<any> { return this.get(['accounts', accountID, 'ledger'], args); }
    getAccountHolds(accountID: string, args?: any): Promise<any> { return this.get(['accounts', accountID, 'holds'], args); }
    private placeOrder(side: string, params: BuySellParams): Promise<any> {
        params['side'] = side;
        return this.post(['orders'], {}, JSON.stringify(params));
    }
    buy(params: BuySellParams): Promise<any> { return this.placeOrder('buy', params); }
    sell(params: BuySellParams): Promise<any> { return this.placeOrder('sell', params); }
    cancelOrder(orderID: string): Promise<any> { return this.delete(['orders', orderID || 'noOrderIDSupplied']); }
    cancelOrders(): Promise<any> { return this.delete(['orders']); }
    getOrders(args?: any): Promise<any> { return this.get(['orders'], args); }
    getOrder(orderID: string): Promise<any> { return this.get(['orders', orderID]); }
    getFills(args?: any): Promise<any> { return this.get(['fills'], args); }
    deposit(params?: TransferParams): Promise<any> { return this.transferFunds('deposit', params); }
    withdraw(params?: TransferParams): Promise<any> { return this.transferFunds('withdraw', params); }
    private transferFunds(direction: string, params: any): Promise<any> {
        params.type = direction;
        return this.post(['transfers'], {}, JSON.stringify(params));
    }
    cancelAllOrders(args?: any): Promise<any> {
        var deletedOrders: any[] = [];
        var query = true;
        var response: any;

        return this.delete(['orders'], args)
            .then(loopIfNotFinished.bind(this));

        function loopIfNotFinished(result: any) {
            if (result.length > 0) {
                deletedOrders = deletedOrders.concat(result);
                return this.delete(['orders'], args).then(loopIfNotFinished.bind(this));
            } else {
                return deletedOrders;
            }
        }
    }

    //-------------------------------------------------------------------------------------------
    //Orderbook syncing
    protected onMessage(data: string) {/*TODO handle errors*/
        if (this.sequence === -1) {
            // Orderbook snapshot not loaded yet
            this.queue.push(JSON.parse(data));
        } else {
            this.processMessage(JSON.parse(data));
        }
    }

    syncOrderbook(): Promise<any> {
        const bookArgs = { 'level': 3 };
        this.book = new Orderbook();
        return this.getProductOrderBook(this.productID, bookArgs)
            .then((data) => {
                this.book.state(data);
                this.sequence = data.sequence;
                this.queue.forEach(this.processMessage.bind(this));
                this.queue = [];
            });
    }

    protected processMessage(data: any) {//TODO add more specfic typing
        if (this.sequence == -1) {
            // Resync is in process
            return;
        }
        if (data.sequence <= this.sequence) {
            // Skip this one, since it was already processed
            return;
        }

        if (data.sequence != this.sequence + 1) {
            // Dropped a message, start a resync process
            this.queue = [];
            this.sequence = -1;

            this.syncOrderbook();
            return;
        }

        this.sequence = data.sequence;

        switch (data.type) {
            case 'open':
                this.book.add(data);
                break;
            case 'done':
                this.book.remove(data.order_id);
                break;
            case 'match':
                this.book.match(data);
                break;
            case 'change':
                this.book.change(data);
                break;
        }
    }

    //-------------------------------------------------------------------------------------------
    //HTTP management
    protected get(uriParts: (string | number)[], query?: Object): Promise<any> { return this.request('get', uriParts, query); }
    protected post(uriParts: (string | number)[], query?: Object, body?: string): Promise<any> { return this.request('post', uriParts, query, body); }
    protected delete(uriParts: (string | number)[], query?: Object): Promise<any> { return this.request('delete', uriParts, query); }
    protected put(uriParts: (string | number)[], query?: Object): Promise<any> { return this.request('put', uriParts, query); }
    protected request(method: string, uriParts: (string | number)[], query?: Object, body?: string): Promise<any> {
        let opts: https.RequestOptions = {};

        //removed behavior: throw on no callback (unnecessary)
        opts.method = method.toUpperCase()
        opts.hostname = this.apiHost;
        opts.path = '/' + uriParts.join('/');

        opts.headers = {};
        opts.headers['User-Agent'] = 'gdax-node-client';
        opts.headers['Accept'] = 'application/json';
        opts.headers['Content-Type'] = 'application/json';

        let querystring = '?' + qs.stringify(query);

        if (this.key) {
            let timestamp = Date.now() / 1000;
            let what = timestamp + method + opts.path + (body || querystring);
            opts.headers['CB-ACCESS-KEY'] = this.key;
            opts.headers['CB-ACCESS-SIGN'] = crypto.createHmac('sha256', this.secret).update(what).digest('base64');
            opts.headers['CB-ACCESS-TIMESTAMP'] = timestamp;
            opts.headers['CB-ACCESS-PASSPHRASE'] = this.passphrase;
        }

        opts.path += querystring;

        return new Promise((resolve, reject) => {
            let req = https.request(opts, res => {
                if (res.statusCode !== 200) {
                    reject(new Error('StatusCode: ' + res.statusCode));
                    return;
                }
                let data: any = '';
                res.on('data', (d: any) => {
                    data += d;
                })
                res.on('error', reject);
                res.on('end', () => {
                    try {
                        data = JSON.parse(data);
                        resolve(data);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', (err: Error) => { reject(err); });
            if (body) { req.end(body); } else { req.end(); }
        });
    }

}
export type TransferParams = {
    amount: string,
    coinbase_account_id: string
}

export type BuySellParams = {
    price: string,
    size: string,
    product_id: string,
    type: string,
    [index: string]: string
}

export type ConstructorOpts = {
    websocketURI?: string,
    apiHost?: string,
    apiPath?: string
}