(function () {
  var raw = (document.documentElement.getAttribute('data-signup-type') || '').trim().toLowerCase();
  var allowed = { band: true, musician: true, venue: true, fan: true };
  var type = allowed[raw] ? raw : '';
  var next = new URL('/signup.html', location.origin);
  if (type) next.searchParams.set('type', type);
  try {
    var current = new URL(location.href);
    var returnTo = current.searchParams.get('returnTo') || '';
    if (returnTo && returnTo.indexOf('//') !== 0 && returnTo.indexOf('://') === -1) {
      next.searchParams.set('returnTo', returnTo);
    }
  } catch (error) {}
  location.replace(next.pathname + next.search + next.hash);
})();
