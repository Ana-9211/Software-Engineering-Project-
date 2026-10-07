// Money is always an integer in minor currency units (D-08).
function computeSummary(lines, { taxRatePercent, shippingFlatFee }) {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  // round half up to a whole minor unit
  const tax = Math.floor((subtotal * taxRatePercent + 50) / 100);
  const shippingFee = lines.length === 0 ? 0 : shippingFlatFee;
  return { subtotal, tax, shippingFee, total: subtotal + tax + shippingFee };
}

module.exports = { computeSummary };
