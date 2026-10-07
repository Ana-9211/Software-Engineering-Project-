const config = require('./config');
const logger = require('./utils/logger');
const { connect, disconnect } = require('./db/connect');
const { createApp } = require('./app');

async function main() {
  await connect(config.mongodbUri);
  const { app, container } = createApp();

  // reservation sweeper (I-27): once at start-up and then every minute
  const sweep = () =>
    container.orderService
      .releaseExpiredReservations()
      .then((n) => n > 0 && logger.info('expired reservations released', { count: n }))
      .catch((err) => logger.error('sweeper failed', { error: err.message }));
  sweep();
  const sweeperTimer = setInterval(sweep, 60 * 1000);
  // failed confirmation emails are retried every 5 minutes
  const retryTimer = setInterval(() => container.notificationService.retryFailed().catch(() => {}), 5 * 60 * 1000);

  const server = app.listen(config.port, () => logger.info('server listening', { port: config.port, env: config.nodeEnv }));

  async function shutdown() {
    clearInterval(sweeperTimer);
    clearInterval(retryTimer);
    server.close(async () => {
      await container.notificationService.flush();
      await disconnect();
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('could not start', { error: err.message });
  process.exit(1);
});
