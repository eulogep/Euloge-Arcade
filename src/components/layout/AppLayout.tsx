import {Suspense, useEffect} from 'react';
import {Outlet, useLocation} from 'react-router-dom';
import {Footer} from '@/components/layout/Footer';
import {Header, MobileTabBar} from '@/components/layout/Header';
import {IntroSplash} from '@/components/layout/IntroSplash';
import {BrandLoader, Toaster} from '@/components/ui/feedback';

function ScrollToTop() {
  const {pathname} = useLocation();
  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'instant' as ScrollBehavior});
  }, [pathname]);
  return null;
}

export function AppLayout() {
  const location = useLocation();
  return (
    <>
      <IntroSplash />
      <ScrollToTop />
      <Header />
      <main id="contenu" className="min-h-[70vh] pb-20 md:pb-0">
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
