(function () {
  var root = document.getElementById('pr-filter-widget');
  if (!root) return;

  var btn = root.querySelector('.pfw-toggle');
  var badge = root.querySelector('.pfw-badge');
  var menu = root.querySelector('.pfw-menu');
  var list = root.querySelector('.pfw-list');
  var closeBtn = root.querySelector('.pfw-close');
  var clearBtn = root.querySelector('.pfw-clear');
  var applyBtn = root.querySelector('.pfw-apply');
  var searchInput = root.querySelector('.pfw-search-input');
  var isOpen = false;
  var options = [];

  function setOpen(open) {
    isOpen = !!open;
    if (isOpen) {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      setTimeout(function(){ menu.style.transform = 'translateY(0)'; menu.style.opacity = '1'; }, 0);
    } else {
      menu.style.opacity = '0';
      menu.style.transform = 'translateY(-4px)';
      btn.setAttribute('aria-expanded', 'false');
      setTimeout(function(){ menu.hidden = true; }, 120);
    }
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt','"':'&quot;','\'':'&#39;'}[c]);}); }

  function normalize(data) {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map(function (it) {
        if (typeof it === 'string') return { value: it, label: it };
        if (it && typeof it === 'object') {
          var v = it.value != null ? it.value : (it.key != null ? it.key : (it.id != null ? it.id : ''));
          var l = it.label != null ? it.label : (it.name != null ? it.name : String(v));
          return { value: String(v), label: String(l) };
        }
        return { value: String(it), label: String(it) };
      });
    }
    if (typeof data === 'object') {
      return Object.keys(data).map(function(k){ return { value: k, label: String(data[k]) }; });
    }
    return [];
  }

  function renderList(filterText) {
    var ft = (filterText||'').toLowerCase();
    list.innerHTML = '';
    var frag = document.createDocumentFragment();
    options.filter(function(opt){
      if (!ft) return true;
      return opt.label.toLowerCase().includes(ft) || opt.value.toLowerCase().includes(ft);
    }).forEach(function(opt, idx){
      var id = 'pfw-opt-' + idx;
      var item = document.createElement('label');
      item.className = 'pfw-item';
      item.setAttribute('for', id);
      item.innerHTML = '<input type="checkbox" id="' + id + '" value="' + escapeHtml(opt.value) + '" ' + (opt.selected?'checked':'') + '>\
      <span class="pfw-item-label">' + escapeHtml(opt.label) + '</span>';
      frag.appendChild(item);
    });
    list.appendChild(frag);
    updateBadge();
  }

  function updateBadge() {
    var count = options.filter(function(o){ return o.selected; }).length;
    badge.textContent = String(count);
    badge.setAttribute('data-count', String(count));
  }

  function syncFromDom() {
    var inputs = list.querySelectorAll('input[type="checkbox"]');
    inputs.forEach(function(cb){
      var v = cb.value;
      var found = options.find(function(o){ return o.value === v; });
      if (found) found.selected = cb.checked;
    });
    updateBadge();
  }

  function loadFromQuery() {
    try {
      var usp = new URLSearchParams(window.location.search);
      var raw = usp.get('filters') || '';
      if (!raw) return;
      var vals = raw.split(',').map(function(s){ return decodeURIComponent(s.trim()); }).filter(Boolean);
      options.forEach(function(o){ o.selected = vals.indexOf(o.value) !== -1 || vals.indexOf(o.label) !== -1; });
    } catch(e) { /* ignore */ }
  }

  function applySelection() {
    syncFromDom();
    var selected = options.filter(function(o){ return o.selected; }).map(function(o){ return o.value; });
    var url = new URL(window.location.href);
    if (selected.length) {
      url.searchParams.set('filters', selected.map(encodeURIComponent).join(','));
    } else {
      url.searchParams.delete('filters');
    }
    window.location.assign(url.toString());
  }

  function clearSelection() {
    options.forEach(function(o){ o.selected = false; });
    renderList(searchInput.value);
  }

  function fetchFilters() {
    fetch('/prmonitor/getfiltervalues?page=new', { credentials: 'include' })
      .then(function(res){ return res.json(); })
      .then(function(json){
        var data = json && (json.filters || json.data || json || []);
        options = normalize(data);
        loadFromQuery();
        renderList('');
      })
      .catch(function(){
        options = [];
        renderList('');
      });
  }

  // Events
  btn.addEventListener('click', function(){ setOpen(!isOpen); });
  closeBtn.addEventListener('click', function(){ setOpen(false); });
  document.addEventListener('click', function(ev){
    if (!root.contains(ev.target)) setOpen(false);
  });
  list.addEventListener('change', function(){ syncFromDom(); });
  clearBtn.addEventListener('click', clearSelection);
  applyBtn.addEventListener('click', applySelection);
  searchInput.addEventListener('input', function(){ renderList(this.value); });

  // Initial
  fetchFilters();
})();