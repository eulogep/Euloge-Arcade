import {
  Command,
  Compass,
  Crosshair,
  Dices,
  Eye,
  Heart,
  Palette,
  Play,
  Search,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {usePlatform, type ChromaSkin} from '@/app/PlatformProvider';
import {CoverImage} from '@/components/gaming/GameBits';
import {GENRE_LABELS, LAUNCH_MODE_LABELS, matchesSearch, pickRandom} from '@/lib/catalog';
import {getCartridgeCode} from '@/lib/prestige';
import {playClickPulse} from '@/lib/sound';
import {cn} from '@/lib/cn';

const SKINS: {id: ChromaSkin; label: string; desc: string; dot: string}[] = [
  {id: 'obsidian', label: 'Obsidian Pulse', desc: 'Saphir électrique & plasma violet', dot: 'bg-[#38E1FF]'},
  {id: 'gold', label: 'Atelier Cyber-Or', desc: 'Carbone profond & or solaire', dot: 'bg-[#F59E0B]'},
  {id: 'phosphor', label: 'Terminal Phosphore', desc: 'Matrice CRT & bio-émeraude', dot: 'bg-[#10B981]'},
];

export function CommandPalette() {
  const {
    games,
    commandPaletteOpen,
    setCommandPaletteOpen,
    setInspectGame,
    setReflexLabOpen,
    settings,
    updateSettings,
    notify,
  } = usePlatform();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        playClickPulse();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [commandPaletteOpen]);

  const matchingGames = useMemo(() => {
    if (!query.trim()) return games.slice(0, 6);
    return games.filter((g) => matchesSearch(g, query)).slice(0, 8);
  }, [games, query]);

  if (!commandPaletteOpen) return null;

  const close = () => setCommandPaletteOpen(false);

  const triggerSurprise = () => {
    const playable = games.filter((g) => g.linkStatus !== 'broken');
    const chosen = pickRandom(playable);
    close();
    if (chosen) {
      playClickPulse();
      navigate(`/jeux/${chosen.slug}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-bg/80 px-4 pt-16 sm:pt-24 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Console de commande rapide"
      onClick={close}>
      <div
        className="holo-panel reticle-frame w-full max-w-2xl overflow-hidden rounded-3xl shadow-card"
        onClick={(e) => e.stopPropagation()}>
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b px-4 py-3.5 border-line-soft">
          <Command size={18} className="text-accent-3 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une cartouche, un genre ou lancer une commande…"
            aria-label="Rechercher dans la console de commande"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            className="btn-ghost h-8 min-h-0 w-8 rounded-lg px-0"
            aria-label="Fermer la console de commande">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70dvh] overflow-y-auto p-4 space-y-5">
          {/* Quick Actions Deck */}
          <div>
            <p className="mb-2 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-faint">
              Actions Tactiques // Console
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={triggerSurprise}
                className="flex items-center gap-3 rounded-2xl border bg-surface/60 p-3 text-left transition hover:border-accent-3/40 hover:bg-surface-2 border-line-soft">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white">
                  <Dices size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink">Tirage Aléatoire</p>
                  <p className="truncate text-[11px] text-ink-muted">Ouvre une cartouche jouable au hasard</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  playClickPulse();
                  close();
                  setReflexLabOpen(true);
                }}
                className="flex items-center gap-3 rounded-2xl border bg-surface/60 p-3 text-left transition hover:border-accent-3/40 hover:bg-surface-2 border-line-soft">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-2/20 text-accent-3 ring-1 ring-accent-3/30">
                  <Crosshair size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink">Calibrateur de Réflexes</p>
                  <p className="truncate text-[11px] text-ink-muted">Mini-jeu Cyber-Pulse 20 secondes</p>
                </div>
              </button>
            </div>
          </div>

          {/* Matching Cartridges */}
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-faint">
                Cartouches ({matchingGames.length})
              </p>
              <button
                type="button"
                onClick={() => {
                  close();
                  navigate(query.trim() ? `/jeux?q=${encodeURIComponent(query.trim())}` : '/jeux');
                }}
                className="text-xs font-semibold text-accent-3 hover:underline">
                Voir tout le catalogue →
              </button>
            </div>

            {matchingGames.length === 0 ? (
              <div className="rounded-2xl border bg-surface/40 p-6 text-center text-sm text-ink-muted border-line-soft">
                <Search size={22} className="mx-auto mb-2 text-ink-faint" />
                Aucune cartouche ne correspond à « {query} ».
              </div>
            ) : (
              <ul className="space-y-1.5">
                {matchingGames.map((g) => (
                  <li
                    key={g.id}
                    className="group flex items-center justify-between gap-3 rounded-2xl border bg-surface/50 p-2 pr-3 transition hover:border-accent/40 hover:bg-surface-2 border-line-soft">
                    <button
                      type="button"
                      onClick={() => {
                        playClickPulse();
                        close();
                        navigate(`/jeux/${g.slug}`);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <CoverImage game={g} className="h-11 w-16 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold text-accent-3">{getCartridgeCode(g)}</span>
                          <p className="truncate font-display text-sm font-bold text-ink">{g.title}</p>
                        </div>
                        <p className="truncate text-xs text-ink-muted">
                          {g.genre.map((x) => GENRE_LABELS[x]).join(' · ')} — {LAUNCH_MODE_LABELS[g.launchMode]}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          playClickPulse();
                          close();
                          setInspectGame(g);
                        }}
                        className="btn-ghost h-8 min-h-0 px-2 text-xs"
                        title={`Inspecter ${g.title}`}
                        aria-label={`Inspecter ${g.title}`}>
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playClickPulse();
                          close();
                          navigate(`/jeux/${g.slug}?jouer=1`);
                        }}
                        className="btn-secondary h-8 min-h-0 px-2.5 text-xs">
                        <Play size={13} className="fill-current" /> Jouer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Atmosphere & Audio Deck */}
          <div className="border-t pt-4 border-line-soft">
            <p className="mb-2.5 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-faint">
              Atmosphère Holographique &amp; Système
            </p>
            <div className="grid gap-2 sm:grid-cols-4">
              {SKINS.map((s) => {
                const active = settings.theme === 'dark' && settings.skin === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      playClickPulse();
                      updateSettings({theme: 'dark', skin: s.id});
                      notify({tone: 'info', title: `Atmosphère : ${s.label}`, body: s.desc});
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition border-line-soft',
                      active ? 'border-accent-3/60 bg-accent/15 text-ink shadow-glow' : 'bg-surface/60 text-ink-muted hover:text-ink',
                    )}>
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', s.dot)} />
                    <span className="truncate">{s.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  playClickPulse();
                  const nextLight = settings.theme !== 'light';
                  updateSettings({theme: nextLight ? 'light' : 'dark'});
                  notify({tone: 'info', title: nextLight ? 'Atmosphère : Prisme Solaire' : 'Atmosphère : Obsidian Pulse'});
                }}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition border-line-soft',
                  settings.theme === 'light'
                    ? 'border-accent-3/60 bg-accent/15 text-ink shadow-glow'
                    : 'bg-surface/60 text-ink-muted hover:text-ink',
                )}>
                <Palette size={13} className="text-accent-3 shrink-0" />
                <span className="truncate">Prisme Solaire</span>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    navigate('/jeux');
                  }}
                  className="chip h-8 min-h-0 px-2.5">
                  <Compass size={13} /> Catalogue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    navigate('/favoris');
                  }}
                  className="chip h-8 min-h-0 px-2.5">
                  <Heart size={13} /> Favoris
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    navigate('/profil');
                  }}
                  className="chip h-8 min-h-0 px-2.5">
                  <User size={13} /> Passeport Joueur
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !settings.soundEnabled;
                  updateSettings({soundEnabled: next});
                  if (next) playClickPulse();
                }}
                className="chip h-8 min-h-0 px-2.5">
                {settings.soundEnabled ? <Volume2 size={13} className="text-accent-3" /> : <VolumeX size={13} />}
                Son tactile : {settings.soundEnabled ? 'Actif' : 'Muet'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t bg-surface/90 px-4 py-2 text-[11px] text-ink-faint border-line-soft">
          <span className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-accent-3" /> EULOGE ARCADE // PRISM-DECK OS
          </span>
          <span>Raccourci : Ctrl+K / ⌘K · Échap pour fermer</span>
        </div>
      </div>
    </div>
  );
}

