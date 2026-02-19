'use client';

import { useEffect } from 'react';

type BootstrapAssetsProps = {
  includeJs?: boolean;
};

declare global {
  interface Window {
    __ssBootstrapCssUsers?: number;
    __ssBootstrapJsUsers?: number;
  }
}

export default function BootstrapAssets({ includeJs = false }: BootstrapAssetsProps) {
  useEffect(() => {
    const cssId = 'bootstrap-css-scoped';
    window.__ssBootstrapCssUsers = (window.__ssBootstrapCssUsers || 0) + 1;
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
      document.head.appendChild(link);
    }

    if (includeJs) {
      const jsId = 'bootstrap-js-scoped';
      window.__ssBootstrapJsUsers = (window.__ssBootstrapJsUsers || 0) + 1;
      if (!document.getElementById(jsId)) {
        const script = document.createElement('script');
        script.id = jsId;
        script.src = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      window.__ssBootstrapCssUsers = Math.max(0, (window.__ssBootstrapCssUsers || 1) - 1);
      if ((window.__ssBootstrapCssUsers || 0) === 0) {
        document.getElementById(cssId)?.remove();
      }

      if (includeJs) {
        window.__ssBootstrapJsUsers = Math.max(0, (window.__ssBootstrapJsUsers || 1) - 1);
        if ((window.__ssBootstrapJsUsers || 0) === 0) {
          document.getElementById('bootstrap-js-scoped')?.remove();
        }
      }
    };
  }, [includeJs]);

  return null;
}
