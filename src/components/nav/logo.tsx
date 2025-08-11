import React from 'react';
import Image from 'next/image';

const Logo = () => {
  return (
    <>
      <Image
        width={30}
        height={30}
        src={'/imgs/logo/logo-b.png'}
        alt='Follow Sync Logo'
        title='Follow Sync Logo'
        className='block dark:hidden'
      />
      <Image
        width={30}
        height={30}
        src={'/imgs/logo/logo-w.png'}
        alt='Follow Sync Logo'
        title='Follow Sync Logo'
        className='hidden dark:block'
      />
    </>
  );
};

export default Logo;
