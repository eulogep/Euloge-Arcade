import {
  Command,
  Dices,
  Ghost,
  Heart,
  Home,
  LayoutGrid,
  LogIn,
  LogOut,
  Palette,
  Search,
  Shield,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {Link, NavLink, useLocation, useNavigate} from 'react-router-dom';
import {usePlatform, type ChromaSkin} from '@/app/PlatformProvider';
import {Logo} from '@/components/ui/Logo';
import {cn} from '@/lib/cn';
import {pickRandom} from '@/lib/catalog';
import {playClickPulse} from '@/lib/sound';

const NAV = [
  {to: '/', label: 'Accueil', Icon: Home, end: true},
  {to: '/jeux', label: 'Jeux', Icon: LayoutGrid, end: false},
  {to: '/favoris', label: 'Favoris', Icon: Heart, end: false},
] as const;

export function useSurprise() {
  const {games} = usePlatform();
  const navigate = useNavigate();
  return () => {
    playClickPulse();
    const playable = games.filter((g) => g.linkStatus !== 'broken');
    const g = pickRandom(playable);
    if (g) navigate(`/jeux/${g.slug}`);
  };
}

function HeaderSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCatalog = location.pathname === '/jeux';
  const urlQ = onCatalog ? new URLSearchParams(location.search).get('q') ?? '' : '';
  const [value, setValue] = useState(urlQ);

  useEffect(() => setValue(urlQ), [urlQ]);

  // "/" focuses the search, like many gaming storefronts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (q: string) => {
    const params = onCatalog ? new URLSearchParams(location.search) : new URLSearchParams();
    if (q) params.set('q', q);
    else params.delete('q');
    const search = params.toString();
    navigate({pathname: '/jeux', search: search ? `?${search}` : ''}, {replace: onCatalog});
  };

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        go(value.trim());
      }}>
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          go(e.target.value);
        }}
        placeholder="Rechercher un jeu…"
        aria-label="Rechercher un jeu"
        className="input h-10 min-h-0 rounded-full pl-9 pr-10"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[10px] text-ink-faint border-line-soft md:block">
        /
      </kbd>
    </form>
  );
}

function ChromaMenu() {
  const {settings, updateSettings, notify} = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const skins: {id: ChromaSkin; theme: 'dark' | 'light'; label: string; dot: string}[] = [
    {id: 'obsidian', theme: 'dark', label: 'Obsidian Pulse', dot: 'bg-[#38E1FF]'},
    {id: 'gold', theme: 'dark', label: 'Atelier Cyber-Or', dot: 'bg-[#F59E0B]'},
    {id: 'phosphor', theme: 'dark', label: 'Terminal Phosphore', dot: 'bg-[#10B981]'},
    {id: 'obsidian', theme: 'light', label: 'Prisme Solaire (Clair)', dot: 'bg-[#2563EB]'},
  ];

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => {
          playClickPulse();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn-ghost h-10 min-h-0 w-10 px-0"
        title="Studio d'atmosphère & son tactile"
        aria-label="Studio d'atmosphère et son">
        <Palette size={17} className="text-accent-3" />
      </button>
      {open && (
        <div
          role="menu"
          className="holo-panel reticle-frame absolute right-0 top-12 z-50 w-60 animate-fade-in rounded-2xl p-2 shadow-card">
          <p className="px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-faint">
            Atmosphère Visuelle
          </p>
          {skins.map((s) => {
            const active =
              s.theme === 'light'
                ? settings.theme === 'light'
                : settings.theme === 'dark' && settings.skin === s.id;
            return (
              <button
                key={s.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  playClickPulse();
                  updateSettings({theme: s.theme, skin: s.id});
                  notify({tone: 'info', title: `Atmosphère : ${s.label}`});
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition hover:bg-surface-2',
                  active ? 'bg-accent/15 text-ink' : 'text-ink-muted',
                )}>
                <span className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', s.dot)} />
                  {s.label}
                </span>
                {active && <span className="font-mono text-[10px] text-accent-3">ACTIF</span>}
              </button>
            );
          })}
          <div className="my-1 border-t border-line-soft" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              const next = !settings.soundEnabled;
              updateSettings({soundEnabled: next});
              if (next) playClickPulse();
            }}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink">
            <span className="flex items-center gap-2">
              {settings.soundEnabled ? <Volume2 size={14} className="text-accent-3" /> : <VolumeX size={14} />}
              Audio tactile
            </span>
            <span className="font-mono text-[10px] text-accent-3">{settings.soundEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const {user, profile, isAdmin, signOut, backendEnabled, authReady} = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!backendEnabled || !authReady) {
    return (
      <Link to="/profil" className="btn-ghost h-10 min-h-0 w-10 px-0" aria-label="Mon espace">
        <User size={18} />
      </Link>
    );
  }
  if (!user) {
    return (
      <Link to="/connexion" className="btn-secondary h-10 min-h-0 px-3">
        <LogIn size={16} /> <span className="hidden sm:inline">Connexion</span>
      </Link>
    );
  }
  const name = profile?.displayName ?? 'Joueur';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-full pl-1 pr-3 transition hover:bg-surface-2"
        aria-label={`Menu du compte de ${name}`}>
        <Avatar url={profile?.avatarUrl ?? null} name={name} />
        <span className="hidden max-w-[8rem] truncate text-sm font-semibold lg:inline">{name}</span>
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 top-12 z-50 w-56 animate-fade-in rounded-xl p-1.5 shadow-card">
          <Link role="menuitem" to="/profil" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            <User size={16} /> Mon profil
          </Link>
          {isAdmin && (
            <Link role="menuitem" to="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
              <Shield size={16} /> Administration
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface-2">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}

export function Avatar({url, name, size = 32}: {url: string | null; name: string; size?: number}) {
  return url ? (
    <img src={url} alt="" width={size} height={size} className="rounded-full object-cover ring-2 ring-accent/40" style={{width: size, height: size}} />
  ) : (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-full bg-brand-gradient font-display font-bold text-white"
      style={{width: size, height: size, fontSize: size * 0.42}}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Header() {
  const surprise = useSurprise();
  const {favorites, setCommandPaletteOpen} = usePlatform();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-colors duration-300',
        scrolled ? 'glass border-x-0 border-t-0 !bg-bg/90' : 'bg-transparent',
      )}>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <div className="container-page flex h-16 items-center gap-2.5 sm:gap-5">
        <Link to="/" className="shrink-0 rounded-lg" aria-label="Euloge Arcade — accueil">
          <Logo className="hidden sm:inline-flex" />
          <Logo compact className="sm:hidden" />
        </Link>
        <span className="halloween-badge hidden xl:inline-flex">
          <Ghost size={14} aria-hidden /> Halloween
        </span>
        <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
          {NAV.map(({to, label, end}) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => playClickPulse()}
              className={({isActive}) =>
                cn(
                  'relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition',
                  isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
                )
              }>
              {({isActive}) => (
                <>
                  {label}
                  {to === '/favoris' && favorites.size > 0 && (
                    <span
                      aria-hidden="true"
                      className="rounded-full bg-accent/20 px-1.5 py-0.2 font-mono text-[10px] font-bold text-accent-3">
                      {favorites.size}
                    </span>
                  )}
                  {isActive && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-gradient" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-1 justify-end md:justify-center">
          <HeaderSearch />
        </div>
        <button
          type="button"
          onClick={() => {
            playClickPulse();
            setCommandPaletteOpen(true);
          }}
          className="btn-ghost hidden h-10 min-h-0 shrink-0 px-2.5 xl:inline-flex"
          title="Ouvrir la console de commande (⌘K / Ctrl+K)"
          aria-label="Console de commande">
          <Command size={16} className="text-accent-3" />
          <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-ink-faint border-line-soft">⌘K</kbd>
        </button>
        <button type="button" onClick={surprise} className="btn-ghost h-10 min-h-0 shrink-0 px-2.5" title="Surprends-moi : un jeu au hasard">
          <Dices size={18} className="text-accent-3" />
          <span className="hidden lg:inline">Surprends-moi</span>
          <span className="sr-only lg:hidden">Surprends-moi : un jeu au hasard</span>
        </button>
        <ChromaMenu />
        <AccountMenu />
      </div>
    </header>
  );
}

/** Thumb-friendly navigation on phones. */
export function MobileTabBar() {
  return (
    <nav aria-label="Navigation mobile" className="glass fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-4">
        {[...NAV, {to: '/profil', label: 'Profil', Icon: User, end: false}].map(({to, label, Icon, end}) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({isActive}) =>
                cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-accent-3' : 'text-ink-muted')
              }>
              <Icon size={20} aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
