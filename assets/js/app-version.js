window.BIT_HAPPENS_ASSET_VERSION = '20260401a';

// Redirect HTTP → HTTPS on production (skip localhost for dev)
(function () {
  if (
    location.protocol === 'http:' &&
    location.hostname !== 'localhost' &&
    location.hostname !== '127.0.0.1'
  ) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
  }
})();
