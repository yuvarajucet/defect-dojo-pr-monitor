(function(){
  // Project Handler tab script
  var panel = document.getElementById('tab-handler');
  if (!panel) return;

  var tableHost = null;
  var endpoint = panel.getAttribute('data-endpoint');
  var productsEndpoint = panel.getAttribute('data-products-endpoint');
  var usersEndpoint = panel.getAttribute('data-users-endpoint');
  var deleteEndpoint = panel.getAttribute('data-delete-endpoint');
  var productsCache = null;
  var usersCache = null;

  function setBusy(state){
    if (!panel) return;
    panel.setAttribute('aria-busy', state ? 'true' : 'false');
  }

  function escapeHtml(str){
    return String(str == null ? '' : str).replace(/[&<>\"\']/g, function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[m];
    });
  }

  function getCookie(name){
    var cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }
  function getCsrfToken(){
    // Default Django cookie name
    return getCookie('csrftoken');
  }

  function renderTable(rows){
    if (!tableHost) tableHost = panel.querySelector('#ph-table-host');
    if (!tableHost) return;

    // Clear host
    tableHost.innerHTML = '';

    // Empty state
    if (!Array.isArray(rows) || rows.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'ph-empty';
      empty.style.padding = '12px';
      empty.style.border = '1px dashed #e6e9ef';
      empty.style.borderRadius = '8px';
      empty.style.color = '#6b7785';
      empty.textContent = 'No project handlers found.';
      tableHost.appendChild(empty);
      return;
    }

    var table = document.createElement('table');
    table.className = 'table table-striped table-bordered';

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    var thId = document.createElement('th'); thId.textContent = 'ID'; thId.style.width = '80px'; thId.style.display = 'none';
    var thProd = document.createElement('th'); thProd.textContent = 'Product';
    var thHandled = document.createElement('th'); thHandled.textContent = 'Handled By';
    var thActions = document.createElement('th'); thActions.textContent = '';
    thActions.style.width = '48px';
    trh.appendChild(thId); trh.appendChild(thProd); trh.appendChild(thHandled); trh.appendChild(thActions);
    thead.appendChild(trh);

    var tbody = document.createElement('tbody');

    rows.forEach(function(item){
      var id = item.id;
      var product = item.product;
      var handlerName = item.handled_by;
      var handlerEmail = item.handled_by_email;
      var handlerDisplay = (handlerName || handlerEmail)
        ? (handlerName ? handlerName : '') + (handlerEmail ? (handlerName ? ' (' + handlerEmail + ')' : handlerEmail) : '')
        : '-';

      var tr = document.createElement('tr');
      var tdId = document.createElement('td'); tdId.textContent = id != null ? String(id) : '-'; tdId.style.display = 'none';
      var tdProd = document.createElement('td'); tdProd.textContent = product;
      var tdHandler = document.createElement('td'); tdHandler.textContent = handlerDisplay;
      var tdActions = document.createElement('td');
      tdActions.style.textAlign = 'right';

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.title = 'Delete';
      delBtn.setAttribute('aria-label', 'Delete');
      delBtn.style.backgroundColor = '#dc3545';
      delBtn.style.color = '#fff';
      delBtn.style.border = 'none';
      delBtn.style.borderRadius = '6px';
      delBtn.style.width = '32px';
      delBtn.style.height = '32px';
      delBtn.style.display = 'inline-flex';
      delBtn.style.alignItems = 'center';
      delBtn.style.justifyContent = 'center';
      delBtn.style.cursor = 'pointer';

      delBtn.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6m4 3H5m2 0l1 14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-14M10 10v8M14 10v8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      if (deleteEndpoint) {
        delBtn.addEventListener('click', function(){
          if (id == null || id === '') return;
          delBtn.disabled = true;
          setBusy(true);
          var body = 'id=' + encodeURIComponent(id);
          fetch(deleteEndpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-CSRFToken': getCsrfToken() || ''
            },
            body: body
          })
          .then(function(){ fetchData(); })
          .catch(function(){ /* noop */ })
          .finally(function(){ delBtn.disabled = false; setBusy(false); });
        });
      } else {
        delBtn.disabled = true;
        delBtn.title = 'Delete endpoint not configured';
      }

      tdActions.appendChild(delBtn);

      tr.appendChild(tdId); tr.appendChild(tdProd); tr.appendChild(tdHandler); tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableHost.appendChild(table);
  }

  function fetchData(){
    if (!endpoint) { renderTable([]); return; }
    setBusy(true);
    fetch(endpoint, { credentials: 'same-origin' })
      .then(function(res){ return res.json(); })
      .then(function(json){
        try {
          var arr = Array.isArray(json) ? json : (json && (json.data || json.Data)) || [];
          renderTable(arr);
        } catch (e) {
          renderTable([]);
        }
      })
      .catch(function(){ renderTable([]); })
      .finally(function(){ setBusy(false); });
  }

  function openPhPanel(){
    var shell = document.getElementById('projectHandlerPanel');
    if (!shell) return;
    if (!shell.classList.contains('is-open')) {
      shell.classList.add('is-open');
      document.body.classList.add('no-scroll');
    }
    // Ensure container is interactable and focus the product select for accessibility
    var container = shell.querySelector('.cf-panel__container');
    if (container) {
      container.style.pointerEvents = 'auto';
      // Small timeout to allow CSS transition to set stacking context, then focus
      setTimeout(function(){
        var sel = document.getElementById('ph-product');
        if (sel) {
          sel.disabled = false;
          sel.style.pointerEvents = 'auto';
          try { sel.focus(); } catch (e) {}
        }
      }, 0);
    }
  }

  function closePhPanel(){
    var shell = document.getElementById('projectHandlerPanel');
    if (!shell) return;
    if (shell.classList.contains('is-open')) {
      shell.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
    }
  }

  // Populate product dropdown in the Assign panel
  function setProductOptions(products) {
    var sel = document.getElementById('ph-product');
    if (!sel) return;

    while (sel.firstChild) sel.removeChild(sel.firstChild);

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a product';
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);

    var names = [];
    if (Array.isArray(products)) {
      products.forEach(function(p){
        var name = null;
        if (typeof p === 'string') name = p;
        else if (p && typeof p === 'object') name = p.name || p.product_name || p.title || p.value || p.Value || p.Name;
        if (name && names.indexOf(name) === -1) names.push(String(name));
      });
    }

    names.sort(function(a,b){ return a.localeCompare(b); });

    if (!names.length) {
      var none = document.createElement('option');
      none.value = '';
      none.textContent = 'No products available';
      none.disabled = true;
      sel.innerHTML = '';
      sel.appendChild(none);
      return;
    }

    names.forEach(function(name){
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  function loadProducts(done, force){
    var sel = document.getElementById('ph-product');
    if (sel) {
      var loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = 'Loading products...';
      loadingOpt.selected = true;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      sel.appendChild(loadingOpt);
    }

    if (!force && Array.isArray(productsCache) && productsCache.length) {
      setProductOptions(productsCache);
      if (typeof done === 'function') done();
      return;
    }
    if (!productsEndpoint) {
      setProductOptions([]);
      if (typeof done === 'function') done();
      return;
    }
    fetch(productsEndpoint, { credentials: 'same-origin' })
      .then(function(res){ return res.json(); })
      .then(function(json){
        var arr = Array.isArray(json) ? json : (json && (json.Data || json.data)) || [];
        productsCache = arr;
        setProductOptions(arr);
      })
      .catch(function(){ setProductOptions([]); })
      .finally(function(){ if (typeof done === 'function') done(); });
  }

  function setUserOptions(users) {
    var sel = document.getElementById('ph-handler');
    if (!sel) return;

    while (sel.firstChild) sel.removeChild(sel.firstChild);

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a user';
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);

    var entries = [];
    if (Array.isArray(users)) {
      users.forEach(function(u){
        if (typeof u === 'string') {
          // Fallback: if API returns a simple string, keep it, though expected is object with id/username/email
          entries.push({ value: u, text: u });
        } else if (u && typeof u === 'object') {
          // Expected shape: { id, username, email }
          var id = u.id != null ? u.id : (u.pk != null ? u.pk : u.user_id);
          var username = u.username || u.name || '';
          var email = u.email || u.mail || '';
          if (id != null) {
            var display = username ? (email ? (username + ' (' + email + ')') : username) : (email || String(id));
            entries.push({ value: String(id), text: String(display) });
          }
        }
      });
    }

    // Deduplicate by value
    var seen = new Set();
    entries = entries.filter(function(e){ if (seen.has(e.value)) return false; seen.add(e.value); return true; });

    if (!entries.length) {
      var none = document.createElement('option');
      none.value = '';
      none.textContent = 'No users available';
      none.disabled = true;
      sel.innerHTML = '';
      sel.appendChild(none);
      return;
    }

    // Sort by text
    entries.sort(function(a,b){ return a.text.localeCompare(b.text); });

    entries.forEach(function(e){
      var opt = document.createElement('option');
      opt.value = e.value;
      opt.textContent = e.text;
      sel.appendChild(opt);
    });
  }

  function loadUsers(done, force){
    var sel = document.getElementById('ph-handler');
    if (sel) {
      var loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = 'Loading users...';
      loadingOpt.selected = true;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      sel.appendChild(loadingOpt);
    }

    if (!force && Array.isArray(usersCache) && usersCache.length) {
      setUserOptions(usersCache);
      if (typeof done === 'function') done();
      return;
    }
    if (!usersEndpoint) {
      setUserOptions([]);
      if (typeof done === 'function') done();
      return;
    }
    fetch(usersEndpoint, { credentials: 'same-origin' })
      .then(function(res){ return res.json(); })
      .then(function(json){
        var arr = Array.isArray(json) ? json : (json && (json.data || json.Data)) || [];
        usersCache = arr;
        setUserOptions(arr);
      })
      .catch(function(){ setUserOptions([]); })
      .finally(function(){ if (typeof done === 'function') done(); });
  }

  function bindPanelControls(){
    // Close on overlay/close buttons
    document.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.hasAttribute('data-ph-close')) {
        closePhPanel();
      }
    });
    // ESC to close
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') closePhPanel();
    });

    // Submit handler: if action is set, let the browser submit normally (POST to Django);
    // otherwise prevent and just close + refresh.
    var form = document.getElementById('ph-assign-form');
    if (form && !form.dataset.boundSubmit) {
      form.addEventListener('submit', function(ev){
        if (!form.getAttribute('action')) {
          ev.preventDefault();
          closePhPanel();
          fetchData();
        }
        // When action exists, allow native submit so CSRF + POST go to Django
      });
      form.dataset.boundSubmit = '1';
    }
  }

  function bindToolbar(){
    var assignBtn = panel.querySelector('#btn-assign-project');
    var handleOpen = function(){
      openPhPanel();
      // Ensure selects are enabled
      var selProd = document.getElementById('ph-product');
      if (selProd) { selProd.disabled = false; selProd.style.pointerEvents = 'auto'; }
      var selUser = document.getElementById('ph-handler');
      if (selUser) { selUser.disabled = false; selUser.style.pointerEvents = 'auto'; }

      // Load both products and users
      loadProducts(function(){
        var s = document.getElementById('ph-product');
        if (s) {
          s.disabled = false;
          s.style.pointerEvents = 'auto';
          if (s.options && s.options.length) s.selectedIndex = 0;
        }
      }, true);
      loadUsers(function(){
        var u = document.getElementById('ph-handler');
        if (u) {
          u.disabled = false;
          u.style.pointerEvents = 'auto';
          if (u.options && u.options.length) u.selectedIndex = 0;
        }
      }, true);
    };

    if (assignBtn && !assignBtn.dataset.boundAssign) {
      assignBtn.addEventListener('click', handleOpen);
      assignBtn.dataset.boundAssign = '1';
    }

    var assignBtnBottom = panel.querySelector('#btn-assign-project-bottom');
    if (assignBtnBottom && !assignBtnBottom.dataset.boundAssign) {
      assignBtnBottom.addEventListener('click', handleOpen);
      assignBtnBottom.dataset.boundAssign = '1';
    }
  }

  function init(){
    tableHost = panel.querySelector('#ph-table-host');
    bindToolbar();
    bindPanelControls();
    fetchData();
  }

  var initialized = false;
  function ensureInit(){
    if (!initialized) { init(); initialized = true; }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ ensureInit(); }, { once: true });
  } else {
    ensureInit();
  }

  var observer = new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      if (m.type === 'attributes' && m.attributeName === 'hidden') {
        if (!panel.hidden) fetchData();
      }
    });
  });
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
})();
