const ArcadeGames = (() => {
  const raceGoal = 1000;
  const towerGoal = 24;
  const bossHealth = 240;
  const dragonHealth = 260;
  const dragonArmor = 90;
  const tapsPerBlock = 10;
  const palette = ['#76f5d2', '#ffa984', '#bfb4ff', '#ffe086', '#8fc6ff', '#ffa8db', '#c7f181'];

  const modes = {
    race: {
      title: 'Turbo Sprint', label: 'RACE / 02', seconds: 30, color: '#71f7d1',
      canvasLabel: 'Race track with viewer avatars', unit: 'Distance traveled', suffix: ' m',
      like: 'Tap to move your avatar toward the finish.', gift: 'Gifts give your avatar a turbo boost.',
      objective: 'Reach 1,000 m first or lead when time runs out.'
    },
    tower: {
      title: 'LIVE Tower', label: 'BUILD / 03', seconds: 35, color: '#ffc77a',
      canvasLabel: 'Tower of blocks labeled with the builders\' names', unit: 'Blocks placed', suffix: '',
      like: 'Every 10 team taps add a block.', gift: 'Gifts add 2 to 4 blocks.',
      objective: 'Build a 24-block tower together.'
    },
    boss: {
      title: 'Boss Raid', label: 'BATTLE / 04', seconds: 60, color: '#f6a0ff',
      canvasLabel: 'Robot arena with a health bar and viewer team', unit: 'Damage dealt', suffix: ' HP',
      like: 'Each tap deals 1 damage.', gift: 'Gifts deal 18, 30, or 42 damage.',
      objective: 'Defeat the robot before time runs out.'
    },
    dragon: {
      title: 'Dragon Raid', label: 'BATTLE / 05', seconds: 60, color: '#ff9773',
      canvasLabel: 'Dragon with armor, health, and viewer team', unit: 'Damage dealt', suffix: ' HP',
      like: 'Each tap deals 1 damage. Break the armor first.', gift: 'Gifts launch fire attacks that deal up to 76 damage.',
      objective: 'Break the armor and defeat the dragon before time runs out.'
    },
    meteor: {
      title: 'Meteor Shield', label: 'DEFENSE / 06', seconds: 40, color: '#92c8ff',
      canvasLabel: 'Base and shield under meteor attack', unit: 'Shield and repairs', suffix: ' pts',
      like: 'Each tap adds 1 shield point.', gift: 'Gifts repair the base and add 12 shield points.',
      objective: 'Protect the base from seven meteors. One hits every five seconds.'
    },
    duel: {
      title: 'Color Duel', label: 'TEAMS / 07', seconds: 35, color: '#ff9fcb',
      canvasLabel: 'Red and blue team showdown', unit: 'Team points', suffix: ' pts',
      like: 'Type !red or !blue to pick a team, then tap to score.', gift: 'Gifts add up to 34 points for your team.',
      objective: 'Build a 120-point lead or lead when time runs out.'
    },
    vault: {
      title: 'LIVE Vault', label: 'PUZZLE / 08', seconds: 35, color: '#ffe08b',
      canvasLabel: 'Vault with three locks and team progress', unit: 'Unlock points', suffix: ' pts',
      like: 'Collect 55 taps per lock.', gift: 'A gift adds at least 55 unlock points.',
      objective: 'Open all three locks before time runs out.'
    },
    rescue: {
      title: 'Orbital Rescue', label: 'RESCUE / 09', seconds: 40, color: '#8ce6fc',
      canvasLabel: 'Shuttle and three rescue pods', unit: 'Fuel and boost', suffix: ' pts',
      like: 'Each tap adds 1 fuel point.', gift: 'Gifts refuel the shuttle and advance it by 10% of the route.',
      objective: 'Rescue all three pods and reach the end of the route.'
    }
  };

  const rescuePods = [27, 55, 85];
  const duelLimit = 120;
  const vaultLock = 55;
  const meteorWaves = 7;
  const challenges = {
    dragon: {
      act(round, player, count, tier, gift, now) {
        const damage = Math.min(round.armor + round.health, gift ? [30, 52, 76][tier] : count);
        const armorDamage = Math.min(round.armor, damage);
        round.armor -= armorDamage;
        round.health -= damage - armorDamage;
        player.score += damage;
        if (!round.health) finish(round, now);
        return `Fire attack · ${damage} damage`;
      },
      result: round => round.health ? `The dragon survived with ${round.health} HP and ${round.armor} armor.` : 'Dragon defeated!'
    },
    meteor: {
      initial: now => ({ hull: 100, shield: 0, wave: 0, impactAt: now + 5000, lastImpact: null }),
      advance(round, until) {
        while (until >= round.impactAt && round.ended === null) {
          const threat = 22 + round.wave * 3;
          const absorbed = Math.min(threat, round.shield);
          round.shield -= absorbed;
          round.hull = Math.max(0, round.hull - (threat - absorbed));
          round.wave += 1;
          round.lastImpact = round.impactAt;
          round.impactAt += 5000;
          if (!round.hull || round.wave === meteorWaves) finish(round, round.lastImpact);
        }
      },
      act(round, player, count, tier, gift) {
        const charge = Math.min(100 - round.shield, gift ? 12 : count);
        const heal = gift ? Math.min(100 - round.hull, [18, 30, 44][tier]) : 0;
        round.shield += charge;
        round.hull += heal;
        player.score += charge + heal;
        return `+${heal} base HP · +${charge} shield`;
      },
      result: round => !round.hull ? `The base fell on impact ${round.wave}.` : round.wave === meteorWaves ? `The base survived all seven impacts with ${round.hull}% health.` : `The round ended after ${round.wave} impacts.`
    },
    duel: {
      initial: () => ({ power: 0, teams: { red: 0, blue: 0 } }),
      join(round, player) {
        player.team ??= round.teams.red <= round.teams.blue ? 'red' : 'blue';
        round.teams[player.team] += 1;
        player.color = player.team === 'red' ? '#ff8979' : '#8fc6ff';
      },
      act(round, player, count, tier, gift, now) {
        const direction = player.team === 'red' ? -1 : 1;
        const power = Math.min(duelLimit - round.power * direction, gift ? [12, 22, 34][tier] : count);
        round.power += direction * power;
        player.score += power;
        if (Math.abs(round.power) === duelLimit) finish(round, now);
        return `+${power} team points`;
      },
      result: round => round.power === 0 ? 'The teams tied.' : `The ${round.power < 0 ? 'red' : 'blue'} team wins the duel.`
    },
    vault: {
      initial: () => ({ unlocked: 0, lockCharge: 0 }),
      act(round, player, count, tier, gift, now) {
        const previous = round.unlocked;
        const progress = round.unlocked * vaultLock + round.lockCharge;
        const charge = Math.min(3 * vaultLock - progress, gift ? [55, 75, 95][tier] : count);
        const updated = progress + charge;
        round.unlocked = Math.floor(updated / vaultLock);
        round.lockCharge = updated % vaultLock;
        player.score += charge;
        if (round.unlocked === 3) finish(round, now);
        return `+${round.unlocked - previous} locks opened`;
      },
      result: round => round.unlocked === 3 ? 'Vault open! The team unlocked all three locks.' : `The team opened ${round.unlocked} of 3 locks.`
    },
    rescue: {
      initial: () => ({ distance: 0, fuel: 0 }),
      advance(round, until) {
        const time = Math.min((until - round.lastTick) / 1000, round.fuel / 7, (100 - round.distance) / 5);
        round.fuel = Math.max(0, round.fuel - time * 7);
        round.distance = Math.min(100, round.distance + time * 5);
        if (round.distance >= 99.9999) {
          round.distance = 100;
          finish(round, round.lastTick + time * 1000);
        }
      },
      act(round, player, count, tier, gift, now) {
        const charge = Math.min(100 - round.fuel, gift ? [20, 32, 45][tier] : count);
        const jump = gift ? Math.min(100 - round.distance, 10) : 0;
        round.fuel += charge;
        round.distance += jump;
        player.score += charge + jump;
        if (round.distance === 100) finish(round, now);
        return 'Orbital boost · tanks refueled';
      },
      result: round => round.distance === 100 ? 'Rescue complete! The shuttle arrived with all three pods.' : `${rescuePods.filter(point => point <= round.distance).length}/3 pods rescued at ${Math.floor(round.distance)}% of the route.`
    }
  };

  function isRaid(mode) {
    return mode === 'boss' || mode === 'dragon';
  }

  function create(mode, demo, now, viewers = 1) {
    const raidViewers = isRaid(mode) ? Math.max(1, Math.min(100, viewers)) : 0;
    const scale = Math.sqrt(raidViewers || 1);
    const seconds = raidViewers
      ? Math.max(35, modes[mode].seconds - Math.round(5 * Math.log2(raidViewers)))
      : modes[mode].seconds;
    const maxHealth = Math.round((mode === 'dragon' ? dragonHealth : bossHealth) * scale);
    const maxArmor = mode === 'dragon' ? Math.round(dragonArmor * scale) : 0;
    return {
      mode, demo, players: new Map(), started: now, lastTick: now,
      deadline: now + seconds * 1000, ended: null,
      raidViewers, health: maxHealth, maxHealth, armor: maxArmor, maxArmor,
      blocks: [], taps: 0, effect: null, result: '', ...challenges[mode]?.initial?.(now)
    };
  }

  function rankings(round) {
    return [...round.players.values()].sort((a, b) => b.score - a.score);
  }

  function finish(round, now) {
    if (round.ended !== null) return;
    round.ended = now;
    const leader = rankings(round)[0];
    if (!leader) round.result = 'The round ended with no players.';
    else if (challenges[round.mode]) round.result = challenges[round.mode].result(round);
    else if (round.mode === 'race') round.result = `${leader.name} wins the race with ${Math.min(raceGoal, Math.floor(leader.score))} m.`;
    else if (round.mode === 'tower') round.result = round.blocks.length === towerGoal ? 'Tower complete! The team placed all 24 blocks.' : `The team placed ${round.blocks.length} of ${towerGoal} blocks.`;
    else round.result = round.health === 0 ? 'Boss defeated!' : `The boss survived with ${round.health} HP.`;
    if (round.raidViewers && leader?.score > 0) {
      round.result += ` Hero: ${leader.name} (${leader.score.toLocaleString('en-US')} damage).`;
    }
  }

  function tick(round, now) {
    if (round.ended !== null) return;
    const until = Math.max(round.lastTick, Math.min(now, round.deadline));
    challenges[round.mode]?.advance?.(round, until);
    if (round.mode === 'race') {
      for (const player of round.players.values()) {
        const elapsed = until - round.lastTick;
        const turbo = Math.max(0, Math.min(until, player.boostUntil) - round.lastTick);
        player.score += elapsed * .016 + turbo * .080;
      }
    }
    round.lastTick = until;
    if (now >= round.deadline || (round.mode === 'race' && [...round.players.values()].some(player => player.score >= raceGoal))) {
      finish(round, until);
    }
  }

  function addBlocks(round, player, count, now) {
    const placed = Math.min(count, towerGoal - round.blocks.length);
    for (let index = 0; index < placed; index += 1) round.blocks.push({ player, at: now });
    player.score += placed;
    if (round.blocks.length >= towerGoal) finish(round, now);
    return placed;
  }

  function apply(round, event, now) {
    tick(round, now);
    if (round.ended !== null) return;
    const { actor, kind, count } = event;
    let player = round.players.get(actor.key);
    if (!player) {
      player = { ...actor, color: palette[round.players.size % palette.length], score: 0, boostUntil: 0, actionAt: -Infinity };
      round.players.set(actor.key, player);
      challenges[round.mode]?.join?.(round, player);
    } else if (!player.avatar && actor.avatar) {
      player.avatar = actor.avatar;
    }
    if (kind === 'join') return player;

    const tier = count >= 100 ? 2 : count >= 25 ? 1 : 0;
    let label = '';
    player.actionAt = now;
    if (challenges[round.mode]) {
      label = challenges[round.mode].act(round, player, count, tier, kind === 'gift', now);
    } else if (round.mode === 'race') {
      if (kind === 'like') {
        player.score += count * 6;
        if (player.score >= raceGoal) finish(round, now);
      } else {
        const duration = [2500, 3100, 4000][tier];
        player.boostUntil = Math.min(now + 8000, Math.max(now, player.boostUntil) + duration);
        label = 'Turbo activated';
      }
    } else if (round.mode === 'tower') {
      if (kind === 'like') {
        round.taps += count;
        const earned = Math.floor(round.taps / tapsPerBlock);
        round.taps %= tapsPerBlock;
        addBlocks(round, player, earned, now);
      } else {
        const placed = addBlocks(round, player, 2 + tier, now);
        label = `+${placed} blocks`;
      }
    } else {
      const damage = Math.min(round.health, kind === 'gift' ? [18, 30, 42][tier] : count);
      round.health -= damage;
      player.score += damage;
      if (kind === 'gift') label = `Heavy hit · ${damage} damage`;
      if (round.health <= 0) finish(round, now);
    }
    round.effect = { at: now, player, kind, label };
    return player;
  }

  return { modes, raceGoal, towerGoal, bossHealth, dragonHealth, dragonArmor, tapsPerBlock, duelLimit, vaultLock, meteorWaves, rescuePods, isRaid, create, apply, tick, finish, rankings };
})();
