import React from 'react';
import { Button } from '../ui/button';
import { useModalsStore } from '@/lib/store/modals';
import { LuSettings } from 'react-icons/lu';

const UserSettings = () => {
  const { openModal } = useModalsStore();

  return (
    <Button size='sm' onClick={() => openModal('settings')}>
      <LuSettings />
      Settings
    </Button>
  );
};

export default UserSettings;
