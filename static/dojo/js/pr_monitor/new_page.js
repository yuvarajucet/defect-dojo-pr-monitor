(function ($) {
    var reloadOnClose = false;
    function buildTwoColumnRows(raw) {
        // Accept either array of objects or single object. Use first object if array.
        var data = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
        if (!$.isPlainObject(data)) data = {};

        // Ignore 'id' and control display order via this list
        var order = [
            'pr_title',
            'pr_number',
            'pr_link',
            'created_by',
            'target_branch',
            'product_id',
            'pr_status',
            'validation_status',
            'ticket_link',
            'issue_reason',
            'validated_by_id',
            'validated_at',
            'created_at'
        ];

        function labelize(key) {
            var map = {
                pr_title: 'PR title',
                pr_number: 'PR number',
                pr_link: 'PR link',
                created_by: 'Created by',
                target_branch: 'Target branch',
                product_id: 'Product',
                pr_status: 'PR status',
                validation_status: 'Validation status',
                ticket_link: 'Ticket link',
                issue_reason: 'Issue reason',
                validated_by_id: 'Validated by',
                validated_at: 'Validated at',
                created_at: 'Created at'
            };
            return map[key] || (key || '').replace(/_/g, ' ');
        }

        function formatVal(key, value) {
            if (value === null || value === undefined) return '-';
            // Linkify URL fields
            if ((key === 'pr_link' || key === 'ticket_link')) {
                var raw = (value == null ? '' : String(value));
                if (raw) {
                    return '<a href="' + raw + '" target="_blank" rel="noopener noreferrer">' + raw + '</a>';
                }
                return '-';
            }
            // Format ISO date strings into readable form
            if ((key === 'validated_at' || key === 'created_at')) {
                var rawDate = (value == null ? '' : String(value));
                if (rawDate) {
                    try {
                        var d = new Date(rawDate);
                        if (!isNaN(d.getTime())) {
                            return d.toLocaleString();
                        }
                    } catch (e) { /* ignore */ }
                }
                return '-';
            }
            // Render validation status as colored badge similar to PR status
            if (key === 'validation_status') {
                var v = (value == null ? '' : String(value).trim());
                if (!v) return '-';
                var cls = 'status-' + v.toLowerCase().replace(/\s+/g, '-');
                return '<span class="pr-badge ' + cls + '">' + v + '</span>';
            }
            if ($.isArray(value)) {
                var joined = value.join(', ');
                return joined ? joined : '-';
            }
            if ($.isPlainObject(value)) {
                var json = JSON.stringify(value);
                return json && json !== '{}' ? json : '-';
            }
            var str = String(value);
            return str ? str : '-';
        }

        // Build cells as pairs per row: [label, value] x 2
        var keys = order.filter(function (k) { return k !== 'id' && data.hasOwnProperty(k); });
        // Include any other unexpected keys (except id)
        Object.keys(data).forEach(function (k) {
            if (k !== 'id' && order.indexOf(k) === -1) keys.push(k);
        });

        var rowsHtml = '';
        for (var i = 0; i < keys.length; i += 2) {
            var k1 = keys[i];
            var k2 = keys[i + 1];
            var v1 = formatVal(k1, data[k1]);
            var v2 = k2 ? formatVal(k2, data[k2]) : '';
            rowsHtml += [
                '<tr>',
                '  <th scope="row">' + labelize(k1) + '</th>',
                '  <td>' + v1 + '</td>',
                k2 ? ('  <th scope="row">' + labelize(k2) + '</th><td>' + v2 + '</td>') : ('  <th scope="row"></th><td></td>'),
                '</tr>'
            ].join('');
        }

        return rowsHtml || '';
    }

    function renderMonitorSection(monitorData) {
        var rows = buildTwoColumnRows(monitorData);
        // 4 columns per row when pairs exist; fallback text spans all when empty
        $('.pr-monitor-body').html(rows || '<tr><td colspan="4" class="text-muted">No data</td></tr>');
    }

    function renderValidationSection(options, currentStatus, prNumber) {
        function normalizeOptions(opts) {
            if (!opts) return [];
            // Accept array of strings, array of objects, or object map
            if (Array.isArray(opts)) {
                return opts.map(function (o) {
                    if (typeof o === 'string') return { value: o, label: o.replace(/_/g, ' ') };
                    if (o && typeof o === 'object') {
                        var v = o.value != null ? o.value : o.key || o.id || '';
                        var l = o.label != null ? o.label : o.name || String(v);
                        return { value: String(v), label: String(l) };
                    }
                    return { value: String(o), label: String(o) };
                });
            }
            if ($.isPlainObject(opts)) {
                return Object.keys(opts).map(function (k) {
                    var v = opts[k];
                    var label = (typeof v === 'string' ? v : k).replace(/_/g, ' ');
                    return { value: String(k), label: String(label) };
                });
            }
            return [];
        }

        var list = normalizeOptions(options);
        var selected = currentStatus != null ? String(currentStatus) : '';
        var selectId = 'validation-status-select-' + (prNumber || 'x');
        var ticketId = 'validation-ticket-' + (prNumber || 'x');
        var reasonId = 'validation-reason-' + (prNumber || 'x');
        var updateBtnId = 'validation-update-' + (prNumber || 'x');

        var optsHtml = list.map(function (opt) {
            var isSel = selected && (String(opt.value) === selected || String(opt.label) === selected);
            return '<option value="' + opt.value + '"' + (isSel ? ' selected' : '') + '>' + opt.label + '</option>';
        }).join('');

        var html = [
            '<div class="validation-field">',
            '  <label for="' + selectId + '" class="validation-label">Validation Status:</label>',
            '  <div class="validation-select-wrap">',
            '    <select id="' + selectId + '" class="validation-select">',
            optsHtml || '<option disabled selected>No options</option>',
            '    </select>',
            '  </div>',
            '</div>',

            // Ticket link (conditional)
            '<div class="validation-field validation-ticket hidden" data-extra="ticket">',
            '  <label for="' + ticketId + '" class="validation-label">Ticket link</label>',
            '  <input type="url" id="' + ticketId + '" class="validation-input" placeholder="https://tracker/ticket/123" autocomplete="off" />',
            '</div>',

            // Reason (conditional; appears after ticket has a value)
            '<div class="validation-field validation-reason hidden" data-extra="reason">',
            '  <label for="' + reasonId + '" class="validation-label">Reason for the issue</label>',
            '  <textarea id="' + reasonId + '" class="validation-textarea" rows="3" placeholder="Briefly describe the reason..."></textarea>',
            '</div>',

            // Update button (always visible)
            '<div class="validation-actions">',
            '  <button type="button" id="' + updateBtnId + '" class="btn btn-primary">Update</button>',
            '</div>'
        ].join('');

        var $container = $('.pr-validation-body');
        $container.html(html);

        function safeRecalcAll() {
            if (typeof recalcAllCollapsibles === 'function') {
                recalcAllCollapsibles();
                requestAnimationFrame(function () { recalcAllCollapsibles(); });
                setTimeout(function () { recalcAllCollapsibles(); }, 120);
            }
        }

        function isIssueStatus(val) {
            if (!val) return false;
            var v = String(val).toLowerCase();
            return v === 'new issue' || v === 'breaking issue' || v === 'new_issue' || v === 'breaking_issue' || v === 'new-issue' || v === 'breaking-issue';
        }

        function toggleExtras() {
            var selVal = $('#' + selectId).val();
            var showExtras = isIssueStatus(selVal);
            var $ticketInput = $('#' + ticketId);
            var $ticket = $ticketInput.closest('[data-extra="ticket"]');
            var $reason = $('#' + reasonId).closest('[data-extra="reason"]');

            if (!showExtras) {
                $ticket.addClass('hidden');
                $reason.addClass('hidden');
            } else {
                // Show both fields immediately for new/breaking issue
                $ticket.removeClass('hidden');
                $reason.removeClass('hidden');
            }

            safeRecalcAll();
        }

        // Initial state
        toggleExtras();

        // Simple jQuery-based toast (no Bootstrap detection)
        function showToast(message, type) {
            type = type || 'success';
            var containerId = 'global-toast-container';
            var $container = $('#' + containerId);
            if (!$container.length) {
                $container = $('<div id="' + containerId + '" aria-live="polite" aria-atomic="true"></div>')
                    .css({ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1080, maxWidth: '360px' });
                $('body').append($container);
            }

            var colors = {
                success: { bg: '#198754', fg: '#fff' },
                error: { bg: '#dc3545', fg: '#fff' },
                info: { bg: '#6c757d', fg: '#fff' }
            };
            var c = colors[type] || colors.info;

            var $toast = $('<div role="status" class="simple-toast"></div>')
                .text(message || '')
                .css({
                    background: c.bg,
                    color: c.fg,
                    padding: '10px 14px',
                    borderRadius: '6px',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
                    marginTop: '8px',
                    display: 'none',
                    fontSize: '0.95rem',
                    minWidth: '240px'
                });

            $container.append($toast);
            $toast.fadeIn(150);
            setTimeout(function () {
                $toast.fadeOut(200, function () { $(this).remove(); });
            }, 3000);
        }

        // Using credentials (cookies) for authentication; CSRF header not required here

        // Events: selection change and ticket input typing/focus (bind within container for reliability)
        $container
            .off('change.validation', '#' + selectId)
            .on('change.validation', '#' + selectId, function () { toggleExtras(); })
            .off('input.validation', '#' + ticketId)
            .on('input.validation', '#' + ticketId, function () { toggleExtras(); })
            .off('keyup.validation', '#' + ticketId)
            .on('keyup.validation', '#' + ticketId, function () { toggleExtras(); })
            .off('paste.validation', '#' + ticketId)
            .on('paste.validation', '#' + ticketId, function () { setTimeout(toggleExtras, 0); })
            .off('change.validationTicket', '#' + ticketId)
            .on('change.validationTicket', '#' + ticketId, function () { toggleExtras(); })
            .off('focus.validationTicket', '#' + ticketId)
            .on('focus.validationTicket', '#' + ticketId, function () { toggleExtras(); })
            .off('blur.validationTicket', '#' + ticketId)
            .on('blur.validationTicket', '#' + ticketId, function () { toggleExtras(); })
            // Update click handler: send data to backend
            .off('click.validationUpdate', '#' + updateBtnId)
            .on('click.validationUpdate', '#' + updateBtnId, function () {
                var $btn = $(this);
                var payload = {
                    pr_number: prNumber,
                    validation_status: $('#' + selectId).val() || '',
                    ticket_link: $('#' + ticketId).val() || '',
                    issue_reason: $('#' + reasonId).val() || ''
                };

                var originalText = $btn.text();
                $btn.prop('disabled', true).text('Updating...');

                // You can change this endpoint path if needed in backend
                var endpoint = 'update_validation/' + encodeURIComponent(prNumber);
                $.ajax({
                    url: endpoint,
                    method: 'POST',
                    contentType: 'application/json; charset=UTF-8',
                    data: JSON.stringify(payload),
                    xhrFields: { withCredentials: true }
                }).done(function (resp) {
                    var ok = !!(resp && (resp.status === true || resp.success === true));
                    var msg = '';
                    if (ok) {
                        msg = (resp && (resp.message || resp.detail)) || 'Status updated!';
                        showToast(msg, 'success');
                        // mark to refresh on next modal close
                        reloadOnClose = true;
                    } else {
                        // Handle false status on 200 response
                        msg = (resp && (resp.error || resp.message || resp.detail)) || 'Update failed.';
                        showToast(msg, 'error');
                    }
                }).fail(function (jqXHR) {
                    var rj = jqXHR && jqXHR.responseJSON;
                    var err = (rj && (rj.error || rj.message || rj.detail))
                        || (jqXHR && typeof jqXHR.responseText === 'string' && jqXHR.responseText)
                        || 'Failed to update.';
                    showToast(err, 'error');
                }).always(function () {
                    $btn.prop('disabled', false).text(originalText);
                });
            });

        // Mutation observer to catch any late layout/insertion changes
        try {
            var prevObserver = $container.data('val-observer');
            if (prevObserver && prevObserver.disconnect) prevObserver.disconnect();
            var observer = new MutationObserver(function () { safeRecalcAll(); });
            observer.observe($container[0], { childList: true, subtree: true, characterData: true });
            $container.data('val-observer', observer);
        } catch (e) { /* no-op if not supported */ }

        // Extra passes after layout settles
        safeRecalcAll();
    }

    function renderCommitsSection(commits) {
        function parseFiles(raw) {
            if (!raw) return [];
            try {
                if (Array.isArray(raw)) return raw;
                if (typeof raw === 'string') return JSON.parse(raw);
                if ($.isPlainObject(raw)) return [raw];
            } catch (e) {
                // fallthrough to empty
            }
            return [];
        }

        function statusClass(status) {
            var s = (status || '').toLowerCase();
            if (s === 'added' || s === 'new') return 'status-added';
            if (s === 'modified' || s === 'changed' || s === 'updated') return 'status-modified';
            if (s === 'deleted' || s === 'removed') return 'status-deleted';
            return 'status-neutral';
        }

        var items = (commits || []).map(function (commit, idx) {
            var idFull = commit.commit_id || '';
            var id = idFull ? String(idFull).slice(-6) : '';
            var msg = commit.commit_msg || '';
            var by = commit.commited_by || '';
            var filesArr = parseFiles(commit.commited_files);

            var fileRows = filesArr.map(function (f) {
                var name = f.filename|| '';
                var st = (f.status || '').toString();
                var cls = statusClass(st);
                return [
                    '<div class="file-row" role="listitem" aria-label="' + (name || '-') + ' ' + (st || '-') + '">',
                    '  <span class="vline" aria-hidden="true"></span>',
                    '  <span class="hline" aria-hidden="true"></span>',
                    '  <span class="file-chip" title="Filename">' + (name || '-') + '</span>',
                    '  <span class="hline small" aria-hidden="true"></span>',
                    '  <span class="status-badge ' + cls + '" title="Status">' + (st || '-') + '</span>',
                    '</div>'
                ].join('');
            }).join('');

            var filesFlow = [
                '<div class="files-flow" role="list" aria-label="Files changed">',
                fileRows || '<div class="timeline-empty text-muted">No files</div>',
                '</div>'
            ].join('');

            return [
                '<div class="timeline-item" aria-label="Commit ' + (idx + 1) + '">',
                '  <i class="fa-solid fa-code-commit timeline-node" aria-hidden="true"></i>',
                '  <div class="timeline-content">',
                '    <div class="pill-row">',
                '      <span class="pill pill-msg" title="Commit message">' + msg + '</span>',
                '      <span class="pill pill-by" title="Committed by">' + by + '</span>',
                '      <span class="pill pill-id" title="Commit id">' + id + '</span>',
                '    </div>',
                filesFlow,
                '  </div>',
                '</div>'
            ].join('');
        }).join('');

        $('.pr-commits-body').html(items || '<div class="timeline-empty text-muted">No commits found</div>');
    }

    function setModalState(state) {
        $('.pr-details-loading').toggleClass('hidden', state !== 'loading');
        $('.pr-details-error').toggleClass('hidden', state !== 'error');
        $('.pr-details-content').toggleClass('hidden', state !== 'content');
    }

    function fetchPrDetails(prNumber, repo, product) {
        setModalState('loading');
        $('.pr-details-error').empty();
        var endpoint = 'getinfo/'+ product +'/' + repo + '/' + encodeURIComponent(prNumber);
        return $.getJSON(endpoint)
            .done(function (response) {
                if (!response || response.success === false) {
                    var errorMessage = (response && response.message) || 'Failed to load pull request details.';
                    $('.pr-details-error').removeClass('hidden').text(errorMessage);
                    setModalState('error');
                    return;
                }
                renderMonitorSection(response.monitor);
                // Determine current validation status from possible fields
                var currentStatus = (response && (response.monitor && response.monitor.validation_status)) || '';
                renderValidationSection(response.validation_options, currentStatus, prNumber);
                renderCommitsSection(response.commits);
                $('.pr-details-link')
                    .attr('href', response.pr_link || '#')
                    .toggleClass('hidden', !response.pr_link);

                // Build modal title: "PR <number>: <title>" linked to PR URL with PR icon
                (function () {
                    function escapeHtml(str) {
                        return String(str || '')
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#39;');
                    }
                    var mon = response && response.monitor && response.monitor[0] || {};
                    var prNum = mon.pr_number  || prNumber;
                    var prTitle = mon.pr_title || '';
                    var prUrl = mon.pr_link || '#';
                    var safeTitle = escapeHtml(prTitle);
                    var safeNum = escapeHtml(prNum);
                    var safeUrl = escapeHtml(prUrl);
                    var titleHtml = [
                        '<i class="fa-solid fa-code-pull-request" aria-hidden="true"></i>',
                        '<a href="', safeUrl, '" target="_blank" rel="noopener">',
                        safeNum, ' - ', safeTitle,
                        '</a>'
                    ].join('');
                    $('#prDetailsModalLabel')
                        .html(titleHtml)
                        .css({
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            fontWeight: '700',
                            fontSize: '2rem',
                            textAlign: 'center',
                            width: '100%',
                            flex: '1 1 auto'
                        });
                    $('#prDetailsModalLabel a').css({
                        color: 'inherit',
                        fontWeight: 'inherit',
                        textDecoration: 'none'
                    });
                    $('#prDetailsModalLabel i').css({
                        fontSize: '2rem'
                    });
                })();

                setModalState('content');
                // After content renders, recalc collapsible heights for smooth animations
                if (typeof recalcAllCollapsibles === 'function') {
                    recalcAllCollapsibles();
                }
            })
            .fail(function (jqXHR) {
                var message = 'Unable to load details for PR #' + prNumber + '. Please try again.';
                if (jqXHR.responseJSON && jqXHR.responseJSON.message) {
                    message = jqXHR.responseJSON.message;
                }
                $('.pr-details-error').removeClass('hidden').text(message);
                setModalState('error');
            });
    }

    function openDetailsPanel() {
        var $panel = $('#prDetailsModal');
        if (!$panel.hasClass('is-open')) {
            $panel.addClass('is-open');
            $('body').addClass('no-scroll');
        }
    }

    function closeDetailsPanel() {
        var $panel = $('#prDetailsModal');
        if ($panel.hasClass('is-open')) {
            $panel.removeClass('is-open');
            $('body').removeClass('no-scroll');
            if (reloadOnClose) {
                // reload once after successful update when user closes the panel
                reloadOnClose = false;
                setTimeout(function () { window.location.reload(); }, 100);
            }
        }
    }

    function bindPanelControls() {
        // Close on overlay or close button
        $(document).on('click', '[data-panel-close]', function () {
            closeDetailsPanel();
        });
        // Close on ESC key
        $(document).on('keydown', function (e) {
            if (e.key === 'Escape') {
                closeDetailsPanel();
            }
        });
    }

    function openPrModal(prNumber, repo, product) {
        openDetailsPanel();
        fetchPrDetails(prNumber, repo, product);
    }

    function bindHeaderClicks() {
        $('.pr-header-activator').on('click keypress', function (event) {
            if (event.type === 'click' || event.key === 'Enter' || event.key === ' ') {
                var prNumber = $(this).data('pr-number');
                var repo = $(this).data('pr-repo-name');
                var product = $(this).data('pr-product'); 
                if (prNumber) {
                    openPrModal(prNumber, repo, product);
                }
            }
        });
    }

    // Recalculate heights for all collapsibles (exported to outer scope)
    function recalcAllCollapsibles() {
        var BUFFER = 24; // px buffer to avoid fractional rounding/margin clipping
        $('[data-collapsible]').each(function () {
            var $card = $(this);
            var $body = $card.find('.collapsible-card__body');
            if ($card.hasClass('is-collapsed') || $card.find('.collapsible-card__header').attr('aria-expanded') === 'false') {
                // Ensure collapsed bodies have zero height
                $body.css('max-height', '0px');
            } else {
                // Expanded: set to content height plus a small buffer to prevent clipping
                $body.css('max-height', '');
                var h = $body.prop('scrollHeight');
                $body.css('max-height', (h + BUFFER) + 'px');
            }
        });
    }

    function setupCollapsibles() {
        function toggleCard($card, expand) {
            var BUFFER = 24; // px buffer to ensure full visibility
            var $body = $card.find('.collapsible-card__body');
            var willExpand = typeof expand === 'boolean' ? expand : $card.hasClass('is-collapsed');
            if (willExpand) {
                // EXPAND: remove collapsed class, then set height to content
                $card.removeClass('is-collapsed');
                $card.find('.collapsible-card__header').attr('aria-expanded', 'true');
                // Reset and measure
                $body.css('max-height', '');
                var hOpen = $body.prop('scrollHeight');
                $body.css('max-height', (hOpen + BUFFER) + 'px');
            } else {
                // COLLAPSE: set current height, force reflow, then animate to 0 and add class
                var hNow = $body.prop('scrollHeight');
                $body.css('max-height', (hNow + BUFFER) + 'px');
                // Force reflow to make sure transition starts from current height
                // eslint-disable-next-line no-unused-expressions
                $body[0] && $body[0].offsetHeight;
                $card.addClass('is-collapsed');
                $card.find('.collapsible-card__header').attr('aria-expanded', 'false');
                $body.css('max-height', '0px');
            }
        }

        // Initialize all collapsibles based on their starting state
        $('[data-collapsible]').each(function () {
            var $card = $(this);
            var $header = $card.find('.collapsible-card__header');
            var $body = $card.find('.collapsible-card__body');
            var isCollapsed = $card.hasClass('is-collapsed') || $header.attr('aria-expanded') === 'false';
            if (isCollapsed) {
                $card.addClass('is-collapsed');
                $header.attr('aria-expanded', 'false');
                $body.css('max-height', '0px');
            } else {
                $card.removeClass('is-collapsed');
                $header.attr('aria-expanded', 'true');
                $body.css('max-height', '');
                var hInit = $body.prop('scrollHeight');
                $body.css('max-height', hInit + 'px');
            }
        });

        // Toggle on header click/keyboard
        $(document).on('click keydown', '.collapsible-card__header', function (e) {
            if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                var $card = $(this).closest('[data-collapsible]');
                toggleCard($card);
            }
        });

        // Recompute heights on window resize
        var resizeTimeout;
        $(window).on('resize', function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                recalcAllCollapsibles();
            }, 100);
        });
    }

    $(document).ready(function () {
        bindHeaderClicks();
        bindPanelControls();
        setupCollapsibles();

        // Handle critical files filter checkbox
        var $toggle = $('#critical-filter-toggle');
        if ($toggle.length) {
            // Read current "filter" query param and sync checkbox
            var params = new URLSearchParams(window.location.search);
            var isFiltered = (params.get('filters') || '').toString().toLowerCase() === 'true';
            $toggle.prop('checked', isFiltered);

            $toggle.on('change', function () {
                var checked = $(this).is(':checked');
                var p = new URLSearchParams(window.location.search);
                p.set('filters', checked ? 'true' : 'false');
                var newUrl = window.location.pathname + '?' + p.toString();
                // Replace to avoid piling history entries; change to assign if you prefer back navigation
                window.location.replace(newUrl);
            });
        }
    });
})(window.jQuery);
