'use client';

import { useModalsStore } from '@/lib/store/modals';
import StarRepoModal from './starRepoModal';
import SettingsModal from './settingsModal';

const modalRegistry = {
  star: StarRepoModal,
  settings: SettingsModal,
};

const ModalManager = () => {
  const { modal } = useModalsStore();

  if (!modal?.type) {
    return null;
  }

  const ModalComponent = modalRegistry[modal.type];

  if (!ModalComponent) {
    return null;
  }
  
  return <ModalComponent {...modal.props} />;
};

export default ModalManager;
