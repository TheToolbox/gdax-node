///<reference path="typings/index.d.ts" />
import {default as WebsocketClient} from './clients/websocket';
import {default as PublicClient} from './clients/public';
import {default as AuthenticatedClient} from './clients/authenticated';
import {default as Orderbook} from './orderbook';
import util = require('util');

export default class OrderbookSync extends WebsocketClient {
  //productID: string;
  apiURI: string;
  //websocketURI: string;
  book: Orderbook;
  publicClient: PublicClient;
  authenticatedClient: AuthenticatedClient;

  private queue: any[] = [];//TODO TYPE
  private sequence = -1;

  constructor(productID: string, apiURI: string, websocketURI: string, authenticatedClient: AuthenticatedClient) {
    super(productID || 'BTC-USD', websocketURI || 'wss://ws-feed.gdax.com')
    //this.productID = productID || 'BTC-USD';
    this.apiURI = apiURI || 'https://api.gdax.com';
    //this.websocketURI = websocketURI || 'wss://ws-feed.gdax.com';
    this.authenticatedClient = authenticatedClient;

    WebsocketClient.call(this, this.productID, this.websocketURI);
    this.loadOrderbook();
  }

  onMessage(data: string) {/*TODO handle errors*/
    if (this.sequence === -1) {
      // Orderbook snapshot not loaded yet
      this.queue.push(JSON.parse(data));
    } else {
      this.processMessage(JSON.parse(data));
    }
  }

  loadOrderbook(): Promise<any> {
    var bookArgs = { 'level': 3 };

    this.book = new Orderbook();

    if (this.authenticatedClient) {//note callback guaranteed to evaluate before promise resolves
      return this.authenticatedClient.getProductOrderBook(bookArgs, this.productID, this.cb.bind(this));
    } else {
      if (!this.publicClient) {
        this.publicClient = new PublicClient(this.productID, this.apiURI);
      }
      return this.publicClient.getProductOrderBook(bookArgs, this.cb.bind(this));
    }
  }

  private cb(err: Error, response: any, body: any) {
    if (err) { throw 'Failed to load orderbook: ' + err; }
    if (response.statusCode !== 200) { throw 'Failed to load orderbook: ' + response.statusCode; }

    var data = JSON.parse(response.body);
    this.book.state(data);

    this.sequence = data.sequence;
    this.queue.forEach(this.processMessage.bind(this));
    this.queue = [];
  }


  processMessage(data: any) {//TODO add more specfic typing
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

      this.loadOrderbook();
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
}
