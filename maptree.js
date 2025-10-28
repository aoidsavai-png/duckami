/*************************************************************
 * MapTree Overlay (self-contained)
 * Author: GPTINI (customized for your use)
 * Description: Generates a 10-node decision tree from visible
 *              page text or map labels and overlays it on a
 *              Google Map centered on your location.
 *************************************************************/

(function() {
  const MAPS_API_KEY = 'AIzaSyDINa2bqCwW6mj0tXZc1A0YwxHB0qPQdEo';  // <--- put your key here
  const NODE_COUNT = 10;
  const AUTO_CLOSE_SECONDS = 0;

  /************** Tree Layout + Render *****************/
  function layoutTree(root) {
    const levels = [];
    (function dfs(n, d) {
      if (!n) return;
      levels[d] = levels[d] || [];
      levels[d].push(n);
      n._depth = d;
      if (n.trueBranch) dfs(n.trueBranch, d + 1);
      if (n.falseBranch) dfs(n.falseBranch, d + 1);
    })(root, 0);
    const maxDepth = Math.max(0, levels.length - 1);
    for (let d = 0; d < levels.length; d++) {
      const row = levels[d];
      for (let i = 0; i < row.length; i++) {
        row[i]._x = (i + 1) / (row.length + 1);
        row[i]._y = maxDepth > 0 ? d / (maxDepth + 1) : 0.5;
      }
    }
    return root;
  }

  function renderTreeCanvas(root, canvas) {
    if (!root) return;
    const ctx = canvas.getContext('2d');
    const CSSW = canvas.clientWidth, CSSH = canvas.clientHeight;
    canvas.width = CSSW * devicePixelRatio;
    canvas.height = CSSH * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, CSSW, CSSH);

    const pad = 20, nodeW = Math.min(220, Math.max(110, CSSW * 0.16)), nodeH = 34;
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    function pos(n) {
      return { x: pad + n._x * (CSSW - 2 * pad), y: pad + n._y * (CSSH - 2 * pad) };
    }

    function drawEdges(n) {
      if (!n) return;
      const P = pos(n);
      ['trueBranch', 'falseBranch'].forEach(k => {
        const c = n[k];
        if (!c) return;
        const Q = pos(c);
        ctx.strokeStyle = 'rgba(30,30,30,0.6)';
        ctx.beginPath();
        ctx.moveTo(P.x, P.y + nodeH / 2);
        ctx.lineTo(Q.x, Q.y - nodeH / 2);
        ctx.stroke();
        drawEdges(c);
      });
    }

    function wrapText(ctx, text, x, y, maxW, lh) {
      const words = String(text).split(' ');
      let line = '', lines = [];
      for (let i = 0; i < words.length; i++) {
        const test = line + words[i] + ' ';
        if (ctx.measureText(test).width > maxW && i > 0) {
          lines.push(line.trim());
          line = words[i] + ' ';
        } else line = test;
      }
      if (line) lines.push(line.trim());
      const startY = y - (lines.length - 1) * lh / 2;
      ctx.fillStyle = 'rgba(18,18,18,0.95)';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, startY + i * lh);
    }

    function drawNodes(n) {
      if (!n) return;
      const P = pos(n);
      const x = P.x - nodeW / 2, y = P.y - nodeH / 2, r = 8;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + nodeW, y, x + nodeW, y + nodeH, r);
      ctx.arcTo(x + nodeW, y + nodeH, x, y + nodeH, r);
      ctx.arcTo(x, y + nodeH, x, y, r);
      ctx.arcTo(x, y, x + nodeW, y, r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,40,0.25)';
      ctx.stroke();
      const label = n.label || n.attr || '';
      wrapText(ctx, label, P.x, P.y, nodeW - 12, 14);
      if (n.trueBranch) drawNodes(n.trueBranch);
      if (n.falseBranch) drawNodes(n.falseBranch);
    }

    drawEdges(root);
    drawNodes(root);
  }

  /************** Text Sampling *****************/
  function sampleVisibleText(maxItems = 300) {
    const texts = new Set();
    try {
      document.querySelectorAll('svg text').forEach(t => {
        if (t && t.textContent && t.textContent.trim().length > 1) {
          const r = t.getBoundingClientRect();
          if (r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < window.innerHeight)
            texts.add(t.textContent.trim());
        }
      });
    } catch (e) {}

    const selectors = '[aria-label],[title],[data-label],[data-name],.place,.poi,.gm-style';
    try {
      document.querySelectorAll(selectors).forEach(el => {
        try {
          const t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent);
          if (t && t.trim().length > 1) {
            const r = el.getBoundingClientRect();
            if (r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < window.innerHeight)
              texts.add(t.trim());
          }
        } catch (e) {}
      });
    } catch (e) {}

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && texts.size < maxItems) {
      const s = node.nodeValue.trim();
      if (s.length > 2) texts.add(s);
    }
    return Array.from(texts).slice(0, maxItems);
  }

  /************** Tree Generation *****************/
  function buildRandomTreeFromPhrases(phrases, targetNodes = NODE_COUNT) {
    if (!phrases || phrases.length === 0) phrases = ['here', 'there', 'now', 'elsewhere'];
    const leaves = [];
    for (let i = 0; i < targetNodes; i++) {
      const a = phrases[Math.floor(Math.random() * phrases.length)];
      const b = Math.random() > 0.6 ? ' ' + phrases[Math.floor(Math.random() * phrases.length)] : '';
      leaves.push({ label: (a + b).trim() });
    }
    function pair(arr) {
      if (arr.length === 1) return arr[0];
      const next = [];
      for (let i = 0; i < arr.length; i += 2) {
        if (i + 1 < arr.length)
          next.push({ attr: 'q' + Math.floor(Math.random() * 9999), trueBranch: arr[i], falseBranch: arr[i + 1] });
        else next.push(arr[i]);
      }
      return pair(next);
    }
    return pair(leaves);
  }

  /************** Map & Overlay *****************/
  function createOverlay() {
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      left: 0, top: 0, right: 0, bottom: 0,
      zIndex: 2147483647,
      background: 'rgba(255,255,255,0.15)',
      pointerEvents: 'auto'
    });
    const mapDiv = document.createElement('div');
    Object.assign(mapDiv.style, { width: '100%', height: '100%' });
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%', pointerEvents: 'none'
    });
    container.appendChild(mapDiv);
    container.appendChild(canvas);
    document.body.appendChild(container);

    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_API_KEY)}`;
    s.async = true;
    s.defer = true;
    s.onload = function() {
      const map = new google.maps.Map(mapDiv, { zoom: 14, center: { lat: 0, lng: 0 } });
      if (navigator.geolocation)
        navigator.geolocation.getCurrentPosition(p => map.setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }));
      const phrases = sampleVisibleText();
      const tree = layoutTree(buildRandomTreeFromPhrases(phrases));
      map.addListener('idle', () => renderTreeCanvas(tree, canvas));
      renderTreeCanvas(tree, canvas);
    };
    document.head.appendChild(s);

    if (AUTO_CLOSE_SECONDS > 0)
      setTimeout(() => container.remove(), AUTO_CLOSE_SECONDS * 1000);
  }

  createOverlay();
})();
