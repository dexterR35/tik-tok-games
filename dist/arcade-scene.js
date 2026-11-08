class ArcadeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'race';
    this.round = null;
    this.ranked = [];
    this.now = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    new ResizeObserver(() => this.draw(this.mode, this.round, this.ranked, this.now)).observe(canvas);
  }

  draw(mode, round, ranked, now) {
    const { canvas, ctx } = this;
    const width = Math.round(canvas.clientWidth * Math.min(devicePixelRatio || 1, 2));
    const height = Math.round(canvas.clientHeight * Math.min(devicePixelRatio || 1, 2));
    this.mode = mode;
    this.round = round;
    this.ranked = ranked;
    this.now = now;
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#100f17';
    ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / 840, height / 460);
    ctx.setTransform(scale, 0, 0, scale, (width - 840 * scale) / 2, (height - 460 * scale) / 2);
    this[mode](round, ranked, now);
  }

  polygon(points, fill, stroke) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  line(points, color, width = 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  text(text, x, y, color, size = 12, align = 'left') {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px Consolas, monospace`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  field(glow, grid, label, color) {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(420, 228, 28, 420, 228, 485);
    gradient.addColorStop(0, glow);
    gradient.addColorStop(1, '#100f17');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 840, 460);
    for (let x = 24; x < 840; x += 24) {
      for (let y = 20; y < 460; y += 24) {
        ctx.fillStyle = grid;
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
    this.line([[18, 72], [18, 18], [195, 18]], grid, 2);
    this.line([[645, 442], [822, 442], [822, 388]], grid, 2);
    this.text(label, 31, 40, color, 11);
  }

  avatar(player, x, y, radius) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.clip();
    const image = player.picture;
    if (image?.naturalWidth) {
      const edge = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, x - radius, y - radius, radius * 2, radius * 2);
    } else {
      this.text(player.initials, x, y + radius * .23, '#181827', radius * .76, 'center');
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  race(round, ranked, now) {
    this.field('#233d40', '#79d4bf3a', 'SECTOR 02 / TURBO TRACK', '#94dec9');
    const ctx = this.ctx;
    const point = (distance, lane) => [69 + distance * 660 + lane * 10, 157 + lane * 41 - distance * 51];
    this.polygon([point(0, 0), point(1, 0), point(1, 6), point(0, 6)], '#151d26', '#528679');
    for (let lane = 0; lane < 6; lane += 1) {
      const paint = lane % 2 ? '#1a2931' : '#202f36';
      this.polygon([point(0, lane), point(1, lane), point(1, lane + 1), point(0, lane + 1)], paint);
      this.line([point(0, lane), point(1, lane)], '#81b6a548');
    }
    for (const distance of [.25, .50, .75]) {
      ctx.setLineDash([5, 8]);
      this.line([point(distance, 0), point(distance, 6)], '#b0d7d344');
      ctx.setLineDash([]);
      const [x, y] = point(distance, 6);
      this.text(`${distance * 1000} m`, x - 5, y + 17, '#8fb7b6', 10, 'center');
    }
    this.line([point(0, 6), point(1, 6)], '#7df7d6', 2);
    this.line([point(0, 0), point(1, 0)], '#7df7d6', 2);
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const a = .973 + column * .0135;
        const b = a + .0135;
        const lane = row * .5;
        this.polygon([point(a, lane), point(b, lane), point(b, lane + .5), point(a, lane + .5)], (row + column) % 2 ? '#2b4f4e' : '#bcebdd');
      }
    }
    this.line([point(.018, 0), point(.018, 6)], '#c1ffd9', 2);
    this.text('START', 77, 142, '#d0fbeb', 13);
    this.text('FINISH / 1,000 M', 728, 93, '#d0fbeb', 13, 'right');

    const leaderKeys = new Set(ranked.slice(0, 6).map(player => player.key));
    const lanes = round ? [...round.players.values()].filter(player => leaderKeys.has(player.key)) : [];
    lanes.forEach((player, lane) => {
      const distance = Math.min(1, player.score / ArcadeGames.raceGoal) * .925 + .035;
      const [x, y] = point(distance, lane + .5);
      if (player.boostUntil > now && round.ended === null) {
        this.line([[x - 46, y + 4], [x - 13, y]], `${player.color}55`, 9);
        this.line([[x - 36, y + 2], [x - 13, y]], player.color, 2);
      }
      this.avatar(player, x, y, 15);
      this.text(player.name.slice(0, 15), x > 680 ? x - 20 : x + 21, y + 5, '#eefbf8', 13, x > 680 ? 'right' : 'left');
    });
    if (!lanes.length) {
      this.text('STARTING LINE', 410, 234, '#c7f8e9', 28, 'center');
      this.text('!join  /  TAP-TAP  /  GIFT', 410, 257, '#9ad5c5', 14, 'center');
    }
    this.text('TURBO SPRINT', 31, 438, '#71f7d1', 12);
  }

  tower(round, ranked, now) {
    this.field('#4e322d', '#de9d6b35', 'SECTOR 03 / LIVE BUILD SITE', '#ffcb92');
    const ctx = this.ctx;
    for (let x = 0; x < 840; x += 32) {
      const height = 18 + (x * 17) % 86;
      ctx.fillStyle = '#171722';
      ctx.fillRect(x, 403 - height, 26, height);
      ctx.fillStyle = '#dc8a4a31';
      ctx.fillRect(x + 7, 412 - height, 3, 4);
      ctx.fillRect(x + 16, 425 - height, 3, 4);
    }
    this.polygon([[239, 406], [586, 406], [636, 373], [289, 373]], '#443637', '#9b6d52');
    this.polygon([[239, 406], [586, 406], [586, 421], [239, 421]], '#2b2430', '#775041');
    this.polygon([[586, 406], [636, 373], [636, 388], [586, 421]], '#30242d', '#775041');
    for (let x = 250; x < 580; x += 16) {
      this.line([[x, 418], [x + 9, 408]], '#f1ae7185', 3);
    }
    ctx.setLineDash([5, 6]);
    this.line([[295, 95], [585, 95]], '#ffc9848f');
    this.line([[295, 95], [295, 390]], '#ffc98450');
    this.line([[585, 95], [585, 390]], '#ffc98450');
    ctx.setLineDash([]);
    this.text('GOAL / 24 BLOCKS', 440, 83, '#ffcc8b', 11, 'center');

    const blocks = round?.blocks ?? [];
    blocks.forEach(({ player, at }, index) => {
      const bounce = this.reducedMotion.matches ? 0 : Math.max(0, 1 - (now - at) / 250) * 34;
      const x = 319 + (index % 3 - 1) * 7;
      const y = 390 - index * 12.2 - bounce;
      const shade = player.color;
      this.polygon([[x, y - 11], [x + 220, y - 11], [x + 240, y - 23], [x + 20, y - 23]], `${shade}da`);
      this.polygon([[x, y - 11], [x + 220, y - 11], [x + 220, y], [x, y]], shade, '#19151d');
      this.polygon([[x + 220, y - 11], [x + 240, y - 23], [x + 240, y - 12], [x + 220, y]], `${shade}8c`, '#19151d');
      this.text(player.name.slice(0, 20), x + 10, y - 2, '#211923', 9);
    });
    if (!blocks.length) this.text('WAITING FOR THE FIRST BLOCK', 439, 249, '#f8c99b', 16, 'center');
    this.text('BLOCKS', 64, 175, '#ffca8e', 13);
    this.text(`${String(blocks.length).padStart(2, '0')}/24`, 62, 211, '#fff1df', 32);
    this.text('TAP-TAP', 646, 175, '#ffca8e', 13);
    this.text(`${round?.taps ?? 0}/10`, 645, 211, '#fff1df', 32);
    for (let index = 0; index < 10; index += 1) {
      ctx.fillStyle = index < (round?.taps ?? 0) ? '#ffc77a' : '#694941';
      ctx.fillRect(646 + index * 13, 224, 9, 6);
    }
    this.text('LIVE TOWER', 31, 438, '#ffc77a', 12);
  }

  boss(round, ranked, now) {
    this.field('#4a2b54', '#daa3e741', 'SECTOR 04 / BOSS ARENA', '#f6bdff');
    const ctx = this.ctx;
    for (let x = 60; x <= 780; x += 60) this.line([[420 + (x - 420) * .23, 285], [x, 433]], '#d493ef34');
    for (const y of [300, 317, 342, 378, 433]) this.line([[49, y], [791, y]], '#d493ef26');
    for (const radius of [80, 124, 170]) {
      ctx.beginPath();
      ctx.ellipse(420, 330, radius, radius * .22, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#e5a7ff43';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const health = round?.health ?? ArcadeGames.bossHealth;
    const effect = round?.effect;
    const hit = effect && now - effect.at < 220;
    const alive = health > 0;
    const offset = round?.ended === null && !this.reducedMotion.matches ? Math.sin(now / 370) * 6 : 0;
    ctx.save();
    ctx.translate(420, alive ? 226 + offset : 245);
    if (!alive) ctx.rotate(-.13);
    const armor = hit && alive ? '#9a527e' : '#514364';
    const core = alive ? '#ff9efe' : '#887a92';
    this.polygon([[-95, -21], [-124, -40], [-158, -22], [-165, 17], [-127, 35], [-95, 11]], armor, '#b28fca');
    this.polygon([[95, -21], [124, -40], [158, -22], [165, 17], [127, 35], [95, 11]], armor, '#b28fca');
    this.polygon([[-75, 36], [75, 36], [57, 85], [-57, 85]], '#34283e', '#b28fca');
    this.polygon([[-78, -79], [78, -79], [109, -44], [91, 35], [62, 56], [-62, 56], [-91, 35], [-109, -44]], armor, '#c3a5db');
    this.polygon([[-78, -79], [78, -79], [109, -44], [-109, -44]], '#766087', '#c3a5db');
    this.polygon([[-70, -34], [70, -34], [63, 17], [-63, 17]], '#171320', '#e6aafa80');
    ctx.shadowColor = core;
    ctx.shadowBlur = alive ? 13 : 0;
    this.line([[-52, -14], [-27, -8], [-15, -8]], core, 5);
    this.line([[52, -14], [27, -8], [15, -8]], core, 5);
    this.line([[-30, 37], [30, 37]], core, 2);
    ctx.shadowBlur = 0;
    this.line([[-42, -80], [-54, -109]], '#c6a4d3', 2);
    this.line([[42, -80], [54, -109]], '#c6a4d3', 2);
    this.text('RX·09', 0, 75, '#d9bbec', 13, 'center');
    ctx.restore();

    ctx.fillStyle = '#241a30';
    ctx.fillRect(254, 76, 332, 9);
    ctx.fillStyle = '#f6a0ff';
    ctx.fillRect(254, 76, 332 * health / (round?.maxHealth ?? ArcadeGames.bossHealth), 9);
    this.text(`RX-09  /  ${health} HP`, 420, 67, '#ffe0ff', 15, 'center');
    const team = ranked.slice(0, 6);
    team.forEach((player, index) => {
      const x = 420 + (index - (team.length - 1) / 2) * 105;
      if (effect?.player === player && now - effect.at < 420 && !this.reducedMotion.matches) {
        this.line([[x, 387], [420, 294]], `${player.color}76`, effect.kind === 'gift' ? 7 : 2);
      }
      this.avatar(player, x, 386, 16);
      this.text(player.name.slice(0, 12), x, 419, '#fff1ff', 12, 'center');
    });
    if (!team.length) this.text('TAP TO JOIN THE TEAM', 420, 412, '#eac4f6', 13, 'center');
    this.text('BOSS RAID', 31, 438, '#f6a0ff', 12);
  }

  gauge(label, value, total, x, y, width, color) {
    const ctx = this.ctx;
    this.text(`${label}  /  ${Math.floor(value)} · ${total}`, x, y, '#f7ecf9', 13);
    ctx.fillStyle = '#16141f';
    ctx.fillRect(x, y + 9, width, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 9, width * value / total, 8);
  }

  crew(ranked, effect, now, target) {
    const team = ranked.slice(0, 6);
    team.forEach((player, index) => {
      const x = 420 + (index - (team.length - 1) / 2) * 106;
      if (target && effect?.player === player && now - effect.at < 370 && !this.reducedMotion.matches) {
        this.line([[x, 390], target], `${player.color}80`, effect.kind === 'gift' ? 6 : 2);
      }
      this.avatar(player, x, 389, 15);
      this.text(player.name.slice(0, 13), x, 417, '#f5eef6', 11, 'center');
    });
  }

  dragon(round, ranked, now) {
    this.field('#523036', '#ff9c733c', 'SECTOR 05 / DRAGON LAIR', '#ffb59f');
    const ctx = this.ctx;
    const maxHealth = round?.maxHealth ?? ArcadeGames.dragonHealth;
    const maxArmor = round?.maxArmor ?? ArcadeGames.dragonArmor;
    const health = round?.health ?? maxHealth;
    const armor = round?.armor ?? maxArmor;
    this.gauge('ARMOR', armor, maxArmor, 82, 73, 260, '#ffc875');
    this.gauge('HEALTH', health, maxHealth, 498, 73, 260, '#ff876f');
    this.polygon([[25, 343], [114, 305], [210, 326], [289, 289], [474, 338], [577, 306], [711, 330], [815, 296], [815, 355], [25, 355]], '#221924', '#ec825f46');
    this.line([[43, 347], [161, 332], [228, 350], [334, 333], [449, 352], [526, 335], [644, 348], [791, 332]], '#ff875b9c', 3);
    const flying = round?.ended === null && health && !this.reducedMotion.matches;
    const bob = flying ? Math.sin(now / 330) * 5 : health ? 0 : 28;
    ctx.save();
    ctx.translate(420, 224 + bob);
    if (!health) ctx.rotate(-.12);
    for (const side of [-1, 1]) {
      const wing = [[-26, -19], [-103, -73], [-227, -89], [-189, -16], [-153, 45], [-114, 16], [-55, 57]];
      this.polygon(wing.map(([x, y]) => [x * side, y]), health ? '#713e4d' : '#4d4147', '#fa8c775a');
      this.line([[-224 * side, -86], [-130 * side, -40], [-91 * side, 21]], '#f299857b', 2);
      this.line([[-131 * side, -41], [-155 * side, 40]], '#f2998550', 2);
    }
    this.polygon([[-59, 2], [59, 2], [85, 53], [67, 97], [15, 105], [68, 74], [28, 60], [-46, 78], [-86, 53]], '#884758', '#f49681');
    this.polygon([[-71, -20], [-84, -89], [-47, -61], [-23, -68], [18, -68], [48, -61], [84, -89], [71, -20], [60, 28], [31, 52], [-31, 52], [-60, 28]], armor ? '#a76c53' : '#934858', '#ff9d7d');
    this.polygon([[-50, 7], [-22, -8], [20, -8], [50, 7], [35, 34], [-35, 34]], '#4c2c39', '#ed916d');
    ctx.shadowColor = '#ff9973';
    ctx.shadowBlur = health ? 12 : 0;
    this.line([[-52, -30], [-24, -23]], health ? '#ffcf80' : '#76656c', 5);
    this.line([[52, -30], [24, -23]], health ? '#ffcf80' : '#76656c', 5);
    ctx.shadowBlur = 0;
    this.line([[-26, 24], [26, 24]], '#f58c76', 2);
    ctx.restore();
    this.crew(ranked, round?.effect, now, [420, 288 + bob]);
    if (!ranked.length) this.text('TAP TO JOIN THE TEAM', 420, 412, '#f8c6b2', 13, 'center');
  }

  meteor(round, ranked, now) {
    this.field('#25374f', '#93b6f24b', 'SECTOR 06 / METEOR SHIELD', '#a4d0ff');
    const ctx = this.ctx;
    const hull = round?.hull ?? 100;
    const shield = round?.shield ?? 0;
    const wave = round?.wave ?? 0;
    this.gauge('BASE', hull, 100, 61, 83, 218, '#a7d1ff');
    this.gauge('SHIELD', shield, 100, 560, 83, 218, '#62eff7');
    const seconds = round?.ended === null ? Math.ceil(Math.max(0, round.impactAt - now) / 1000) : 0;
    const subtitle = round?.ended === null ? `NEXT IMPACT / ${seconds} S` : 'IMPACTS SURVIVED';
    this.text(subtitle, 420, 72, '#bce5ff', 12, 'center');
    this.text(`${wave} / ${ArcadeGames.meteorWaves}`, 420, 104, '#effaff', 25, 'center');
    const impact = round?.lastImpact != null && now - round.lastImpact < 300;
    ctx.beginPath();
    ctx.ellipse(420, 327, 210, 33, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#121927';
    ctx.fill();
    ctx.strokeStyle = '#7bafe6';
    ctx.stroke();
    this.polygon([[263, 309], [325, 265], [522, 265], [581, 309], [541, 332], [303, 332]], '#3f607b', '#7cb7e1');
    this.polygon([[305, 318], [540, 318], [535, 345], [312, 345]], '#24364e', '#79a2ca');
    this.polygon([[375, 280], [401, 225], [440, 225], [465, 280], [443, 307], [397, 307]], hull ? '#607ba0' : '#5f5864', '#a4d0ff');
    this.polygon([[398, 255], [420, 239], [442, 255], [433, 282], [406, 282]], hull ? '#91edff' : '#3d3342');
    ctx.beginPath();
    ctx.ellipse(420, 307, 197, 133, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = shield ? '#77f3ff1d' : '#88a9f109';
    ctx.fill();
    ctx.strokeStyle = impact ? '#fff1d1' : shield ? '#79f3ffb0' : '#9fc8ff43';
    ctx.lineWidth = impact ? 4 : 2;
    ctx.stroke();
    if (round?.ended === null) {
      const progress = Math.min(1, Math.max(0, 1 - (round.impactAt - now) / 5000));
      const direction = wave % 2 ? -1 : 1;
      const x = 420 + direction * (268 - progress * 216);
      const y = 123 + progress * 68;
      this.line([[x + direction * 60, y - 33], [x, y]], '#ff987e55', 9);
      this.line([[x + direction * 48, y - 26], [x, y]], '#ffc08c', 2);
      this.polygon([[x - 12, y + 2], [x - 5, y - 12], [x + 11, y - 8], [x + 15, y + 4], [x + 4, y + 12]], '#ff9f7b', '#ffd5a3');
    }
    this.crew(ranked, round?.effect, now, null);
  }

  duel(round, ranked, now) {
    this.field('#43334e', '#dfb5f03d', 'SECTOR 07 / COLOR DUEL', '#ffbee1');
    const ctx = this.ctx;
    const red = '#ff8979';
    const blue = '#8fc6ff';
    this.polygon([[54, 143], [419, 143], [419, 319], [54, 319]], '#683c4788', '#ff897976');
    this.polygon([[421, 143], [786, 143], [786, 319], [421, 319]], '#374f7088', '#8fc6ff76');
    this.text('RED TEAM', 90, 116, red, 18);
    this.text('BLUE TEAM', 750, 116, blue, 18, 'right');
    const power = round?.power ?? 0;
    const center = 420 + 300 * power / ArcadeGames.duelLimit;
    this.line([[110, 232], [730, 232]], '#140f20', 24);
    for (let x = 120; x <= 720; x += 30) this.line([[x, 218], [x, 245]], '#ded5ec44');
    this.line([[420, 232], [center, 232]], power < 0 ? red : blue, 10);
    ctx.shadowColor = power < 0 ? red : blue;
    ctx.shadowBlur = 19;
    this.polygon([[center, 198], [center + 25, 232], [center, 266], [center - 25, 232]], '#fff1e7', '#ffffff');
    ctx.shadowBlur = 0;
    this.text(power ? `${Math.abs(power)} POINT LEAD` : 'TIE', 420, 292, '#fff1f6', 15, 'center');
    this.text(`!red  /  ${round?.teams.red ?? 0}`, 90, 342, red, 13);
    this.text(`!blue  /  ${round?.teams.blue ?? 0}`, 750, 342, blue, 13, 'right');
    this.crew(ranked, round?.effect, now, null);
  }

  vault(round, ranked, now) {
    this.field('#49412b', '#f5d57b3c', 'SECTOR 08 / LIVE VAULT', '#ffe4a0');
    const ctx = this.ctx;
    const unlocked = round?.unlocked ?? 0;
    const charge = round?.lockCharge ?? 0;
    const open = unlocked === 3;
    this.gauge('LOCK', open ? ArcadeGames.vaultLock : charge, ArcadeGames.vaultLock, 67, 121, 170, '#ffe08b');
    this.polygon([[280, 108], [565, 108], [604, 147], [604, 327], [565, 365], [280, 365], [241, 327], [241, 147]], '#655c45', '#c0a975');
    this.polygon([[295, 120], [550, 120], [589, 158], [589, 316], [550, 351], [295, 351], [256, 316], [256, 158]], '#252234', '#b89e60');
    if (open) {
      for (let index = 0; index < 7; index += 1) {
        const x = 313 + index * 29;
        const y = 283 - (index % 3) * 18;
        this.polygon([[x, y], [x + 61, y], [x + 53, y - 19], [x + 8, y - 19]], '#ffce66', '#fff0ab');
      }
    } else {
      for (const radius of [105, 87, 36]) {
        ctx.beginPath();
        ctx.arc(422, 233, radius, 0, 2 * Math.PI);
        ctx.fillStyle = radius === 105 ? '#504a3c' : radius === 87 ? '#383340' : '#1f1c2a';
        ctx.fill();
        ctx.strokeStyle = '#c7aa68';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const angle = this.reducedMotion.matches ? 0 : charge / 21;
      for (let spoke = 0; spoke < 6; spoke += 1) {
        const a = angle + spoke * Math.PI / 3;
        this.line([[422 + Math.cos(a) * 22, 233 + Math.sin(a) * 22], [422 + Math.cos(a) * 69, 233 + Math.sin(a) * 69]], '#c8ad73', 5);
      }
    }
    this.text(open ? 'OPEN' : 'SEALED', 423, 239, '#fff0bc', 14, 'center');
    for (let lock = 0; lock < 3; lock += 1) {
      const y = 150 + lock * 54;
      this.text(`0${lock + 1}`, 654, y, '#fff0bc', 13);
      this.line([[683, y - 5], [742, y - 5]], lock < unlocked ? '#ffe08b' : '#6d624a', 6);
    }
    this.crew(ranked, round?.effect, now, null);
  }

  rescue(round, ranked, now) {
    this.field('#233d54', '#97e6ff4a', 'SECTOR 09 / ORBITAL RESCUE', '#a5f2ff');
    const ctx = this.ctx;
    const distance = round?.distance ?? 0;
    const fuel = round?.fuel ?? 0;
    const pods = ArcadeGames.rescuePods;
    const saved = pods.filter(point => point <= distance).length;
    const point = percent => [100 + percent * 6.4, 247 - Math.sin(percent / 100 * Math.PI) * 73];
    this.gauge('FUEL', fuel, 100, 61, 79, 215, '#82e9fc');
    this.text(`PODS / ${saved} OF ${pods.length}`, 776, 80, '#a5f2ff', 15, 'right');
    ctx.beginPath();
    ctx.ellipse(426, 330, 250, 81, -.07, 0, Math.PI * 2);
    ctx.fillStyle = '#263a52';
    ctx.fill();
    ctx.strokeStyle = '#84c9ea77';
    ctx.stroke();
    for (const offset of [0, 17, 34]) this.line([[229, 294 + offset], [399, 275 + offset], [614, 301 + offset]], '#69a4ca2b', 2);
    const route = Array.from({ length: 21 }, (_, index) => point(index * 5));
    ctx.setLineDash([5, 7]);
    this.line(route, '#9edffb78', 2);
    ctx.setLineDash([]);
    pods.forEach((position, index) => {
      const [x, y] = point(position);
      const color = position <= distance ? '#91ffc8' : '#d3deff';
      this.polygon([[x, y - 11], [x + 10, y], [x, y + 11], [x - 10, y]], '#2b3c53', color);
      this.text(position <= distance ? '✓' : `${index + 1}`, x, y + 4, color, 10, 'center');
      this.text(position <= distance ? 'RESCUED' : 'POD', x, y - 20, color, 10, 'center');
    });
    const [x, y] = point(distance);
    ctx.save();
    ctx.translate(x, y + 17);
    if (fuel > 0) this.polygon([[-20, -6], [-40, 0], [-20, 6]], '#74e6f9', '#b5f3ff');
    this.polygon([[-19, -15], [1, -10], [26, 0], [1, 10], [-19, 15], [-12, 0]], '#92bde6', '#def5ff');
    this.polygon([[0, -5], [13, 0], [0, 5], [-5, 0]], '#e5faff');
    ctx.restore();
    this.text(`${Math.floor(distance)}% TRAVELED`, 420, 331, '#b7e8f7', 14, 'center');
    this.crew(ranked, round?.effect, now, null);
  }
}
