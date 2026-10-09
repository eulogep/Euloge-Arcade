/**
 * System Breach - Game Configuration & Constants
 */

export const CONFIG = {
  // Game Setup
  title: {
    value: 'System Breach',
    type: 'string',
    label: 'Game Title',
    group: 'GAME',
  },
  baseCanvasWidth: {
    value: 1280,
    type: 'number',
    label: 'Base Canvas Width',
    group: 'GAME',
  },
  baseCanvasHeight: {
    value: 720,
    type: 'number',
    label: 'Base Canvas Height',
    group: 'GAME',
  },

  // System
  targetFPS: {
    value: 60,
    type: 'number',
    label: 'Target FPS',
    group: 'SYSTEM',
  },
  stepMs: {
    value: 1000 / 60,
    type: 'number',
    label: 'Step MS',
    group: 'SYSTEM',
  },
  maxSubSteps: {
    value: 5,
    type: 'number',
    label: 'Max Sub Steps',
    group: 'SYSTEM',
  },

  // Theming
  backgroundColor: {
    value: '#050714',
    type: 'color',
    label: 'Background Color',
    group: 'THEME',
  },
  primaryColor: {
    value: '#00f0ff',
    type: 'color',
    label: 'Primary Neon Cyan',
    group: 'THEME',
  },
  secondaryColor: {
    value: '#ff007f',
    type: 'color',
    label: 'Secondary Magenta',
    group: 'THEME',
  },
  fontFamily: {
    value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    type: 'string',
    label: 'Font Family',
    group: 'THEME',
  },

  // Audio Defaults
  defaultMusicVolume: {
    value: 0.5,
    type: 'number',
    label: 'Default Music Volume',
    group: 'AUDIO',
  },
  defaultSfxVolume: {
    value: 0.6,
    type: 'number',
    label: 'Default SFX Volume',
    group: 'AUDIO',
  },

  // Physics & Movement
  playerSpeed: {
    value: 6.2,
    type: 'number',
    label: 'Hacker Speed',
    group: 'Physics',
  },
  gravityRising: {
    value: 0.52,
    type: 'number',
    label: 'Gravity Rising',
    group: 'Physics',
  },
  gravityFalling: {
    value: 1.15,
    type: 'number',
    label: 'Gravity Falling',
    group: 'Physics',
  },
  gravityApex: {
    value: 0.22,
    type: 'number',
    label: 'Apex Float Gravity',
    group: 'Physics',
  },
  apexThreshold: {
    value: 1.8,
    type: 'number',
    label: 'Apex Threshold',
    group: 'Physics',
  },
  playerJumpForce: {
    value: -12.4,
    type: 'number',
    label: 'Jump Impulse',
    group: 'Physics',
  },
  playerDoubleJumpForce: {
    value: -11.0,
    type: 'number',
    label: 'Double Jump Impulse',
    group: 'Physics',
  },
  groundAccel: {
    value: 1.0,
    type: 'number',
    label: 'Ground Accel',
    group: 'Physics',
  },
  groundDecel: {
    value: 0.80,
    type: 'number',
    label: 'Ground Decel',
    group: 'Physics',
  },
  airAccel: {
    value: 0.55,
    type: 'number',
    label: 'Air Accel',
    group: 'Physics',
  },
  airDecel: {
    value: 0.94,
    type: 'number',
    label: 'Air Decel',
    group: 'Physics',
  },
  coyoteTimeGracePeriod: {
    value: 0.12,
    type: 'number',
    label: 'Coyote Time',
    group: 'Physics',
  },
  jumpBufferTime: {
    value: 0.10,
    type: 'number',
    label: 'Jump Buffer Time',
    group: 'Physics',
  },
  cornerCorrectionThreshold: {
    value: 14,
    type: 'number',
    label: 'Corner Correction',
    group: 'Physics',
  },

  // Gameplay Rules
  maxIntegrity: {
    value: 100,
    type: 'number',
    label: 'Max Integrity HP',
    group: 'Rules',
  },
  startingLives: {
    value: 3,
    type: 'number',
    label: 'Starting Lives',
    group: 'Rules',
  },
  fragmentScoreValue: {
    value: 100,
    type: 'number',
    label: 'Points per Fragment',
    group: 'Rules',
  },
  hazardDamage: {
    value: 25,
    type: 'number',
    label: 'Hazard Damage',
    group: 'Rules',
  },
  invincibilityDuration: {
    value: 1.2,
    type: 'number',
    label: 'Invincibility Duration',
    group: 'Rules',
  },
  blasterCooldown: {
    value: 0.22,
    type: 'number',
    label: 'Blaster Cooldown (s)',
    group: 'Rules',
  },
  blasterSpeed: {
    value: 750,
    type: 'number',
    label: 'Blaster Bolt Speed',
    group: 'Rules',
  },
  blasterDamage: {
    value: 25,
    type: 'number',
    label: 'Blaster Bolt Damage',
    group: 'Rules',
  },

  // Asset Resolutions & Aspect Ratios (Authoritative from read_assets_metadata)
  assetBgNetworkAspectRatio: {
    value: 1376 / 768, // 1.7917
    type: 'number',
    label: 'Background Aspect Ratio',
    group: 'ASSETS',
  },
  assetPlatformAspectRatio: {
    value: 915 / 159, // 5.7547
    type: 'number',
    label: 'Platform Tile Aspect Ratio',
    group: 'ASSETS',
  },
  assetDroneAspectRatio: {
    value: 501 / 520, // 0.9635
    type: 'number',
    label: 'Drone Aspect Ratio',
    group: 'ASSETS',
  },
  assetPortalAspectRatio: {
    value: 624 / 875, // 0.7131
    type: 'number',
    label: 'Portal Aspect Ratio',
    group: 'ASSETS',
  },
  assetFragmentAspectRatio: {
    value: 540 / 673, // 0.8024
    type: 'number',
    label: 'Data Fragment Aspect Ratio',
    group: 'ASSETS',
  },
  assetCheckpointAspectRatio: {
    value: 299 / 961, // 0.3111
    type: 'number',
    label: 'Checkpoint Beacon Aspect Ratio',
    group: 'ASSETS',
  },
};

// Merge customized config values if present (injected by Playground)
const {playgroundConfig} = globalThis as {
  playgroundConfig?: Record<string, unknown>;
};
if (playgroundConfig) {
  for (const [key, value] of Object.entries(playgroundConfig)) {
    if (key in CONFIG) {
      Object.assign(CONFIG[key as keyof typeof CONFIG], {value});
    }
  }
}

/**
 * Type helper for reading values in game code
 */
export type ConfigKey = keyof typeof CONFIG;

/**
 * Gets a configuration value by key.
 * @param key The configuration key.
 * @return The configuration value.
 */
export function getConfig<K extends ConfigKey>(
  key: K,
): (typeof CONFIG)[K]['value'] {
  return CONFIG[key].value;
}
