// Procedural pixel-art textures for SCC2. All top-down, team-tinted.
import Phaser from 'phaser';

const T = 32; // tile size

function makeTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  scene.textures.addCanvas(key, c);
}

function px(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

function teamHex(team, colors) {
  const n = team === 0 ? colors[0] : team === 1 ? colors[1] : colors[2];
  return '#' + n.toString(16).padStart(6, '0');
}

export const TEAM_COLORS = [[0x4ea1ff, 0xff7b2e, 0xff4fa3], [0xff7b2e, 0xffd23f, 0x9b5de5], [0xb0b7c3, 0x8d99ae, 0x6c757d]];

export function createAllTextures(scene) {
  createTerrain(scene);
  createResources(scene);
  createCreep(scene);
  createUnitTextures(scene);
  createBuildingTextures(scene);
  createFx(scene);
  createCursor(scene);
}

function createTerrain(scene) {
  // 4 ground variants + cliff tile
  const bases = [
    { key: 'g0', c1: '#1d2b1f', c2: '#233524', speck: '#2b4030' },
    { key: 'g1', c1: '#202d1e', c2: '#283625', speck: '#31422e' },
    { key: 'g2', c1: '#252a1c', c2: '#2d3222', speck: '#39412c' },
    { key: 'g3', c1: '#1c2820', c2: '#22302a', speck: '#2c3e35' }
  ];
  for (const b of bases) {
    makeTex(scene, b.key, T, T, (ctx) => {
      px(ctx, 0, 0, T, T, b.c1);
      for (let i = 0; i < 26; i++) {
        const x = (Math.random() * T) | 0, y = (Math.random() * T) | 0;
        px(ctx, x, y, 2 + ((Math.random() * 3) | 0), 1 + ((Math.random() * 2) | 0), Math.random() < 0.5 ? b.c2 : b.speck);
      }
      // subtle darker edge cracks
      for (let i = 0; i < 3; i++) {
        const x = (Math.random() * T) | 0;
        px(ctx, x, (Math.random() * T) | 0, 1, 4 + ((Math.random() * 5) | 0), 'rgba(0,0,0,0.25)');
      }
    });
  }
  makeTex(scene, 'rock', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#12161a');
    // chunky rock
    ctx.fillStyle = '#3c4450'; ctx.beginPath(); ctx.moveTo(3, 26); ctx.lineTo(8, 8); ctx.lineTo(17, 4); ctx.lineTo(27, 12); ctx.lineTo(28, 24); ctx.lineTo(14, 29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#556070'; ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(17, 4); ctx.lineTo(22, 10); ctx.lineTo(12, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20262e'; ctx.fillRect(0, 26, T, 6);
  });
  makeTex(scene, 'rock2', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#12161a');
    ctx.fillStyle = '#47505e'; ctx.beginPath(); ctx.moveTo(4, 20); ctx.lineTo(10, 6); ctx.lineTo(24, 8); ctx.lineTo(26, 22); ctx.lineTo(16, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#646f80'; ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(24, 8); ctx.lineTo(18, 14); ctx.closePath(); ctx.fill();
  });
}

function createResources(scene) {
  // mineral cluster 32x32, sparkling blue crystals
  makeTex(scene, 'minerals', T, T, (ctx) => {
    px(ctx, 0, 24, T, 8, 'rgba(0,0,0,0.3)');
    const crystal = (x, y, w, h, c1, c2) => {
      ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h * 0.7); ctx.lineTo(x + w * 0.7, y + h); ctx.lineTo(x + w * 0.25, y + h); ctx.lineTo(x, y + h * 0.65); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h * 0.7); ctx.lineTo(x + w * 0.55, y + h * 0.6); ctx.closePath(); ctx.fill();
    };
    crystal(6, 6, 10, 18, '#3f78cf', '#7db4ff');
    crystal(15, 2, 9, 22, '#356bbd', '#69a6ff');
    crystal(22, 8, 8, 16, '#2f5ca3', '#5e97e8');
    crystal(2, 12, 7, 12, '#356bbd', '#69a6ff');
    px(ctx, 8, 10, 2, 3, '#cfe6ff'); px(ctx, 18, 6, 2, 4, '#cfe6ff'); px(ctx, 24, 12, 1, 3, '#bcd9ff');
  });
  // vespene geyser
  makeTex(scene, 'geyser', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#1a2024');
    ctx.fillStyle = '#2e3840'; ctx.beginPath(); ctx.arc(16, 18, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a4650'; ctx.beginPath(); ctx.arc(16, 16, 7, 0, Math.PI * 2); ctx.fill();
    px(ctx, 12, 12, 8, 8, '#4affc8');
    px(ctx, 14, 8, 4, 6, '#7dffd9');
    ctx.globalAlpha = 0.5; px(ctx, 13, 4, 6, 4, '#b8ffe9'); px(ctx, 15, 0, 3, 4, '#d8fff4'); ctx.globalAlpha = 1;
  });
}

function createCreep(scene) {
  makeTex(scene, 'creep', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#3d1f2e');
    for (let i = 0; i < 30; i++) {
      px(ctx, (Math.random() * T) | 0, (Math.random() * T) | 0, 2, 2, Math.random() < 0.5 ? '#52293d' : '#2e1622');
    }
    ctx.fillStyle = '#6b3550';
    ctx.beginPath(); ctx.arc(8, 10, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(22, 20, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(15, 26, 2, 0, 7); ctx.fill();
  });
  makeTex(scene, 'creep-node', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#452434');
    ctx.fillStyle = '#7a4060'; ctx.beginPath(); ctx.arc(16, 16, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#a85c84'; ctx.beginPath(); ctx.arc(16, 16, 3, 0, 7); ctx.fill();
  });
}

function createUnitTextures(scene) {
  // Each unit: 20x20 canvas top-down sprite per team tint.
  const defs = {
    scv: (ctx, col) => {
      px(ctx, 5, 4, 10, 12, '#697079'); px(ctx, 6, 5, 8, 6, col); // torso + visor
      px(ctx, 3, 6, 2, 6, '#525860'); px(ctx, 15, 6, 2, 6, '#525860'); // arms
      px(ctx, 6, 16, 3, 3, '#3c4248'); px(ctx, 11, 16, 3, 3, '#3c4248'); // feet
      px(ctx, 14, 2, 4, 3, '#d9c26a'); // tool arm
    },
    marine: (ctx, col) => {
      px(ctx, 5, 3, 10, 14, col); px(ctx, 6, 4, 8, 4, '#0e1620'); // helmet visor
      px(ctx, 3, 8, 2, 5, col); px(ctx, 15, 8, 2, 5, col);
      px(ctx, 16, 9, 4, 2, '#2b323b'); // rifle
      px(ctx, 7, 17, 2, 2, '#222831'); px(ctx, 11, 17, 2, 2, '#222831');
      px(ctx, 7, 2, 6, 2, '#ffffff'); // helmet stripe
    },
    firebat: (ctx, col) => {
      px(ctx, 5, 3, 10, 14, '#8a3b1e'); px(ctx, 6, 4, 8, 4, '#ff9d3c');
      px(ctx, 3, 7, 2, 6, '#6e2f17'); px(ctx, 15, 7, 2, 6, '#6e2f17');
      px(ctx, 16, 8, 5, 3, '#ffb03c'); // flame nozzle
      px(ctx, 20, 8, 3, 3, '#ffe27a');
      px(ctx, 6, 17, 2, 2, '#222831'); px(ctx, 11, 17, 2, 2, '#222831');
    },
    tank: (ctx, col) => {
      px(ctx, 2, 5, 16, 12, '#5b6470'); px(ctx, 3, 6, 14, 4, col);
      px(ctx, 14, 9, 10, 3, '#3c434c'); // barrel
      px(ctx, 2, 5, 16, 2, '#727c8a'); px(ctx, 2, 15, 16, 2, '#727c8a'); // tread edges
      px(ctx, 8, 10, 4, 4, '#8b95a3');
    },
    vulture: (ctx, col) => {
      px(ctx, 3, 7, 14, 8, col); px(ctx, 13, 5, 6, 4, '#3c434c'); // gun pod
      px(ctx, 4, 15, 3, 3, '#1e2229'); px(ctx, 12, 15, 3, 3, '#1e2229'); // wheels
      px(ctx, 5, 8, 8, 3, '#ffd9a0');
      px(ctx, 17, 6, 4, 2, '#ff7b2e');
    },
    goliath: (ctx, col) => {
      px(ctx, 4, 4, 12, 12, '#4a5462'); px(ctx, 5, 5, 10, 4, col);
      px(ctx, 2, 2, 4, 8, '#39424e'); px(ctx, 14, 2, 4, 8, '#39424e'); // rockets pods
      px(ctx, 3, 3, 2, 1, '#ff5a5a'); px(ctx, 15, 3, 2, 1, '#ff5a5a');
      px(ctx, 15, 10, 6, 3, '#2c333d'); //链 gun
      px(ctx, 6, 16, 3, 3, '#313842'); px(ctx, 11, 16, 3, 3, '#313842');
    },
    wraith: (ctx, col) => {
      ctx.fillStyle = '#414b58'; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(18, 8); ctx.lineTo(20, 16); ctx.lineTo(2, 16); ctx.lineTo(4, 8); ctx.closePath(); ctx.fill();
      px(ctx, 7, 5, 6, 4, col); px(ctx, 1, 12, 4, 2, '#2c333d'); px(ctx, 15, 12, 4, 2, '#2c333d');
      px(ctx, 9, 16, 2, 3, '#ff9c3c'); // thruster
      px(ctx, 8, 10, 4, 2, '#8fd0ff');
    },
    bc: (ctx, col) => {
      ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(16, 2); ctx.lineTo(18, 10); ctx.lineTo(14, 16); ctx.lineTo(2, 12); ctx.closePath(); ctx.fill();
      px(ctx, 6, 4, 8, 3, col); px(ctx, 14, 4, 6, 2, '#2c333d'); px(ctx, 14, 8, 6, 2, '#2c333d');
      px(ctx, 2, 12, 4, 2, '#7a8794'); px(ctx, 4, 14, 3, 2, '#3d444d');
      px(ctx, 8, 8, 4, 4, '#9fb4c8');
    },
    ghost: (ctx, col) => {
      px(ctx, 5, 4, 10, 12, '#3d4450'); px(ctx, 6, 5, 8, 4, col);
      px(ctx, 4, 8, 2, 5, '#333a45'); px(ctx, 14, 8, 2, 5, '#333a45');
      px(ctx, 15, 9, 5, 2, '#20252c'); // sniper
      px(ctx, 7, 2, 6, 2, '#5f6c7d');
    },
    drone: (ctx, col) => {
      ctx.fillStyle = '#7a4520'; ctx.beginPath(); ctx.arc(10, 11, 6, 0, 7); ctx.fill();
      px(ctx, 7, 5, 6, 3, col); // carapace top
      px(ctx, 2, 8, 3, 2, '#5e3517'); px(ctx, 15, 8, 3, 2, '#5e3517'); // side legs
      px(ctx, 4, 14, 2, 3, '#5e3517'); px(ctx, 14, 14, 2, 3, '#5e3517');
      px(ctx, 8, 3, 4, 2, '#f0b060');
    },
    zergling: (ctx, col) => {
      ctx.fillStyle = '#8f4a1e'; ctx.beginPath(); ctx.arc(10, 12, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#c96a24'; ctx.beginPath(); ctx.arc(10, 6, 4, 0, 7); ctx.fill(); // head
      px(ctx, 5, 3, 2, 3, '#ffe9c2'); px(ctx, 13, 3, 2, 3, '#ffe9c2'); // claws
      px(ctx, 8, 5, 4, 2, col); // back spine tint
      px(ctx, 3, 12, 2, 2, '#6b3513'); px(ctx, 15, 12, 2, 2, '#6b3513');
    },
    hydra: (ctx, col) => {
      ctx.fillStyle = '#3c6b40'; ctx.beginPath(); ctx.arc(9, 12, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#5d8f52'; ctx.beginPath(); ctx.arc(10, 6, 3.5, 0, 7); ctx.fill(); // head
      px(ctx, 14, 5, 6, 2, '#8bbf7a'); // spined ridge
      px(ctx, 13, 7, 4, 1, col);
      px(ctx, 4, 14, 2, 3, '#2f5233'); px(ctx, 12, 14, 2, 3, '#2f5233');
    },
    muta: (ctx, col) => {
      ctx.fillStyle = '#4a3b6e'; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(16, 8); ctx.lineTo(13, 15); ctx.lineTo(5, 13); ctx.lineTo(2, 7); ctx.closePath(); ctx.fill();
      px(ctx, 6, 5, 6, 3, col);
      ctx.fillStyle = '#6b55a0'; ctx.fillRect(0, 9, 6, 2); ctx.fillRect(14, 9, 6, 2); // wings
      px(ctx, 8, 13, 3, 3, '#37284f');
    },
    ultra: (ctx, col) => {
      ctx.fillStyle = '#7a3a22'; ctx.beginPath(); ctx.arc(10, 10, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#a05030'; ctx.beginPath(); ctx.arc(10, 6, 5, 0, 7); ctx.fill();
      px(ctx, 3, 2, 3, 4, '#ffe9c2'); px(ctx, 14, 2, 3, 4, '#ffe9c2'); // tusks
      px(ctx, 7, 7, 6, 3, col);
      px(ctx, 1, 12, 3, 3, '#57291763'); px(ctx, 16, 12, 3, 3, '#572917');
      px(ctx, 5, 16, 3, 3, '#572917'); px(ctx, 12, 16, 3, 3, '#572917');
    },
    overlord: (ctx, col) => {
      ctx.fillStyle = '#7a5030'; ctx.beginPath(); ctx.arc(10, 9, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#5e3b20'; ctx.beginPath(); ctx.arc(10, 12, 4, 0, 7); ctx.fill(); // lower pouch
      px(ctx, 6, 6, 8, 3, col);
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#c98d55';
      ctx.beginPath(); ctx.arc(3, 12, 3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(17, 12, 3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    },
    scourge: (ctx, col) => {
      ctx.fillStyle = '#556b2f'; ctx.beginPath(); ctx.arc(10, 10, 4.5, 0, 7); ctx.fill();
      px(ctx, 6, 2, 2, 5, '#88aa44'); px(ctx, 12, 2, 2, 5, '#88aa44');
      px(ctx, 8, 14, 4, 3, col);
    },
    lurker: (ctx, col) => {
      ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.ellipse(10, 12, 7, 5, 0, 0, 7); ctx.fill();
      px(ctx, 8, 4, 4, 8, '#8a6238');
      px(ctx, 7, 2, 6, 2, '#d9c290'); // spikes
      px(ctx, 8, 7, 4, 2, col);
    },
    probe: (ctx, col) => {
      ctx.fillStyle = '#5a5f7a'; ctx.beginPath(); ctx.arc(10, 10, 5, 0, 7); ctx.fill();
      px(ctx, 8, 3, 4, 4, col);
      ctx.fillStyle = '#7d84a8'; ctx.fillRect(2, 9, 3, 2); ctx.fillRect(15, 9, 3, 2);
      ctx.globalAlpha = 0.7; px(ctx, 8, 15, 4, 3, '#9fb0ff'); ctx.globalAlpha = 1; // hover glow
    },
    zealot: (ctx, col) => {
      px(ctx, 6, 4, 8, 12, '#7d6bc4');
      px(ctx, 7, 5, 6, 3, col); // face guard
      ctx.fillStyle = '#9f8fe0'; ctx.fillRect(1, 7, 3, 2); ctx.fillRect(16, 7, 3, 2); // arm blades mount
      px(ctx, 0, 6, 2, 6, '#cfe0ff'); px(ctx, 18, 6, 2, 6, '#cfe0ff'); // vibro blades glow
      px(ctx, 7, 16, 2, 3, '#4b3f7e'); px(ctx, 11, 16, 2, 3, '#4b3f7e');
    },
    dragoon: (ctx, col) => {
      px(ctx, 4, 8, 12, 8, '#4b5563'); px(ctx, 5, 9, 10, 3, col);
      px(ctx, 14, 8, 6, 3, '#333a45'); // blaster
      ctx.fillStyle = '#6b7686'; ctx.fillRect(2, 14, 4, 3); ctx.fillRect(14, 14, 4, 3); // legs
      px(ctx, 7, 5, 6, 4, '#8b95a3'); px(ctx, 8, 6, 4, 2, '#aef');
    },
    htemplar: (ctx, col) => {
      px(ctx, 6, 4, 8, 12, '#e8e4d8'); px(ctx, 7, 5, 6, 3, col);
      px(ctx, 3, 8, 2, 5, '#cfc9b8'); px(ctx, 15, 8, 2, 5, '#cfc9b8');
      px(ctx, 8, 2, 4, 2, '#b0a888'); // headpiece
    },
    dtemplar: (ctx, col) => {
      px(ctx, 6, 4, 8, 12, '#2c2440'); px(ctx, 7, 5, 6, 3, col);
      px(ctx, 3, 7, 2, 6, '#1e1830'); px(ctx, 15, 7, 2, 6, '#1e1830');
      px(ctx, 16, 6, 5, 2, '#b060ff'); // warp blade
    },
    archon: (ctx, col) => {
      ctx.fillStyle = '#8fb4ff'; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(10, 10, 7, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#cfe0ff'; ctx.beginPath(); ctx.arc(10, 10, 4, 0, 7); ctx.fill();
      px(ctx, 6, 8, 8, 2, col);
      px(ctx, 8, 2, 4, 3, '#ffffff');
    },
    carrier: (ctx, col) => {
      ctx.fillStyle = '#6f7f95'; ctx.beginPath(); ctx.moveTo(2, 6); ctx.lineTo(18, 3); ctx.lineTo(20, 12); ctx.lineTo(4, 16); ctx.closePath(); ctx.fill();
      px(ctx, 4, 7, 12, 4, col);
      px(ctx, 6, 12, 8, 2, '#4a586b'); // flight deck
      px(ctx, 8, 14, 4, 1, '#9fc8ff');
      ctx.fillStyle = '#55657a'; ctx.fillRect(14, 2, 5, 3);
    }
  };

  for (const [kind, fn] of Object.entries(defs)) {
    for (let team = 0; team < 3; team++) {
      const col = team === 0 ? '#4ea1ff' : team === 1 ? '#ff7b2e' : '#ff4fa3';
      makeTex(scene, `u-${kind}-t${team}`, 20, 20, (ctx) => fn(ctx, col));
    }
  }
}

function createBuildingTextures(scene) {
  // key: b-{buildId}-t{team} at TILE multiples
  const drawPanel = (ctx, w, h, base, edge, roof, accent) => {
    ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = base; ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = roof; ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = accent; ctx.fillRect(6, 6, Math.max(4, (w - 12) * 0.4), 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, h - 4, w, 4); // shadow
  };
  for (let team = 0; team < 3; team++) {
    const col = team === 0 ? '#4ea1ff' : team === 1 ? '#ff7b2e' : '#ff4fa3';
    const dark = team === 0 ? '#1d3a63' : team === 1 ? '#6e3512' : '#5b3f9e';

    // command center 5x4 tiles
    makeTex(scene, 'b-commandCenter-t0', 5 * T, 4 * T, (ctx) => {
      const w = 5 * T, h = 4 * T;
      drawPanel(ctx, w, h, '#5b6675', '#2e343c', '#6d798a', col);
      px(ctx, 24, 24, w - 60, 20, '#39424e'); // landing pad
      px(ctx, 26, 26, w - 64, 16, '#20262d');
      px(ctx, 6, 6, w - 12, 3, '#8fa2ff'); // glow strip
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 4, 8, 0, 7); ctx.fill();
    });
    // hatchery 4x4
    makeTex(scene, 'b-hatchery-t1', 4 * T, 4 * T, (ctx) => {
      const w = 4 * T, h = 4 * T;
      ctx.fillStyle = '#5e3320'; ctx.beginPath(); ctx.arc(w / 2, h / 2 + 4, w / 2 - 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#7c4527'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#a05c30'; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 6, 14, 0, 7); ctx.fill();
      px(ctx, 4, h - 10, 10, 6, '#40222f'); // ramp
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 8, 5, 0, 7); ctx.fill();
    });
    // nexus 5x4
    makeTex(scene, 'b-nexus-t2', 5 * T, 4 * T, (ctx) => {
      const w = 5 * T, h = 4 * T;
      ctx.fillStyle = '#4a586b'; ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w - 8, h / 2); ctx.lineTo(w / 2, h - 6); ctx.lineTo(8, h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#65758c'; ctx.beginPath(); ctx.moveTo(w / 2, 12); ctx.lineTo(w - 22, h / 2); ctx.lineTo(w / 2, h - 16); ctx.lineTo(22, h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2, h / 2, 7, 0, 7); ctx.fill();
      px(ctx, 0, h - 4, w, 4, 'rgba(0,0,0,0.45)');
    });

    // generic sized buildings per race/size
    const sizes = { supplyDepot: [2, 2], refinery: [4, 3], barracks: [4, 3], factory: [4, 3], starport: [4, 3], academy: [3, 3], missileTurret: [2, 2], engineeringBay: [2, 2], scienceFacility: [4, 3], machineShop: [2, 2],
      evolutionChamber: [3, 3], spawningPool: [3, 3], hydraliskDen: [3, 3], spire: [3, 3], ultraliskCavern: [3, 3], sporeColony: [2, 2], extractor: [4, 3], lair: [4, 4], hive: [4, 4], creepColony: [2, 2],
      pylon: [2, 2], gateway: [3, 3], roboticsFacility: [4, 3], cyberneticsCore: [3, 3], roboticsTechFacility: [3, 3], templarArchives: [3, 3], council: [3, 3], stargate: [4, 3], photonCannon: [2, 2], forge: [2, 2], assimulator: [4, 3], fleetBeacon: [3, 3], controlTower: [2, 2] };

    for (const [bid, [tw, th]] of Object.entries(sizes)) {
      for (let team = 0; team < 3; team++) {
        const tcol = team === 0 ? '#4ea1ff' : team === 1 ? '#ff7b2e' : '#ff4fa3';
        const base = team === 0 ? '#525c6a' : team === 1 ? '#6b3d22' : '#4c4a72';
        const roof = team === 0 ? '#67727f' : team === 1 ? '#87502c' : '#63618f';
        const edge = team === 0 ? '#2b313a' : team === 1 ? '#42250f' : '#2f2e4a';
        const key = `b-${bid}-t${team}`;
        if (scene.textures.exists(key)) continue;
        makeTex(scene, key, tw * T, th * T, (ctx) => {
          const w = tw * T, h = th * T;
          if (bid === 'pylon') {
            ctx.fillStyle = tcol; ctx.fillRect(w / 2 - 4, 2, 8, h - 4);
            ctx.fillStyle = '#8b95a3'; ctx.fillRect(w / 2 - 6, h / 2 - 3, 12, 6);
            ctx.globalAlpha = 0.4; ctx.fillStyle = '#ffffff'; ctx.fillRect(w / 2 - 2, 4, 4, h - 8); ctx.globalAlpha = 1;
            return;
          }
          if (bid === 'photonCannon' || bid === 'missileTurret' || bid === 'sporeColony') {
            ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 1, 0, 7); ctx.fill();
            ctx.fillStyle = base; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, 7); ctx.fill();
            ctx.fillStyle = roof; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 2, w / 2 - 9, 0, 7); ctx.fill();
            ctx.fillStyle = tcol; ctx.fillRect(w / 2 - 3, h / 2 - 3, 6, 6);
            if (bid === 'missileTurret') { px(ctx, w / 2 - 1, 2, 2, 8, '#ff5a5a'); px(ctx, w / 2 + 3, 3, 2, 7, '#ffd23f'); }
            return;
          }
          drawPanel(ctx, w, h, base, edge, roof, tcol);
          if (bid === 'barracks' || bid === 'factory' || bid === 'starport' || bid === 'gateway' || bid === 'roboticsFacility' || bid === 'stargate') {
            px(ctx, 6, h - 10, 12, 6, '#101418'); // door
            px(ctx, 7, h - 9, 10, 4, '#1c222a');
          }
          if (bid === 'spire' || bid === 'cyberneticsCore' || bid === 'templarArchives') {
            ctx.globalAlpha = 0.8; ctx.fillStyle = tcol; ctx.beginPath(); ctx.arc(w / 2, h / 2, 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          }
        });
      }
    }
    // terran command center exists; hatchery/nexus exist. skip duplicates.
  }
}

function createFx(scene) {
  makeTex(scene, 'spark', 8, 8, (ctx) => {
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(4, 4, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(3, 3, 2, 2);
  });
  makeTex(scene, 'explosion', 40, 40, (ctx) => {
    ctx.fillStyle = '#ff9c3c'; ctx.beginPath(); ctx.arc(20, 20, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(20, 20, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(20, 20, 5, 0, 7); ctx.fill();
  });
  makeTex(scene, 'storm', 64, 64, (ctx) => {
    ctx.fillStyle = 'rgba(160,90,255,0.5)'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,150,255,0.6)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(16 + Math.random() * 32, 16 + Math.random() * 32, 6, 0, 7); ctx.fill(); }
  });
  makeTex(scene, 'lift-glow', 32, 12, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 12);
    g.addColorStop(0, '#9fc8ff'); g.addColorStop(1, 'rgba(159,200,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 12);
  });
  // persistent death scorch decal
  makeTex(scene, 'scorch', 24, 24, (ctx) => {
    ctx.fillStyle = 'rgba(20,14,10,0.75)'; ctx.beginPath(); ctx.ellipse(12, 12, 11, 8, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(45,32,22,0.6)'; ctx.beginPath(); ctx.ellipse(10, 11, 6, 4, 0.8, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(80,55,35,0.5)'; ctx.fillRect(6, 14, 3, 2); ctx.fillRect(15, 8, 2, 2);
  });
  // blood splat for hits
  makeTex(scene, 'blood', 10, 10, (ctx) => {
    ctx.fillStyle = '#b3372e'; ctx.beginPath(); ctx.arc(5, 5, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#8f2b24'; ctx.fillRect(2, 4, 2, 2); ctx.fillRect(7, 6, 2, 1);
  });
}

function createCursor(scene) {
  makeTex(scene, 'crosshair', 16, 16, (ctx) => {
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, 8, 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8, 4); ctx.moveTo(8, 12); ctx.lineTo(8, 16); ctx.moveTo(0, 8); ctx.lineTo(4, 8); ctx.moveTo(12, 8); ctx.lineTo(16, 8); ctx.stroke();
  });
}

export { makeTex };
