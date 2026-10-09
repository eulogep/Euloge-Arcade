import {Briefcase, Github, Instagram, Linkedin, Twitter, Youtube} from 'lucide-react';
import {BRAND, type BrandLinks} from '@/config/brand';
import {cn} from '@/lib/cn';

const META: Record<keyof BrandLinks, {label: string; Icon: typeof Github}> = {
  github: {label: 'GitHub', Icon: Github},
  portfolio: {label: 'Portfolio', Icon: Briefcase},
  x: {label: 'X (Twitter)', Icon: Twitter},
  instagram: {label: 'Instagram', Icon: Instagram},
  linkedin: {label: 'LinkedIn', Icon: Linkedin},
  youtube: {label: 'YouTube', Icon: Youtube},
};

/** Official links from src/config/brand.ts. Empty entries are not rendered. */
export function SocialLinks({className, withLabels = false}: {className?: string; withLabels?: boolean}) {
  const entries = (Object.entries(BRAND.links) as Array<[keyof BrandLinks, string]>).filter(([, url]) => url);
  if (entries.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {entries.map(([key, url]) => {
        const {label, Icon} = META[key];
        return (
          <li key={key}>
            <a href={url} target="_blank" rel="noopener noreferrer me" className="btn-secondary h-10 min-h-0 px-3" aria-label={withLabels ? undefined : label}>
              <Icon size={16} aria-hidden />
              {withLabels && <span>{label}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function hasSocialLinks(): boolean {
  return Object.values(BRAND.links).some(Boolean);
}
