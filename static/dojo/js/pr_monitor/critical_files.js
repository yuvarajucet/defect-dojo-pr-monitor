(function(){
  // Critical files tab script
  var panel = document.getElementById('tab-critical');
  if (!panel) return;

  var listHost = null;
  var endpoint = panel.getAttribute('data-endpoint');
  var productsEndpoint = panel.getAttribute('data-products-endpoint');
  var productsCache = null;

  function setBusy(state){
    if (!panel) return;
    panel.setAttribute('aria-busy', state ? 'true' : 'false');
  }

  function renderAccordion(data){
    // data: array of { product_name, files: [...] } as per new flow
    if (!listHost) listHost = panel.querySelector('#cf-accordion');
    if (!listHost) return;
    listHost.innerHTML = '';

    // Expect an array of groups in new flow; if not, show empty state
    if (!Array.isArray(data)) {
      var empty2 = document.createElement('div');
      empty2.className = 'cf-empty';
      empty2.textContent = 'No critical files found.';
      listHost.appendChild(empty2);
      return;
    }
    var groups = data;

    groups.forEach(function(group){
      var prod = group.product_name || group.product || 'Product';
      var files = group.files || group.filenames || group.items || [];
      var repos = Array.isArray(group.repos) ? group.repos : [{ repo_name: '-', files: files }];

      // Card wrapper
      var card = document.createElement('div');
      card.className = 'cf-card';

      // Header: left title + right actions
      var header = document.createElement('button');
      header.className = 'cf-card-header';
      header.type = 'button';
      header.setAttribute('aria-expanded', 'false');

      var left = document.createElement('span');
      left.className = 'cf-header-left';
      left.innerHTML = '<span class="cf-arrow" aria-hidden="true">▸</span>' +
                       '<span class="cf-title">' + escapeHtml(prod) + '</span>';

      header.appendChild(left);

      // Collapsible body
      var body = document.createElement('div');
      body.className = 'cf-card-body';
      body.hidden = true;

      // Repo sections inside product
      if (!repos || repos.length === 0) {
        var emptyRepo = document.createElement('div');
        emptyRepo.className = 'cf-empty';
        emptyRepo.textContent = 'No repositories.';
        body.appendChild(emptyRepo);
      } else {
        var repoWrap = document.createElement('div');
        repoWrap.className = 'cf-repo-list';
        repos.forEach(function(repo){
          var repoBlock = document.createElement('div');
          repoBlock.className = 'cf-repo';

          // Top row: repo title left, edit button right
          var repoTop = document.createElement('div');
          repoTop.className = 'cf-repo-top';

          var repoTitle = document.createElement('div');
          repoTitle.className = 'cf-repo-title';
          repoTitle.textContent = repo.repo_name || '-';

          var repoEdit = document.createElement('button');
          repoEdit.type = 'button';
          repoEdit.className = 'btn-edit';
          repoEdit.textContent = 'Edit';
          repoEdit.addEventListener('click', function(e){
            e.stopPropagation();
            openCfPanel();
            setFormMode('update');
            // Load products and prefill with current product, repo, filenames, and set unique id
            loadProducts(function(){
              prefillForm(
                prod,
                repo.repo_name || '',
                Array.isArray(repo.files) ? repo.files : (typeof repo.files === 'string' ? repo.files : [])
              );
              // Set unique id hidden field if available
              var uidInput = document.getElementById('cf-unique-id');
              if (uidInput) {
                var uid = (repo && (repo.unique_id || repo.uid || repo.id)) || (group && (group.unique_id || group.uid || group.id));
                uidInput.value = uid || '';
              }
            });
          });

          repoTop.appendChild(repoTitle);
          repoTop.appendChild(repoEdit);

          var ul = document.createElement('ul');
          ul.className = 'cf-file-list';
          var rfiles = repo.files || [];
          if (!rfiles || rfiles.length === 0) {
            var li0 = document.createElement('li');
            li0.className = 'muted';
            li0.textContent = 'No files.';
            ul.appendChild(li0);
          } else {
            rfiles.forEach(function(f){
              var li = document.createElement('li');
              li.textContent = f;
              ul.appendChild(li);
            });
          }

          repoBlock.appendChild(repoTop);
          repoBlock.appendChild(ul);
          repoWrap.appendChild(repoBlock);
        });
        body.appendChild(repoWrap);
      }

      header.addEventListener('click', function(){
        var expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        body.hidden = expanded;
        card.classList.toggle('is-open', !expanded);
      });

      card.appendChild(header);
      card.appendChild(body);
      listHost.appendChild(card);
    });
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[m];
    });
  }

  function fetchData(){
    if (!endpoint) return;
    setBusy(true);
    fetch(endpoint, { credentials: 'same-origin' })
      .then(function(res){ return res.json(); })
      .then(function(json){
        try {
          var dataArr = (json && Array.isArray(json.Data)) ? json.Data : [];
          if (!dataArr.length) { renderAccordion([]); return; }
          var byProduct = {};
          dataArr.forEach(function(it){
            var prod = it.product_name || it.product_id || 'Unknown';
            var repo = it.repo_name || '-';
            var unique_id = it.unique_id || "";
            var files = [];
            if (typeof it.file_names === 'string') {
              files = it.file_names.split(',').map(function(f){ return f.trim(); }).filter(Boolean);
            } else if (Array.isArray(it.files)) {
              files = it.files;
            }
            if (!byProduct[prod]) byProduct[prod] = {};
            if (!byProduct[prod][repo]) {
              byProduct[prod][repo] = { files: [], unique_id: unique_id };
            }
            // Backfill unique_id if not set yet
            if (!byProduct[prod][repo].unique_id && unique_id) {
              byProduct[prod][repo].unique_id = unique_id;
            }
            Array.prototype.push.apply(byProduct[prod][repo].files, files);
          });
          var groups = Object.keys(byProduct).map(function(prod){
            var repoMap = byProduct[prod];
            var repos = Object.keys(repoMap).map(function(rname){
              var entry = repoMap[rname] || { files: [] };
              return { repo_name: rname, files: entry.files || [], unique_id: entry.unique_id };
            });
            return { product_name: prod, repos: repos };
          });
          renderAccordion(groups);
        } catch (e) {
          renderAccordion([]);
        }
      })
      .catch(function(){ renderAccordion([]); })
      .finally(function(){ setBusy(false); });
  }

  function init(){
    listHost = panel.querySelector('#cf-accordion');
    fetchData();
  }

  // If the tab becomes visible later, we still want to initialize once
  var initialized = false;
  function ensureInit(){
    if (!initialized) { init(); initialized = true; }
  }

  function openCfPanel(){
    var panelShell = document.getElementById('criticalFilePanel');
    if (!panelShell) return;
    if (!panelShell.classList.contains('is-open')) {
      panelShell.classList.add('is-open');
      document.body.classList.add('no-scroll');
    }
  }

  function closeCfPanel(){
    var panelShell = document.getElementById('criticalFilePanel');
    if (!panelShell) return;
    if (panelShell.classList.contains('is-open')) {
      panelShell.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
    }
  }
  
  // Switch form mode (add/update) and update submit button text
  function setFormMode(mode) {
    var form = document.getElementById('cf-add-form');
    if (!form) return;
    var submitBtn = form.querySelector('#cf-submit-btn') || form.querySelector('button[type="submit"]');
    var deleteBtn = document.getElementById('cf-delete-btn');
    var titleEl = document.getElementById('criticalFilePanelLabel');

    if (mode === 'update') {
      if (submitBtn) submitBtn.textContent = 'Update';
      form.dataset.mode = 'update';
      if (deleteBtn) deleteBtn.style.display = '';
      if (titleEl) titleEl.textContent = 'Edit Critical File';
    } else {
      if (submitBtn) submitBtn.textContent = 'Add';
      form.dataset.mode = 'add';
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (titleEl) titleEl.textContent = 'Add Critical File';
    }
  }

  // Populate product dropdown in the Add/Edit panel
  function setProductOptions(products, preselect) {
    var sel = document.getElementById('cf-product');
    if (!sel) return;
    // Reset options
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a product';
    placeholder.selected = true;
    sel.appendChild(placeholder);

    products.forEach(function(p){
      var name = (typeof p === 'string') ? p : (p && (p.name || p.product_name || p.title));
      if (!name) return;
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (preselect && preselect === name) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function loadProducts(done){
    var sel = document.getElementById('cf-product');
    if (sel) {
      // show loading state
      var loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = 'Loading products...';
      loadingOpt.selected = true;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      sel.appendChild(loadingOpt);
    }

    if (Array.isArray(productsCache) && productsCache.length) {
      setProductOptions(productsCache);
      if (typeof done === 'function') done();
      return;
    }
    if (!productsEndpoint) {
      if (typeof done === 'function') done();
      return;
    }
    fetch(productsEndpoint, { credentials: 'same-origin' })
      .then(function(res){ return res.json(); })
      .then(function(json){
        var arr = (json && (json.Data || json.data)) || [];
        productsCache = arr;
        setProductOptions(arr);
      })
      .catch(function(){ setProductOptions([]); })
      .finally(function(){ if (typeof done === 'function') done(); });
  }

  function prefillForm(productName, repoName, fileList){
    var sel = document.getElementById('cf-product');
    var repo = document.getElementById('cf-repo');
    var filesTa = document.getElementById('cf-filenames');
    var uidInput = document.getElementById('cf-unique-id');

    if (sel && productName) {
      // if options not ready yet, this can be called again after loadProducts
      for (var i=0;i<sel.options.length;i++) {
        if (sel.options[i].value === productName) {
          sel.selectedIndex = i; break;
        }
      }
    } else if (sel && !productName) {
      // ensure placeholder stays selected when empty
      sel.selectedIndex = 0;
    }

    if (repo && typeof repoName === 'string') {
      repo.value = repoName;
    } else if (repo) {
      repo.value = '';
    }

    if (filesTa) {
      if (Array.isArray(fileList)) {
        filesTa.value = fileList.join(',');
      } else if (typeof fileList === 'string') {
        filesTa.value = fileList;
      } else {
        filesTa.value = '';
      }
    }

    // Do not set uid here unless explicitly provided via attribute on elements in future
    if (uidInput && !uidInput.value) {
      uidInput.value = '';
    }
  }

  function bindCfPanelControls(){
    // Close on overlay and close button
    document.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.hasAttribute('data-cf-close')) {
        closeCfPanel();
      }
    });
    // Close on ESC
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') closeCfPanel();
    });
    // Open on Add new file button
    var addBtn = panel.querySelector('#btn-add-critical-file');
    if (addBtn && !addBtn.dataset.boundOpen) {
      addBtn.addEventListener('click', function(){
        openCfPanel();
        setFormMode('add');
        // Clear unique id when adding new
        var uidInput = document.getElementById('cf-unique-id');
        if (uidInput) uidInput.value = '';
        loadProducts();
        prefillForm('', '', '');
      });
      addBtn.dataset.boundOpen = '1';
    }

    // Ensure the form posts to the correct endpoint based on mode
    var form = document.getElementById('cf-add-form');
    if (form && !form.dataset.boundSubmit) {
      form.addEventListener('submit', function(){
        var mode = form.dataset.mode || 'add';
        var addAction = form.getAttribute('data-add-action');
        var updateAction = form.getAttribute('data-update-action');
        // If action was set explicitly (e.g., by delete), keep it; otherwise choose based on mode
        var explicit = form.dataset.explicitAction === '1';
        if (!explicit) {
          if (mode === 'update' && updateAction) {
            form.setAttribute('action', updateAction);
          } else if (addAction) {
            form.setAttribute('action', addAction);
          }
        }
        // Clear explicit flag after submission preparation
        form.dataset.explicitAction = '0';
      });
      form.dataset.boundSubmit = '1';
    }

    // Bind Delete button to submit the form to delete endpoint with current values
    var delBtn = document.getElementById('cf-delete-btn');
    if (delBtn && !delBtn.dataset.boundDelete) {
      delBtn.addEventListener('click', function(){
        var delAction = form ? form.getAttribute('data-delete-action') : '';
        if (!form || !delAction) return;
        // Optional confirm
        var ok = window.confirm('Are you sure you want to delete these entries?');
        if (!ok) return;
        form.setAttribute('action', delAction);
        form.dataset.explicitAction = '1';
        form.requestSubmit ? form.requestSubmit() : form.submit();
      });
      delBtn.dataset.boundDelete = '1';
    }
  }

  // Run once on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ ensureInit(); bindCfPanelControls(); }, { once: true });
  } else {
    ensureInit();
    bindCfPanelControls();
  }

  // Also hook into tab activation (from settings_tabs.js toggling hidden)
  var observer = new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      if (m.type === 'attributes' && m.attributeName === 'hidden') {
        if (!panel.hidden) fetchData();
      }
    });
  });
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
})();
