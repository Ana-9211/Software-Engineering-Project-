const crypto = require('crypto');
const { AppError, notFound } = require('../../utils/AppError');
const { toPage } = require('../../utils/pagination');
const { toObjectId } = require('../../utils/ids');
const { computeSummary } = require('../../utils/money');
const logger = require('../../utils/logger');
const { deriveOrderStatus, isValidTransition, PLACED_OR_LATER } = require('./orderStatusPolicy');

const PAGE_SIZE = 10;
const SELLER_PAGE_SIZE = 20;

function newOrderNumber(now) {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `OB-${d}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function refundStatusOf(payment) {
  if (!payment) return 'none';
  if (payment.status === 'refund_pending') return 'pending';
  if (payment.status === 'refunded') return 'refunded';
  return 'none';
}

// openapi Order. Item ids let the seller screen address one item (API-43).
function toOrder(order, payment) {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    items: order.items.map((i) => ({
      id: String(i._id),
      bookId: String(i.bookId),
      title: i.titleSnapshot,
      isbn: i.isbnSnapshot,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      fulfilmentStatus: i.fulfilmentStatus,
    })),
    summary: { subtotal: order.subtotal, tax: order.tax, shippingFee: order.shippingFee, total: order.total },
    shippingAddress: order.shippingAddress,
    paymentStatus: payment ? payment.status : undefined,
    refundStatus: refundStatusOf(payment),
    reservationExpiresAt: order.status === 'PendingPayment' ? order.reservationExpiresAt : undefined,
    failureReason: order.failureReason,
    placedAt: order.placedAt,
    createdAt: order.createdAt,
  };
}

// What a seller sees: only their own items, plus the shipping name and address needed to ship (API-42, API-43).
// The `summary` required by the OpenAPI Order schema is worked out from the seller's own items only, so it
// never shows another seller's amounts or the order total: subtotal and tax of the seller's own lines, no
// shipping fee (the flat fee belongs to the whole order and is not split between sellers).
function toSellerOrder(o, sellerId, taxRatePercent) {
  const own = o.items.filter((i) => String(i.sellerId) === String(sellerId));
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    placedAt: o.placedAt,
    shippingAddress: o.shippingAddress,
    summary: computeSummary(own, { taxRatePercent, shippingFlatFee: 0 }),
    items: own.map((i) => ({
        id: String(i._id),
        bookId: String(i.bookId),
        title: i.titleSnapshot,
        isbn: i.isbnSnapshot,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        fulfilmentStatus: i.fulfilmentStatus,
      })),
  };
}

// BM-06 Order: checkout, payment confirmation, cancellation, expiry sweeper and item fulfilment.
function createOrderService({ repo, cartService, inventoryService, paymentService, notificationService, userService, clock, config, withTransaction }) {
  const minutesFromNow = (m) => new Date(clock.now().getTime() + m * 60000);

  async function paymentOf(order) {
    return paymentService.findByOrder(order._id);
  }

  async function view(order) {
    return toOrder(order, await paymentOf(order));
  }

  // Close an unpaid order and release its reserved units, in one transaction. Safe to call twice:
  // only the call that flips PendingPayment -> PaymentFailed releases the units.
  async function releaseOrder(order, reason) {
    return withTransaction(async (session) => {
      const closed = await repo.closeUnpaid(order._id, reason, { session });
      if (!closed) return false;
      await inventoryService.releaseReservation(closed.items, session);
      await paymentService.markFailed(order._id, { session });
      return true;
    });
  }

  // a customer has at most one open checkout; starting a new one releases the earlier one
  async function releaseOpenCheckouts(userId) {
    for (const open of await repo.findOpenCheckouts(userId)) await releaseOrder(open, 'abandoned');
  }

  async function resolveAddress(userId, input) {
    if (input.addressId) {
      const snapshot = await userService.getAddressSnapshot(userId, input.addressId);
      if (!snapshot) {
        throw new AppError('VALIDATION_ERROR', 400, 'Unknown address', [{ field: 'addressId', issue: 'address not found' }]);
      }
      return snapshot;
    }
    return input.shippingAddress;
  }

  // Finalise the reservation and place the order. Used by the browser confirmation (API-28) and the
  // gateway webhook (API-29): one idempotent code path (D-13).
  async function finalizePaidOrder(order, gatewayPaymentId) {
    let outcome;
    try {
      outcome = await withTransaction(async (session) => {
        const fresh = await repo.findById(order._id, { session });
        if (PLACED_OR_LATER.includes(fresh.status)) return { order: fresh, already: true };
        if (fresh.status === 'PaymentFailed') {
          if (fresh.failureReason !== 'expired') throw new AppError('ORDER_NOT_PAYABLE', 409, 'This order can no longer be paid');
          await inventoryService.reserve(fresh.items, session); // the hold had expired: reserve again
        } else if (fresh.status !== 'PendingPayment') {
          throw new AppError('ORDER_NOT_PAYABLE', 409, 'This order can no longer be paid');
        }
        const books = await inventoryService.finalizeReservation(fresh.items, session);
        const placed = await repo.markPlaced(fresh._id, clock.now(), { session });
        if (!placed) throw new AppError('ORDER_NOT_PAYABLE', 409, 'This order can no longer be paid');
        await paymentService.markSucceeded(fresh._id, gatewayPaymentId, { session });
        await cartService.clear(fresh.userId, session);
        return { order: placed, books };
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'INSUFFICIENT_STOCK') {
        // late payment and the stock is gone: record the payment, refund it, fail the order
        await paymentService.markSucceeded(order._id, gatewayPaymentId);
        const payment = await paymentOf(order);
        await paymentService.refund(payment, order.total);
        await repo.setFailureReason(order._id, 'stock_unavailable_refunded');
        throw new AppError('ORDER_FAILED_REFUNDED', 409, 'The books sold out while payment was pending. Your payment has been refunded.');
      }
      throw err;
    }
    if (!outcome.already) {
      for (const book of outcome.books) await inventoryService.evaluateLowStock(book);
      const user = await userService.findById(outcome.order.userId);
      await notificationService.sendOrderConfirmation(outcome.order, user); // never fails the order (I-10)
    }
    return outcome.order;
  }

  async function releaseExpiredReservations() {
    const expired = await repo.findExpired(clock.now(), 100);
    let released = 0;
    for (const order of expired) {
      try {
        if (await releaseOrder(order, 'expired')) released += 1;
      } catch (err) {
        logger.error('could not release expired reservation', { orderId: String(order._id), error: err.message });
      }
    }
    return released;
  }

  return {
    toOrder,
    releaseExpiredReservations,

    // API-27: reserve stock atomically, create the order, then create the payment session
    async createOrder(userId, input) {
      const cart = await cartService.getValidatedCart(userId); // 400 if empty, 409 if a line is short
      const shippingAddress = await resolveAddress(userId, input);
      await releaseOpenCheckouts(userId);

      const now = clock.now();
      const items = cart.items.map((line) => ({
        bookId: line.bookId,
        sellerId: line.sellerId,
        titleSnapshot: line.title,
        isbnSnapshot: line.isbn,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.unitPrice * line.quantity,
        fulfilmentStatus: 'Placed',
      }));
      const summary = cartService.computeSummary(items);

      const order = await withTransaction(async (session) => {
        await inventoryService.reserve(items, session); // all lines or none
        return repo.create(
          {
            orderNumber: newOrderNumber(now),
            userId,
            items,
            shippingAddress,
            ...summary,
            status: 'PendingPayment',
            reservationExpiresAt: minutesFromNow(config.reservationMinutes),
          },
          { session }
        );
      });

      let payment;
      try {
        payment = await paymentService.createPaymentSession(order); // outside any transaction
      } catch (err) {
        await releaseOrder(order, 'payment_failed');
        throw err;
      }
      await repo.setPayment(order._id, (await paymentOf(order))._id);

      if (input.saveAddress && !input.addressId) {
        try {
          await userService.addAddress(userId, { ...shippingAddress, label: 'Checkout' });
        } catch (err) {
          if (!(err instanceof AppError)) throw err; // a full address book must not fail the order
        }
      }
      const fresh = await repo.findById(order._id);
      return { order: await view(fresh), payment };
    },

    // API-28
    async confirmPayment(userId, orderId, paymentRef) {
      const order = await repo.findOwned(userId, orderId);
      if (!order) throw notFound('Order not found');
      if (PLACED_OR_LATER.includes(order.status)) return view(order); // idempotent
      if (order.status === 'Cancelled' || (order.status === 'PaymentFailed' && order.failureReason !== 'expired')) {
        throw new AppError('ORDER_NOT_PAYABLE', 409, 'This order can no longer be paid');
      }
      const verified = await paymentService.verifyPayment(order, paymentRef);
      if (!verified) {
        throw new AppError('PAYMENT_VERIFICATION_FAILED', 400, 'The payment could not be verified. Your stock stays reserved until the hold expires.');
      }
      const placed = await finalizePaidOrder(order, paymentRef.gatewayPaymentId);
      return view(placed);
    },

    // API-29 (webhook), called with the raw body and the signature header
    async handleGatewayEvent(rawBody, signature) {
      const event = paymentService.verifyWebhook(rawBody, signature);
      const payment = event && event.gatewayOrderId ? await paymentService.findByGatewayOrderId(String(event.gatewayOrderId)) : null;
      if (!payment) return; // unknown order: ignored
      const order = await repo.findById(payment.orderId);
      if (!order) return;
      if (event.event === 'payment.succeeded' && event.gatewayPaymentId) {
        try {
          await finalizePaidOrder(order, String(event.gatewayPaymentId));
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          logger.warn('webhook payment could not place the order', { orderId: String(order._id), code: err.code });
        }
      } else if (event.event === 'payment.failed') {
        await releaseOrder(order, 'payment_failed');
      }
    },

    async listOrders(userId, page) {
      const { items, totalItems } = await repo.listForUser(userId, page, PAGE_SIZE);
      return toPage(await Promise.all(items.map(view)), page, PAGE_SIZE, totalItems);
    },

    async getOrder(userId, orderId) {
      const order = await repo.findOwned(userId, orderId);
      if (!order) throw notFound('Order not found');
      return view(order);
    },

    // API-32
    async cancelOrder(userId, orderId) {
      const order = await repo.findOwned(userId, orderId);
      if (!order) throw notFound('Order not found');
      const notCancellable = () => new AppError('ORDER_NOT_CANCELLABLE', 409, 'This order can no longer be cancelled');

      if (order.status === 'PendingPayment') {
        await releaseOrder(order, 'abandoned'); // reservation released, no refund
        return view(await repo.findById(order._id));
      }
      const cancelled = await withTransaction(async (session) => {
        const c = await repo.cancelPlaced(userId, orderId, clock.now(), { session });
        if (!c) return null;
        await inventoryService.restore(c.items, session); // stock goes back on the shelf
        return c;
      });
      if (!cancelled) throw notCancellable();
      const payment = await paymentOf(cancelled);
      if (payment && payment.status === 'succeeded') await paymentService.refund(payment, cancelled.total); // after the commit
      return view(cancelled);
    },

    // BM-09 / I-18: seller views and fulfilment
    async listSellerOrders(sellerId, status, page) {
      const { items, totalItems } = await repo.listForSeller(toObjectId(sellerId), status, page, SELLER_PAGE_SIZE);
      const shaped = items.map((o) => toSellerOrder(o, sellerId, config.taxRatePercent));
      return toPage(shaped, page, SELLER_PAGE_SIZE, totalItems);
    },

    async applyItemStatus(orderId, itemId, sellerId, status) {
      const sellerObjectId = toObjectId(sellerId);
      const updated = await withTransaction(async (session) => {
        const order = await repo.findById(orderId, { session });
        const item = order && order.items.id(itemId);
        if (!order || !item || String(item.sellerId) !== String(sellerId) || !order.placedAt) return null; // not found or not owned
        if (!isValidTransition(item.fulfilmentStatus, status)) {
          throw new AppError('INVALID_STATUS_TRANSITION', 409, `An item can only move from ${item.fulfilmentStatus} to the next step`);
        }
        const moved = await repo.updateItemStatus(orderId, toObjectId(itemId), sellerObjectId, item.fulfilmentStatus, status, { session });
        if (!moved) throw new AppError('INVALID_STATUS_TRANSITION', 409, 'The item status changed; reload and try again');
        return repo.setStatus(orderId, deriveOrderStatus(moved.items), { session });
      });
      if (!updated) throw notFound('Order item not found');
      return toSellerOrder(updated, sellerId, config.taxRatePercent);
    },
  };
}

module.exports = { createOrderService, toOrder };
