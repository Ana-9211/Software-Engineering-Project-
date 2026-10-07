const LABELS = { PendingPayment: 'Awaiting payment', PaymentFailed: 'Payment failed' };

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{LABELS[status] || String(status).replace(/_/g, ' ')}</span>;
}
