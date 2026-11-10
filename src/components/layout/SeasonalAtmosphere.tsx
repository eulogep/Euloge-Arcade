import {Ghost, Snowflake, Sparkles} from 'lucide-react';
import {useState} from 'react';
import {getActiveSeason, type SeasonId} from '@/lib/season';

function Bat({className}: {className: string}) {
  return (
    <svg className={className} viewBox="0 0 64 32" fill="currentColor">
      <path d="M32 15c-4-7-11-10-18-10 2 3 2 6 1 9-5-2-10-1-14 2 7 2 10 8 13 14l3-6 7 5 3-9 3 9 7-5 3 6c3-6 6-12 13-14-4-3-9-4-14-2-1-3-1-6 1-9-7 0-14 3-18 10Z" />
    </svg>
  );
}

function HalloweenScene() {
  return (
    <>
      <div className="halloween-moon" />
      <div className="halloween-web" />
      <Bat className="halloween-bat halloween-bat-one" />
      <Bat className="halloween-bat halloween-bat-two" />
      <Bat className="halloween-bat halloween-bat-three" />
      <Ghost className="halloween-ghost halloween-ghost-left" strokeWidth={1.35} />
      <Ghost className="halloween-ghost halloween-ghost-right" strokeWidth={1.35} />
      <Sparkles className="halloween-spark halloween-spark-one" />
      <Sparkles className="halloween-spark halloween-spark-two" />
      <div className="halloween-fog halloween-fog-one" />
      <div className="halloween-fog halloween-fog-two" />
      <div className="halloween-pumpkin halloween-pumpkin-left"><i /><i /></div>
      <div className="halloween-pumpkin halloween-pumpkin-right"><i /><i /></div>
      <div className="halloween-vignette" />
    </>
  );
}

const GARLAND_BULBS = 18;

function WinterScene() {
  return (
    <>
      <div className="winter-aurora" />
      <div className="winter-garland">
        {Array.from({length: GARLAND_BULBS}, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="winter-snow winter-snow-far" />
      <div className="winter-snow winter-snow-near" />
      <Snowflake className="winter-flake winter-flake-one" strokeWidth={1.25} />
      <Snowflake className="winter-flake winter-flake-two" strokeWidth={1.25} />
      <Snowflake className="winter-flake winter-flake-three" strokeWidth={1.25} />
      <div className="winter-drift" />
    </>
  );
}

const SCENES: Record<SeasonId, () => JSX.Element> = {
  halloween: HalloweenScene,
  winter: WinterScene,
};

/** Decorative seasonal atmosphere. Hidden from assistive technology and interaction. */
export function SeasonalAtmosphere() {
  const [season] = useState(() => getActiveSeason());
  if (!season) return null;
  const Scene = SCENES[season.id];
  return (
    <div className={`seasonal-atmosphere seasonal-atmosphere-${season.id}`} aria-hidden="true">
      <Scene />
    </div>
  );
}

/** Header badge; shown on wide screens only (see .seasonal-badge in index.css). */
export function SeasonalBadge() {
  const [season] = useState(() => getActiveSeason());
  if (!season) return null;
  const Icon = season.id === 'halloween' ? Ghost : Snowflake;
  return (
    <span className="seasonal-badge">
      <Icon size={14} aria-hidden /> {season.label}
    </span>
  );
}
