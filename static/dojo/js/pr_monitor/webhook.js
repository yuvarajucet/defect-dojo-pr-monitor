(function(){
  // Webhook tab script
  var panel = document.getElementById('tab-webhook');
  if (!panel) return;

  function copyToClipboard(text){
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function(){
        // fallback below
        throw new Error('clipboard API failed');
      });
    }
    return new Promise(function(resolve){
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch(e) { /* ignore */ }
      document.body.removeChild(ta);
      resolve();
    });
  }

  function init(){
    var input = panel.querySelector('#wh-url');
    var btn = panel.querySelector('#wh-copy-btn');

    if (!input || !btn) return;

    // Set value from data attribute once
    if (!input.dataset.boundValue) {
      var attr = panel.getAttribute('data-webhook-value') || '';
      var full = attr;
      if (attr) {
        // If it's not an absolute URL, prefix with current host origin
        if (!/^https?:\/\//i.test(attr)) {
          var origin = (window.location && (window.location.origin || (window.location.protocol + '//' + window.location.host))) || '';
          if (attr.charAt(0) !== '/') attr = '/' + attr;
          full = origin + attr;
        }
      }
      input.value = full;
      input.dataset.boundValue = '1';
    }

    if (!btn.dataset.boundClick) {
      btn.addEventListener('click', function(){
        var val = input.value || '';
        var originalHtml = btn.innerHTML;
        var originalTitle = btn.getAttribute('title') || '';
        var originalAria = btn.getAttribute('aria-label') || '';
        copyToClipboard(val).finally(function(){
          // swap to a Font Awesome check icon briefly
          btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
          btn.setAttribute('title', 'Copied');
          if (originalAria) btn.setAttribute('aria-label', 'Copied');
          btn.disabled = true;
          setTimeout(function(){
            btn.innerHTML = originalHtml;
            if (originalTitle) btn.setAttribute('title', originalTitle); else btn.removeAttribute('title');
            if (originalAria) btn.setAttribute('aria-label', originalAria);
            btn.disabled = false;
          }, 1200);
        });
      });
      btn.dataset.boundClick = '1';
    }
  }

  var initialized = false;
  function ensureInit(){
    if (!initialized) { init(); initialized = true; }
    else { init(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureInit, { once: true });
  } else {
    ensureInit();
  }

  var observer = new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      if (m.type === 'attributes' && m.attributeName === 'hidden') {
        if (!panel.hidden) ensureInit();
      }
    });
  });
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
})();
