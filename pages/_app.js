import Head from 'next/head';
import { useEffect } from 'react';
import '../styles/globals.css';
import '../styles/player.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return <>
    <Head>
      <title>The Rig Coupon</title>
      <meta name="description" content="Your crew. Your coupon. Football predictions, live scores and results for The Rig Coupon." />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#081724" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="Rig Coupon" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      <link rel="icon" type="image/png" href="/icons/icon-192.png" />
    </Head>
    <Component {...pageProps} />
  </>;
}
