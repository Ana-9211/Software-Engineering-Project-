const { AppError } = require('../../utils/AppError');
const { toObjectId } = require('../../utils/ids');

const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" -> Date at 00:00 UTC, or null when it is not a real calendar date
function parseDate(text) {
  const d = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : d;
}

// the range is inclusive of both days: [from 00:00, to + 1 day)
function parseRange(from, to) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end || start > end || (end - start) / DAY_MS + 1 > MAX_DAYS) {
    throw new AppError('INVALID_DATE_RANGE', 400, 'The date range is invalid: from must not be after to, and the range is at most 366 days');
  }
  return { start, endExclusive: new Date(end.getTime() + DAY_MS) };
}

// BM-12 Reporting (FR-23, FR-28): aggregations over paid orders (placedAt is set at payment confirmation)
function createReportingService({ orderRepo }) {
  return {
    async salesReport(sellerId, from, to) {
      const { start, endExclusive } = parseRange(from, to);
      const sid = toObjectId(sellerId);
      const [result] = await orderRepo.aggregate([
        { $match: { placedAt: { $gte: start, $lt: endExclusive }, 'items.sellerId': sid } },
        { $unwind: '$items' },
        { $match: { 'items.sellerId': sid, 'items.fulfilmentStatus': { $ne: 'Cancelled' } } },
        {
          $facet: {
            totals: [{ $group: { _id: null, orders: { $addToSet: '$_id' }, units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } }],
            byBook: [
              { $group: { _id: '$items.bookId', title: { $first: '$items.titleSnapshot' }, units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
              { $sort: { revenue: -1, _id: 1 } },
            ],
          },
        },
      ]);
      const totals = result.totals[0] || { orders: [], units: 0, revenue: 0 };
      return {
        from,
        to,
        orderCount: totals.orders.length,
        unitsSold: totals.units,
        revenue: totals.revenue,
        byBook: result.byBook.map((b) => ({ bookId: String(b._id), title: b.title, units: b.units, revenue: b.revenue })),
      };
    },

    async platformReport(from, to) {
      const { start, endExclusive } = parseRange(from, to);
      const match = { placedAt: { $gte: start, $lt: endExclusive }, status: { $ne: 'Cancelled' } };
      const [result] = await orderRepo.aggregate([
        { $match: match },
        {
          $facet: {
            totals: [{ $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }],
            top: [
              { $unwind: '$items' },
              { $group: { _id: '$items.bookId', title: { $first: '$items.titleSnapshot' }, units: { $sum: '$items.quantity' } } },
              { $sort: { units: -1, _id: 1 } },
              { $limit: 10 },
            ],
          },
        },
      ]);
      const totals = result.totals[0] || { orders: 0, revenue: 0 };
      return {
        from,
        to,
        orderCount: totals.orders,
        revenue: totals.revenue,
        topBooks: result.top.map((b) => ({ bookId: String(b._id), title: b.title, units: b.units })),
      };
    },
  };
}

module.exports = { createReportingService, parseRange };
