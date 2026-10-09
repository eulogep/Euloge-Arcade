import {HOSTED_PATH_RE} from '@/lib/rules';
import type {Game} from '@/types/game';

/**
 * Client-side defence in depth for the GamePlayer. The database already refuses
 * embeds outside the allowlist; the player re-checks before rendering any iframe.
 */
export function hostMatchesAllowlist(host: string, allowlist: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((domain) => {
    const d = domain.toLowerCase();
    return h === d || h.endsWith('.' + d);
  });
}

export type LaunchDecision =
  | {kind: 'hosted'; src: string}
  | {kind: 'embed'; src: string}
  | {kind: 'external'; href: string}
  | {kind: 'blocked'; reason: string};

export function decideLaunch(game: Game, allowlist: readonly string[]): LaunchDecision {
  if (game.linkStatus === 'broken') {
    return {kind: 'blocked', reason: 'Ce jeu est momentanément indisponible : son lien ne répond plus.'};
  }
  if (game.launchMode === 'hosted') {
    if (!HOSTED_PATH_RE.test(game.launchUrl) || game.launchUrl.includes('..')) {
      return {kind: 'blocked', reason: 'Configuration de lancement invalide.'};
    }
    return {kind: 'hosted', src: game.launchUrl};
  }
  let url: URL;
  try {
    url = new URL(game.launchUrl);
  } catch {
    return {kind: 'blocked', reason: 'Adresse du jeu invalide.'};
  }
  if (url.protocol !== 'https:') {
    return {kind: 'blocked', reason: 'Adresse du jeu non sécurisée.'};
  }
  if (game.launchMode === 'embed') {
    if (game.linkStatus === 'embed_blocked' || !hostMatchesAllowlist(url.hostname, allowlist)) {
      // Never force an embed: fall back to the official site.
      return {kind: 'external', href: url.href};
    }
    return {kind: 'embed', src: url.href};
  }
  return {kind: 'external', href: url.href};
}
