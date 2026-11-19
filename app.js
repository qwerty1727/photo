// app.js — вся логика приложения (v1.0.9)
(function () {
  var stage = document.getElementById('stage');
  var img = document.getElementById('photo');
  var gear = document.getElementById('gear');
  var sheetWrap = document.getElementById('sheetWrap');
  var note = document.getElementById('note');
  var fileInput = document.getElementById('file');
  var opEl = document.getElementById('gearOpacity');
  var sxEl = document.getElementById('scaleX');
  var syEl = document.getElementById('scaleY');
  var opVal = document.getElementById('opacityVal');
  var sxVal = document.getElementById('sxVal');
  var syVal = document.getElementById('syVal');

  var linkManagerWrap = document.getElementById('linkManagerWrap');
  var linkList = document.getElementById('linkList');
  var editModeToggle = document.getElementById('editModeToggle');
  var linksVisibleToggle = document.getElementById('linksVisibleToggle');
  var linksContainer = document.getElementById('linksContainer');

  var NOTE_DEFAULT = 'Фото и настройки хранятся только на этом телефоне.';
  var isEditMode = false;
  var linksVisible = true;

  var st = { z: 1, sx: 1, sy: 1, x: 0, y: 0 };
  var ptrs = {}, gesture = null, tap = null;
  var lastTap = { t: 0, x: 0, y: 0, n: 0 };
  var last = null, vel = { x: 0, y: 0 }, lastT = 0, raf = 0;
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var customLinks = [];
  var dragState = null;

  function clampS(v) { return Math.min(3, Math.max(0.5, v)); }
  function clampZ(v) { return Math.min(8, Math.max(1, v)); }

  function box() { return stage.getBoundingClientRect(); }
  function rel(e) {
    var b = box();
    return { x: e.clientX - b.left - b.width / 2, y: e.clientY - b.top - b.height / 2 };
  }
  function fitted() {
    var b = box();
    var nw = img.naturalWidth || b.width;
    var nh = img.naturalHeight || b.height;
    var k = Math.min(b.width / nw, b.height / nh);
    return { w: nw * k, h: nh * k };
  }
  function clampPan() {
    var b = box(), f = fitted();
    var mx = Math.max(0, (f.w * st.sx * st.z - b.width) / 2);
    var my = Math.max(0, (f.h * st.sy * st.z - b.height) / 2);
    st.x = Math.min(mx, Math.max(-mx, st.x));
    st.y = Math.min(my, Math.max(-my, st.y));
  }

  function updateLinksPositions() {
    var b = box(), f = fitted();
    var pw = f.w * st.z * st.sx;
    var ph = f.h * st.z * st.sy;
    var cx = b.width / 2 + st.x;
    var cy = b.height / 2 + st.y;
    var textScale = Math.min(2.5, Math.max(0.6, st.z));
    var els = linksContainer.children;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var link = customLinks[parseInt(el.dataset.index, 10)];
      if (!link) continue;
      el.style.left = (cx + (link.x / 100 - 0.5) * pw) + 'px';
      el.style.top = (cy + (link.y / 100 - 0.5) * ph) + 'px';
      el.style.transform = 'translate(-50%, -50%) scale(' + textScale + ')';
    }
  }

  function apply() {
    clampPan();
    img.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + (st.z * st.sx) + ',' + (st.z * st.sy) + ')';
    updateLinksPositions();
  }
  function syncScaleUI() {
    sxEl.value = st.sx; syEl.value = st.sy;
    sxVal.textContent = st.sx.toFixed(2) + '×';
    syVal.textContent = st.sy.toFixed(2) + '×';
  }
  function zoomAt(p, factor) {
    var nz = clampZ(st.z * factor);
    var ex = st.z * st.sx, ey = st.z * st.sy;
    var qx = (p.x - st.x) / ex, qy = (p.y - st.y) / ey;
    st.z = nz;
    st.x = p.x - nz * st.sx * qx;
    st.y = p.y - nz * st.sy * qy;
    apply();
  }
  function resetView() {
    stopAnim(); stopInertia();
    st.z = 1; st.x = 0; st.y = 0;
    apply();
  }
  function resetAll() {
    st.sx = 1; st.sy = 1;
    resetView(); syncScaleUI(); saveSettings();
  }
  function canPan() {
    var b = box(), f = fitted();
    return f.w * st.sx * st.z > b.width + 1 || f.h * st.sy * st.z > b.height + 1;
  }

  var animRaf = 0;
  function stopAnim() { if (animRaf) { cancelAnimationFrame(animRaf); animRaf = 0; } }
  function animateView(toZ, toX, toY) {
    stopAnim(); stopInertia();
    var b = box(), f = fitted();
    var mx = Math.max(0, (f.w * st.sx * toZ - b.width) / 2);
    var my = Math.max(0, (f.h * st.sy * toZ - b.height) / 2);
    toX = Math.min(mx, Math.max(-mx, toX));
    toY = Math.min(my, Math.max(-my, toY));
    if (reduceMotion) { st.z = toZ; st.x = toX; st.y = toY; apply(); return; }
    var z0 = st.z, x0 = st.x, y0 = st.y;
    var t0 = performance.now(), DUR = 280;
    function step(t) {
      var k = Math.min(1, (t - t0) / DUR);
      var e = 1 - Math.pow(1 - k, 3);
      st.z = z0 + (toZ - z0) * e;
      st.x = x0 + (toX - x0) * e;
      st.y = y0 + (toY - y0) * e;
      apply();
      if (k < 1) { animRaf = requestAnimationFrame(step); } else { animRaf = 0; }
    }
    animRaf = requestAnimationFrame(step);
  }
  function animateZoomAt(p, factor) {
    var nz = clampZ(st.z * factor);
    var qx = (p.x - st.x) / (st.z * st.sx), qy = (p.y - st.y) / (st.z * st.sy);
    animateView(nz, p.x - nz * st.sx * qx, p.y - nz * st.sy * qy);
  }

  function stopInertia() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function startInertia() {
    stopInertia();
    if (reduceMotion || Math.hypot(vel.x, vel.y) < 0.05) return;
    var prev = performance.now();
    function step(t) {
      var dt = Math.min(48, Math.max(1, t - prev)); prev = t;
      st.x += vel.x * dt; st.y += vel.y * dt;
      var k = Math.exp(-dt / 325); vel.x *= k; vel.y *= k;
      apply();
      if (Math.hypot(vel.x, vel.y) < 0.02) { raf = 0; return; }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  function count() { return Object.keys(ptrs).length; }
  function startPinch() {
    var ids = Object.keys(ptrs);
    var a = ptrs[ids[0]], b = ptrs[ids[1]];
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gesture = {
      d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z0: st.z,
      qx: (mid.x - st.x) / (st.z * st.sx), qy: (mid.y - st.y) / (st.z * st.sy)
    };
  }

  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.custom-link')) return;
    stopInertia(); vel.x = 0; vel.y = 0; lastT = performance.now();
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs[e.pointerId] = rel(e);
    if (count() === 1) {
      last = rel(e);
      tap = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false, multi: false };
    } else {
      if (tap) tap.multi = true;
      if (count() === 2) { stopAnim(); startPinch(); }
    }
  });

  stage.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    var p = rel(e); ptrs[e.pointerId] = p;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.moved = true;
    if (animRaf && count() === 1 && tap && !tap.moved) return;
    if (animRaf) stopAnim();

    if (count() >= 2 && gesture) {
      var ids = Object.keys(ptrs);
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var factor = Math.min(4, Math.max(0.25, d / gesture.d0));
      st.z = clampZ(gesture.z0 * factor);
      st.x = mid.x - st.z * st.sx * gesture.qx;
      st.y = mid.y - st.z * st.sy * gesture.qy;
      apply();
    } else if (count() === 1 && last) {
      var nowT = performance.now(), dtm = Math.max(1, nowT - lastT);
      vel.x = 0.7 * ((p.x - last.x) / dtm) + 0.3 * vel.x;
      vel.y = 0.7 * ((p.y - last.y) / dtm) + 0.3 * vel.y;
      lastT = nowT; st.x += p.x - last.x; st.y += p.y - last.y;
      last = p; apply();
    }
  });

  function endPointer(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId]; gesture = null;
    var left = Object.keys(ptrs);
    if (left.length === 1) { last = ptrs[left[0]]; }
    else if (left.length === 0) {
      last = null;
      if (e.type === 'pointerup' && tap && !tap.moved && !tap.multi && Date.now() - tap.t < 300) {
        var now = Date.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) { lastTap.n++; }
        else { lastTap.n = 1; }
        lastTap.t = now; lastTap.x = e.clientX; lastTap.y = e.clientY;
        if (lastTap.n === 2) {
          if (st.z > 1.05) animateView(1, 0, 0);
          else animateZoomAt(rel(e), 2.5);
        }
      }
      if (e.type === 'pointerup' && canPan() && !(tap && tap.multi) && performance.now() - lastT < 80) startInertia();
      tap = null;
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('wheel', function (e) {
    e.preventDefault(); stopAnim(); stopInertia();
    zoomAt(rel(e), Math.exp(-e.deltaY * 0.0022));
  }, { passive: false });

  window.addEventListener('resize', apply);

  function openDb() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open('photo-app-v2', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function dbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var q = db.transaction('kv').objectStore('kv').get(key);
        q.onsuccess = function () { resolve(q.result); };
        q.onerror = function () { reject(q.error); };
      });
    });
  }
  function dbPut(key, val) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function dbDel(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function validateAndFixUrl(url) {
    url = url.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); return url; } catch (e) { return null; }
  }

  function showModal(title, placeholder, defaultValue, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal"><h2>' + title + '</h2>' +
      '<input type="text" placeholder="' + placeholder + '" value="' + (defaultValue || '') + '">' +
      '<div class="modal-buttons"><button class="btn" data-action="cancel">Отмена</button>' +
      '<button class="btn primary" data-action="confirm">OK</button></div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector('input');
    input.focus();
    function done(val) {
      if (overlay.parentNode) document.body.removeChild(overlay);
      onConfirm(val);
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.dataset.action === 'cancel') done(null);
      else if (e.target.dataset.action === 'confirm') done(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') done(input.value);
      else if (e.key === 'Escape') done(null);
    });
  }

  function showConfirm(title, message, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal"><h2>' + title + '</h2>' +
      '<p style="margin:0; color:var(--muted);">' + message + '</p>' +
      '<div class="modal-buttons"><button class="btn" data-action="cancel">Отмена</button>' +
      '<button class="btn danger" data-action="confirm">Удалить</button></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.dataset.action === 'cancel') {
        document.body.removeChild(overlay); onConfirm(false);
      } else if (e.target.dataset.action === 'confirm') {
        document.body.removeChild(overlay); onConfirm(true);
      }
    });
  }

  function saveSettings() {
    var settings = {
      sx: st.sx, sy: st.sy, opacity: parseFloat(opEl.value),
      links: customLinks, linksVisible: linksVisible
    };
    try { localStorage.setItem('photo-settings', JSON.stringify(settings)); } catch (e) {}
    dbPut('settings', settings).catch(function () {});
  }

  function applySettings(s) {
    st.sx = clampS(s.sx || 1); st.sy = clampS(s.sy || 1);
    var op = Math.min(1, Math.max(0.1, s.opacity === undefined ? 1 : s.opacity));
    opEl.value = op; opVal.textContent = Math.round(op * 100) + '%';
    gear.style.opacity = op;
    syncScaleUI();
    linksVisible = s.linksVisible !== false;
    linksVisibleToggle.classList.toggle('active', linksVisible);
    customLinks = (s.links || []).map(function (l) {
      return {
        text: l.text || 'Ссылка',
        url: l.url || '#',
        x: typeof l.x === 'number' ? l.x : 50,
        y: typeof l.y === 'number' ? l.y : 50,
        enabled: l.enabled !== false,
        v8: !!l.v8
      };
    });
    renderLinks();
    apply();
  }

  function loadSettings() {
    var settings = null;
    try {
      var stored = localStorage.getItem('photo-settings');
      if (stored) settings = JSON.parse(stored);
    } catch (e) {}
    if (settings) { applySettings(settings); }
    else {
      dbGet('settings').then(function (s) {
        if (s) {
          applySettings(s);
          try { localStorage.setItem('photo-settings', JSON.stringify(s)); } catch (e) {}
        }
      }).catch(function () {});
    }
  }

  var migrated = false;
  function tryMigrate() {
    if (migrated) return;
    migrated = true;
    var need = customLinks.some(function (l) { return !l.v8; });
    if (!need) return;
    var b = box(), f = fitted();
    var pw = f.w * st.z * st.sx, ph = f.h * st.z * st.sy;
    var cx = b.width / 2 + st.x, cy = b.height / 2 + st.y;
    customLinks.forEach(function (l) {
      if (l.v8) return;
      var px = l.x / 100 * b.width, py = l.y / 100 * b.height;
      l.x = ((px - cx) / pw + 0.5) * 100;
      l.y = ((py - cy) / ph + 0.5) * 100;
      l.v8 = true;
    });
    saveSettings();
    updateLinksPositions();
  }

  function renderLinks() {
    linksContainer.innerHTML = '';
    if (!linksVisible && !isEditMode) return;
    customLinks.forEach(function (link, index) {
      if (!link.enabled && !isEditMode) return;
      var el = document.createElement('a');
      el.className = 'custom-link' +
        (isEditMode ? ' edit-mode' : '') +
        (!link.enabled ? ' link-disabled' : '');
      el.textContent = link.text;
      el.href = link.url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.dataset.index = index;
      linksContainer.appendChild(el);
    });
    updateLinksPositions();
  }

  linksContainer.addEventListener('pointerdown', function (e) {
    var linkEl = e.target.closest('.custom-link');
    if (!linkEl) return;
    e.stopPropagation();
    var index = parseInt(linkEl.dataset.index, 10);
    var link = customLinks[index];
    if (!link) return;

    if (isEditMode) {
      var b = box(), f = fitted();
      dragState = {
        index: index,
        el: linkEl,
        startX: e.clientX,
        startY: e.clientY,
        rect: b,
        cx: b.width / 2 + st.x,
        cy: b.height / 2 + st.y,
        pw: f.w * st.z * st.sx,
        ph: f.h * st.z * st.sy
      };
      try { linkEl.setPointerCapture(e.pointerId); } catch (err) {}
    } else if (link.enabled) {
      linkEl.classList.add('charging');
    }
  });

  linksContainer.addEventListener('animationend', function (e) {
    if (e.animationName === 'linkcharge') {
      e.target.classList.remove('charging');
      e.target.classList.add('armed');
      e.target._armed = true;
    }
  });

  linksContainer.addEventListener('pointermove', function (e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    var px = e.clientX - dragState.rect.left;
    var py = e.clientY - dragState.rect.top;
    var link = customLinks[dragState.index];
    link.x = Math.max(-50, Math.min(150, ((px - dragState.cx) / dragState.pw + 0.5) * 100));
    link.y = Math.max(-50, Math.min(150, ((py - dragState.cy) / dragState.ph + 0.5) * 100));
    link.v8 = true;
    updateLinksPositions();
  });

  function endLinkPointer(e) {
    var linkEl = e.target.closest('.custom-link');
    if (dragState) {
      dragState = null;
      saveSettings();
    } else if (linkEl) {
      linkEl.classList.remove('charging');
      if (e.type === 'pointercancel') {
        linkEl.classList.remove('armed');
        linkEl._armed = false;
      }
    }
  }
  linksContainer.addEventListener('pointerup', endLinkPointer);
  linksContainer.addEventListener('pointercancel', endLinkPointer);

  linksContainer.addEventListener('click', function (e) {
    var linkEl = e.target.closest('.custom-link');
    if (!linkEl) return;
    if (isEditMode) { e.preventDefault(); return; }
    if (!linkEl._armed) { e.preventDefault(); }
    linkEl._armed = false;
    linkEl.classList.remove('armed');
    linkEl.classList.remove('charging');
  });

  function renderLinkManager() {
    linkList.innerHTML = '';
    if (customLinks.length === 0) {
      linkList.innerHTML = '<div style="text-align:center; color:var(--muted); padding:20px;">Ссылок пока нет</div>';
      return;
    }
    customLinks.forEach(function (link, index) {
      var item = document.createElement('div');
      item.className = 'link-item';
      item.innerHTML =
        '<div class="link-info"><div class="link-text">' + link.text + '</div>' +
        '<div class="link-url">' + link.url + '</div></div>' +
        '<div class="link-actions">' +
        '<button class="link-btn" data-action="toggle" data-index="' + index + '">' + (link.enabled ? '👁' : '🙈') + '</button>' +
        '<button class="link-btn" data-action="edit" data-index="' + index + '">✏️</button>' +
        '<button class="link-btn delete" data-action="delete" data-index="' + index + '">➖</button>' +
        '</div>';
      linkList.appendChild(item);
    });

    linkList.querySelectorAll('.link-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.dataset.index, 10);
        var action = this.dataset.action;

        if (action === 'toggle') {
          customLinks[idx].enabled = !customLinks[idx].enabled;
          saveSettings();
          renderLinkManager();
          renderLinks();
        } else if (action === 'delete') {
          showConfirm('Удалить ссылку?', customLinks[idx].text, function (confirmed) {
            if (confirmed) {
              customLinks.splice(idx, 1);
              saveSettings();
              renderLinkManager();
              renderLinks();
            }
          });
        } else if (action === 'edit') {
          showModal('Текст ссылки', 'Например: Мой сайт', customLinks[idx].text, function (text) {
            if (text === null || !text.trim()) return;
            showModal('URL адрес', 'https://example.com', customLinks[idx].url, function (url) {
              if (url === null) return;
              var validUrl = validateAndFixUrl(url);
              if (!validUrl) { alert('Некорректный URL адрес'); return; }
              customLinks[idx].text = text.trim();
              customLinks[idx].url = validUrl;
              saveSettings();
              renderLinkManager();
              renderLinks();
            });
          });
        }
      });
    });
  }

  function openSheet() { note.textContent = NOTE_DEFAULT; sheetWrap.hidden = false; }
  function closeSheet() { sheetWrap.hidden = true; saveSettings(); }

  gear.addEventListener('click', openSheet);
  document.getElementById('close').addEventListener('click', closeSheet);
  sheetWrap.addEventListener('click', function (e) { if (e.target === sheetWrap) closeSheet(); });

  linksVisibleToggle.addEventListener('click', function () {
    linksVisible = !linksVisible;
    linksVisibleToggle.classList.toggle('active', linksVisible);
    saveSettings();
    renderLinks();
  });

  document.getElementById('openLinkSettings').addEventListener('click', function () {
    sheetWrap.hidden = true;
    renderLinkManager();
    linkManagerWrap.hidden = false;
  });

  document.getElementById('closeLinkManager').addEventListener('click', function () {
    linkManagerWrap.hidden = true;
    isEditMode = false;
    editModeToggle.classList.remove('active');
    renderLinks();
    sheetWrap.hidden = false;
  });

  editModeToggle.addEventListener('click', function () {
    isEditMode = !isEditMode;
    editModeToggle.classList.toggle('active', isEditMode);
    var links = linksContainer.querySelectorAll('.custom-link');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('edit-mode', isEditMode);
    }
    if (isEditMode) renderLinks();
  });

  document.getElementById('addLinkBtn').addEventListener('click', function () {
    showModal('Текст ссылки', 'Например: Мой сайт', '', function (text) {
      if (!text || !text.trim()) return;
      showModal('URL адрес', 'https://example.com', 'https://', function (url) {
        if (!url) return;
        var validUrl = validateAndFixUrl(url);
        if (!validUrl) { alert('Некорректный URL адрес'); return; }
        customLinks.push({ text: text.trim(), url: validUrl, x: 50, y: 50, enabled: true, v8: true });
        saveSettings();
        renderLinkManager();
        renderLinks();
      });
    });
  });

  opEl.addEventListener('input', function () {
    var v = parseFloat(opEl.value);
    gear.style.opacity = v;
    opVal.textContent = Math.round(v * 100) + '%';
    saveSettings();
  });
  sxEl.addEventListener('input', function () {
    st.sx = clampS(parseFloat(sxEl.value));
    sxVal.textContent = st.sx.toFixed(2) + '×';
    apply(); saveSettings();
  });
  syEl.addEventListener('input', function () {
    st.sy = clampS(parseFloat(syEl.value));
    syVal.textContent = st.sy.toFixed(2) + '×';
    apply(); saveSettings();
  });
  document.getElementById('resetTransform').addEventListener('click', resetAll);

  var SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2a4a"/><stop offset="0.55" stop-color="#b5546b"/><stop offset="1" stop-color="#f0a35e"/></linearGradient></defs><rect width="1200" height="1600" fill="url(#g)"/><circle cx="840" cy="980" r="130" fill="#ffd9a0" opacity="0.9"/><path d="M0 1180 L220 900 L400 1080 L620 780 L860 1100 L1020 940 L1200 1120 L1200 1600 L0 1600Z" fill="#15192b"/><path d="M0 1380 L300 1200 L560 1330 L860 1180 L1200 1360 L1200 1600 L0 1600Z" fill="#0d1020"/><text x="600" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" fill="#ffffff">Здесь будет твоё фото</text><text x="600" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" fill="#ffffff" opacity="0.85">Настройки → Выбрать новое фото</text></svg>';
  var SAMPLE = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SAMPLE_SVG);

  var currentUrl = null;
  function showBlob(blob) {
    if (currentUrl) { try { URL.revokeObjectURL(currentUrl); } catch (e) {} }
    currentUrl = URL.createObjectURL(blob);
    resetView(); img.src = currentUrl;
  }
  function showSample() {
    if (currentUrl) { try { URL.revokeObjectURL(currentUrl); } catch (e) {} currentUrl = null; }
    resetView(); img.src = SAMPLE;
  }
  function downscale(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 2560 / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('blob')); }, 'image/jpeg', 0.92);
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      im.src = url;
    });
  }

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var ready = file.size > 8 * 1024 * 1024 ? downscale(file) : Promise.resolve(file);
    ready.then(function (blob) {
      showBlob(blob);
      return dbPut('photo', blob).then(function () { closeSheet(); }, function () { note.textContent = 'Фото показано, но не сохранилось.'; });
    }).catch(function () { note.textContent = 'Не удалось открыть файл. Выбери JPG или PNG.'; })
    .then(function () { try { fileInput.value = ''; } catch (e) {} });
  });

  document.getElementById('reset').addEventListener('click', function () {
    showSample(); dbDel('photo').catch(function () {}); closeSheet();
  });

  img.addEventListener('load', function () {
    tryMigrate();
    apply();
  });

  showSample();
  loadSettings();
  dbGet('photo').then(function (blob) { if (blob) showBlob(blob); }).catch(function () {});

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
