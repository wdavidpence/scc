export const MAP_ORDER = ['baseline', 'chokepoint', 'flank', 'island'];

export const MAPS = {
  baseline: {
    id: 'baseline',
    label: 'Baseline Open',
    description: 'Standard open-field layout with symmetric gas nodes.',
    gasGeysers: [
      { x: 0.30, y: 0.30, amount: 1500 },
      { x: 0.70, y: 0.70, amount: 1500 }
    ],
    playerBuildSlots: [
      { x: 315, y: 960 / 2 - 150 },
      { x: 315, y: 960 / 2 + 150 }
    ],
    enemyBuildSlots: [
      { x: 1680 - 315, y: 960 / 2 - 150 },
      { x: 1680 - 315, y: 960 / 2 + 150 }
    ]
  },
  chokepoint: {
    id: 'chokepoint',
    label: 'Chokepoint',
    description: 'Narrow central passage with clustered resources.',
    gasGeysers: [
      { x: 0.22, y: 0.35, amount: 1500 },
      { x: 0.78, y: 0.65, amount: 1500 }
    ],
    playerBuildSlots: [
      { x: 280, y: 960 / 2 - 120 },
      { x: 280, y: 960 / 2 + 120 }
    ],
    enemyBuildSlots: [
      { x: 1680 - 280, y: 960 / 2 - 120 },
      { x: 1680 - 280, y: 960 / 2 + 120 }
    ]
  },
  flank: {
    id: 'flank',
    label: 'Multi-Lane Flank',
    description: 'Multiple approach lanes for flanking maneuvers.',
    gasGeysers: [
      { x: 0.25, y: 0.25, amount: 1500 },
      { x: 0.25, y: 0.75, amount: 1500 },
      { x: 0.75, y: 0.25, amount: 1500 },
      { x: 0.75, y: 0.75, amount: 1500 }
    ],
    playerBuildSlots: [
      { x: 300, y: 960 / 2 - 200 },
      { x: 300, y: 960 / 2 + 200 }
    ],
    enemyBuildSlots: [
      { x: 1680 - 300, y: 960 / 2 - 200 },
      { x: 1680 - 300, y: 960 / 2 + 200 }
    ]
  },
  island: {
    id: 'island',
    label: 'Separated Island',
    description: 'Isolated expansions requiring naval or air control.',
    gasGeysers: [
      { x: 0.18, y: 0.50, amount: 1500 },
      { x: 0.82, y: 0.50, amount: 1500 }
    ],
    playerBuildSlots: [
      { x: 250, y: 960 / 2 },
      { x: 380, y: 960 / 2 }
    ],
    enemyBuildSlots: [
      { x: 1680 - 380, y: 960 / 2 },
      { x: 1680 - 250, y: 960 / 2 }
    ]
  }
};

export function getMap(mapId = 'baseline') {
  return MAPS[mapId] ?? MAPS.baseline;
}
