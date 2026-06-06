import Phaser from 'phaser';
import { getDifficulty } from '../data/difficulties.js';

export const GameStates = Object.freeze({
  MENU: 'MENU',
  BRIEFING: 'BRIEFING',
  BATTLE: 'BATTLE',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT'
});

const MENU_RESET_MESSAGE = 'Choose a faction and start the mission.';
const MAX_LOG_ENTRIES = 6;

const initialState = () => ({
  screen: GameStates.MENU,
  raceId: 'terran',
  raceName: 'Terran',
  difficultyId: 'normal',
  difficultyLabel: 'Normal',
  mapId: 'baseline',
  mapLabel: 'Baseline Open',
  objective: 'Select a race to begin.',
  message: MENU_RESET_MESSAGE,
  outcome: 'none',
  log: ['SCC initialized.'],
  resources: {
    minerals: 0,
    gas: 0,
    supplyUsed: 0,
    supplyCap: 0,
    enemyMinerals: 0
  },
  selection: {
    label: 'None',
    kind: 'none',
    owner: 'none',
    hp: 0,
    maxHp: 0,
    details: 'Nothing selected.'
  },
  battle: {
    difficultyId: 'normal',
    difficultyLabel: 'Normal',
    playerUnits: 0,
    enemyUnits: 0,
    playerStructures: 0,
    enemyStructures: 0,
    playerBaseHp: 0,
    enemyBaseHp: 0,
    wave: 0,
    commandMode: 'select',
    availableCommands: [],
    buildQueue: [],
    status: 'Ready.'
  },
  lastAction: 'ready'
});

export function createGameSession() {
  const events = new Phaser.Events.EventEmitter();
  const state = initialState();

  const snapshot = () => ({
    screen: state.screen,
    raceId: state.raceId,
    raceName: state.raceName,
    difficultyId: state.difficultyId,
    difficultyLabel: state.difficultyLabel,
    objective: state.objective,
    message: state.message,
    outcome: state.outcome,
    log: [...state.log],
    resources: { ...state.resources },
    selection: { ...state.selection },
    battle: {
      ...state.battle,
      availableCommands: [...state.battle.availableCommands],
      buildQueue: [...state.battle.buildQueue]
    },
    lastAction: state.lastAction
  });

  const emitChange = (reason = 'update') => {
    state.lastAction = reason;
    events.emit('change', snapshot());
  };

  return {
    events,
    snapshot,
    get current() {
      return state.screen;
    },
    get raceId() {
      return state.raceId;
    },
    get difficultyId() {
      return state.difficultyId;
    },
    setScreen(screen, reason = screen.toLowerCase()) {
      state.screen = screen;
      emitChange(reason);
      return snapshot();
    },
    setRace(raceId, raceName) {
      state.raceId = raceId;
      state.raceName = raceName;
      emitChange('race');
      return snapshot();
    },
    setDifficulty(difficultyId) {
      const difficulty = getDifficulty(difficultyId);
      state.difficultyId = difficulty.id;
      state.difficultyLabel = difficulty.label;
      if (state.battle) {
        state.battle.difficultyId = difficulty.id;
        state.battle.difficultyLabel = difficulty.label;
      }
      emitChange('difficulty');
      return snapshot();
    },
    setObjective(objective) {
      state.objective = objective;
      emitChange('objective');
      return snapshot();
    },
    setMessage(message) {
      state.message = message;
      emitChange('message');
      return snapshot();
    },
    pushLog(entry) {
      state.log.push(entry);
      if (state.log.length > MAX_LOG_ENTRIES) {
        state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
      }
      emitChange('log');
      return snapshot();
    },
    setResources(partial) {
      Object.assign(state.resources, partial);
      emitChange('resources');
      return snapshot();
    },
    setSelection(partial) {
      Object.assign(state.selection, partial);
      emitChange('selection');
      return snapshot();
    },
    setBattle(partial) {
      Object.assign(state.battle, partial);
      emitChange('battle');
      return snapshot();
    },
    setOutcome(outcome) {
      state.outcome = outcome;
      emitChange('outcome');
      return snapshot();
    },
    resetForMenu(message = MENU_RESET_MESSAGE) {
      const next = initialState();
      next.raceId = state.raceId;
      next.raceName = state.raceName;
      next.difficultyId = state.difficultyId;
      next.difficultyLabel = state.difficultyLabel;
      next.message = message;
      state.screen = next.screen;
      state.objective = next.objective;
      state.message = next.message;
      state.outcome = next.outcome;
      state.log = next.log;
      state.resources = next.resources;
      state.selection = next.selection;
      state.battle = next.battle;
      state.lastAction = 'menu-reset';
      emitChange('menu-reset');
      return snapshot();
    },
    startBattle(raceId, raceName, config = {}) {
      state.screen = GameStates.BATTLE;
      state.raceId = raceId;
      state.raceName = raceName;
      state.difficultyId = config.difficultyId ?? state.difficultyId;
      state.difficultyLabel = config.difficultyLabel ?? state.difficultyLabel;
      state.objective = config.objective ?? 'Secure the battlefield, build your force, and destroy the enemy base.';
      state.message = config.message ?? 'Your first objective is to establish the economy and mass a strike force.';
      state.outcome = 'none';
      state.log = config.log ? [...config.log] : ['Mission started.'];
      state.resources = {
        minerals: config.minerals ?? 0,
        gas: config.gas ?? 0,
        supplyUsed: config.supplyUsed ?? 0,
        supplyCap: config.supplyCap ?? 0,
        enemyMinerals: config.enemyMinerals ?? 0
      };
      state.selection = {
        label: 'None',
        kind: 'none',
        owner: 'none',
        hp: 0,
        maxHp: 0,
        details: 'Nothing selected.'
      };
      state.battle = {
        difficultyId: config.difficultyId ?? state.difficultyId,
        difficultyLabel: config.difficultyLabel ?? state.difficultyLabel,
        playerUnits: 0,
        enemyUnits: 0,
        playerStructures: 0,
        enemyStructures: 0,
        playerBaseHp: 0,
        enemyBaseHp: 0,
        wave: 0,
        commandMode: 'select',
        availableCommands: [],
        buildQueue: [],
        status: 'Ready.'
      };
      emitChange('battle-start');
      return snapshot();
    }
  };
}

export const session = createGameSession();
