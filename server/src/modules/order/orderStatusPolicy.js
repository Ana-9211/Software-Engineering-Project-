// OrderStatusPolicy (D-07): the order status is derived from the item statuses.
const RANK = { Placed: 0, Packed: 1, Shipped: 2, Delivered: 3 };
const NEXT = { Placed: 'Packed', Packed: 'Shipped', Shipped: 'Delivered' };

// the lowest status among the items that are not cancelled; Cancelled when every item is cancelled
function deriveOrderStatus(items) {
  const active = items.filter((i) => i.fulfilmentStatus !== 'Cancelled');
  if (active.length === 0) return 'Cancelled';
  return active.reduce((low, i) => (RANK[i.fulfilmentStatus] < RANK[low] ? i.fulfilmentStatus : low), active[0].fulfilmentStatus);
}

// an item may only move to the next step, one step at a time
const isValidTransition = (from, to) => NEXT[from] === to;

// FR-16: the order is unpaid, Placed or Packed, and no item has been shipped or delivered
function canCancel(order) {
  if (!['PendingPayment', 'Placed', 'Packed'].includes(order.status)) return false;
  return !order.items.some((i) => ['Shipped', 'Delivered'].includes(i.fulfilmentStatus));
}

const PLACED_OR_LATER = ['Placed', 'Packed', 'Shipped', 'Delivered'];

module.exports = { deriveOrderStatus, isValidTransition, canCancel, PLACED_OR_LATER };
