// Every call the web app makes to the REST API, grouped by frontend module (SDD 4.2 "API calls").
// There is no endpoint here that is not in docs/phase-2/design/openapi.yaml.
import { api } from './index.js';

export const authApi = {
  csrf: () => api.get('/api/auth/csrf-token'), // API-01
  register: (body) => api.post('/api/auth/register', body), // API-02
  verifyEmail: (token) => api.post('/api/auth/verify-email', { token }), // API-03
  resendVerification: (email) => api.post('/api/auth/resend-verification', { email }), // API-04
  login: (email, password) => api.post('/api/auth/login', { email, password }), // API-05
  logout: () => api.post('/api/auth/logout'), // API-06
  me: () => api.get('/api/auth/me'), // API-07
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }), // API-08
  resetPassword: (token, newPassword) => api.post('/api/auth/reset-password', { token, newPassword }), // API-09
};

export const profileApi = {
  get: () => api.get('/api/profile'), // API-10
  update: (body) => api.patch('/api/profile', body), // API-11
  addAddress: (body) => api.post('/api/profile/addresses', body), // API-12
  updateAddress: (id, body) => api.patch(`/api/profile/addresses/${id}`, body), // API-13
  removeAddress: (id) => api.delete(`/api/profile/addresses/${id}`), // API-14
};

export const catalogApi = {
  books: (query) => api.get('/api/books', query), // API-15
  book: (id) => api.get(`/api/books/${id}`), // API-16
  reviews: (id, page) => api.get(`/api/books/${id}/reviews`, { page }), // API-17
  categories: () => api.get('/api/categories'), // API-18
  // API-19 is the image URL itself (/api/images/:imageId), used as <img src>
};

export const cartApi = {
  get: () => api.get('/api/cart'), // API-20
  add: (bookId, quantity) => api.post('/api/cart/items', { bookId, quantity }), // API-21
  setQuantity: (bookId, quantity) => api.patch(`/api/cart/items/${bookId}`, { quantity }), // API-22
  remove: (bookId) => api.delete(`/api/cart/items/${bookId}`), // API-23
};

export const wishlistApi = {
  get: () => api.get('/api/wishlist'), // API-24
  add: (bookId) => api.put(`/api/wishlist/items/${bookId}`), // API-25
  remove: (bookId) => api.delete(`/api/wishlist/items/${bookId}`), // API-26
};

export const orderApi = {
  create: (body) => api.post('/api/orders', body), // API-27
  confirmPayment: (orderId, body) => api.post(`/api/orders/${orderId}/payment/confirm`, body), // API-28
  list: (page) => api.get('/api/orders', { page }), // API-30
  get: (orderId) => api.get(`/api/orders/${orderId}`), // API-31
  cancel: (orderId) => api.post(`/api/orders/${orderId}/cancel`), // API-32
};

export const reviewApi = {
  create: (bookId, body) => api.post(`/api/books/${bookId}/reviews`, body), // API-33
};

export const sellerApi = {
  apply: (body) => api.post('/api/seller/applications', body), // API-34
  myApplication: () => api.get('/api/seller/applications/me'), // API-35
  listings: (query) => api.get('/api/seller/books', query), // API-36
  createListing: (body) => api.post('/api/seller/books', body), // API-37
  updateListing: (id, body) => api.patch(`/api/seller/books/${id}`, body), // API-38
  removeListing: (id) => api.delete(`/api/seller/books/${id}`), // API-39
  setInventory: (id, body) => api.patch(`/api/seller/books/${id}/inventory`, body), // API-40
  uploadImage: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload('/api/seller/uploads/images', form); // API-41
  },
  orders: (query) => api.get('/api/seller/orders', query), // API-42
  setItemStatus: (orderId, itemId, status) => api.patch(`/api/seller/orders/${orderId}/items/${itemId}/status`, { status }), // API-43
  salesReport: (from, to) => api.get('/api/seller/reports/sales', { from, to }), // API-44
  notifications: (query) => api.get('/api/notifications', query), // API-45
  markRead: (id) => api.patch(`/api/notifications/${id}/read`), // API-46
};

export const adminApi = {
  users: (query) => api.get('/api/admin/users', query), // API-47
  setUserStatus: (id, status) => api.patch(`/api/admin/users/${id}/status`, { status }), // API-48
  applications: (query) => api.get('/api/admin/seller-applications', query), // API-49
  approveApplication: (id) => api.post(`/api/admin/seller-applications/${id}/approve`), // API-50
  rejectApplication: (id, reason) => api.post(`/api/admin/seller-applications/${id}/reject`, { reason }), // API-51
  books: (query) => api.get('/api/admin/books', query), // API-52
  approveBook: (id) => api.post(`/api/admin/books/${id}/approve`), // API-53
  rejectBook: (id, reason) => api.post(`/api/admin/books/${id}/reject`, { reason }), // API-54
  createCategory: (name) => api.post('/api/admin/categories', { name }), // API-55
  renameCategory: (id, name) => api.patch(`/api/admin/categories/${id}`, { name }), // API-56
  deleteCategory: (id) => api.delete(`/api/admin/categories/${id}`), // API-57
  reviews: (query) => api.get('/api/admin/reviews', query), // API-58
  deleteReview: (id) => api.delete(`/api/admin/reviews/${id}`), // API-59
  platformReport: (from, to) => api.get('/api/admin/reports/platform', { from, to }), // API-60
};
// API-29 (payment webhook) is called by the gateway, and API-61 (health) by the uptime monitor: not by the web app.
