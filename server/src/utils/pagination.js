const toPage = (items, page, pageSize, totalItems) => ({
  items,
  page,
  pageSize,
  totalItems,
  totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
});

module.exports = { toPage };
