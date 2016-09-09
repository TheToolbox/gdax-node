///<reference path="../typings/index.d.ts" />
import events = require('events');
import Websocket = require('ws');

export default class WebsocketClient extends events.EventEmitter {
  productID: string;
  websocketURI: string;
  private socket: Websocket;
  private pinger: NodeJS.Timer;

  constructor(productID : string, websocketURI : string) {
    super();
    this.productID = productID || 'BTC-USD';
    this.websocketURI = websocketURI || 'wss://ws-feed.gdax.com';
    this.connect();
  }

  connect() : void {
    if (this.socket) {
      this.socket.close();
    }

    this.socket = new Websocket(this.websocketURI);

    this.socket.on('message', this.onMessage.bind(this));
    this.socket.on('open',    this.onOpen.bind(this));
    this.socket.on('close',   this.onClose.bind(this));
  }

  disconnect() : void {
    if (!this.socket) {
      throw "Could not disconnect (not connected)"
    }

    this.socket.close();
  }

  onOpen() {
    this.emit('open');
    var subscribeMessage = {
      type: 'subscribe',
      product_id: this.productID,
    };
    this.socket.send(JSON.stringify(subscribeMessage));

    // Set a 30 second ping to keep connection alive
    this.pinger = setInterval(function(){
      this.socket.ping("keepalive");
    }, 30000);

  }

  onClose() {
    clearInterval(this.pinger);
    this.socket = null;
    this.emit('close');
  }

  onMessage(data : string) {
    this.emit('message', JSON.parse(data));
  }
}
