// Keeps a visit's tracking tags (utm_*, fbclid, gclid) on internal links, and copies them
// into the contact form, so an enquiry can be tied to the link that brought someone in.
// Uses nothing but the page address: no cookies, no browser storage.
(function () {
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'msclkid'];
  var here = new URLSearchParams(location.search);
  var tags = KEYS.filter(function (k) { return here.get(k); }).map(function (k) { return [k, here.get(k)]; });

  var form = document.querySelector('form[action="/api/enquiry"]');
  if (form) {
    var landing = form.querySelector('input[name="landing"]');
    if (landing) landing.value = here.get('lp') || location.pathname;
    tags.forEach(function (t) {
      var input = form.querySelector('input[name="' + t[0] + '"]');
      if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = t[0]; form.appendChild(input); }
      input.value = t[1];
    });
  }
  if (!tags.length) return;

  var lp = here.get('lp') || location.pathname;
  document.querySelectorAll('a[href]').forEach(function (a) {
    var u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
    if (u.origin !== location.origin || /\.(jpe?g|png|svg|webp|pdf|xml|txt)$/i.test(u.pathname)) return;
    tags.forEach(function (t) { if (!u.searchParams.has(t[0])) u.searchParams.set(t[0], t[1]); });
    if (!u.searchParams.has('lp')) u.searchParams.set('lp', lp);
    a.setAttribute('href', u.pathname + u.search + u.hash);
  });
})();
