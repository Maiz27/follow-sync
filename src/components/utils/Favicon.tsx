import React from 'react';

export const Favicons = () => {
  return (
    <>
      <link
        rel='icon'
        type='image/png'
        href='/imgs/logo/icon1.png'
        sizes='96x96'
      />
      <link rel='icon' type='image/svg+xml' href='/imgs/logo/icon0.svg' />
      <link rel='shortcut icon' href='/imgs/logo/favicon.ico' />
      <link
        rel='apple-touch-icon'
        sizes='180x180'
        href='/imgs/logo/apple-icon.png'
      />
      <meta name='apple-mobile-web-app-title' content='Follow Sync' />
      <link rel='manifest' href='/imgs/logo/manifest.json' />
    </>
  );
};
