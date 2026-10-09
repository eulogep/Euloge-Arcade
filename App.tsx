// tslint:disable
/* eslint-disable */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  Shield,
  HelpCircle,
  Menu as MenuIcon,
  X,
  Zap,
  Sparkles,
  Trophy,
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Target,
  Clock,
  Flame,
  Award,
  Crosshair,
} from 'lucide-react';
import {getConfig} from './constants';
import BackgroundMusic from './utils/BackgroundMusic';
import {
  createFixedStepper,
  drawAsset,
  drawBackground,
  formatTime,
  GameState,
  MenuOverlay,
  Overlay,
  prepareCanvas,
  useAssets,
  useAutoFocus,
  useInput,
  useIsMobile,
  gameAudio,
  clamp,
} from './utils/helper';
import {
  usePlayground,
  usePlaygroundGameLifecycle,
  useRpc,
} from './utils/usePlayground';
import {
  SpriteActionConfig,
  SpriteAnimationState,
  SpriteRenderer,
} from './SpriteRenderer';

const BACKGROUND_MUSIC_URL = 'assets/audio/bgm_cyber_synth.mp3';

// ASSETS MANIFEST
const ASSETS_MANIFEST: Record<string, string> = {
  bg_cyber_network: 'assets/images/bg_cyber_network.png',
  cyber_platform: 'assets/images/cyber_platform.png',
  security_drone: 'assets/images/security_drone.png',
  terminal_portal: 'assets/images/terminal_portal.png',
  data_fragment: 'assets/images/data_fragment.png',
  checkpoint_beacon: 'assets/images/checkpoint_beacon.png',
  player_hacker_idle: 'assets/images/player_hacker_idle.png',
  player_hacker_run: 'assets/images/player_hacker_run.png',
  player_hacker_jump: 'assets/images/player_hacker_jump.png',
  player_hacker_hurt: 'assets/images/player_hacker_hurt.png',
  player_hacker_death: 'assets/images/player_hacker_death.png',
};

// Player Spritesheet Action Configs from read_assets_metadata
const PLAYER_ACTION_CONFIGS: Record<string, SpriteActionConfig> = {
  IDLE: {
    imageUrl: 'player_hacker_idle',
    frameWidth: 512,
    frameHeight: 512,
    totalFrames: 4,
    fps: 8,
    loop: true,
  },
  RUN: {
    imageUrl: 'player_hacker_run',
    frameWidth: 512,
    frameHeight: 512,
    totalFrames: 16,
    fps: 16,
    loop: true,
  },
  JUMP: {
    imageUrl: 'player_hacker_jump',
    frameWidth: 512,
    frameHeight: 512,
    totalFrames: 16,
    fps: 14,
    loop: false,
  },
  HURT: {
    imageUrl: 'player_hacker_hurt',
    frameWidth: 512,
    frameHeight: 512,
    totalFrames: 16,
    fps: 12,
    loop: false,
  },
  DEATH: {
    imageUrl: 'player_hacker_death',
    frameWidth: 512,
    frameHeight: 512,
    totalFrames: 16,
    fps: 10,
    loop: false,
  },
};

// Platform Definition
interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  oneWay?: boolean;
  moving?: {
    axis: 'x' | 'y';
    range: number;
    speed: number;
    initialX: number;
    initialY: number;
  };
  disappearing?: {
    cycleDuration: number;
    activeDuration: number;
    timer: number;
    isVisible: boolean;
  };
  theme?: 'cyber' | 'firewall' | 'mainframe';
  vx?: number;
  vy?: number;
}

// Security Drone Hazard / Destructible Enemy
interface Drone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  patrolType: 'horizontal' | 'vertical' | 'hover' | 'chase';
  minCoord: number;
  maxCoord: number;
  speed: number;
  direction: number;
  baseY: number;
  timeOffset: number;
  hp: number;
  maxHp: number;
  isDead: boolean;
  scoreValue: number;
  shootTimer?: number;
}

// Laser Grid Hazard
interface LaserGrid {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: 'vertical' | 'horizontal';
  cycleDuration: number;
  activeDuration: number;
  warningDuration: number;
  timeOffset: number;
  state: 'off' | 'warning' | 'active';
  color?: string;
}

// Boss Definition
type BossState = 'IDLE' | 'TELEGRAPH' | 'ATTACK' | 'VULNERABLE' | 'DEFEATED';

interface BossEntity {
  id: string;
  name: string;
  title: string;
  sector: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  phase: number;
  maxPhases: number;
  state: BossState;
  stateTimer: number;
  attackPattern: number;
  telegraphAngle: number;
  telegraphTarget: {x: number; y: number};
  isVulnerable: boolean;
  vulnerableTimer: number;
  laserAngle: number;
  attackCounter: number;
  active: boolean;
}

// Projectiles
interface PlayerBullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  damage: number;
}

interface EnemyBullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  color: string;
  isSeeker?: boolean;
}

// Energy Shockwave
interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  active: boolean;
  damage: number;
}

// Data Fragment Item
interface DataFragmentItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collected: boolean;
  floatOffset: number;
}

// Checkpoint Beacon
interface Checkpoint {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  activated: boolean;
}

// Exit Portal
interface ExitPortal {
  x: number;
  y: number;
  width: number;
  height: number;
  isUnlocked: boolean;
}

// Floating Damage / Score Text
interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
}

// Visual Particle
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  shape?: 'square' | 'circle' | 'ring' | 'glitch' | 'spark';
}

// Level Sector Data Specification
interface LevelSector {
  levelNumber: number;
  name: string;
  subtitle: string;
  theme: 'cyber' | 'firewall' | 'mainframe';
  worldWidth: number;
  worldHeight: number;
  spawnX: number;
  spawnY: number;
  platforms: Platform[];
  drones: Drone[];
  lasers: LaserGrid[];
  fragments: DataFragmentItem[];
  checkpoints: Checkpoint[];
  portal: ExitPortal;
  boss: BossEntity | null;
  chaseTriggers?: {x: number; triggered: boolean}[];
}

// ============================================================================
// LEVEL CREATION FACTORIES
// ============================================================================

function createSector1(): LevelSector {
  return {
    levelNumber: 1,
    name: 'Sector 01: Network Infiltration',
    subtitle: 'Difficulty: 2/5 // Target: Guardian Drone Subroutine',
    theme: 'cyber',
    worldWidth: 3600,
    worldHeight: 720,
    spawnX: 100,
    spawnY: 520,
    platforms: [
      // Ground sections
      {x: 0, y: 620, width: 650, height: 100, theme: 'cyber'},
      {x: 750, y: 620, width: 600, height: 100, theme: 'cyber'},
      {x: 1450, y: 620, width: 550, height: 100, theme: 'cyber'},
      {x: 2100, y: 620, width: 500, height: 100, theme: 'cyber'},
      // Boss Arena Ground
      {x: 2750, y: 620, width: 850, height: 100, theme: 'cyber'},

      // Stepping nodes & upper routes
      {x: 350, y: 480, width: 160, height: 26, oneWay: true, theme: 'cyber'},
      {x: 580, y: 380, width: 170, height: 26, oneWay: true, theme: 'cyber'},
      // Moving platform 1
      {
        x: 820,
        y: 450,
        width: 150,
        height: 26,
        oneWay: true,
        theme: 'cyber',
        moving: {axis: 'y', range: 160, speed: 70, initialX: 820, initialY: 450},
      },
      {x: 1050, y: 360, width: 220, height: 26, theme: 'cyber'},
      {
        x: 1350,
        y: 440,
        width: 160,
        height: 26,
        oneWay: true,
        theme: 'cyber',
        moving: {axis: 'x', range: 220, speed: 100, initialX: 1350, initialY: 440},
      },
      {x: 1650, y: 340, width: 220, height: 26, theme: 'cyber'},
      {x: 1920, y: 460, width: 170, height: 26, oneWay: true, theme: 'cyber'},
      {x: 2200, y: 350, width: 240, height: 26, theme: 'cyber'},

      // Boss arena elevated safe nodes
      {x: 2850, y: 460, width: 140, height: 24, oneWay: true, theme: 'cyber'},
      {x: 3100, y: 360, width: 160, height: 24, oneWay: true, theme: 'cyber'},
      {x: 3350, y: 460, width: 140, height: 24, oneWay: true, theme: 'cyber'},
    ],
    drones: [
      {
        id: 'd1_1',
        x: 900,
        y: 380,
        width: 48,
        height: 48,
        patrolType: 'horizontal',
        minCoord: 850,
        maxCoord: 1040,
        speed: 100,
        direction: 1,
        baseY: 380,
        timeOffset: 0,
        hp: 50,
        maxHp: 50,
        isDead: false,
        scoreValue: 150,
      },
      {
        id: 'd1_2',
        x: 1680,
        y: 270,
        width: 48,
        height: 48,
        patrolType: 'hover',
        minCoord: 1620,
        maxCoord: 1850,
        speed: 110,
        direction: 1,
        baseY: 270,
        timeOffset: 0.5,
        hp: 50,
        maxHp: 50,
        isDead: false,
        scoreValue: 150,
      },
      {
        id: 'd1_3',
        x: 2250,
        y: 280,
        width: 48,
        height: 48,
        patrolType: 'horizontal',
        minCoord: 2180,
        maxCoord: 2420,
        speed: 130,
        direction: 1,
        baseY: 280,
        timeOffset: 0.2,
        hp: 50,
        maxHp: 50,
        isDead: false,
        scoreValue: 150,
      },
    ],
    lasers: [
      {
        id: 'l1_1',
        x: 1300,
        y: 440,
        width: 14,
        height: 180,
        orientation: 'vertical',
        cycleDuration: 3.5,
        activeDuration: 1.2,
        warningDuration: 0.8,
        timeOffset: 0,
        state: 'off',
      },
    ],
    fragments: [
      {id: 'f1_1', x: 260, y: 560, width: 28, height: 34, collected: false, floatOffset: 0},
      {id: 'f1_2', x: 420, y: 420, width: 28, height: 34, collected: false, floatOffset: 1},
      {id: 'f1_3', x: 670, y: 320, width: 28, height: 34, collected: false, floatOffset: 2},
      {id: 'f1_4', x: 910, y: 560, width: 28, height: 34, collected: false, floatOffset: 3},
      {id: 'f1_5', x: 1150, y: 300, width: 28, height: 34, collected: false, floatOffset: 4},
      {id: 'f1_6', x: 1430, y: 380, width: 28, height: 34, collected: false, floatOffset: 5},
      {id: 'f1_7', x: 1750, y: 280, width: 28, height: 34, collected: false, floatOffset: 6},
      {id: 'f1_8', x: 2020, y: 400, width: 28, height: 34, collected: false, floatOffset: 7},
      {id: 'f1_9', x: 2320, y: 290, width: 28, height: 34, collected: false, floatOffset: 8},
      {id: 'f1_10', x: 3160, y: 300, width: 28, height: 34, collected: false, floatOffset: 9},
    ],
    checkpoints: [
      {id: 'cp1_1', x: 1480, y: 510, width: 34, height: 110, activated: false},
      {id: 'cp1_2', x: 2680, y: 510, width: 34, height: 110, activated: false},
    ],
    portal: {x: 3450, y: 490, width: 90, height: 130, isUnlocked: false},
    boss: {
      id: 'boss_s1',
      name: 'GUARDIAN DRONE v1.4',
      title: 'Sector 01 Autonomous Defense Subroutine',
      sector: 1,
      x: 3200,
      y: 280,
      width: 72,
      height: 72,
      vx: 0,
      vy: 0,
      hp: 300,
      maxHp: 300,
      phase: 1,
      maxPhases: 2,
      state: 'IDLE',
      stateTimer: 2.0,
      attackPattern: 0,
      telegraphAngle: 0,
      telegraphTarget: {x: 0, y: 0},
      isVulnerable: false,
      vulnerableTimer: 0,
      laserAngle: 0,
      attackCounter: 0,
      active: false,
    },
  };
}

function createSector2(): LevelSector {
  return {
    levelNumber: 2,
    name: 'Sector 02: Firewall Fortress',
    subtitle: 'Difficulty: 3/5 // Target: Firewall Sentinel Core',
    theme: 'firewall',
    worldWidth: 4200,
    worldHeight: 720,
    spawnX: 100,
    spawnY: 520,
    platforms: [
      // Starting base
      {x: 0, y: 620, width: 450, height: 100, theme: 'firewall'},
      // Moving & Disappearing platforms
      {
        x: 520,
        y: 520,
        width: 150,
        height: 26,
        oneWay: true,
        theme: 'firewall',
        moving: {axis: 'x', range: 200, speed: 90, initialX: 520, initialY: 520},
      },
      // Holographic Disappearing Platform 1
      {
        x: 820,
        y: 440,
        width: 160,
        height: 26,
        oneWay: true,
        theme: 'firewall',
        disappearing: {cycleDuration: 3.2, activeDuration: 1.8, timer: 0, isVisible: true},
      },
      {x: 1080, y: 360, width: 220, height: 26, theme: 'firewall'},
      {
        x: 1400,
        y: 480,
        width: 150,
        height: 26,
        oneWay: true,
        theme: 'firewall',
        moving: {axis: 'y', range: 180, speed: 80, initialX: 1400, initialY: 480},
      },
      // Checkpoint 1 island
      {x: 1650, y: 360, width: 280, height: 26, theme: 'firewall'},
      {x: 1720, y: 620, width: 340, height: 100, theme: 'firewall'},
      // Disappearing Platform 2
      {
        x: 2060,
        y: 450,
        width: 150,
        height: 26,
        oneWay: true,
        theme: 'firewall',
        disappearing: {cycleDuration: 2.8, activeDuration: 1.6, timer: 1.2, isVisible: true},
      },
      {
        x: 2300,
        y: 350,
        width: 160,
        height: 26,
        oneWay: true,
        theme: 'firewall',
        moving: {axis: 'x', range: 220, speed: 110, initialX: 2300, initialY: 350},
      },
      // Checkpoint 2 platform
      {x: 2620, y: 420, width: 260, height: 26, theme: 'firewall'},

      // Boss Arena Ground & Pillars
      {x: 3000, y: 620, width: 1100, height: 100, theme: 'firewall'},
      {x: 3150, y: 460, width: 140, height: 24, oneWay: true, theme: 'firewall'},
      {x: 3450, y: 350, width: 160, height: 24, oneWay: true, theme: 'firewall'},
      {x: 3750, y: 460, width: 140, height: 24, oneWay: true, theme: 'firewall'},
    ],
    drones: [
      {
        id: 'd2_1',
        x: 950,
        y: 380,
        width: 48,
        height: 48,
        patrolType: 'horizontal',
        minCoord: 900,
        maxCoord: 1150,
        speed: 130,
        direction: 1,
        baseY: 380,
        timeOffset: 0,
        hp: 60,
        maxHp: 60,
        isDead: false,
        scoreValue: 200,
      },
      {
        id: 'd2_2',
        x: 1750,
        y: 280,
        width: 48,
        height: 48,
        patrolType: 'hover',
        minCoord: 1680,
        maxCoord: 1900,
        speed: 110,
        direction: 1,
        baseY: 280,
        timeOffset: 1.0,
        hp: 60,
        maxHp: 60,
        isDead: false,
        scoreValue: 200,
      },
      {
        id: 'd2_3',
        x: 2400,
        y: 270,
        width: 48,
        height: 48,
        patrolType: 'horizontal',
        minCoord: 2320,
        maxCoord: 2550,
        speed: 140,
        direction: 1,
        baseY: 270,
        timeOffset: 0.4,
        hp: 60,
        maxHp: 60,
        isDead: false,
        scoreValue: 200,
      },
    ],
    lasers: [
      {
        id: 'l2_1',
        x: 1250,
        y: 240,
        width: 14,
        height: 220,
        orientation: 'vertical',
        cycleDuration: 3.0,
        activeDuration: 1.2,
        warningDuration: 0.7,
        timeOffset: 0,
        state: 'off',
        color: '#ff3b30',
      },
      {
        id: 'l2_2',
        x: 2200,
        y: 260,
        width: 14,
        height: 220,
        orientation: 'vertical',
        cycleDuration: 3.2,
        activeDuration: 1.3,
        warningDuration: 0.7,
        timeOffset: 1.2,
        state: 'off',
        color: '#ff3b30',
      },
    ],
    fragments: [
      {id: 'f2_1', x: 260, y: 560, width: 28, height: 34, collected: false, floatOffset: 0},
      {id: 'f2_2', x: 600, y: 460, width: 28, height: 34, collected: false, floatOffset: 1},
      {id: 'f2_3', x: 890, y: 380, width: 28, height: 34, collected: false, floatOffset: 2},
      {id: 'f2_4', x: 1180, y: 300, width: 28, height: 34, collected: false, floatOffset: 3},
      {id: 'f2_5', x: 1470, y: 420, width: 28, height: 34, collected: false, floatOffset: 4},
      {id: 'f2_6', x: 1800, y: 300, width: 28, height: 34, collected: false, floatOffset: 5},
      {id: 'f2_7', x: 2130, y: 390, width: 28, height: 34, collected: false, floatOffset: 6},
      {id: 'f2_8', x: 2380, y: 290, width: 28, height: 34, collected: false, floatOffset: 7},
      {id: 'f2_9', x: 2720, y: 360, width: 28, height: 34, collected: false, floatOffset: 8},
      {id: 'f2_10', x: 3520, y: 290, width: 28, height: 34, collected: false, floatOffset: 9},
    ],
    checkpoints: [
      {id: 'cp2_1', x: 1680, y: 250, width: 34, height: 110, activated: false},
      {id: 'cp2_2', x: 2900, y: 510, width: 34, height: 110, activated: false},
    ],
    portal: {x: 3950, y: 490, width: 90, height: 130, isUnlocked: false},
    boss: {
      id: 'boss_s2',
      name: 'FIREWALL SENTINEL',
      title: 'Sector 02 High-Security Thermal Core',
      sector: 2,
      x: 3500,
      y: 250,
      width: 86,
      height: 86,
      vx: 0,
      vy: 0,
      hp: 500,
      maxHp: 500,
      phase: 1,
      maxPhases: 3,
      state: 'IDLE',
      stateTimer: 2.0,
      attackPattern: 0,
      telegraphAngle: 0,
      telegraphTarget: {x: 0, y: 0},
      isVulnerable: false,
      vulnerableTimer: 0,
      laserAngle: 0,
      attackCounter: 0,
      active: false,
    },
  };
}

function createSector3(): LevelSector {
  return {
    levelNumber: 3,
    name: 'Sector 03: Mainframe Core',
    subtitle: 'Difficulty: 5/5 // Target: CORE-OMEGA Superintelligence',
    theme: 'mainframe',
    worldWidth: 4600,
    worldHeight: 720,
    spawnX: 100,
    spawnY: 520,
    platforms: [
      // Starting node
      {x: 0, y: 620, width: 400, height: 100, theme: 'mainframe'},
      // Floating cluster
      {x: 480, y: 480, width: 160, height: 26, oneWay: true, theme: 'mainframe'},
      {
        x: 720,
        y: 400,
        width: 150,
        height: 26,
        oneWay: true,
        theme: 'mainframe',
        moving: {axis: 'y', range: 180, speed: 90, initialX: 720, initialY: 400},
      },
      {x: 960, y: 300, width: 220, height: 26, theme: 'mainframe'},
      // Disappearing gauntlet
      {
        x: 1260,
        y: 440,
        width: 150,
        height: 26,
        oneWay: true,
        theme: 'mainframe',
        disappearing: {cycleDuration: 2.4, activeDuration: 1.4, timer: 0, isVisible: true},
      },
      {
        x: 1480,
        y: 350,
        width: 150,
        height: 26,
        oneWay: true,
        theme: 'mainframe',
        moving: {axis: 'x', range: 240, speed: 120, initialX: 1480, initialY: 350},
      },
      // Checkpoint 1
      {x: 1800, y: 420, width: 260, height: 26, theme: 'mainframe'},
      // Cyber Towers
      {x: 2140, y: 520, width: 150, height: 26, oneWay: true, theme: 'mainframe'},
      {x: 2360, y: 400, width: 150, height: 26, oneWay: true, theme: 'mainframe'},
      {x: 2580, y: 280, width: 220, height: 26, theme: 'mainframe'},
      // Checkpoint 2 (Directly prior to boss room entrance)
      {x: 2900, y: 420, width: 280, height: 26, theme: 'mainframe'},
      {x: 2900, y: 620, width: 280, height: 100, theme: 'mainframe'},

      // Mainframe Sanctuary Boss Arena
      {x: 3300, y: 620, width: 1250, height: 100, theme: 'mainframe'},
      // Safe elevated holographic nodes for boss battle
      {x: 3450, y: 460, width: 140, height: 24, oneWay: true, theme: 'mainframe'},
      {x: 3750, y: 350, width: 180, height: 24, oneWay: true, theme: 'mainframe'},
      {x: 4050, y: 460, width: 140, height: 24, oneWay: true, theme: 'mainframe'},
    ],
    drones: [
      {
        id: 'd3_1',
        x: 1000,
        y: 220,
        width: 48,
        height: 48,
        patrolType: 'horizontal',
        minCoord: 960,
        maxCoord: 1180,
        speed: 140,
        direction: 1,
        baseY: 220,
        timeOffset: 0,
        hp: 75,
        maxHp: 75,
        isDead: false,
        scoreValue: 250,
      },
      {
        id: 'd3_2',
        x: 1860,
        y: 320,
        width: 48,
        height: 48,
        patrolType: 'hover',
        minCoord: 1800,
        maxCoord: 2040,
        speed: 120,
        direction: 1,
        baseY: 320,
        timeOffset: 0.8,
        hp: 75,
        maxHp: 75,
        isDead: false,
        scoreValue: 250,
      },
      {
        id: 'd3_3',
        x: 2620,
        y: 200,
        width: 48,
        height: 48,
        patrolType: 'horizontal',
        minCoord: 2560,
        maxCoord: 2800,
        speed: 150,
        direction: 1,
        baseY: 200,
        timeOffset: 0.3,
        hp: 75,
        maxHp: 75,
        isDead: false,
        scoreValue: 250,
      },
    ],
    lasers: [
      {
        id: 'l3_1',
        x: 1200,
        y: 220,
        width: 14,
        height: 220,
        orientation: 'vertical',
        cycleDuration: 2.6,
        activeDuration: 1.2,
        warningDuration: 0.6,
        timeOffset: 0,
        state: 'off',
        color: '#c084fc',
      },
      {
        id: 'l3_2',
        x: 2280,
        y: 300,
        width: 14,
        height: 220,
        orientation: 'vertical',
        cycleDuration: 2.8,
        activeDuration: 1.3,
        warningDuration: 0.6,
        timeOffset: 1.0,
        state: 'off',
        color: '#c084fc',
      },
    ],
    fragments: [
      {id: 'f3_1', x: 220, y: 560, width: 28, height: 34, collected: false, floatOffset: 0},
      {id: 'f3_2', x: 560, y: 420, width: 28, height: 34, collected: false, floatOffset: 1},
      {id: 'f3_3', x: 800, y: 340, width: 28, height: 34, collected: false, floatOffset: 2},
      {id: 'f3_4', x: 1060, y: 240, width: 28, height: 34, collected: false, floatOffset: 3},
      {id: 'f3_5', x: 1380, y: 380, width: 28, height: 34, collected: false, floatOffset: 4},
      {id: 'f3_6', x: 1900, y: 360, width: 28, height: 34, collected: false, floatOffset: 5},
      {id: 'f3_7', x: 2200, y: 460, width: 28, height: 34, collected: false, floatOffset: 6},
      {id: 'f3_8', x: 2440, y: 340, width: 28, height: 34, collected: false, floatOffset: 7},
      {id: 'f3_9', x: 2680, y: 220, width: 28, height: 34, collected: false, floatOffset: 8},
      {id: 'f3_10', x: 3000, y: 360, width: 28, height: 34, collected: false, floatOffset: 9},
      {id: 'f3_11', x: 3840, y: 290, width: 28, height: 34, collected: false, floatOffset: 10},
    ],
    checkpoints: [
      {id: 'cp3_1', x: 1830, y: 310, width: 34, height: 110, activated: false},
      {id: 'cp3_2', x: 2940, y: 310, width: 34, height: 110, activated: false},
    ],
    portal: {x: 4350, y: 490, width: 100, height: 135, isUnlocked: false},
    boss: {
      id: 'boss_s3',
      name: 'CORE-OMEGA',
      title: 'Central Mainframe Superintelligence',
      sector: 3,
      x: 3850,
      y: 240,
      width: 100,
      height: 100,
      vx: 0,
      vy: 0,
      hp: 800,
      maxHp: 800,
      phase: 1,
      maxPhases: 3,
      state: 'IDLE',
      stateTimer: 2.0,
      attackPattern: 0,
      telegraphAngle: 0,
      telegraphTarget: {x: 0, y: 0},
      isVulnerable: false,
      vulnerableTimer: 0,
      laserAngle: 0,
      attackCounter: 0,
      active: false,
    },
  };
}

// ============================================================================
// PERSISTENT RECORDS
// ============================================================================

interface GameRecords {
  bestScore: number;
  bestTime: number | null; // full runs started from Sector 01 only
}

const RECORDS_KEY = 'system-breach-records';

function loadRecords(): GameRecords {
  try {
    const raw = window.localStorage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        bestScore: Number(parsed.bestScore) || 0,
        bestTime: typeof parsed.bestTime === 'number' ? parsed.bestTime : null,
      };
    }
  } catch {
    // Storage unavailable (private mode, sandboxed iframe...)
  }
  return {bestScore: 0, bestTime: null};
}

function saveRecords(records: GameRecords) {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Ignore: records simply won't persist
  }
}

const DASH_DURATION = 0.16;
const DASH_COOLDOWN = 0.55;
const DASH_SPEED_MULT = 2.6;
const COMBO_WINDOW = 2.5;
const MAX_COMBO_MULTIPLIER = 5;
const FULL_DECRYPT_BONUS = 500;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stepperRef = useRef<ReturnType<typeof createFixedStepper>>();
  const isMobile = useIsMobile();

  // SDK Integration
  const {sdk} = usePlayground();

  // Preload Assets
  const {assets, isReady: assetsReady} = useAssets(ASSETS_MANIFEST);

  const canvasWidth = getConfig('baseCanvasWidth') as number;
  const canvasHeight = getConfig('baseCanvasHeight') as number;

  if (!stepperRef.current) {
    const stepMs = getConfig('stepMs') as number;
    const maxSubSteps = getConfig('maxSubSteps') as number;
    stepperRef.current = createFixedStepper(stepMs, maxSubSteps);
  }

  // Master React Game State
  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: 0,
    level: 1,
    lives: getConfig('startingLives') as number,
    integrity: getConfig('maxIntegrity') as number,
    maxIntegrity: getConfig('maxIntegrity') as number,
    fragmentsCount: 0,
    totalFragmentsCollected: 0,
    timeElapsed: 0,
    enemiesKilled: 0,
    damageTaken: 0,
    deaths: 0,
    isTimeAttack: false,
  });

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Audio mute toggles
  const [sfxMuted, setSfxMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);

  // UI Overlays & Modes
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [selectedLevelTab, setSelectedLevelTab] = useState(1);
  const [isTimeAttackMode, setIsTimeAttackMode] = useState(false);

  // Persistent records (best score / best full-run clear time)
  const [records, setRecords] = useState<GameRecords>(loadRecords);
  const [newRecord, setNewRecord] = useState({score: false, time: false});
  const runStartLevelRef = useRef(1);

  // Focus ref for autoFocus primary buttons
  const startBtnRef = useAutoFocus<HTMLButtonElement>(gameState.status === 'START');

  // Touch virtual inputs
  const touchLeftRef = useRef(false);
  const touchRightRef = useRef(false);
  const touchDownRef = useRef(false);
  const touchJumpRef = useRef(false);
  const touchAttackRef = useRef(false);
  const touchDashRef = useRef(false);

  // Keyboard / Pointer Input
  const inputRef = useInput(canvasRef, true, {
    width: canvasWidth,
    height: canvasHeight,
  });

  // Sprite Renderer instance
  const playerSpriteRef = useRef<SpriteRenderer | null>(null);
  if (!playerSpriteRef.current) {
    playerSpriteRef.current = new SpriteRenderer(PLAYER_ACTION_CONFIGS);
  }

  // High Frequency Simulation Physics State in Ref
  const simRef = useRef({
    // Player
    player: {
      x: 100,
      y: 520,
      width: 34,
      height: 60,
      vx: 0,
      vy: 0,
      isGrounded: false,
      facingRight: true,
      jumpCount: 0,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      invulnerableTimer: 0,
      dropThroughTimer: 0,
      shootCooldown: 0,
      ridingPlatform: null as Platform | null,
      dashTimer: 0,
      dashCooldown: 0,
      dashDir: 1,
      canAirDash: true,
    },
    animState: {
      currentAction: 'IDLE',
      currentFrame: 0,
      timer: 0,
    } as SpriteAnimationState,
    // Camera
    camera: {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      trauma: 0,
    },
    // Projectiles & FX
    playerBullets: [] as PlayerBullet[],
    enemyBullets: [] as EnemyBullet[],
    shockwaves: [] as Shockwave[],
    floatingTexts: [] as FloatingText[],
    particles: [] as Particle[],
    // Current Sector Data
    currentSector: createSector1(),
    lastCheckpointPos: {x: 100, y: 520},
    gameTime: 0,
    sectorBannerTimer: 0,
    lastJumpPressed: false,
    lastAttackPressed: false,
    lastCancelPressed: false,
    lastDashPressed: false,
    // Authoritative health/lives (mirrored into React state for the HUD)
    integrity: getConfig('maxIntegrity') as number,
    lives: getConfig('startingLives') as number,
    // Set once the run ends so extra sub-steps in the same frame can't re-trigger it
    halted: false,
    // Kill chain multiplier
    combo: {count: 0, timer: 0},
    // Feedback FX
    hitStop: 0,
    damageFlash: 0,
    afterimages: [] as {x: number; y: number; flip: boolean; alpha: number; anim: SpriteAnimationState}[],
  });

  // Level selector / initiator
  const loadSector = useCallback((levelNum: number, keepScore = false) => {
    let sector: LevelSector;
    if (levelNum === 1) sector = createSector1();
    else if (levelNum === 2) sector = createSector2();
    else sector = createSector3();

    simRef.current.currentSector = sector;
    simRef.current.lastCheckpointPos = {x: sector.spawnX, y: sector.spawnY};
    simRef.current.player.x = sector.spawnX;
    simRef.current.player.y = sector.spawnY;
    simRef.current.player.vx = 0;
    simRef.current.player.vy = 0;
    simRef.current.player.jumpCount = 0;
    simRef.current.player.isGrounded = false;
    simRef.current.player.invulnerableTimer = 0.8;
    simRef.current.player.dashTimer = 0;
    simRef.current.player.dashCooldown = 0;
    simRef.current.player.canAirDash = true;
    simRef.current.player.ridingPlatform = null;
    simRef.current.playerBullets = [];
    simRef.current.enemyBullets = [];
    simRef.current.shockwaves = [];
    simRef.current.floatingTexts = [];
    simRef.current.particles = [];
    simRef.current.afterimages = [];
    simRef.current.camera.x = 0;
    simRef.current.camera.y = 0;
    simRef.current.camera.trauma = 0;
    simRef.current.sectorBannerTimer = 3.5;
    simRef.current.integrity = getConfig('maxIntegrity') as number;
    simRef.current.combo = {count: 0, timer: 0};
    simRef.current.hitStop = 0;
    simRef.current.damageFlash = 0;

    setGameState((prev) => ({
      ...prev,
      level: levelNum,
      integrity: getConfig('maxIntegrity') as number,
      score: keepScore ? prev.score : (levelNum === 1 ? 0 : prev.score),
      fragmentsCount: 0,
    }));
  }, []);

  const initGame = useCallback((startLevel = 1, timeAttack = false) => {
    setIsTimeAttackMode(timeAttack);
    runStartLevelRef.current = startLevel;
    setNewRecord({score: false, time: false});
    simRef.current.lives = getConfig('startingLives') as number;
    simRef.current.halted = false;
    loadSector(startLevel, false);
    setGameState((prev) => ({
      ...prev,
      status: 'PLAYING',
      score: 0,
      level: startLevel,
      lives: getConfig('startingLives') as number,
      integrity: getConfig('maxIntegrity') as number,
      timeElapsed: 0,
      totalFragmentsCollected: 0,
      enemiesKilled: 0,
      damageTaken: 0,
      deaths: 0,
      isTimeAttack: timeAttack,
    }));
    setIsGameMenuOpen(false);
    setIsHowToPlayOpen(false);
    simRef.current.gameTime = 0;

    if (sdk) {
      sdk.startGame();
    }
  }, [loadSector, sdk]);

  // Handle Autoplay for test screenshot / URL param
  const hasAutoplayed = useRef(false);
  useEffect(() => {
    if (
      !hasAutoplayed.current &&
      new URLSearchParams(window.location.search).has('autoplay')
    ) {
      hasAutoplayed.current = true;
      initGame(1, false);
    }
  }, [initGame]);

  // Win / Loss Status SFX
  useEffect(() => {
    if (gameState.status === 'GAME_OVER') {
      gameAudio.playDefeatMotif();
    } else if (gameState.status === 'VICTORY') {
      gameAudio.playVictoryFanfare();
    }

    if (gameState.status === 'GAME_OVER' || gameState.status === 'VICTORY') {
      const prev = loadRecords();
      const isFullRun = gameState.status === 'VICTORY' && runStartLevelRef.current === 1;
      const scoreRecord = gameState.score > prev.bestScore;
      const timeRecord =
        isFullRun && (prev.bestTime === null || gameState.timeElapsed < prev.bestTime);
      if (scoreRecord || timeRecord) {
        const next: GameRecords = {
          bestScore: scoreRecord ? gameState.score : prev.bestScore,
          bestTime: timeRecord ? gameState.timeElapsed : prev.bestTime,
        };
        saveRecords(next);
        setRecords(next);
      }
      setNewRecord({score: scoreRecord, time: timeRecord});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.status]);

  // Spawn visual particle helper
  const spawnParticles = (
    x: number,
    y: number,
    count: number,
    colors: string[],
    speed = 140,
    shape: 'square' | 'circle' | 'ring' | 'glitch' | 'spark' = 'square'
  ) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (0.3 + Math.random() * 0.7) * speed;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const life = 0.3 + Math.random() * 0.45;
      simRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        size: 3 + Math.random() * 4,
        color,
        alpha: 1,
        life,
        maxLife: life,
        shape,
      });
    }
  };

  const addFloatingText = (x: number, y: number, text: string, color = '#00f0ff') => {
    simRef.current.floatingTexts.push({
      id: Math.random().toString(),
      x,
      y,
      text,
      color,
      alpha: 1,
      life: 0.9,
    });
  };

  const addCameraTrauma = (amount: number) => {
    simRef.current.camera.trauma = Math.min(1.0, simRef.current.camera.trauma + amount);
  };

  // Shared drone kill handler: applies the kill-chain multiplier to the reward
  const killDrone = (drone: Drone) => {
    const sim = simRef.current;
    drone.isDead = true;
    sim.combo.count = sim.combo.timer > 0 ? sim.combo.count + 1 : 1;
    sim.combo.timer = COMBO_WINDOW;
    const multiplier = Math.min(sim.combo.count, MAX_COMBO_MULTIPLIER);
    const reward = drone.scoreValue * multiplier;

    gameAudio.playChiptuneExplosion();
    addCameraTrauma(0.2);
    sim.hitStop = Math.max(sim.hitStop, 0.04);
    spawnParticles(drone.x + drone.width / 2, drone.y + drone.height / 2, 20, ['#00f0ff', '#ff007f', '#ffffff'], 180, 'ring');
    addFloatingText(
      drone.x + drone.width / 2,
      drone.y - 20,
      multiplier > 1 ? `+${reward} x${multiplier} COMBO` : `+${reward}`,
      multiplier > 1 ? '#fbbf24' : '#38bdf8'
    );
    setGameState((prev) => ({
      ...prev,
      score: prev.score + reward,
      enemiesKilled: (prev.enemiesKilled ?? 0) + 1,
    }));
  };

  // -------------------------------------------------------------
  // MAIN PHYSICS UPDATE (Runs at fixed 60 FPS)
  // -------------------------------------------------------------
  const update = (dt: number) => {
    const currentStatus = gameStateRef.current.status;
    if (currentStatus !== 'PLAYING') return;

    const sim = simRef.current;
    if (sim.halted) return;
    const sector = sim.currentSector;
    const player = sim.player;
    const input = inputRef.current;

    // Global pause key (ESC or P) — handled before the pause early-return so it can also resume
    if (input.actions.cancel && !sim.lastCancelPressed) {
      if (isHowToPlayOpen) {
        setIsHowToPlayOpen(false);
      } else {
        setIsGameMenuOpen((prev) => !prev);
      }
      gameAudio.playCrispClick();
    }
    sim.lastCancelPressed = input.actions.cancel;

    if (isGameMenuOpen || isHowToPlayOpen) return;

    // Brief freeze-frame on impactful hits
    if (sim.hitStop > 0) {
      sim.hitStop = Math.max(0, sim.hitStop - dt);
      return;
    }

    sim.gameTime += dt;
    if (sim.damageFlash > 0) {
      sim.damageFlash = Math.max(0, sim.damageFlash - dt);
    }
    if (sim.combo.timer > 0) {
      sim.combo.timer = Math.max(0, sim.combo.timer - dt);
      if (sim.combo.timer === 0) sim.combo.count = 0;
    }
    if (sim.sectorBannerTimer > 0) {
      sim.sectorBannerTimer = Math.max(0, sim.sectorBannerTimer - dt);
    }

    setGameState((prev) => ({
      ...prev,
      timeElapsed: prev.timeElapsed + dt,
    }));

    // Read combined inputs
    const isLeft = input.actions.left || touchLeftRef.current;
    const isRight = input.actions.right || touchRightRef.current;
    const isDown = input.actions.down || touchDownRef.current;
    const isJump = input.actions.up || input.actions.confirm || touchJumpRef.current;
    const isAttack = input.actions.attack || input.actions.tap || touchAttackRef.current;
    const isDash = input.actions.dash || touchDashRef.current;

    // Timers
    if (player.dashCooldown > 0) {
      player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    }
    if (player.invulnerableTimer > 0) {
      player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
    }
    if (player.dropThroughTimer > 0) {
      player.dropThroughTimer = Math.max(0, player.dropThroughTimer - dt);
    }
    if (player.shootCooldown > 0) {
      player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    }

    if (isDown) {
      player.dropThroughTimer = 0.25; // drop through one-way platforms
    }

    // Coyote timer
    if (player.isGrounded) {
      player.coyoteTimer = 0;
      player.jumpCount = 0;
      player.canAirDash = true;
    } else {
      player.coyoteTimer += dt;
    }

    // Jump buffer timer
    const jumpJustPressed = isJump && !sim.lastJumpPressed;
    if (jumpJustPressed) {
      player.jumpBufferTimer = getConfig('jumpBufferTime') as number;
    } else if (player.jumpBufferTimer > 0) {
      player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
    }

    // JUMP EXECUTION
    const maxSpeedX = (getConfig('playerSpeed') as number) * 48;
    const jumpImpulse = (getConfig('playerJumpForce') as number) * 42;
    const doubleJumpImpulse = (getConfig('playerDoubleJumpForce') as number) * 40;
    const coyoteGrace = getConfig('coyoteTimeGracePeriod') as number;

    if (player.jumpBufferTimer > 0) {
      const canGroundJump = player.isGrounded || (player.coyoteTimer < coyoteGrace && player.jumpCount === 0);
      if (canGroundJump) {
        player.vy = jumpImpulse;
        player.isGrounded = false;
        player.jumpCount = 1;
        player.jumpBufferTimer = 0;
        player.ridingPlatform = null;
        player.dashTimer = 0;
        gameAudio.playRetroJump();
        spawnParticles(player.x + player.width / 2, player.y + player.height, 8, ['#00f0ff', '#ffffff'], 80);
      } else if (player.jumpCount === 1) {
        // Double Jump
        player.vy = doubleJumpImpulse;
        player.jumpCount = 2;
        player.jumpBufferTimer = 0;
        player.dashTimer = 0;
        gameAudio.playRetroJump();
        spawnParticles(player.x + player.width / 2, player.y + player.height / 2, 14, ['#ff007f', '#00f0ff', '#a855f7'], 140, 'ring');
      }
    }

    // Variable Jump Cut (release jump early)
    if (!isJump && sim.lastJumpPressed && player.vy < 0) {
      player.vy *= 0.5;
    }
    sim.lastJumpPressed = isJump;

    // PLAYER ATTACK (CYBER BLASTER / PULSE SHOT)
    const attackJustPressed = isAttack && !sim.lastAttackPressed;
    const blasterCooldown = getConfig('blasterCooldown') as number || 0.22;
    const blasterSpeed = getConfig('blasterSpeed') as number || 750;
    const blasterDamage = getConfig('blasterDamage') as number || 25;

    if ((attackJustPressed || (isAttack && player.shootCooldown <= 0)) && player.shootCooldown <= 0) {
      player.shootCooldown = blasterCooldown;
      const bulletVx = player.facingRight ? blasterSpeed : -blasterSpeed;
      const spawnX = player.facingRight ? player.x + player.width + 4 : player.x - 4;
      const spawnY = player.y + player.height / 2 - 2;

      sim.playerBullets.push({
        id: Math.random().toString(),
        x: spawnX,
        y: spawnY,
        vx: bulletVx,
        vy: 0,
        radius: 6,
        life: 1.2,
        damage: blasterDamage,
      });

      gameAudio.playArcadeLaser();
      spawnParticles(spawnX, spawnY, 4, ['#00f0ff', '#ffffff'], 70, 'spark');
    }
    sim.lastAttackPressed = isAttack;

    // DASH (short burst with i-frames; one air dash per airtime)
    const dashJustPressed = isDash && !sim.lastDashPressed;
    sim.lastDashPressed = isDash;
    if (
      dashJustPressed &&
      player.dashTimer <= 0 &&
      player.dashCooldown <= 0 &&
      (player.isGrounded || player.canAirDash)
    ) {
      player.dashDir = isLeft ? -1 : isRight ? 1 : player.facingRight ? 1 : -1;
      player.facingRight = player.dashDir > 0;
      player.dashTimer = DASH_DURATION;
      player.dashCooldown = DASH_COOLDOWN;
      if (!player.isGrounded) player.canAirDash = false;
      gameAudio.playShieldBlock();
      spawnParticles(player.x + player.width / 2, player.y + player.height / 2, 10, ['#00f0ff', '#a855f7', '#ffffff'], 120, 'glitch');
    }

    // HORIZONTAL ACCELERATION & SKIDDING
    const groundAccel = (getConfig('groundAccel') as number) * 3500 * dt;
    const groundDecel = Math.pow(getConfig('groundDecel') as number, dt * 60);
    const airAccel = (getConfig('airAccel') as number) * 2600 * dt;
    const airDecel = Math.pow(getConfig('airDecel') as number, dt * 60);

    const accel = player.isGrounded ? groundAccel : airAccel;
    const decel = player.isGrounded ? groundDecel : airDecel;
    const isDashing = player.dashTimer > 0;

    if (isDashing) {
      player.dashTimer = Math.max(0, player.dashTimer - dt);
      player.vx = player.dashDir * maxSpeedX * DASH_SPEED_MULT;
      player.vy = 0;
      // Afterimage trail
      if (Math.floor(player.dashTimer / 0.03) !== Math.floor((player.dashTimer + dt) / 0.03)) {
        sim.afterimages.push({
          x: player.x,
          y: player.y,
          flip: !player.facingRight,
          alpha: 0.55,
          anim: {...sim.animState},
        });
      }
      if (player.dashTimer === 0) {
        player.vx = player.dashDir * maxSpeedX;
      }
    } else if (isLeft) {
      player.facingRight = false;
      if (player.isGrounded && player.vx > 40) {
        player.vx -= accel * 1.6;
        spawnParticles(player.x + player.width, player.y + player.height, 2, ['#00f0ff'], 40);
      } else {
        player.vx -= accel;
      }
    } else if (isRight) {
      player.facingRight = true;
      if (player.isGrounded && player.vx < -40) {
        player.vx += accel * 1.6;
        spawnParticles(player.x, player.y + player.height, 2, ['#00f0ff'], 40);
      } else {
        player.vx += accel;
      }
    } else {
      player.vx *= decel;
      if (Math.abs(player.vx) < 5) player.vx = 0;
    }

    if (!isDashing) {
      player.vx = clamp(player.vx, -maxSpeedX, maxSpeedX);
    }

    // ASYMMETRIC GRAVITY & APEX HANG TIME
    const gravityRising = (getConfig('gravityRising') as number) * 1600;
    const gravityFalling = (getConfig('gravityFalling') as number) * 1700;
    const gravityApex = (getConfig('gravityApex') as number) * 1600;
    const apexThreshold = (getConfig('apexThreshold') as number) * 40;

    let appliedGravity = gravityFalling;
    if (player.vy < 0) {
      if (Math.abs(player.vy) < apexThreshold) {
        appliedGravity = gravityApex;
      } else {
        appliedGravity = gravityRising;
      }
    }
    if (!isDashing) {
      player.vy += appliedGravity * dt;
      player.vy = clamp(player.vy, -800, 1100);
    }

    // UPDATE MOVING & DISAPPEARING PLATFORMS
    sector.platforms.forEach((p) => {
      if (p.moving) {
        const m = p.moving;
        const progress = Math.sin(sim.gameTime * (m.speed / 40));
        const prevX = p.x;
        const prevY = p.y;
        if (m.axis === 'x') {
          p.x = m.initialX + progress * (m.range / 2);
        } else {
          p.y = m.initialY + progress * (m.range / 2);
        }
        p.vx = (p.x - prevX) / dt;
        p.vy = (p.y - prevY) / dt;
      }

      if (p.disappearing) {
        const d = p.disappearing;
        d.timer = (sim.gameTime) % d.cycleDuration;
        d.isVisible = d.timer < d.activeDuration;
      }
    });

    // If player is on a moving platform, carry its velocity (both axes, so
    // descending platforms don't make the player hop off every frame)
    if (player.isGrounded && player.ridingPlatform) {
      if (player.ridingPlatform.vx) player.x += player.ridingPlatform.vx * dt;
      if (player.ridingPlatform.vy) player.y += player.ridingPlatform.vy * dt;
    }

    // X-AXIS MOVEMENT & COLLISION RESOLUTION
    player.x += player.vx * dt;

    // Bounds X
    if (player.x < 0) {
      player.x = 0;
      player.vx = 0;
    }
    if (player.x + player.width > sector.worldWidth) {
      player.x = sector.worldWidth - player.width;
      player.vx = 0;
    }

    // Solid X collisions
    for (const p of sector.platforms) {
      if (p.oneWay) continue;
      if (p.disappearing && !p.disappearing.isVisible) continue;

      const overlapsX = player.x < p.x + p.width && player.x + player.width > p.x;
      const overlapsY = player.y < p.y + p.height && player.y + player.height > p.y;

      if (overlapsX && overlapsY) {
        if (player.vx > 0) {
          player.x = p.x - player.width;
        } else if (player.vx < 0) {
          player.x = p.x + p.width;
        }
        player.vx = 0;
      }
    }

    // Y-AXIS MOVEMENT & COLLISION RESOLUTION
    const prevY = player.y;
    player.y += player.vy * dt;
    let groundedThisFrame = false;
    let standingPlatform: Platform | null = null;

    for (const p of sector.platforms) {
      if (p.disappearing && !p.disappearing.isVisible) continue;

      const overlapsX = player.x + 4 < p.x + p.width && player.x + player.width - 4 > p.x;
      if (!overlapsX) continue;

      if (p.oneWay) {
        const wasAbove = prevY + player.height <= p.y + 6;
        const nowBelow = player.y + player.height >= p.y;
        if (wasAbove && nowBelow && player.vy >= 0 && player.dropThroughTimer <= 0) {
          player.y = p.y - player.height;
          player.vy = 0;
          groundedThisFrame = true;
          standingPlatform = p;
        }
      } else {
        const overlapsY = player.y < p.y + p.height && player.y + player.height > p.y;
        if (overlapsY) {
          if (player.vy > 0) {
            player.y = p.y - player.height;
            player.vy = 0;
            groundedThisFrame = true;
            standingPlatform = p;
          } else if (player.vy < 0) {
            const cornerThreshold = getConfig('cornerCorrectionThreshold') as number;
            const overlapLeft = player.x + player.width - p.x;
            const overlapRight = p.x + p.width - player.x;

            if (overlapLeft > 0 && overlapLeft < cornerThreshold) {
              player.x -= overlapLeft + 2;
            } else if (overlapRight > 0 && overlapRight < cornerThreshold) {
              player.x += overlapRight + 2;
            } else {
              player.y = p.y + p.height;
              player.vy = 0;
            }
          }
        }
      }
    }

    if (groundedThisFrame && !player.isGrounded) {
      gameAudio.playJumpLandingThud();
      spawnParticles(player.x + player.width / 2, player.y + player.height, 6, ['#00f0ff', '#ffffff'], 60);
    }
    player.isGrounded = groundedThisFrame;
    player.ridingPlatform = standingPlatform;

    // VOID FALL CHECK
    if (player.y > sector.worldHeight + 60) {
      handlePlayerHit(getConfig('hazardDamage') as number, true);
    }

    // -------------------------------------------------------------
    // UPDATE PLAYER BULLETS & COMBAT INTERACTIONS
    // -------------------------------------------------------------
    for (let i = sim.playerBullets.length - 1; i >= 0; i--) {
      const b = sim.playerBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      let bulletHit = false;

      // Check hit with drones
      for (const drone of sector.drones) {
        if (drone.isDead) continue;
        if (
          b.x + b.radius > drone.x &&
          b.x - b.radius < drone.x + drone.width &&
          b.y + b.radius > drone.y &&
          b.y - b.radius < drone.y + drone.height
        ) {
          drone.hp -= b.damage;
          bulletHit = true;
          gameAudio.playMeleePunch();
          spawnParticles(b.x, b.y, 8, ['#00f0ff', '#ffffff', '#ff007f'], 100, 'spark');
          addFloatingText(drone.x + drone.width / 2, drone.y - 10, `-${b.damage}`, '#00f0ff');

          if (drone.hp <= 0) {
            killDrone(drone);
          }
          break;
        }
      }

      // Check hit with Boss
      const boss = sector.boss;
      if (!bulletHit && boss && boss.active && boss.hp > 0) {
        if (
          b.x + b.radius > boss.x &&
          b.x - b.radius < boss.x + boss.width &&
          b.y + b.radius > boss.y &&
          b.y - b.radius < boss.y + boss.height
        ) {
          const dmgMultiplier = boss.isVulnerable ? 2.5 : 1.0;
          const actualDmg = Math.round(b.damage * dmgMultiplier);
          boss.hp = Math.max(0, boss.hp - actualDmg);
          bulletHit = true;

          if (boss.isVulnerable) {
            gameAudio.playGunshotBlast();
            addCameraTrauma(0.25);
            spawnParticles(b.x, b.y, 12, ['#ff007f', '#fbbf24', '#ffffff'], 160, 'ring');
            addFloatingText(boss.x + boss.width / 2, boss.y - 15, `CRIT! -${actualDmg}`, '#f43f5e');
          } else {
            gameAudio.playShieldBlock();
            spawnParticles(b.x, b.y, 6, ['#00f0ff', '#ffffff'], 80, 'spark');
            addFloatingText(boss.x + boss.width / 2, boss.y - 10, `-${actualDmg}`, '#00f0ff');
          }

          if (boss.hp <= 0) {
            handleBossDefeated(boss);
          }
        }
      }

      // Check solid platform hit
      if (!bulletHit) {
        for (const p of sector.platforms) {
          if (p.oneWay) continue;
          if (p.disappearing && !p.disappearing.isVisible) continue;
          if (
            b.x + b.radius > p.x &&
            b.x - b.radius < p.x + p.width &&
            b.y + b.radius > p.y &&
            b.y - b.radius < p.y + p.height
          ) {
            bulletHit = true;
            spawnParticles(b.x, b.y, 4, ['#00f0ff', '#ffffff'], 60, 'spark');
            break;
          }
        }
      }

      if (b.life <= 0 || bulletHit) {
        sim.playerBullets.splice(i, 1);
      }
    }

    // -------------------------------------------------------------
    // UPDATE ENEMY BULLETS
    // -------------------------------------------------------------
    for (let i = sim.enemyBullets.length - 1; i >= 0; i--) {
      const eb = sim.enemyBullets[i];

      if (eb.isSeeker) {
        const angle = Math.atan2(player.y + player.height / 2 - eb.y, player.x + player.width / 2 - eb.x);
        eb.vx += Math.cos(angle) * 180 * dt;
        eb.vy += Math.sin(angle) * 180 * dt;
        const currentSpd = Math.hypot(eb.vx, eb.vy);
        if (currentSpd > 220) {
          eb.vx = (eb.vx / currentSpd) * 220;
          eb.vy = (eb.vy / currentSpd) * 220;
        }
      }

      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      eb.life -= dt;

      // Check hit with player
      if (player.invulnerableTimer <= 0) {
        const pBox = {x: player.x + 4, y: player.y + 4, w: player.width - 8, h: player.height - 8};
        if (
          eb.x + eb.radius > pBox.x &&
          eb.x - eb.radius < pBox.x + pBox.w &&
          eb.y + eb.radius > pBox.y &&
          eb.y - eb.radius < pBox.y + pBox.h
        ) {
          if (handlePlayerHit(getConfig('hazardDamage') as number, false, eb.vx > 0 ? 1 : -1)) {
            sim.enemyBullets.splice(i, 1);
            continue;
          }
        }
      }

      if (eb.life <= 0) {
        sim.enemyBullets.splice(i, 1);
      }
    }

    // -------------------------------------------------------------
    // UPDATE SHOCKWAVES
    // -------------------------------------------------------------
    for (let i = sim.shockwaves.length - 1; i >= 0; i--) {
      const sw = sim.shockwaves[i];
      sw.radius += sw.speed * dt;

      // Check collision with player feet if grounded
      if (sw.active && player.isGrounded && player.invulnerableTimer <= 0) {
        const dist = Math.abs(player.x + player.width / 2 - sw.x);
        if (Math.abs(dist - sw.radius) < 24 && player.y + player.height >= sw.y - 10) {
          handlePlayerHit(sw.damage, false, player.x > sw.x ? 1 : -1);
        }
      }

      if (sw.radius >= sw.maxRadius) {
        sim.shockwaves.splice(i, 1);
      }
    }

    // -------------------------------------------------------------
    // UPDATE DRONES & JUMP STOMP COLLISION
    // -------------------------------------------------------------
    sector.drones.forEach((drone) => {
      if (drone.isDead) return;

      if (drone.patrolType === 'horizontal') {
        drone.x += drone.direction * drone.speed * dt;
        if (drone.x <= drone.minCoord) {
          drone.x = drone.minCoord;
          drone.direction = 1;
        } else if (drone.x >= drone.maxCoord) {
          drone.x = drone.maxCoord;
          drone.direction = -1;
        }
      } else if (drone.patrolType === 'hover') {
        drone.x += drone.direction * drone.speed * dt;
        drone.y = drone.baseY + Math.sin(sim.gameTime * 3 + drone.timeOffset) * 25;
        if (drone.x <= drone.minCoord) {
          drone.x = drone.minCoord;
          drone.direction = 1;
        } else if (drone.x >= drone.maxCoord) {
          drone.x = drone.maxCoord;
          drone.direction = -1;
        }
      }

      // Sector 02+ drones fire aimed bolts when the player is nearby
      if (sector.levelNumber >= 2) {
        const interval = sector.levelNumber >= 3 ? 2.0 : 2.6;
        if (drone.shootTimer === undefined) drone.shootTimer = interval * 0.5 + drone.timeOffset;
        const dcx = drone.x + drone.width / 2;
        const dcy = drone.y + drone.height / 2;
        const pcx = player.x + player.width / 2;
        const pcy = player.y + player.height / 2;
        if (Math.hypot(pcx - dcx, pcy - dcy) < 520) {
          drone.shootTimer -= dt;
          if (drone.shootTimer <= 0) {
            drone.shootTimer = interval;
            const angle = Math.atan2(pcy - dcy, pcx - dcx);
            sim.enemyBullets.push({
              id: Math.random().toString(),
              x: dcx,
              y: dcy,
              vx: Math.cos(angle) * 230,
              vy: Math.sin(angle) * 230,
              radius: 6,
              life: 3.0,
              color: sector.levelNumber >= 3 ? '#c084fc' : '#fb923c',
            });
            gameAudio.playArcadeLaser();
          }
        }
      }

      // Check Jump Stomp or Player collision
      const dBox = {x: drone.x + 6, y: drone.y + 6, w: drone.width - 12, h: drone.height - 12};
      const pBox = {x: player.x + 4, y: player.y + 4, w: player.width - 8, h: player.height - 8};

      if (
        pBox.x < dBox.x + dBox.w &&
        pBox.x + pBox.w > dBox.x &&
        pBox.y < dBox.y + dBox.h &&
        pBox.y + pBox.h > dBox.y
      ) {
        // Jump Stomp from above
        if (player.vy > 0 && prevY + player.height <= drone.y + 14) {
          drone.hp -= 50;
          player.vy = -480; // bounce jump
          gameAudio.playGunshotBlast();
          spawnParticles(drone.x + drone.width / 2, drone.y, 12, ['#00f0ff', '#ffffff'], 120, 'spark');
          addFloatingText(drone.x + drone.width / 2, drone.y - 10, 'STOMP! -50', '#38bdf8');

          // Stomping refreshes the air dash for aerial chains
          player.canAirDash = true;
          player.jumpCount = 1;

          if (drone.hp <= 0) {
            killDrone(drone);
          }
        } else if (player.invulnerableTimer <= 0) {
          handlePlayerHit(getConfig('hazardDamage') as number, false, drone.x < player.x ? 1 : -1);
        }
      }
    });

    // -------------------------------------------------------------
    // UPDATE LASERS
    // -------------------------------------------------------------
    sector.lasers.forEach((laser) => {
      const cycleTime = (sim.gameTime + laser.timeOffset) % laser.cycleDuration;
      const offDuration = laser.cycleDuration - laser.activeDuration - laser.warningDuration;

      if (cycleTime < offDuration) {
        laser.state = 'off';
      } else if (cycleTime < offDuration + laser.warningDuration) {
        laser.state = 'warning';
      } else {
        laser.state = 'active';
      }

      if (laser.state === 'active' && player.invulnerableTimer <= 0) {
        const lBox = {x: laser.x, y: laser.y, w: laser.width, h: laser.height};
        const pBox = {x: player.x + 4, y: player.y + 4, w: player.width - 8, h: player.height - 8};
        if (
          pBox.x < lBox.x + lBox.w &&
          pBox.x + pBox.w > lBox.x &&
          pBox.y < lBox.y + lBox.h &&
          pBox.y + pBox.h > lBox.y
        ) {
          handlePlayerHit(getConfig('hazardDamage') as number, false);
        }
      }
    });

    // -------------------------------------------------------------
    // UPDATE BOSS STATE MACHINES
    // -------------------------------------------------------------
    const boss = sector.boss;
    if (boss && boss.hp > 0) {
      // Activate boss when player enters arena
      if (!boss.active && player.x > boss.x - 600) {
        boss.active = true;
        gameAudio.playLevelUpStinger();
        addFloatingText(boss.x, boss.y - 30, `WARNING: ${boss.name} ENGAGED`, '#f43f5e');
      }

      if (boss.active) {
        updateBossAI(boss, player, dt);
      }
    }

    // CHECKPOINTS COLLISION
    sector.checkpoints.forEach((cp) => {
      if (!cp.activated) {
        const cpBox = {x: cp.x, y: cp.y, w: cp.width, h: cp.height};
        const pBox = {x: player.x, y: player.y, w: player.width, h: player.height};
        if (
          pBox.x < cpBox.x + cpBox.w &&
          pBox.x + pBox.w > cpBox.x &&
          pBox.y < cpBox.y + cpBox.h &&
          pBox.y + pBox.h > cpBox.y
        ) {
          cp.activated = true;
          sim.lastCheckpointPos = {x: cp.x + 40, y: cp.y + cp.height - player.height};
          gameAudio.playPowerupChime();
          sim.integrity = Math.min(getConfig('maxIntegrity') as number, sim.integrity + 35);
          setGameState((prev) => ({...prev, integrity: sim.integrity}));
          addFloatingText(cp.x + 10, cp.y - 15, 'CHECKPOINT ACTIVATED // +35 HP', '#22d3ee');
          spawnParticles(cp.x + cp.width / 2, cp.y + cp.height / 2, 24, ['#00f0ff', '#ff007f', '#ffffff'], 180, 'ring');
        }
      }
    });

    // DATA FRAGMENTS COLLECTION
    sector.fragments.forEach((frag) => {
      if (!frag.collected) {
        const fBox = {x: frag.x, y: frag.y, w: frag.width, h: frag.height};
        const pBox = {x: player.x, y: player.y, w: player.width, h: player.height};
        if (
          pBox.x < fBox.x + fBox.w &&
          pBox.x + pBox.w > fBox.x &&
          pBox.y < fBox.y + fBox.h &&
          pBox.y + pBox.h > fBox.y
        ) {
          frag.collected = true;
          const pts = getConfig('fragmentScoreValue') as number;
          gameAudio.playCoinPickup();
          spawnParticles(frag.x + frag.width / 2, frag.y + frag.height / 2, 16, ['#00f0ff', '#a855f7', '#ffffff'], 120);
          addFloatingText(frag.x, frag.y - 10, `+${pts}`, '#38bdf8');
          const allCollected = sector.fragments.every((f) => f.collected);
          if (allCollected) {
            gameAudio.playLevelUpStinger();
            addFloatingText(frag.x, frag.y - 30, `FULL DECRYPT! +${FULL_DECRYPT_BONUS}`, '#fbbf24');
            spawnParticles(player.x + player.width / 2, player.y + player.height / 2, 30, ['#fbbf24', '#ffffff', '#00f0ff'], 220, 'ring');
          }
          setGameState((prev) => ({
            ...prev,
            score: prev.score + pts + (allCollected ? FULL_DECRYPT_BONUS : 0),
            fragmentsCount: (prev.fragmentsCount ?? 0) + 1,
            totalFragmentsCollected: (prev.totalFragmentsCollected ?? 0) + 1,
          }));
        }
      }
    });

    // PORTAL EXIT CHECK
    const portal = sector.portal;
    const isPortalReady = portal.isUnlocked || (!boss || boss.hp <= 0);
    if (isPortalReady) {
      portal.isUnlocked = true;
      const portBox = {x: portal.x + 10, y: portal.y + 10, w: portal.width - 20, h: portal.height - 20};
      const pBox = {x: player.x, y: player.y, w: player.width, h: player.height};
      if (
        pBox.x < portBox.x + portBox.w &&
        pBox.x + pBox.w > portBox.x &&
        pBox.y < portBox.y + portBox.h &&
        pBox.y + pBox.h > portBox.y
      ) {
        if (sector.levelNumber < 3) {
          gameAudio.playPowerupChime();
          spawnParticles(portal.x + portal.width / 2, portal.y + portal.height / 2, 30, ['#00f0ff', '#ff007f', '#ffffff'], 200, 'ring');
          loadSector(sector.levelNumber + 1, true);
        } else {
          // VICTORY!
          sim.halted = true;
          setGameState((prev) => ({
            ...prev,
            status: 'VICTORY',
            score: prev.score + 1500,
          }));
        }
      }
    }

    // UPDATE FLOATING TEXTS
    for (let i = sim.floatingTexts.length - 1; i >= 0; i--) {
      const ft = sim.floatingTexts[i];
      ft.y -= 25 * dt;
      ft.life -= dt;
      ft.alpha = ft.life / 0.9;
      if (ft.life <= 0) {
        sim.floatingTexts.splice(i, 1);
      }
    }

    // UPDATE PARTICLES
    for (let i = sim.particles.length - 1; i >= 0; i--) {
      const pt = sim.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      pt.alpha = pt.life / pt.maxLife;
      if (pt.life <= 0) {
        sim.particles.splice(i, 1);
      }
    }

    // UPDATE DASH AFTERIMAGES
    for (let i = sim.afterimages.length - 1; i >= 0; i--) {
      sim.afterimages[i].alpha -= dt * 2.8;
      if (sim.afterimages[i].alpha <= 0) {
        sim.afterimages.splice(i, 1);
      }
    }

    // CAMERA SMOOTH TRACKING & TRAUMA DECAY
    const targetCamX = player.x - canvasWidth / 2 + player.width / 2;
    const maxCamX = Math.max(0, sector.worldWidth - canvasWidth);
    sim.camera.x += (clamp(targetCamX, 0, maxCamX) - sim.camera.x) * (dt * 8);

    if (sim.camera.trauma > 0) {
      sim.camera.trauma = Math.max(0, sim.camera.trauma - dt * 1.5);
    }

    // SPRITE ANIMATION STATE UPDATE
    let nextAction = 'IDLE';
    if (player.invulnerableTimer > 0 && player.vy !== 0) {
      nextAction = 'HURT';
    } else if (!player.isGrounded) {
      nextAction = 'JUMP';
    } else if (Math.abs(player.vx) > 15) {
      nextAction = 'RUN';
    } else {
      nextAction = 'IDLE';
    }

    if (sim.animState.currentAction !== nextAction) {
      sim.animState = {
        currentAction: nextAction,
        currentFrame: 0,
        timer: 0,
      };
    } else if (playerSpriteRef.current) {
      sim.animState = playerSpriteRef.current.getNextState(sim.animState, dt);
    }
  };

  // -------------------------------------------------------------
  // BOSS AI IMPLEMENTATIONS FOR SECTORS 1, 2, and 3
  // -------------------------------------------------------------
  const updateBossAI = (boss: BossEntity, player: typeof simRef.current.player, dt: number) => {
    const sim = simRef.current;
    boss.stateTimer -= dt;

    if (boss.sector === 1) {
      // GUARDIAN DRONE (Pattern 1: Sweep laser/dive, Pattern 2: Pulse burst, Vulnerable recharge)
      const healthPercent = boss.hp / boss.maxHp;
      boss.phase = healthPercent < 0.5 ? 2 : 1;

      if (boss.state === 'IDLE') {
        // Hover around arena top
        const targetX = 3150 + Math.sin(sim.gameTime * 2) * 200;
        const targetY = 240 + Math.cos(sim.gameTime * 3) * 40;
        boss.x += (targetX - boss.x) * (dt * 3);
        boss.y += (targetY - boss.y) * (dt * 3);

        if (boss.stateTimer <= 0) {
          boss.attackCounter++;
          if (boss.attackCounter % 3 === 0) {
            // Enter Vulnerable Overheat State
            boss.state = 'VULNERABLE';
            boss.isVulnerable = true;
            boss.stateTimer = 3.2;
            addFloatingText(boss.x, boss.y - 20, 'OVERHEATED // REACTOR EXPOSED!', '#f43f5e');
          } else if (boss.attackCounter % 2 === 1) {
            // Pattern 1: Sweep Dive
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 1;
            boss.telegraphTarget = {x: player.x, y: player.y};
            boss.stateTimer = 1.0;
          } else {
            // Pattern 2: Pulse Burst
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 2;
            boss.stateTimer = 0.8;
          }
        }
      } else if (boss.state === 'TELEGRAPH') {
        if (boss.stateTimer <= 0) {
          boss.state = 'ATTACK';
          if (boss.attackPattern === 1) {
            // Dive Attack
            const angle = Math.atan2(boss.telegraphTarget.y - boss.y, boss.telegraphTarget.x - boss.x);
            boss.vx = Math.cos(angle) * 550;
            boss.vy = Math.sin(angle) * 550;
            boss.stateTimer = 1.2;
            gameAudio.playGunshotBlast();
          } else if (boss.attackPattern === 2) {
            // Pulse Burst (3-5 spreading plasma bolts)
            const count = boss.phase === 2 ? 5 : 3;
            for (let i = 0; i < count; i++) {
              const spread = (i - (count - 1) / 2) * 0.28;
              const baseAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
              const angle = baseAngle + spread;
              sim.enemyBullets.push({
                id: Math.random().toString(),
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height / 2,
                vx: Math.cos(angle) * 320,
                vy: Math.sin(angle) * 320,
                radius: 7,
                life: 3.5,
                color: '#f43f5e',
              });
            }
            gameAudio.playArcadeLaser();
            boss.stateTimer = 1.2;
          }
        }
      } else if (boss.state === 'ATTACK') {
        if (boss.attackPattern === 1) {
          boss.x += boss.vx * dt;
          boss.y += boss.vy * dt;
          // Dive impact check with player
          if (player.invulnerableTimer <= 0) {
            const bBox = {x: boss.x, y: boss.y, w: boss.width, h: boss.height};
            const pBox = {x: player.x, y: player.y, w: player.width, h: player.height};
            if (
              pBox.x < bBox.x + bBox.w &&
              pBox.x + pBox.w > bBox.x &&
              pBox.y < bBox.y + bBox.h &&
              pBox.y + pBox.h > bBox.y
            ) {
              handlePlayerHit(getConfig('hazardDamage') as number, false, boss.vx > 0 ? 1 : -1);
            }
          }
        }

        if (boss.stateTimer <= 0) {
          boss.state = 'IDLE';
          boss.stateTimer = 1.5;
          boss.vx = 0;
          boss.vy = 0;
        }
      } else if (boss.state === 'VULNERABLE') {
        // Drop low and emit steam sparks
        boss.y += (480 - boss.y) * (dt * 4);
        spawnParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, 2, ['#fbbf24', '#f43f5e', '#ffffff'], 60, 'spark');

        if (boss.stateTimer <= 0) {
          boss.state = 'IDLE';
          boss.isVulnerable = false;
          boss.stateTimer = 2.0;
        }
      }
    } else if (boss.sector === 2) {
      // FIREWALL SENTINEL (Rotating quad laser beams, Magma bursts, Floor shockwave)
      const healthPercent = boss.hp / boss.maxHp;
      boss.phase = healthPercent < 0.35 ? 3 : healthPercent < 0.7 ? 2 : 1;

      if (boss.state === 'IDLE') {
        const targetX = 3500 + Math.sin(sim.gameTime * 1.5) * 180;
        boss.x += (targetX - boss.x) * (dt * 2.5);

        if (boss.stateTimer <= 0) {
          boss.attackCounter++;
          if (boss.attackCounter % 4 === 0) {
            boss.state = 'VULNERABLE';
            boss.isVulnerable = true;
            boss.stateTimer = 3.5;
            addFloatingText(boss.x, boss.y - 20, 'COOLING VENTS OPEN // STRIKE CORE!', '#fbbf24');
          } else if (boss.attackCounter % 3 === 1) {
            // Pattern 1: Rotating Laser Sweep
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 1;
            boss.stateTimer = 1.2;
            boss.laserAngle = 0;
          } else if (boss.attackCounter % 3 === 2) {
            // Pattern 2: Triple Magma Spread
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 2;
            boss.stateTimer = 0.9;
          } else {
            // Pattern 3: Ground Shockwave Surge
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 3;
            boss.stateTimer = 1.0;
          }
        }
      } else if (boss.state === 'TELEGRAPH') {
        if (boss.stateTimer <= 0) {
          boss.state = 'ATTACK';
          if (boss.attackPattern === 1) {
            boss.stateTimer = 3.0; // rotate for 3 seconds
          } else if (boss.attackPattern === 2) {
            // Fire fiery magma orbs
            const burstCount = boss.phase >= 2 ? 6 : 4;
            for (let i = 0; i < burstCount; i++) {
              const angle = Math.PI * 0.2 + (i / (burstCount - 1)) * Math.PI * 0.6;
              sim.enemyBullets.push({
                id: Math.random().toString(),
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height / 2,
                vx: Math.cos(angle) * 340,
                vy: Math.sin(angle) * 340,
                radius: 8,
                life: 3.5,
                color: '#ff5722',
              });
            }
            gameAudio.playGunshotBlast();
            boss.stateTimer = 1.2;
          } else if (boss.attackPattern === 3) {
            // Launch ground clearing shockwave
            sim.shockwaves.push({
              x: boss.x + boss.width / 2,
              y: 620,
              radius: 10,
              maxRadius: 550,
              speed: 380,
              active: true,
              damage: 25,
            });
            gameAudio.playChiptuneExplosion();
            addCameraTrauma(0.3);
            boss.stateTimer = 1.4;
          }
        }
      } else if (boss.state === 'ATTACK') {
        if (boss.attackPattern === 1) {
          // Quad laser rotation
          boss.laserAngle += dt * 1.5;
          // Check collision with rotating laser beams
          if (player.invulnerableTimer <= 0) {
            for (let k = 0; k < 4; k++) {
              const rayAngle = boss.laserAngle + (k * Math.PI) / 2;
              const rayDist = 320;
              const pCenterX = player.x + player.width / 2;
              const pCenterY = player.y + player.height / 2;
              const bCenterX = boss.x + boss.width / 2;
              const bCenterY = boss.y + boss.height / 2;

              // Distance from player center to ray segment
              const dx = pCenterX - bCenterX;
              const dy = pCenterY - bCenterY;
              const proj = dx * Math.cos(rayAngle) + dy * Math.sin(rayAngle);
              if (proj > 0 && proj < rayDist) {
                const perpDist = Math.abs(-dx * Math.sin(rayAngle) + dy * Math.cos(rayAngle));
                if (perpDist < 18) {
                  handlePlayerHit(getConfig('hazardDamage') as number, false);
                }
              }
            }
          }
        }

        if (boss.stateTimer <= 0) {
          boss.state = 'IDLE';
          boss.stateTimer = 1.4;
        }
      } else if (boss.state === 'VULNERABLE') {
        spawnParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, 3, ['#fbbf24', '#ff5722', '#ffffff'], 70, 'spark');
        if (boss.stateTimer <= 0) {
          boss.state = 'IDLE';
          boss.isVulnerable = false;
          boss.stateTimer = 1.8;
        }
      }
    } else if (boss.sector === 3) {
      // CORE-OMEGA (Multi-Phase Final Superboss)
      const healthPercent = boss.hp / boss.maxHp;
      boss.phase = healthPercent < 0.3 ? 3 : healthPercent < 0.65 ? 2 : 1;

      if (boss.state === 'IDLE') {
        // Move with pulsing speed depending on phase
        const speedMult = boss.phase === 3 ? 2.5 : boss.phase === 2 ? 1.8 : 1.2;
        const targetX = 3850 + Math.sin(sim.gameTime * 2 * speedMult) * 220;
        const targetY = 250 + Math.cos(sim.gameTime * 3 * speedMult) * 60;
        boss.x += (targetX - boss.x) * (dt * 3);
        boss.y += (targetY - boss.y) * (dt * 3);

        if (boss.stateTimer <= 0) {
          boss.attackCounter++;
          if (boss.attackCounter % 4 === 0) {
            // Phase-dependent vulnerability window
            boss.state = 'VULNERABLE';
            boss.isVulnerable = true;
            boss.stateTimer = boss.phase === 3 ? 2.5 : 3.5;
            addFloatingText(boss.x, boss.y - 25, 'MAINFRAME CORE EXPOSED // FIRE FULL BURST!', '#c084fc');
          } else if (boss.phase === 1) {
            // Heavy plasma orbs
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 1;
            boss.stateTimer = 0.9;
          } else if (boss.phase === 2) {
            // Seeker tracking nodes + floor surge
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 2;
            boss.stateTimer = 0.8;
          } else {
            // Phase 3: Grid laser barrage & overclocked storm
            boss.state = 'TELEGRAPH';
            boss.attackPattern = 3;
            boss.stateTimer = 0.7;
          }
        }
      } else if (boss.state === 'TELEGRAPH') {
        if (boss.stateTimer <= 0) {
          boss.state = 'ATTACK';
          if (boss.attackPattern === 1) {
            // Heavy targeted plasma orbs with clear dodging lanes
            for (let i = 0; i < 4; i++) {
              const angle = Math.PI * 0.15 + i * 0.35;
              sim.enemyBullets.push({
                id: Math.random().toString(),
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height / 2,
                vx: Math.cos(angle) * 360,
                vy: Math.sin(angle) * 360,
                radius: 10,
                life: 3.5,
                color: '#c084fc',
              });
            }
            gameAudio.playGunshotBlast();
            boss.stateTimer = 1.0;
          } else if (boss.attackPattern === 2) {
            // Tracking seeker node + shockwave
            sim.enemyBullets.push({
              id: Math.random().toString(),
              x: boss.x + boss.width / 2,
              y: boss.y + boss.height / 2,
              vx: (player.x - boss.x) > 0 ? 160 : -160,
              vy: 60,
              radius: 9,
              life: 4.5,
              color: '#f43f5e',
              isSeeker: true,
            });
            sim.shockwaves.push({
              x: boss.x + boss.width / 2,
              y: 620,
              radius: 10,
              maxRadius: 600,
              speed: 400,
              active: true,
              damage: 25,
            });
            gameAudio.playChiptuneExplosion();
            addCameraTrauma(0.3);
            boss.stateTimer = 1.2;
          } else if (boss.attackPattern === 3) {
            // Alternating grid barrage
            for (let i = 0; i < 8; i++) {
              const angle = (i / 8) * Math.PI * 2;
              sim.enemyBullets.push({
                id: Math.random().toString(),
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height / 2,
                vx: Math.cos(angle) * 380,
                vy: Math.sin(angle) * 380,
                radius: 8,
                life: 3.2,
                color: '#38bdf8',
              });
            }
            gameAudio.playArcadeLaser();
            boss.stateTimer = 1.0;
          }
        }
      } else if (boss.state === 'ATTACK') {
        if (boss.stateTimer <= 0) {
          boss.state = 'IDLE';
          boss.stateTimer = boss.phase === 3 ? 0.9 : 1.3;
        }
      } else if (boss.state === 'VULNERABLE') {
        spawnParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, 4, ['#c084fc', '#38bdf8', '#ffffff'], 80, 'spark');
        if (boss.stateTimer <= 0) {
          boss.state = 'IDLE';
          boss.isVulnerable = false;
          boss.stateTimer = 1.5;
        }
      }
    }
  };

  const handleBossDefeated = (boss: BossEntity) => {
    const sim = simRef.current;
    boss.hp = 0;
    boss.state = 'DEFEATED';
    boss.active = false;

    gameAudio.playChiptuneExplosion();
    addCameraTrauma(0.6);
    spawnParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, 45, ['#00f0ff', '#ff007f', '#ffffff', '#fbbf24'], 250, 'ring');
    addFloatingText(boss.x, boss.y - 30, `${boss.name} DESTROYED! +1000 PTS`, '#34d399');

    // Unlock exit portal
    sim.currentSector.portal.isUnlocked = true;

    setGameState((prev) => ({
      ...prev,
      score: prev.score + 1000,
      enemiesKilled: (prev.enemiesKilled ?? 0) + 1,
    }));
  };

  // Player Damage / Respawn Handler.
  // Health and lives live in simRef so the outcome is applied immediately: several
  // hazards (or fixed sub-steps) in the same frame can no longer stack damage or
  // cost multiple lives for a single fall. Returns whether the hit landed.
  const handlePlayerHit = (dmg: number, isVoid = false, pushbackDir = 0): boolean => {
    const sim = simRef.current;
    const player = sim.player;

    if (sim.halted) return false;
    if (!isVoid && (player.invulnerableTimer > 0 || player.dashTimer > 0)) return false;

    gameAudio.playGeneralDamage();
    addCameraTrauma(0.35);
    sim.damageFlash = 0.35;
    sim.hitStop = Math.max(sim.hitStop, 0.06);
    sim.combo = {count: 0, timer: 0};
    spawnParticles(player.x + player.width / 2, player.y + player.height / 2, 16, ['#ff007f', '#ff3366'], 160, 'glitch');

    if (isVoid) {
      gameAudio.playChiptuneExplosion();
    }

    sim.integrity = Math.max(0, sim.integrity - dmg);

    if (sim.integrity <= 0 || isVoid) {
      sim.lives -= 1;

      if (sim.lives <= 0) {
        sim.halted = true;
        sim.lives = 0;
        sim.integrity = 0;
        setGameState((prev) => ({
          ...prev,
          status: 'GAME_OVER',
          lives: 0,
          integrity: 0,
          damageTaken: (prev.damageTaken ?? 0) + dmg,
          deaths: (prev.deaths ?? 0) + 1,
        }));
        return true;
      }

      // Respawn at checkpoint
      player.x = sim.lastCheckpointPos.x;
      player.y = sim.lastCheckpointPos.y;
      player.vx = 0;
      player.vy = 0;
      player.jumpCount = 0;
      player.dashTimer = 0;
      player.canAirDash = true;
      player.ridingPlatform = null;
      player.invulnerableTimer = 1.8;
      sim.integrity = getConfig('maxIntegrity') as number;
      addFloatingText(player.x + player.width / 2, player.y - 20, `AVATAR RESTORED // ${sim.lives} LEFT`, '#f472b6');

      setGameState((prev) => ({
        ...prev,
        lives: sim.lives,
        integrity: sim.integrity,
        damageTaken: (prev.damageTaken ?? 0) + dmg,
        deaths: (prev.deaths ?? 0) + 1,
      }));
      return true;
    }

    // Normal hit with invulnerability
    player.invulnerableTimer = getConfig('invincibilityDuration') as number;
    if (pushbackDir !== 0) {
      player.vx = pushbackDir * 240;
      player.vy = -180;
    }
    setGameState((prev) => ({
      ...prev,
      integrity: sim.integrity,
      damageTaken: (prev.damageTaken ?? 0) + dmg,
    }));
    return true;
  };

  // -------------------------------------------------------------
  // DRAW CANVAS SCENE (Runs ~60 FPS)
  // -------------------------------------------------------------
  const draw = (ctx: CanvasRenderingContext2D) => {
    prepareCanvas(ctx, canvasWidth, canvasHeight);

    const sim = simRef.current;
    const sector = sim.currentSector;
    const camX = sim.camera.x;
    const camY = sim.camera.y;

    // Apply Camera Trauma Shake
    const shakeOffsetX = (Math.random() - 0.5) * 16 * sim.camera.trauma;
    const shakeOffsetY = (Math.random() - 0.5) * 16 * sim.camera.trauma;

    // Draw Parallax Background
    const bgFallback = sector.theme === 'firewall' ? '#180707' : sector.theme === 'mainframe' ? '#0f071c' : '#050714';
    drawBackground(
      ctx,
      assets['bg_cyber_network'],
      canvasWidth,
      canvasHeight,
      bgFallback,
      camX,
      camY
    );

    ctx.save();
    ctx.translate(-camX + shakeOffsetX, -camY + shakeOffsetY);

    // Draw Cyber Grid Lines & Thematic Ambiance
    const gridColor = sector.theme === 'firewall' ? 'rgba(255, 80, 0, 0.08)' : sector.theme === 'mainframe' ? 'rgba(192, 132, 252, 0.08)' : 'rgba(0, 240, 255, 0.08)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const gridSpacing = 80;
    const startX = Math.floor(camX / gridSpacing) * gridSpacing;
    const endX = camX + canvasWidth + gridSpacing;
    for (let x = startX; x < endX; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    // 1. Draw Checkpoint Beacons
    sector.checkpoints.forEach((cp) => {
      const beaconImg = assets['checkpoint_beacon'];
      drawAsset(
        ctx,
        beaconImg,
        cp.x,
        cp.y,
        cp.width,
        cp.height,
        (c) => {
          c.fillStyle = cp.activated ? '#00f0ff' : '#475569';
          c.fillRect(cp.x, cp.y, cp.width, cp.height);
        }
      );

      if (cp.activated) {
        ctx.save();
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pulse = Math.sin(sim.gameTime * 4) * 4;
        ctx.ellipse(cp.x + cp.width / 2, cp.y + 15, 18 + pulse, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });

    // 2. Draw Exit Portal
    const portal = sector.portal;
    const portalImg = assets['terminal_portal'];
    const isPortalActive = portal.isUnlocked;

    drawAsset(
      ctx,
      portalImg,
      portal.x,
      portal.y,
      portal.width,
      portal.height,
      (c) => {
        c.fillStyle = isPortalActive ? '#ff007f' : '#334155';
        c.fillRect(portal.x, portal.y, portal.width, portal.height);
      }
    );

    if (isPortalActive) {
      ctx.save();
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = 'rgba(255, 0, 127, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        portal.x + portal.width / 2,
        portal.y + portal.height / 2,
        30 + Math.sin(sim.gameTime * 6) * 6,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    } else {
      // Locked shield icon over portal
      ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKED [DEFEAT BOSS]', portal.x + portal.width / 2, portal.y - 12);
    }

    // 3. Draw Platforms (including moving & holographic disappearing ones)
    const platImg = assets['cyber_platform'];
    sector.platforms.forEach((p) => {
      // Disappearing flicker alpha
      let alpha = 1.0;
      if (p.disappearing) {
        if (!p.disappearing.isVisible) {
          alpha = 0.15; // faded out ghost outline
        } else if (p.disappearing.activeDuration - p.disappearing.timer < 0.6) {
          // Warning flicker right before vanishing
          alpha = Math.floor(sim.gameTime * 20) % 2 === 0 ? 0.3 : 0.9;
        }
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      if (platImg && platImg.complete && platImg.naturalWidth > 0 && !p.disappearing) {
        ctx.drawImage(platImg, p.x, p.y, p.width, p.height);
      } else {
        const fillTheme = p.theme === 'firewall' ? (p.oneWay ? '#7f1d1d' : '#271010') : p.theme === 'mainframe' ? (p.oneWay ? '#581c87' : '#1e102e') : (p.oneWay ? '#0e7490' : '#1e293b');
        const strokeTheme = p.theme === 'firewall' ? '#ff5722' : p.theme === 'mainframe' ? '#c084fc' : '#00f0ff';

        ctx.fillStyle = fillTheme;
        ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.strokeStyle = strokeTheme;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, p.width, p.height);
      }

      // Moving platform rails
      if (p.moving) {
        ctx.strokeStyle = 'rgba(255, 0, 127, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        if (p.moving.axis === 'x') {
          ctx.moveTo(p.moving.initialX - p.moving.range / 2, p.y + p.height / 2);
          ctx.lineTo(p.moving.initialX + p.moving.range / 2 + p.width, p.y + p.height / 2);
        } else {
          ctx.moveTo(p.x + p.width / 2, p.moving.initialY - p.moving.range / 2);
          ctx.lineTo(p.x + p.width / 2, p.moving.initialY + p.moving.range / 2 + p.height);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    });

    // 4. Draw Data Fragments
    const fragImg = assets['data_fragment'];
    sector.fragments.forEach((frag) => {
      if (frag.collected) return;
      const floatY = frag.y + Math.sin(sim.gameTime * 4 + frag.floatOffset) * 6;
      drawAsset(
        ctx,
        fragImg,
        frag.x,
        floatY,
        frag.width,
        frag.height,
        (c) => {
          c.fillStyle = '#00f0ff';
          c.beginPath();
          c.moveTo(frag.x + frag.width / 2, floatY);
          c.lineTo(frag.x + frag.width, floatY + frag.height / 2);
          c.lineTo(frag.x + frag.width / 2, floatY + frag.height);
          c.lineTo(frag.x, floatY + frag.height / 2);
          c.closePath();
          c.fill();
        }
      );
    });

    // 5. Draw Laser Grids
    sector.lasers.forEach((laser) => {
      const beamColor = laser.color || '#ff0055';
      if (laser.state === 'off') {
        ctx.fillStyle = '#334155';
        ctx.fillRect(laser.x - 4, laser.y, laser.width + 8, 8);
        ctx.fillRect(laser.x - 4, laser.y + laser.height - 8, laser.width + 8, 8);
      } else if (laser.state === 'warning') {
        const flashAlpha = 0.25 + Math.sin(sim.gameTime * 20) * 0.2;
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = beamColor;
        ctx.fillRect(laser.x + 3, laser.y, laser.width - 6, laser.height);
        ctx.restore();
        ctx.fillStyle = beamColor;
        ctx.fillRect(laser.x - 4, laser.y, laser.width + 8, 8);
        ctx.fillRect(laser.x - 4, laser.y + laser.height - 8, laser.width + 8, 8);
      } else if (laser.state === 'active') {
        ctx.save();
        ctx.shadowColor = beamColor;
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(laser.x + 2, laser.y, laser.width - 4, laser.height);
        ctx.fillStyle = beamColor;
        ctx.fillRect(laser.x - 2, laser.y, laser.width + 4, laser.height);
        ctx.restore();
      }
    });

    // 6. Draw Security Drones
    const droneImg = assets['security_drone'];
    sector.drones.forEach((drone) => {
      if (drone.isDead) return;
      const flipDrone = drone.direction < 0;
      ctx.save();
      if (flipDrone) {
        ctx.translate(drone.x + drone.width, drone.y);
        ctx.scale(-1, 1);
        drawAsset(ctx, droneImg, 0, 0, drone.width, drone.height, (c) => {
          c.fillStyle = '#ef4444';
          c.beginPath();
          c.arc(drone.width / 2, drone.height / 2, drone.width / 2, 0, Math.PI * 2);
          c.fill();
        });
      } else {
        drawAsset(ctx, droneImg, drone.x, drone.y, drone.width, drone.height, (c) => {
          c.fillStyle = '#ef4444';
          c.beginPath();
          c.arc(drone.width / 2, drone.height / 2, drone.width / 2, 0, Math.PI * 2);
          c.fill();
        });
      }
      ctx.restore();

      // Charge-up glow right before a drone fires
      if (sector.levelNumber >= 2 && drone.shootTimer !== undefined && drone.shootTimer < 0.45) {
        const charge = 1 - drone.shootTimer / 0.45;
        ctx.save();
        ctx.globalAlpha = 0.35 + charge * 0.5;
        ctx.strokeStyle = sector.levelNumber >= 3 ? '#c084fc' : '#fb923c';
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(drone.x + drone.width / 2, drone.y + drone.height / 2, drone.width * (0.9 - charge * 0.35), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Drone mini HP bar if damaged
      if (drone.hp < drone.maxHp) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(drone.x, drone.y - 8, drone.width, 4);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(drone.x, drone.y - 8, (drone.width * drone.hp) / drone.maxHp, 4);
      }
    });

    // 7. Draw Shockwaves
    sim.shockwaves.forEach((sw) => {
      ctx.save();
      ctx.strokeStyle = '#ff007f';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(sw.x, sw.y, sw.radius, sw.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // 8. Draw Enemy Projectiles
    sim.enemyBullets.forEach((eb) => {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = eb.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, eb.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = eb.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    });

    // 9. Draw Boss
    const boss = sector.boss;
    if (boss && boss.hp > 0 && boss.active) {
      ctx.save();
      // Boss body rendering
      const isVulnerableFlicker = boss.isVulnerable && Math.floor(sim.gameTime * 20) % 2 === 0;
      ctx.shadowColor = boss.isVulnerable ? '#fbbf24' : '#ff0055';
      ctx.shadowBlur = boss.isVulnerable ? 25 : 15;

      // Boss core body
      ctx.fillStyle = isVulnerableFlicker ? '#fbbf24' : boss.sector === 2 ? '#ea580c' : boss.sector === 3 ? '#7e22ce' : '#0284c7';
      ctx.beginPath();
      ctx.arc(boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width / 2, 0, Math.PI * 2);
      ctx.fill();

      // Outer neon armor ring
      ctx.strokeStyle = boss.isVulnerable ? '#ffffff' : '#f43f5e';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Exposed Core center
      ctx.fillStyle = boss.isVulnerable ? '#ffffff' : '#00f0ff';
      ctx.beginPath();
      ctx.arc(boss.x + boss.width / 2, boss.y + boss.height / 2, 14 + Math.sin(sim.gameTime * 8) * 3, 0, Math.PI * 2);
      ctx.fill();

      // Telegraph lines
      if (boss.state === 'TELEGRAPH') {
        ctx.strokeStyle = 'rgba(255, 0, 80, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(boss.x + boss.width / 2, boss.y + boss.height / 2);
        ctx.lineTo(sim.player.x + sim.player.width / 2, sim.player.y + sim.player.height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Sector 2 Rotating Laser Beams
      if (boss.sector === 2 && boss.state === 'ATTACK' && boss.attackPattern === 1) {
        ctx.save();
        ctx.shadowColor = '#ff5722';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#ffedd5';
        ctx.lineWidth = 5;
        for (let k = 0; k < 4; k++) {
          const rayAngle = boss.laserAngle + (k * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(boss.x + boss.width / 2, boss.y + boss.height / 2);
          ctx.lineTo(
            boss.x + boss.width / 2 + Math.cos(rayAngle) * 320,
            boss.y + boss.height / 2 + Math.sin(rayAngle) * 320
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();
    }

    // 10. Draw Player Bullets
    sim.playerBullets.forEach((b) => {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.radius * 1.5, b.radius, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    });

    // 11. Draw Player Character Hacker via SpriteRenderer
    const player = sim.player;
    const renderSize = 72;
    sim.afterimages.forEach((ghost) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ghost.alpha);
      ctx.globalCompositeOperation = 'lighter';
      playerSpriteRef.current?.draw(
        ctx,
        ghost.anim,
        ghost.x + (player.width - renderSize) / 2,
        ghost.y + player.height - renderSize + 2,
        renderSize,
        renderSize,
        assets,
        ghost.flip
      );
      ctx.restore();
    });

    if (player.invulnerableTimer === 0 || Math.floor(sim.gameTime * 20) % 2 === 0) {
      const renderW = 72;
      const renderH = 72;
      const drawX = player.x + (player.width - renderW) / 2;
      const drawY = player.y + player.height - renderH + 2;

      playerSpriteRef.current?.draw(
        ctx,
        sim.animState,
        drawX,
        drawY,
        renderW,
        renderH,
        assets,
        !player.facingRight
      );
    }

    // 12. Draw Floating Texts
    sim.floatingTexts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    // 13. Draw Particles
    sim.particles.forEach((pt) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.fillStyle = pt.color;
      if (pt.shape === 'ring') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, pt.size * (1 + (1 - pt.alpha) * 3)), 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.shape === 'spark') {
        ctx.fillRect(pt.x - pt.size / 2, pt.y - 1, pt.size * 2, 2);
      } else if (pt.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, pt.size / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      ctx.restore();
    });

    ctx.restore();

    // ---- Screen-space feedback overlays ----
    // Low integrity warning vignette
    const integrityRatio = sim.integrity / (getConfig('maxIntegrity') as number);
    if (integrityRatio <= 0.25 && gameStateRef.current.status === 'PLAYING') {
      const pulse = 0.25 + (Math.sin(sim.gameTime * 6) + 1) * 0.12;
      const vignette = ctx.createRadialGradient(
        canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.35,
        canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.7
      );
      vignette.addColorStop(0, 'rgba(255, 0, 60, 0)');
      vignette.addColorStop(1, `rgba(255, 0, 60, ${pulse})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Damage flash
    if (sim.damageFlash > 0) {
      ctx.fillStyle = `rgba(255, 0, 80, ${sim.damageFlash * 0.6})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Combo meter
    if (sim.combo.count >= 2 && sim.combo.timer > 0) {
      const mult = Math.min(sim.combo.count, MAX_COMBO_MULTIPLIER);
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = 'bold 30px monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 14;
      ctx.fillText(`x${mult} COMBO`, canvasWidth - 24, canvasHeight - 52);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(canvasWidth - 184, canvasHeight - 40, 160, 6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(canvasWidth - 184, canvasHeight - 40, 160 * (sim.combo.timer / COMBO_WINDOW), 6);
      ctx.restore();
    }

    // Dash readiness pip (bottom-left)
    if (gameStateRef.current.status === 'PLAYING') {
      const ready = player.dashCooldown <= 0 && (player.isGrounded || player.canAirDash);
      const fill = 1 - player.dashCooldown / DASH_COOLDOWN;
      ctx.save();
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = ready ? '#a5f3fc' : '#64748b';
      ctx.fillText('DASH', 24, canvasHeight - 44);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(24, canvasHeight - 38, 70, 6);
      ctx.fillStyle = ready ? '#22d3ee' : '#475569';
      ctx.fillRect(24, canvasHeight - 38, 70 * clamp(fill, 0, 1), 6);
      ctx.restore();
    }
  };

  // --- Game Loop Implementation ---
  const updateRef = useRef(update);
  const drawRef = useRef(draw);
  updateRef.current = update;
  drawRef.current = draw;

  useEffect(() => {
    let raf = 0;
    const loop = (time: number) => {
      stepperRef.current?.(time, (dt) => updateRef.current(dt));
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawRef.current(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sync lifecycle with SDK
  usePlaygroundGameLifecycle(gameState, sdk);

  const isMusicPlaying =
    !['START', 'GAME_OVER', 'VICTORY'].includes(gameState.status) &&
    !isGameMenuOpen &&
    !isHowToPlayOpen;

  const currentIntegrity = gameState.integrity ?? 100;
  const maxIntegrity = gameState.maxIntegrity ?? 100;
  const healthPercent = Math.max(0, Math.min(100, (currentIntegrity / maxIntegrity) * 100));

  const activeBoss = simRef.current.currentSector.boss;
  const showBossBar = activeBoss && activeBoss.active && activeBoss.hp > 0;

  // Rank Calculation
  const calculateFinalRank = () => {
    const s = gameState.score;
    const t = gameState.timeElapsed;
    const d = gameState.deaths ?? 0;
    if (s >= 5500 || (t < 200 && d <= 1)) return {rank: 'S', title: 'SYSTEM ARCHITECT', color: 'text-yellow-300 border-yellow-400'};
    if (s >= 4000) return {rank: 'A', title: 'CYBER OPERATIVE', color: 'text-cyan-300 border-cyan-400'};
    if (s >= 2500) return {rank: 'B', title: 'NET RUNNER', color: 'text-purple-300 border-purple-400'};
    return {rank: 'C', title: 'SCRIPT INTRUDER', color: 'text-slate-300 border-slate-400'};
  };

  return (
    <div className="fixed inset-0 overflow-hidden touch-none flex flex-col items-center justify-between bg-slate-950 text-white font-mono select-none">
      {/* Background Music */}
      <BackgroundMusic
        url={BACKGROUND_MUSIC_URL}
        isPlaying={isMusicPlaying}
        isMuted={musicMuted}
      />

      {/* Asset Loading Screen */}
      {!assetsReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050714] text-cyan-400">
          <Zap className="animate-spin text-cyan-400 mb-4" size={40} />
          <div className="text-xl tracking-widest uppercase font-bold animate-pulse">
            Connecting to Cyberspace Grid...
          </div>
        </div>
      )}

      {/* HUD Header Bar */}
      <div className="w-full bg-[#0a0f24]/90 backdrop-blur border-b border-cyan-500/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20 shrink-0">
        {/* Left: Sector & Score */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-cyan-400/70 font-semibold tracking-wider uppercase">
              Sector 0{gameState.level}
            </span>
            <span className="text-xs md:text-sm font-black text-cyan-300">
              SCORE: {gameState.score}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-cyan-950/60 px-2 py-1 rounded border border-cyan-500/40">
            <Sparkles size={14} className="text-cyan-400" />
            <span className="text-xs text-cyan-200 font-bold">
              {gameState.fragmentsCount ?? 0} FRAGS
            </span>
          </div>
          {isTimeAttackMode && (
            <div className="flex items-center gap-1 bg-purple-950/60 px-2 py-1 rounded border border-purple-500/40 text-purple-200 text-xs font-bold">
              <Clock size={14} className="text-purple-400" />
              <span>{formatTime(gameState.timeElapsed)}</span>
            </div>
          )}
        </div>

        {/* Center: Integrity HP Bar */}
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-pink-500 shrink-0 animate-pulse" />
          <div className="flex flex-col w-28 sm:w-44">
            <div className="flex justify-between text-[10px] text-slate-300 font-bold mb-0.5">
              <span>INTEGRITY</span>
              <span className={healthPercent < 35 ? 'text-pink-400 font-black' : 'text-cyan-400'}>
                {currentIntegrity}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-cyan-500/40">
              <div
                className={`h-full transition-all duration-200 ${
                  healthPercent > 50
                    ? 'bg-gradient-to-r from-cyan-500 to-teal-400'
                    : healthPercent > 25
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-400'
                    : 'bg-gradient-to-r from-red-600 to-pink-500'
                }`}
                style={{width: `${healthPercent}%`}}
              />
            </div>
          </div>
          {/* Lives Counter */}
          <div className="flex items-center gap-1 ml-1 sm:ml-2">
            {Array.from({length: Math.max(0, gameState.lives ?? 3)}).map((_, i) => (
              <Shield key={i} size={14} className="text-cyan-400 fill-cyan-400/30" />
            ))}
          </div>
        </div>

        {/* Right: Menu Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              gameAudio.playCrispClick();
              setIsGameMenuOpen(true);
            }}
            aria-label="Open System Menu"
            className="flex items-center gap-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 px-2.5 py-1.5 rounded-lg border border-cyan-500/50 transition-colors active:scale-95 text-xs font-bold min-w-[48px] min-h-[48px] justify-center">
            <MenuIcon size={18} />
            <span className="hidden sm:inline text-xs">MENU</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 w-full min-h-0 relative flex items-center justify-center bg-[#050714]">
        {/* Boss Health Overlay Bar (When Engaged) */}
        {showBossBar && activeBoss && (
          <div className="absolute top-4 inset-x-0 mx-auto w-11/12 max-w-lg z-30 flex flex-col items-center bg-slate-950/80 border border-red-500/50 rounded-xl p-2.5 shadow-[0_0_20px_rgba(239,68,68,0.4)] backdrop-blur">
            <div className="w-full flex justify-between items-center text-xs font-bold mb-1">
              <span className="text-red-400 tracking-wider flex items-center gap-1">
                <Target size={14} /> {activeBoss.name}
              </span>
              <span className={activeBoss.isVulnerable ? 'text-yellow-300 animate-pulse' : 'text-slate-300'}>
                {activeBoss.isVulnerable ? 'VULNERABLE - STRIKE NOW!' : `PHASE ${activeBoss.phase}/${activeBoss.maxPhases}`}
              </span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-red-500/40">
              <div
                className={`h-full transition-all duration-150 ${
                  activeBoss.isVulnerable
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-300'
                    : 'bg-gradient-to-r from-red-600 via-rose-500 to-pink-500'
                }`}
                style={{width: `${Math.max(0, (activeBoss.hp / activeBoss.maxHp) * 100)}%`}}
              />
            </div>
          </div>
        )}

        {/* Sector Introduction Banner */}
        {simRef.current.sectorBannerTimer > 0 && gameState.status === 'PLAYING' && (
          <div className="absolute top-16 z-30 pointer-events-none flex flex-col items-center animate-fade-in">
            <div className="bg-slate-950/90 border border-cyan-400 px-6 py-2 rounded-full shadow-[0_0_25px_rgba(0,240,255,0.4)] text-center">
              <div className="text-xs uppercase tracking-widest text-cyan-400 font-bold">
                {simRef.current.currentSector.name}
              </div>
              <div className="text-[10px] text-cyan-200/70 font-semibold">
                {simRef.current.currentSector.subtitle}
              </div>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            width: `min(100%, calc(100vh * ${canvasWidth} / ${canvasHeight}))`,
          }}
          className="h-auto max-w-full max-h-full drop-shadow-2xl"
        />
      </div>

      {/* Mobile Touch On-Screen Controls */}
      {isMobile && gameState.status === 'PLAYING' && (
        <div className="w-full px-4 py-2.5 bg-[#0a0f24]/85 backdrop-blur border-t border-cyan-500/30 flex justify-between items-center z-20 shrink-0">
          {/* D-Pad Buttons */}
          <div className="flex items-center gap-2">
            <button
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                touchLeftRef.current = true;
              }}
              onPointerUp={() => {
                touchLeftRef.current = false;
              }}
              onPointerCancel={() => {
                touchLeftRef.current = false;
              }}
              className="w-12 h-12 min-w-[48px] min-h-[48px] bg-cyan-950/80 active:bg-cyan-700 text-cyan-300 border-2 border-cyan-500/60 rounded-xl flex items-center justify-center font-bold text-xl active:scale-90 transition-transform touch-none">
              <ArrowLeft size={22} />
            </button>
            <button
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                touchDownRef.current = true;
              }}
              onPointerUp={() => {
                touchDownRef.current = false;
              }}
              onPointerCancel={() => {
                touchDownRef.current = false;
              }}
              className="w-12 h-12 min-w-[48px] min-h-[48px] bg-cyan-950/80 active:bg-cyan-700 text-cyan-300 border-2 border-cyan-500/60 rounded-xl flex items-center justify-center font-bold text-xl active:scale-90 transition-transform touch-none">
              <ArrowDown size={22} />
            </button>
            <button
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                touchRightRef.current = true;
              }}
              onPointerUp={() => {
                touchRightRef.current = false;
              }}
              onPointerCancel={() => {
                touchRightRef.current = false;
              }}
              className="w-12 h-12 min-w-[48px] min-h-[48px] bg-cyan-950/80 active:bg-cyan-700 text-cyan-300 border-2 border-cyan-500/60 rounded-xl flex items-center justify-center font-bold text-xl active:scale-90 transition-transform touch-none">
              <ArrowRight size={22} />
            </button>
          </div>

          {/* Action Buttons: DASH, BLAST & JUMP */}
          <div className="flex items-center gap-3">
            {/* Dash Button */}
            <button
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                touchDashRef.current = true;
              }}
              onPointerUp={() => {
                touchDashRef.current = false;
              }}
              onPointerCancel={() => {
                touchDashRef.current = false;
              }}
              className="w-12 h-12 min-w-[48px] min-h-[48px] bg-purple-950/80 active:bg-purple-700 text-purple-200 border-2 border-purple-400/70 rounded-full flex flex-col items-center justify-center font-black text-[10px] active:scale-90 transition-transform touch-none">
              <Zap size={16} />
              <span className="text-[9px]">DASH</span>
            </button>

            {/* Blaster Attack Button */}
            <button
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                touchAttackRef.current = true;
              }}
              onPointerUp={() => {
                touchAttackRef.current = false;
              }}
              onPointerCancel={() => {
                touchAttackRef.current = false;
              }}
              className="w-14 h-14 min-w-[48px] min-h-[48px] bg-gradient-to-tr from-cyan-600 to-teal-500 active:from-cyan-400 active:to-teal-300 text-slate-950 border-2 border-cyan-300 rounded-full flex flex-col items-center justify-center font-black text-xs active:scale-90 shadow-lg shadow-cyan-500/40 transition-transform touch-none">
              <Crosshair size={18} />
              <span className="text-[9px]">BLAST</span>
            </button>

            {/* Jump Button */}
            <button
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                touchJumpRef.current = true;
              }}
              onPointerUp={() => {
                touchJumpRef.current = false;
              }}
              onPointerCancel={() => {
                touchJumpRef.current = false;
              }}
              className="w-14 h-14 min-w-[48px] min-h-[48px] bg-gradient-to-tr from-pink-600 to-purple-600 active:from-pink-400 active:to-purple-400 text-white border-2 border-pink-400 rounded-full flex flex-col items-center justify-center font-black text-xs active:scale-90 shadow-lg shadow-pink-500/40 transition-transform touch-none">
              <span>LEAP</span>
              <span className="text-[9px] font-normal opacity-80">(JUMP)</span>
            </button>
          </div>
        </div>
      )}

      {/* START / TITLE MENU SCREEN */}
      {gameState.status === 'START' && (
        <MenuOverlay tone="neutral" zIndex={40}>
          <div className="w-full max-w-md flex flex-col items-center bg-[#0a0f24] border-2 border-cyan-500/80 rounded-2xl p-6 md:p-8 shadow-[0_0_40px_rgba(0,240,255,0.25)] text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-950/90 border border-cyan-400/50 rounded-full text-[11px] text-cyan-300 font-bold uppercase tracking-widest mb-3">
              <Zap size={14} className="text-cyan-400 animate-pulse" />
              Cyberpunk Infiltration Protocol v2.0
            </div>
            <h1 className="text-3xl md:text-5xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-200 to-pink-500 tracking-wider">
              SYSTEM BREACH
            </h1>
            <p className="text-cyan-200/80 text-xs md:text-sm mb-4 leading-relaxed">
              Equip your Cyber Blaster, leap past lethal firewall hazards, dismantle security drone swarms, and defeat CORE-OMEGA.
            </p>

            {/* Level Select Chips */}
            <div className="w-full mb-4">
              <div className="text-xs text-cyan-400/80 uppercase font-semibold mb-2 text-left">
                Select Starting Sector:
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setSelectedLevelTab(lvl);
                    }}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all ${
                      selectedLevelTab === lvl
                        ? 'bg-cyan-500 text-black border-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.5)] scale-105'
                        : 'bg-cyan-950/50 text-cyan-300 border-cyan-800 hover:border-cyan-500'
                    }`}>
                    Sector 0{lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full flex flex-col gap-2.5">
              {/* Standard Story Mode */}
              <button
                ref={startBtnRef}
                autoFocus
                onClick={() => {
                  gameAudio.playCrispClick();
                  initGame(selectedLevelTab, false);
                }}
                className="w-full bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 hover:from-cyan-300 hover:to-teal-300 px-6 py-3.5 rounded-xl font-black text-base md:text-lg tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)] active:scale-95 transition-all">
                <Play size={20} className="fill-slate-950" />
                INITIATE STORY BREACH
              </button>

              {/* Time Attack Mode */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  initGame(1, true);
                }}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.35)] transition-colors">
                <Clock size={16} />
                SPEEDRUN TIME ATTACK MODE
              </button>

              {/* How to play */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors">
                <HelpCircle size={16} />
                COMBAT & MISSION MANUAL
              </button>
            </div>

            {/* Personal Records */}
            {(records.bestScore > 0 || records.bestTime !== null) && (
              <div className="w-full mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-900/80 border border-yellow-500/40 rounded-lg px-2 py-1.5 flex flex-col items-center">
                  <span className="text-yellow-400/80 font-semibold uppercase flex items-center gap-1">
                    <Award size={12} /> Best Score
                  </span>
                  <span className="text-yellow-200 font-black text-sm">{records.bestScore}</span>
                </div>
                <div className="bg-slate-900/80 border border-purple-500/40 rounded-lg px-2 py-1.5 flex flex-col items-center">
                  <span className="text-purple-400/80 font-semibold uppercase flex items-center gap-1">
                    <Clock size={12} /> Best Full Run
                  </span>
                  <span className="text-purple-200 font-black text-sm">
                    {records.bestTime !== null ? formatTime(records.bestTime) : '--:--'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </MenuOverlay>
      )}

      {/* GAME OVER SCREEN */}
      {gameState.status === 'GAME_OVER' && (
        <Overlay
          title="SIGNAL TERMINATED"
          description={`Mainframe firewall overwhelmed your avatar. Final Score: ${gameState.score}${
            newRecord.score ? ' — NEW BEST SCORE!' : ` (Best: ${records.bestScore})`
          }`}
          actionLabel="RE-INFILTRATE"
          onAction={() => initGame(1, isTimeAttackMode)}
          icon={<RotateCw size={22} />}
          tone="danger"
        />
      )}

      {/* VICTORY SCREEN WITH ARCADE RANKING */}
      {gameState.status === 'VICTORY' && (
        <MenuOverlay tone="victory" zIndex={40}>
          <div className="w-full max-w-md flex flex-col items-center bg-[#0a0f24] border-2 border-emerald-400 rounded-2xl p-6 md:p-8 shadow-[0_0_40px_rgba(52,211,153,0.3)] text-center">
            <Trophy className="text-emerald-400 mb-2 animate-bounce" size={44} />
            <h1 className="text-2xl md:text-4xl font-black mb-1 text-emerald-300 tracking-wider">
              MAINFRAME BREACHED
            </h1>
            <p className="text-emerald-200/90 text-xs mb-4">
              CORE-OMEGA dismantled. Cyberspace grid liberated!
            </p>

            {/* Rank Badge */}
            {(() => {
              const rankInfo = calculateFinalRank();
              return (
                <div className="w-full flex items-center justify-center gap-3 bg-slate-900/90 border-2 rounded-xl p-3 mb-4 shadow-lg">
                  <div className={`text-4xl font-black ${rankInfo.color} px-3 py-1 bg-slate-950 rounded-lg border`}>
                    {rankInfo.rank}
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">MISSION RATING</div>
                    <div className={`text-sm font-black ${rankInfo.color}`}>{rankInfo.title}</div>
                  </div>
                </div>
              );
            })()}

            {(newRecord.score || newRecord.time) && (
              <div className="w-full mb-3 flex items-center justify-center gap-2 bg-yellow-950/60 border border-yellow-400/70 rounded-lg py-1.5 text-yellow-300 text-xs font-black tracking-wider animate-pulse">
                <Flame size={14} />
                NEW RECORD: {[newRecord.score && 'SCORE', newRecord.time && 'CLEAR TIME'].filter(Boolean).join(' + ')}
              </div>
            )}

            {/* Detailed Score Breakdown */}
            <div className="w-full bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 mb-5 text-left flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-emerald-400/80">TOTAL SCORE:</span>
                <span className="font-bold text-emerald-200">{gameState.score} PTS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400/80">CLEAR TIME:</span>
                <span className="font-bold text-emerald-200">{formatTime(gameState.timeElapsed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400/80">ENEMIES DESTROYED:</span>
                <span className="font-bold text-emerald-200">{gameState.enemiesKilled ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400/80">DATA FRAGMENTS:</span>
                <span className="font-bold text-emerald-200">{gameState.totalFragmentsCollected ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400/80">AVATAR RESPAWNS:</span>
                <span className="font-bold text-emerald-200">{gameState.deaths ?? 0}</span>
              </div>
            </div>

            <button
              autoFocus
              onClick={() => {
                gameAudio.playCrispClick();
                initGame(1, isTimeAttackMode);
              }}
              className="w-full bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 px-6 py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(52,211,153,0.4)] active:scale-95 transition-all">
              <RotateCw size={20} />
              PLAY AGAIN
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* GAME MENU OVERLAY */}
      {isGameMenuOpen && (
        <MenuOverlay tone="neutral" zIndex={50}>
          <div className="w-full max-w-md flex flex-col items-center bg-[#0a0f24] border-2 border-cyan-500 rounded-2xl p-6 md:p-8 shadow-2xl text-center">
            <h2 className="text-2xl md:text-3xl font-black mb-6 text-cyan-300 tracking-wider">
              SYSTEM MENU
            </h2>

            <div className="w-full flex flex-col gap-3">
              {/* Resume */}
              <button
                autoFocus
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                }}
                className="w-full bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 py-3 rounded-xl font-black text-sm md:text-base flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[48px]">
                <Play size={18} className="fill-slate-950" />
                RESUME
              </button>

              {/* Audio Controls Grid */}
              <div className="grid grid-cols-2 gap-2 my-1">
                <button
                  onClick={() => {
                    const next = gameAudio.toggleMute();
                    setSfxMuted(next);
                  }}
                  className={`py-3 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all min-h-[48px] ${
                    sfxMuted
                      ? 'bg-red-950/60 border-red-500/50 text-red-300'
                      : 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                  }`}>
                  {sfxMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  <span>SFX: {sfxMuted ? 'MUTED' : 'ACTIVE'}</span>
                </button>

                <button
                  onClick={() => {
                    gameAudio.playCrispClick();
                    setMusicMuted((prev) => !prev);
                  }}
                  className={`py-3 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all min-h-[48px] ${
                    musicMuted
                      ? 'bg-red-950/60 border-red-500/50 text-red-300'
                      : 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                  }`}>
                  {musicMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  <span>BGM: {musicMuted ? 'MUTED' : 'ACTIVE'}</span>
                </button>
              </div>

              {/* Restart Sector */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  loadSector(gameState.level, false);
                  setIsGameMenuOpen(false);
                }}
                className="w-full bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-colors min-h-[48px]">
                <RotateCw size={16} />
                RETRY CURRENT SECTOR
              </button>

              {/* Mission Intel / How to Play */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-colors min-h-[48px]">
                <HelpCircle size={16} />
                HOW TO PLAY
              </button>

              {/* Return to Title */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                  setGameState((prev) => ({...prev, status: 'START'}));
                }}
                className="w-full bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-colors min-h-[48px]">
                <X size={16} />
                RETURN TO TITLE
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* HOW TO PLAY / MISSION INTEL MODAL */}
      {isHowToPlayOpen && (
        <MenuOverlay tone="neutral" zIndex={60}>
          <div className="w-full max-w-md flex flex-col items-center bg-[#0a0f24] border-2 border-cyan-400 rounded-2xl p-6 shadow-2xl text-left">
            <div className="flex items-center justify-between w-full mb-4 border-b border-cyan-500/30 pb-3">
              <h3 className="text-xl font-black text-cyan-300 tracking-wide flex items-center gap-2">
                <HelpCircle size={20} className="text-cyan-400" />
                MISSION MANUAL
              </h3>
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(false);
                }}
                aria-label="Close Manual"
                className="p-1 rounded-lg hover:bg-cyan-950 text-cyan-400 transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center">
                <X size={20} />
              </button>
            </div>

            <div className="text-xs text-cyan-200/90 flex flex-col gap-3 mb-6 leading-relaxed">
              <div>
                <span className="font-bold text-cyan-400 block mb-1">🎮 CONTROLS (KEYBOARD & TOUCH):</span>
                <ul className="list-disc pl-5 space-y-1 text-slate-300">
                  <li><strong className="text-white">A / D or Left / Right:</strong> Run across digital nodes</li>
                  <li><strong className="text-white">W / Up / Space / (LEAP):</strong> Jump & Double Jump mid-air</li>
                  <li><strong className="text-white">J / X / F / Pointer Tap / (BLAST):</strong> Fire Cyber Blaster</li>
                  <li><strong className="text-white">Shift / L / C / (DASH):</strong> Phase-dash — invulnerable for a split second, once per jump in mid-air</li>
                  <li><strong className="text-white">S / Down:</strong> Drop through one-way data platforms</li>
                  <li><strong className="text-white">Jump Stomp:</strong> Land on drones from above to stomp & bounce (also restores your air dash)!</li>
                  <li><strong className="text-white">Esc / P:</strong> Pause & resume</li>
                </ul>
              </div>

              <div>
                <span className="font-bold text-cyan-400 block mb-1">⚔️ COMBAT & BOSS VULNERABILITIES:</span>
                <ul className="list-disc pl-5 space-y-1 text-slate-300">
                  <li>Every boss enters a telegraphed <strong className="text-yellow-300">VULNERABLE STATE</strong> (Overheated / Cooling vents open) that takes 2.5x critical damage!</li>
                  <li>Evade laser grids and jumping ground shockwaves to maintain Integrity. Dash straight through bullets!</li>
                  <li>Chain drone kills within 2.5s for a <strong className="text-yellow-300">COMBO</strong> multiplier (up to x5).</li>
                  <li>Collect every data fragment in a sector for a <strong className="text-yellow-300">FULL DECRYPT</strong> bonus (+500).</li>
                  <li>Sector 02+ drones fire back — watch for the glowing charge ring.</li>
                </ul>
              </div>
            </div>

            <button
              autoFocus
              onClick={() => {
                gameAudio.playCrispClick();
                setIsHowToPlayOpen(false);
              }}
              className="w-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[48px]">
              CLOSE MANUAL
            </button>
          </div>
        </MenuOverlay>
      )}
    </div>
  );
}
