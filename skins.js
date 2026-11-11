/* Visor de skins de Cube Unbound (10-nov). Lee .vox de MagicaVoxel y monta el personaje como el juego:
   - ejes como render/VoxelModel.cpp: MagicaVoxel (x, y, z) con Z arriba -> motor (sx-1-x, z, sy-1-y), Y arriba y el frente en +Z;
   - cada pieza en su «at» menos su «pivot» (render/CharacterRig.cpp); sin pivote, el centro; la pieza reflejada da la vuelta en X.
   Lo usan skins.html (vista previa al subir) y el panel (la imagen de la tarjeta). Sin dependencias. */
(function () {
  'use strict';
  var GRAY = [];
  for (var g = 1; g < 256; g++) { var v = 64 + (g * 37) % 160; GRAY[g] = [v, v, v]; }

  function parseVox(buffer) {
    var b = new Uint8Array(buffer), dv = new DataView(buffer);
    if (b.length < 20 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'VOX ') throw new Error('no es un .vox');
    var p = 8, size = null, xyzi = null, pal = null;
    while (p + 12 <= b.length) {
      var id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]), n = dv.getUint32(p + 4, true);
      p += 12;
      if (n > b.length - p) throw new Error('archivo cortado');
      if (id === 'SIZE' && !size) size = [dv.getUint32(p, true), dv.getUint32(p + 4, true), dv.getUint32(p + 8, true)];
      else if (id === 'XYZI' && size && !xyzi) xyzi = { at: p + 4, count: Math.min(dv.getUint32(p, true), (n - 4) >> 2) };
      else if (id === 'RGBA' && n >= 1024) {
        pal = [];
        for (var i = 0; i < 255; i++) pal[i + 1] = [b[p + i * 4], b[p + i * 4 + 1], b[p + i * 4 + 2]];
      }
      p += n;
    }
    if (!size || !xyzi) throw new Error('no tiene ningún modelo');
    if (size[0] > 32 || size[1] > 32 || size[2] > 32) throw new Error('mide más de 32 por lado');
    var sx = size[0], sy = size[1], sz = size[2];
    var m = { sizeX: sx, sizeY: sz, sizeZ: sy, pal: pal || GRAY, cells: {}, list: [] };
    for (var k = 0; k < xyzi.count; k++) {
      var q = xyzi.at + k * 4, x = b[q], y = b[q + 1], z = b[q + 2], c = b[q + 3];
      if (x >= sx || y >= sy || z >= sz || !c) continue;
      var X = sx - 1 - x, Y = z, Z = sy - 1 - y, key = X + ',' + Y + ',' + Z;
      if (!m.cells[key]) m.list.push([X, Y, Z]);
      m.cells[key] = c;
    }
    return m;
  }

  // Normales de las caras: +X, -X, +Y, -Y, +Z, -Z (los 4 vértices de cada una, en el cubo unidad)
  var FACES = [
    { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];

  // rig: [{ piece, at:[x,y,z], pivot:[x,y,z]|null, mirror }]; models: { piece: parseVox(...) }
  // opts: { yaw (grados; 0 = de frente, 180 = de espaldas), pitch, bg }
  function render(canvas, rig, models, opts) {
    opts = opts || {};
    var yaw = (opts.yaw == null ? 32 : opts.yaw) * Math.PI / 180, pitch = (opts.pitch == null ? 24 : opts.pitch) * Math.PI / 180;
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    function proj(X, Y, Z) {   // cámara delante (+Z), girada yaw alrededor de Y y un poco desde arriba
      var x = X * cy - Z * sy, z = X * sy + Z * cy;
      return [x, Y * cp - z * sp, z * cp + Y * sp];
    }
    var light = [0.45, 0.85, 0.6], ll = Math.hypot(light[0], light[1], light[2]);
    var visible = FACES.map(function (f) {
      var d = proj(f.n[0], f.n[1], f.n[2])[2];
      var shade = 0.55 + 0.45 * Math.max(0, (f.n[0] * light[0] + f.n[1] * light[1] + f.n[2] * light[2]) / ll);
      return d > 1e-6 ? shade : 0;
    });
    var polys = [], minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    rig.forEach(function (part) {
      var m = models[part.piece];
      if (!m) return;
      var px = part.pivot ? part.pivot[0] : m.sizeX / 2, py = part.pivot ? part.pivot[1] : m.sizeY / 2, pz = part.pivot ? part.pivot[2] : m.sizeZ / 2;
      if (part.mirror) px = m.sizeX - px;
      var ox = part.at[0] - px, oy = part.at[1] - py, oz = part.at[2] - pz;
      m.list.forEach(function (c) {
        var lx = part.mirror ? m.sizeX - 1 - c[0] : c[0];
        var col = m.pal[m.cells[c[0] + ',' + c[1] + ',' + c[2]]] || [255, 0, 255];
        FACES.forEach(function (f, fi) {
          if (!visible[fi]) return;
          var nx = c[0] + (part.mirror ? -f.n[0] : f.n[0]), ny = c[1] + f.n[1], nz = c[2] + f.n[2];
          if (m.cells[nx + ',' + ny + ',' + nz]) return;   // cara tapada dentro de la pieza
          var pts = [], depth = 0;
          f.v.forEach(function (v) {
            var q = proj(ox + lx + v[0], oy + c[1] + v[1], oz + c[2] + v[2]);
            pts.push(q[0], q[1]);
            depth += q[2];
            if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
            if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1];
          });
          var s = visible[fi];
          polys.push({ d: depth, p: pts, c: 'rgb(' + Math.round(col[0] * s) + ',' + Math.round(col[1] * s) + ',' + Math.round(col[2] * s) + ')' });
        });
      });
    });
    var ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, W, H); }
    if (!polys.length) return;
    polys.sort(function (a, b) { return a.d - b.d; });
    var pad = 0.08, scale = Math.min(W * (1 - 2 * pad) / (maxX - minX), H * (1 - 2 * pad) / (maxY - minY));
    var offX = W / 2 - (minX + maxX) / 2 * scale, offY = H / 2 + (minY + maxY) / 2 * scale;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.6;
    polys.forEach(function (q) {
      ctx.beginPath();
      for (var i = 0; i < 8; i += 2) {
        var X = offX + q.p[i] * scale, Y = offY - q.p[i + 1] * scale;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.closePath();
      ctx.fillStyle = q.c;
      ctx.strokeStyle = q.c;   // tapa las rendijas entre caras
      ctx.fill();
      ctx.stroke();
    });
  }

  // Las piezas de la raza que no trae la skin, las del juego (img/skins/base/<raza>/<pieza>.vox)
  var baseCache = {};
  function base(root, race, piece) {
    var k = race + '/' + piece;
    if (!baseCache[k]) {
      baseCache[k] = fetch(root + 'skins/base/' + k + '.vox').then(function (r) {
        if (!r.ok) throw new Error(k);
        return r.arrayBuffer();
      }).then(parseVox);
    }
    return baseCache[k];
  }

  // Monta y pinta: skin = { piece: modelo ya leído }; female: la versión femenina (cabeza y cuerpo _f)
  function draw(canvas, root, rigs, race, skin, female, opts) {
    var r = rigs[race];
    if (!r) return Promise.reject(new Error('raza'));
    var rig = female && r.female ? r.female : r.parts;
    var need = [];
    rig.forEach(function (p) { if (need.indexOf(p.piece) < 0) need.push(p.piece); });
    return Promise.all(need.map(function (piece) {
      return skin[piece] ? Promise.resolve(skin[piece]) : base(root, race, piece).catch(function () { return null; });
    })).then(function (ms) {
      var models = {};
      need.forEach(function (piece, i) { if (ms[i]) models[piece] = ms[i]; });
      render(canvas, rig, models, opts);
    });
  }

  function b64ToBuffer(text) {
    var bin = atob(text), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  window.CUSkins = { parseVox: parseVox, render: render, draw: draw, b64ToBuffer: b64ToBuffer };
})();
