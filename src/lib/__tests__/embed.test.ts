import {decideLaunch, hostMatchesAllowlist} from '@/lib/embed';
import {framingAllowed} from '../../../supabase/functions/_shared/framing';
import {bySlug, makeGame} from './fixtures';

const allow = ['lichess.org'];

describe('embed allowlist', () => {
  it('accepts exact domains and subdomains only', () => {
    expect(hostMatchesAllowlist('lichess.org', allow)).toBe(true);
    expect(hostMatchesAllowlist('www.lichess.org', allow)).toBe(true);
    expect(hostMatchesAllowlist('evillichess.org', allow)).toBe(false);
    expect(hostMatchesAllowlist('lichess.org.evil.com', allow)).toBe(false);
  });
});

describe('decideLaunch', () => {
  it('hosts first-party games from /games/', () => {
    expect(decideLaunch(bySlug('system-breach'), allow)).toEqual({kind: 'hosted', src: '/games/system-breach/index.html'});
  });

  it('embeds allowlisted providers', () => {
    expect(decideLaunch(bySlug('lichess-daily-puzzle'), allow).kind).toBe('embed');
  });

  it('never embeds a domain outside the allowlist: falls back to external', () => {
    expect(decideLaunch(bySlug('lichess-daily-puzzle'), []).kind).toBe('external');
  });

  it('opens Budokai Tenkaichi 3 on its original site because framing is forbidden', () => {
    const game = bySlug('budokai-tenkaichi-3-web-online');
    expect(game.launchUrl).toBe('https://dragonballbt3.online/');
    expect(decideLaunch(game, ['dragonballbt3.online'])).toEqual({
      kind: 'external',
      href: 'https://dragonballbt3.online/',
    });
  });

  it('falls back to external when the provider now refuses framing', () => {
    expect(decideLaunch({...bySlug('lichess-daily-puzzle'), linkStatus: 'embed_blocked'}, allow).kind).toBe('external');
  });

  it('blocks dead links and unsafe URLs', () => {
    expect(decideLaunch({...bySlug('krunker'), linkStatus: 'broken'}, allow).kind).toBe('blocked');
    expect(decideLaunch(makeGame({launchMode: 'external', launchUrl: 'http://insecure.example'}), allow).kind).toBe('blocked');
    expect(decideLaunch(makeGame({launchMode: 'external', launchUrl: 'javascript:alert(1)'}), allow).kind).toBe('blocked');
    expect(decideLaunch(makeGame({launchMode: 'hosted', launchUrl: '/games/x/../../admin'}), allow).kind).toBe('blocked');
    expect(decideLaunch(makeGame({launchMode: 'hosted', launchUrl: 'https://evil.example/game.html'}), allow).kind).toBe('blocked');
  });
});

describe('framingAllowed (link checker)', () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it('detects X-Frame-Options', () => {
    expect(framingAllowed(h({'x-frame-options': 'DENY'}), 'arcade.example')).toBe(false);
    expect(framingAllowed(h({'x-frame-options': 'SAMEORIGIN'}), 'arcade.example')).toBe(false);
  });
  it('parses CSP frame-ancestors', () => {
    expect(framingAllowed(h({'content-security-policy': "default-src 'self'; frame-ancestors 'none'"}), 'a.example')).toBe(false);
    expect(framingAllowed(h({'content-security-policy': "frame-ancestors 'self' https://play2048.co"}), 'a.example')).toBe(false);
    expect(framingAllowed(h({'content-security-policy': 'frame-ancestors https://a.example'}), 'a.example')).toBe(true);
    expect(framingAllowed(h({'content-security-policy': 'frame-ancestors *.example'}), 'a.example')).toBe(true);
    expect(framingAllowed(h({'content-security-policy': 'frame-ancestors *'}), 'a.example')).toBe(true);
  });
  it('allows when no restriction is set', () => {
    expect(framingAllowed(h({}), 'a.example')).toBe(true);
  });
});
