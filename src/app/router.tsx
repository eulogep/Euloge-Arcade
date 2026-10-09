import {lazy} from 'react';
import {createBrowserRouter} from 'react-router-dom';
import {AppLayout} from '@/components/layout/AppLayout';

// Every page is its own chunk: the home page never downloads admin or player code.
const HomePage = lazy(() => import('@/features/home/HomePage'));
const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage'));
const GameDetailsPage = lazy(() => import('@/features/game/GameDetailsPage'));
const FavoritesPage = lazy(() => import('@/features/favorites/FavoritesPage'));
const AuthPage = lazy(() => import('@/features/profiles/AuthPage'));
const ProfilePage = lazy(() => import('@/features/profiles/ProfilePage'));
const AdminDashboard = lazy(() => import('@/features/admin/AdminDashboard'));
const AdminGameForm = lazy(() => import('@/features/admin/AdminGameForm'));
const AboutPage = lazy(() => import('@/features/about/AboutPage'));
const LegalNoticePage = lazy(() => import('@/features/about/LegalPages').then((m) => ({default: m.LegalNoticePage})));
const PrivacyPage = lazy(() => import('@/features/about/LegalPages').then((m) => ({default: m.PrivacyPage})));
const CreditsPage = lazy(() => import('@/features/about/LegalPages').then((m) => ({default: m.CreditsPage})));
const NotFoundPage = lazy(() => import('@/features/about/LegalPages').then((m) => ({default: m.NotFoundPage})));

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {path: '/', element: <HomePage />},
      {path: '/jeux', element: <CatalogPage />},
      {path: '/jeux/:slug', element: <GameDetailsPage />},
      {path: '/favoris', element: <FavoritesPage />},
      {path: '/connexion', element: <AuthPage />},
      {path: '/profil', element: <ProfilePage />},
      {path: '/admin', element: <AdminDashboard />},
      {path: '/admin/jeux/nouveau', element: <AdminGameForm />},
      {path: '/admin/jeux/:id', element: <AdminGameForm />},
      {path: '/a-propos', element: <AboutPage />},
      {path: '/mentions-legales', element: <LegalNoticePage />},
      {path: '/confidentialite', element: <PrivacyPage />},
      {path: '/credits', element: <CreditsPage />},
      {path: '*', element: <NotFoundPage />},
    ],
  },
]);
