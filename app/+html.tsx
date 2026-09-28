import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <base href={siteBase} />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F2F3F6" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#090B10" />
        <meta name="color-scheme" content="light dark" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="TCL" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="manifest.json" />
        <link rel="apple-touch-icon" href="apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: serviceWorker }} />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: viewportHeight }} />
        <script dangerouslySetInnerHTML={{ __html: pinViewport }} />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const siteBase = `${process.env.EXPO_BASE_URL || "/"}`.replace(/\/?$/, "/");

const serviceWorker = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const scopeUrl = new URL('.', document.baseURI);
    const scriptUrl = new URL('sw.js', scopeUrl);
    navigator.serviceWorker.register(scriptUrl.href, { scope: scopeUrl.href }).catch(() => {});
  });
}
`;

const viewportHeight = `
html, body, #root { height: 100dvh; }
`;

const pinViewport = `
if (window.visualViewport) {
  const pin = () => {
    if (window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  };
  window.visualViewport.addEventListener('scroll', pin);
  window.visualViewport.addEventListener('resize', pin);
  window.addEventListener('scroll', pin);
}
`;

const responsiveBackground = `
body {
  background-color: #F2F3F6;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #090B10;
  }
}`;
