(function () {
  function toVersioned(path) {
    const version = String(window.BIT_HAPPENS_ASSET_VERSION || '').trim();
    if (!version) return path;
    return `${path}?v=${encodeURIComponent(version)}`;
  }

  window.BitHappenLoadScripts = function loadScripts(paths) {
    const list = Array.isArray(paths) ? paths : [];
    list.forEach((path) => {
      const script = document.createElement('script');
      script.src = toVersioned(path);
      script.async = false;
      document.body.appendChild(script);
    });
  };
})();
