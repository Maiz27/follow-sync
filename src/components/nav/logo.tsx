'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';

const Logo = () => {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const isDark = theme === 'dark' || resolvedTheme === 'dark';

  return (
    <div>
      <Image
        src={isDark ? '/imgs/logo/logo-w.png' : '/imgs/logo/logo-b.png'}
        alt='Follow Sync Logo'
        width={30}
        height={30}
      />
    </div>
  );
};

export default Logo;
