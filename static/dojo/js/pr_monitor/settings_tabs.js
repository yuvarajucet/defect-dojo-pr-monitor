(function(){
  var root = document.querySelector('.settings-tabs');
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.settings-panel'));

  // Map between panels and query parameter values
  var panelToView = {
    'tab-critical': 'cf',
    'tab-handler': 'ph',
    'tab-webhook': 'wh'
  };
  var viewToPanel = { cf: 'tab-critical', ph: 'tab-handler', wh: 'tab-webhook' };

  function setViewInUrl(code, replace){
    try {
      var url = new URL(window.location.href);
      var params = url.searchParams;
      if (code) params.set('view', code); else params.delete('view');
      url.search = params.toString();
      if (replace) window.history.replaceState({ view: code }, '', url.toString());
      else window.history.pushState({ view: code }, '', url.toString());
    } catch (e) { /* ignore */ }
  }

  function activateTab(tab, opts){
    opts = opts || {};
    var targetId = tab.getAttribute('aria-controls');
    tabs.forEach(function(t){
      var selected = t === tab;
      t.setAttribute('aria-selected', selected ? 'true' : 'false');
      t.classList.toggle('is-active', selected);
      t.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(function(p){
      var isTarget = p.id === targetId;
      p.hidden = !isTarget;
    });
    if (opts.updateUrl) {
      var code = panelToView[targetId] || null;
      setViewInUrl(code, false);
    }
  }

  function findTabButtonByPanelId(panelId){
    return tabs.find(function(t){ return t.getAttribute('aria-controls') === panelId; }) || null;
  }

  // init based on ?view=
  (function init(){
    var urlView = null;
    try {
      var u = new URL(window.location.href);
      urlView = u.searchParams.get('view');
    } catch (e) {}

    var initialTab = null;
    if (urlView && viewToPanel[urlView]) {
      var panelId = viewToPanel[urlView];
      initialTab = findTabButtonByPanelId(panelId);
    }
    if (!initialTab) {
      initialTab = tabs.find(function(t){ return t.getAttribute('aria-selected') === 'true'; }) || tabs[0];
      var defaultCode = initialTab ? panelToView[initialTab.getAttribute('aria-controls')] : null;
      setViewInUrl(defaultCode, true);
    }
    if (initialTab) activateTab(initialTab, { updateUrl: false });
  })();

  // click
  root.addEventListener('click', function(e){
    var btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    activateTab(btn, { updateUrl: true });
  });

  // keyboard
  root.addEventListener('keydown', function(e){
    var idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      var next = tabs[(idx + 1) % tabs.length];
      next.focus();
      activateTab(next, { updateUrl: true });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      prev.focus();
      activateTab(prev, { updateUrl: true });
    } else if (e.key === 'Home') {
      e.preventDefault();
      tabs[0].focus();
      activateTab(tabs[0], { updateUrl: true });
    } else if (e.key === 'End') {
      e.preventDefault();
      tabs[tabs.length - 1].focus();
      activateTab(tabs[tabs.length - 1], { updateUrl: true });
    }
  });

  // respond to back/forward navigation
  window.addEventListener('popstate', function(){
    var code = null;
    try { code = new URL(window.location.href).searchParams.get('view'); } catch (e) {}
    var panelId = (code && viewToPanel[code]) ? viewToPanel[code] : null;
    var btn = panelId ? findTabButtonByPanelId(panelId) : null;
    if (btn) activateTab(btn, { updateUrl: false });
  });
})();
