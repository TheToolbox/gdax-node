import events = require('events');
import Websocket = require('ws');

export default class WebsocketClient extends events.EventEmitter {
  protected productID: string;
  protected websocketURI: string = 'wss://ws-feed.gdax.com';
  private socket: Websocket;//TODO import Websocket appropriately and re-type this
  protected pinger: NodeJS.Timer;

  constructor(productID?: string, opts?: { websocketURI?: string }) {
    super();
    this.productID = productID || 'BTC-USD';
    this.websocketURI = opts && opts.websocketURI ? opts.websocketURI : this.websocketURI;
    this.connect();
  }

  connect(): void {
    if (this.socket) {
      this.socket.close();
    }

    this.socket = new Websocket(this.websocketURI);

    this.socket.on('close', this.onClose.bind(this));
    this.socket.on('message', this.onMessage.bind(this));
    this.socket.on('open', this.onOpen.bind(this));
  }

  disconnect(): void {
    if (!this.socket) {
      throw "Could not disconnect (not connected)"
    }

    this.socket.close();
  }

  protected onOpen() {
    this.emit('open');
    var subscribeMessage = {
      type: 'subscribe',
      product_id: this.productID,
    };
    this.socket.send(JSON.stringify(subscribeMessage));

    // Set a 30 second ping to keep connection alive

    this.pinger = setInterval(() => { this.socket.ping('keepalive') }, 30000);

  }

  protected onClose() {
    clearInterval(this.pinger);
    this.socket = null;
    this.emit('close');
  }

  protected onMessage(data: string) { this.emit('message', JSON.parse(data)); }
}
