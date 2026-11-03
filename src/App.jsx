import { useEffect, useRef } from 'react';
import siteMarkup from './site.html?raw';
import legacyScriptUrl from './legacy.js?url';

export default function App() {
  const siteRef = useRef(null);

  useEffect(() => {
    const container = siteRef.current;
    container.innerHTML = siteMarkup;

    const legacyScript = document.createElement('script');
    legacyScript.src = legacyScriptUrl;
    legacyScript.async = false;
    legacyScript.onload = () => {
      if (typeof window.onload === 'function') window.onload();
    };
    document.body.appendChild(legacyScript);

    return () => {
      legacyScript.remove();
      container.replaceChildren();
    };
  }, []);

  return <div ref={siteRef} />;
}
