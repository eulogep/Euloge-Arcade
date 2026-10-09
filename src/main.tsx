import '@/styles/index.css';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {RouterProvider} from 'react-router-dom';
import {PlatformProvider} from '@/app/PlatformProvider';
import {router} from '@/app/router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider>
      <RouterProvider router={router} />
    </PlatformProvider>
  </StrictMode>,
);
