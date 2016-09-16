///<reference path="../typings/index.d.ts" />
var RBTree = require('bintrees').RBTree;
var num = require('num');
var assert = require('assert');

export default class Orderbook {
  private ordersByID: { [index: string]: Order };
  private bids: RBTree<any>;//TODO better typing
  private asks: RBTree<any>;

  constructor() {
    this.ordersByID = {};
    this.bids = new RBTree(Orderbook.compare);
    this.asks = new RBTree(Orderbook.compare);
  }

  private static compare(a: Num, b: Num) {
    return a.price.cmp(b.price);
  }

  private getTree(side: string) {
    return side === 'buy' ? this.bids : this.asks;
  }

  state(book?: Book) {
    if (book) {
      book.bids.forEach((order: any) => {//TODO better typing
        order = {
          id: order[2],
          side: 'buy',
          price: num(order[0]),
          size: num(order[1])
        }
        this.add(order);
      });

      book.asks.forEach((order: any) => {//TODO better typing
        order = {
          id: order[2],
          side: 'sell',
          price: num(order[0]),
          size: num(order[1])
        }
        this.add(order);
      });

    } else {

      book = {
        asks: [],
        bids: []
      };

      this.bids.reach(bid => {
        bid.orders.forEach((order: any) => {
          book.bids.push(order);
        });
      });

      this.asks.each(ask => {
        ask.orders.forEach((order: any) => {
          book.asks.push(order);
        });
      });

      return book;
    }
  }

  get(orderId: string) {
    return this.ordersByID[orderId]
  }

  add(order: Order) {

    order = {
      id: order.order_id || order.id,
      side: order.side,
      price: num(order.price),
      size: num(order.size || order.remaining_size),
    };

    var tree = this.getTree(order.side);
    var node = tree.find({ price: order.price });

    if (!node) {
      node = {
        price: order.price,
        orders: []
      }
      tree.insert(node);
    }

    node.orders.push(order);
    this.ordersByID[order.id] = order;
  }

  remove(orderId: string) {
    var order = this.get(orderId);

    if (!order) {
      return;
    }

    var tree = this.getTree(order.side);
    var node = tree.find({ price: order.price });
    assert(node);
    var orders = node.orders;

    orders.splice(orders.indexOf(order), 1);

    if (orders.length === 0) {
      tree.remove(node);
    }

    delete this.ordersByID[order.id];
  }

  match(match: any) {//TODO better typing
    var size = num(match.size);
    var price = num(match.price);
    var tree = this.getTree(match.side);
    var node = tree.find({ price: price });
    assert(node);

    var order = node.orders[0];
    assert.equal(order.id, match.maker_order_id);

    order.size = order.size.sub(size);
    this.ordersByID[order.id] = order;

    assert(order.size >= 0);

    if (order.size.eq(0)) {
      this.remove(order.id);
    }
  }

  change(change: any) {//TODO better typing

    var size = num(change.new_size);
    var price = num(change.price);
    var order = this.get(change.order_id)
    var tree = this.getTree(change.side);
    var node = tree.find({ price: price });

    if (!node || node.orders.indexOf(order) < 0) {
      return;
    }

    var nodeOrder = node.orders[node.orders.indexOf(order)];

    var newSize = parseFloat(order.size);
    var oldSize = parseFloat(change.old_size);

    assert.equal(oldSize, newSize);

    nodeOrder.size = size;
    this.ordersByID[nodeOrder.id] = nodeOrder;
  }
}

export type Order = {
  id?: string,
  order_id?: string,
  side: 'buy' | 'sell',
  price: Num | number,
  size?: Num | number,
  remaining_size?: Num | number
};
export type Num = any;
type RBTree<T> = {
  insert: (item: T) => void,
  remove: (item: T) => void,
  size: number,
  clear(): () => void,
  find: (item: T) => T,
  findIter: (item: T) => Iterator<T>,
  lowerBound: (item: T) => Iterator<T>,
  upperBound: (item: T) => Iterator<T>,
  min: () => T,
  max: () => T,
  each: (f: (item: T) => void) => void,
  reach: (f: (item: T) => void) => void,
  iterator(): () => { next(): Iterator<T>, prev(): Iterator<T> }
};
export type Book = any;

