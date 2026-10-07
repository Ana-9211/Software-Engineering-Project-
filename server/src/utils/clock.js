// Injectable clock so lockout and expiry rules can be tested without waiting.
const systemClock = { now: () => new Date() };

function createFakeClock(start = new Date()) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advanceMinutes: (m) => { current = new Date(current.getTime() + m * 60000); },
    set: (d) => { current = new Date(d); },
  };
}

module.exports = { systemClock, createFakeClock };
