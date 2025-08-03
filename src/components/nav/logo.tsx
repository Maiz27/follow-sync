import React from 'react';
import Image from 'next/image';

const Logo = () => {
  return (
    <>
      <Image
        src={'/imgs/logo/logo-b.png'}
        alt='Follow Sync Logo'
        width={30}
        height={30}
        className='block dark:hidden'
      />
      <Image
        src={'/imgs/logo/logo-w.png'}
        alt='Follow Sync Logo'
        width={30}
        height={30}
        className='hidden dark:block'
      />
    </>
  );
};

export default Logo;
