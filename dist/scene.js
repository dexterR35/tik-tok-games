class PrinterScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.job = null;
    this.progress = 0;
    this.closeup = false;
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  update(job, progress) {
    this.job = job;
    this.progress = progress;
    this.draw();
  }

  point(x, y, z) {
    return [364 + (x - 160) * 1.40 + (y - 125) * .61, 303 + (x - 160) * .20 - (y - 125) * .57 - z];
  }

  polygon(points, fill, stroke = null) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = .65;
      ctx.stroke();
    }
  }

  box(x, y, z, w, d, h, colors) {
    const a = this.point(x, y, z + h);
    const b = this.point(x + w, y, z + h);
    const c = this.point(x + w, y + d, z + h);
    const d1 = this.point(x, y + d, z + h);
    const a0 = this.point(x, y, z);
    const b0 = this.point(x + w, y, z);
    const c0 = this.point(x + w, y + d, z);
    this.polygon([a, b, b0, a0], colors[1], '#141519');
    this.polygon([b, c, c0, b0], colors[2], '#141519');
    this.polygon([a, b, c, d1], colors[0], '#72778150');
  }

  plane(x, y, z, w, d, callback) {
    const ctx = this.ctx;
    const [ax, ay] = this.point(x, y + d, z);
    const [bx, by] = this.point(x + w, y + d, z);
    const [cx, cy] = this.point(x, y, z);
    ctx.save();
    ctx.transform((bx - ax) / 260, (by - ay) / 260, (cx - ax) / 330, (cy - ay) / 330, ax, ay);
    callback(ctx);
    ctx.restore();
  }

  sheet(ctx) {
    const paper = ctx.createLinearGradient(0, 0, 260, 330);
    paper.addColorStop(0, '#fff8e8');
    paper.addColorStop(1, '#e9dfc9');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 260, 330);
    ctx.strokeStyle = '#7b745680';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, 236, 306);

    ctx.fillStyle = '#272a26';
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillText('P/L   PORTRAIT LAB', 24, 32);
    ctx.textAlign = 'right';
    ctx.fillText(this.job ? String(this.job.number).padStart(2, '0') : '01', 236, 32);
    ctx.textAlign = 'start';
    ctx.fillStyle = '#2c31221c';
    ctx.fillRect(24, 45, 212, 212);

    if (this.job) {
      this.ink(ctx);
      ctx.fillStyle = '#272a26';
      ctx.font = 'bold 19px Segoe UI, sans-serif';
      ctx.fillText(this.job.name, 24, 284, 212);
      ctx.fillStyle = '#696557';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText(this.job.demo ? 'TEST / PRINT LIVE' : 'TIKTOK / PRINT LIVE', 24, 304);
    } else {
      ctx.strokeStyle = '#918b785c';
      ctx.beginPath();
      ctx.moveTo(120, 151);
      ctx.lineTo(140, 151);
      ctx.moveTo(130, 141);
      ctx.lineTo(130, 161);
      ctx.stroke();
      ctx.fillStyle = '#696557';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText('IDLE', 24, 284);
    }
  }

  ink(ctx) {
    const scan = this.scan();
    const size = 212;
    const pitch = size / scan.rows;
    ctx.save();
    ctx.beginPath();
    for (let row = 0; row <= scan.row; row += 1) {
      const width = row < scan.row ? size : size * scan.fraction;
      const start = row % 2 ? 24 + size - width : 24;
      ctx.rect(start, 45 + row * pitch, width, pitch * .90);
    }
    ctx.clip();
    const image = this.job.image;
    if (image?.naturalWidth) {
      const crop = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, 24, 45, size, size);
    } else {
      ctx.fillStyle = '#283f37';
      ctx.fillRect(24, 45, size, size);
      ctx.fillStyle = '#daff99';
      ctx.font = 'bold 72px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.job.initials, 130, 151, 182);
    }
    ctx.restore();
  }

  scan() {
    const rows = 54;
    const steps = this.progress * rows;
    const row = Math.min(rows - 1, Math.floor(steps));
    const fraction = steps - row;
    return { rows, row, fraction, x: 24 + 212 * (row % 2 ? 1 - fraction : fraction), y: 45 + 212 * (row + .45) / rows };
  }

  screw(x, y, z) {
    const [px, py] = this.point(x, y, z);
    this.ctx.beginPath();
    this.ctx.ellipse(px, py, 3.2, 1.8, .12, 0, Math.PI * 2);
    this.ctx.fillStyle = '#111217';
    this.ctx.fill();
    this.ctx.strokeStyle = '#838795';
    this.ctx.lineWidth = .8;
    this.ctx.stroke();
  }

  rail(x, y, z, w, d, h) {
    this.box(x, y, z, w, d, h, ['#4a4e58', '#292b33', '#17191f']);
    this.box(x + .7, y - .15, z + h * .45, w - 1.4, 1, 2.1, ['#696d77', '#15161b', '#22232a']);
  }

  post(x, y) {
    this.rail(x, y, 24, 12, 13, 180);
    this.box(x + 4.5, y - .2, 33, 2.8, 1, 166, ['#535965', '#101116', '#292b31']);
    this.box(x - 2, y - 2, 200, 16, 17, 7, ['#b6e94e', '#7a9d36', '#4d6428']);
  }

  drawMachine() {
    const ctx = this.ctx;
    const metal = ['#555b65', '#2d3038', '#1b1d24'];
    const [sx, sy] = this.point(156, 115, 0);
    ctx.save();
    ctx.translate(sx, sy + 14);
    ctx.scale(1, .29);
    const shadow = ctx.createRadialGradient(0, 0, 35, 0, 0, 295);
    shadow.addColorStop(0, '#0b0c10ed');
    shadow.addColorStop(1, '#0b0c1000');
    ctx.fillStyle = shadow;
    ctx.fillRect(-295, -295, 590, 590);
    ctx.restore();

    for (const [x, y] of [[12, 15], [293, 15], [12, 218], [293, 218]]) {
      this.box(x, y, 0, 21, 19, 11, ['#272a31', '#101116', '#090a0d']);
    }
    this.box(0, 0, 10, 326, 250, 23, metal);
    this.box(2, -1, 17, 322, 2, 2, ['#4a4c55', '#17191f', '#1b1d24']);
    this.box(31, 22, 33, 255, 207, 4, ['#2d3036', '#13151a', '#202229']);
    this.plane(32, 23, 37, 253, 205, (plane) => {
      plane.strokeStyle = '#777b8338';
      plane.lineWidth = .65;
      plane.beginPath();
      for (let x = 10; x < 260; x += 13) {
        plane.moveTo(x, 0);
        plane.lineTo(x, 330);
      }
      for (let y = 10; y < 330; y += 16) {
        plane.moveTo(0, y);
        plane.lineTo(260, y);
      }
      plane.stroke();
    });
    for (const [x, y] of [[39, 30], [278, 30], [39, 222], [278, 222]]) this.screw(x, y, 37);

    this.post(6, 231);
    this.post(309, 231);
    this.rail(15, 232, 192, 295, 10, 12);
    this.box(91, 40, 37, 137, 182, 1.2, ['#d9ccb3', '#b9ad97', '#9e9581']);
    this.plane(91, 40, 38.3, 137, 182, (plane) => this.sheet(plane));

    const active = this.job && this.progress < 1;
    const scan = this.scan();
    const x = active ? 91 + 137 * scan.x / 260 : 254;
    const y = active ? 222 - 182 * scan.y / 330 : 207;
    this.rail(10, 17, 93, 12, 218, 10);
    this.rail(306, 17, 93, 12, 218, 10);
    this.box(6, y - 4, 92, 20, 17, 16, metal);
    this.box(301, y - 4, 92, 20, 17, 16, metal);
    this.rail(21, y + 1, 94, 286, 11, 12);
    this.box(x - 2, y - 2, active ? 38.3 : 53, 4, 4, active ? 30 : 15, ['#eff2f7', '#bcc5cf', '#6d737d']);
    this.box(x - 4, y - 4, 61, 8, 8, 18, ['#efffbb', '#cfec7b', '#92ae51']);
    this.box(x - 13, y - 10, 75, 26, 20, 31, ['#606671', '#3b3e47', '#24262e']);
    this.box(x - 8, y - 10.4, 79, 16, 1, 17, ['#2c3037', '#121419', '#272932']);
    this.box(x - 6, y - 11, 92, 12, 1.2, 2, ['#ebffa9', '#cfff61', '#7da237']);
    this.box(x - 5, y - 2, 105, 10, 8, 3, ['#777d87', '#40434a', '#30323a']);
    this.post(6, 8);
    this.post(309, 8);
    this.rail(8, 18, 193, 10, 215, 11);
    this.rail(310, 18, 193, 10, 215, 11);
    this.rail(16, 8, 192, 293, 12, 12);
    this.box(32, 7.8, 196, 58, 1, 5, ['#8fae49', '#b3d851', '#718a39']);
    this.box(261, -8, 15, 43, 14, 17, ['#666b74', '#22242b', '#191b21']);
    this.box(265, -8.5, 19, 24, 1, 8, ['#c5e967', '#9ec857', '#62783e']);
    this.box(294, -9, 20, 6, 2, 6, ['#646873', '#4a4e59', '#2b2e36']);
  }

  drawCloseup() {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(234, 42);
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 11;
    ctx.shadowColor = '#09090bbd';
    ctx.fillStyle = '#e9dfc9';
    ctx.fillRect(0, 0, 260, 330);
    ctx.shadowColor = 'transparent';
    this.sheet(ctx);
    if (this.job && this.progress < 1) {
      const scan = this.scan();
      ctx.fillStyle = '#232520';
      ctx.beginPath();
      ctx.arc(scan.x, scan.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  draw() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    const ctx = this.ctx;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const drawingWidth = width < 600 ? (this.closeup ? 510 : 610) : 728;
    const scale = Math.min(width / drawingWidth, height / 452);
    ctx.translate((width - 728 * scale) / 2, (height - 420 * scale) / 2);
    ctx.scale(scale, scale);
    if (this.closeup) this.drawCloseup();
    else this.drawMachine();
  }
}
