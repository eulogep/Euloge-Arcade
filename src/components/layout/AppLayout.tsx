import {Suspense, useEffect} from 'react';
import {Outlet, useLocation} from 'react-router-dom';
import {Footer} from '@/components/layout/Footer';
import {Header, MobileTabBar} from '@/components/layout/Header';
import {HalloweenAtmosphere} from '@/components/layout/HalloweenAtmosphere';
import {IntroSplash} from '@/components/layout/IntroSplash';
import {BrandLoader, Toaster} from '@/components/ui/feedback';
import {cn} from '@/lib/cn';

function ScrollToTop() {
  const {pathname} = useLocation();
  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'instant' as ScrollBehavior});
  }, [pathname]);
  return null;
}

export function AppLayout() {
  const location = useLocation();
  // Pages with a full-bleed hero/banner slide under the transparent header. Applied
  // here (not in the page) so the offset exists before the page chunk loads: no layout shift.
  const underHeader = location.pathname === '/' || /^\/jeux\/[^/]+$/.test(location.pathname);
  return (
    <>
      <IntroSplash />
      <HalloweenAtmosphere />
      <ScrollToTop />
      <Header />
      <main id="contenu" className={cn('min-h-[100dvh] pb-20 md:pb-0', underHeader && '-mt-16')}>
        <Suspense fallback={<BrandLoader className="py-32" />}>
          {/* Keyed wrapper = a soft fade on every page change */}
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </Suspense>
      </main>
      <Footer />
      <MobileTabBar />
      <Toaster />
    </>
  );
}
