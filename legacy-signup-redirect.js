(function () {
  var raw = (document.documentElement.getAttribute('data-signup-type') || '').trim().toLowerCase();
  var allowed = { band: true, musician: true, venue: true, fan: true };
  var type = allowed[raw] ? raw : '';
  var next = new URL('/signup.html', location.origin);
  if (type) next.searchParams.set('type', type);
  try {
    var current = new URL(location.href);
    var returnTo = current.searchParams.get('returnTo') || '';
    var safe = '';
    if (returnTo && returnTo.length <= 512 && !/[\u0000-\u001F\u007F\\]/.test(returnTo) && returnTo.indexOf('//') !== 0 && !/^[a-z][a-z0-9+.-]*:/i.test(returnTo)) {
      var parsed = new URL(returnTo, location.origin + '/');
      if (parsed.origin === location.origin && /^\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(parsed.pathname)) {
        safe = parsed.pathname.replace(/^\/+/, '') + parsed.search + parsed.hash;
      }
    }
    if (safe && safe.indexOf('//') !== 0) next.searchParams.set('returnTo', safe);
  } catch (error) {}
  location.replace(next.pathname + next.search + next.hash);
})();
