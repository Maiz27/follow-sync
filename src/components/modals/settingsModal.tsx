import React from 'react';
import { useSession } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useModalsStore } from '@/lib/store/modals';
import { useSettingsStore } from '@/lib/store/settings';
import { useCacheManager } from '@/lib/hooks/useCacheManager';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZE_LIST } from '@/lib/constants';
import { Button } from '../ui/button';

const SettingsModal = () => {
  const { modal, closeModal } = useModalsStore();
  const {
    showAvatars,
    ghostDetectionBatchSize,
    paginationPageSize,
    customStaleTime,
    setShowAvatars,
    setGhostDetectionBatchSize,
    setPaginationPageSize,
    setCustomStaleTime,
    saveSettings,
  } = useSettingsStore();
  const { persistChanges } = useCacheManager();
  const { data: session } = useSession();
  const accessToken = session?.accessToken;

  const handleSave = async () => {
    if (!accessToken) return;
    await saveSettings(accessToken, persistChanges);
    closeModal();
  };

  return (
    <Dialog open={modal?.type === 'settings'} onOpenChange={closeModal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your FollowSync experience.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-4'>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='show-avatars' className='text-right'>
              Show Avatars
            </Label>
            <Switch
              id='show-avatars'
              checked={showAvatars}
              onCheckedChange={setShowAvatars}
              className='col-span-3'
            />
          </div>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='ghost-batch-size' className='text-right'>
              Ghost Batch Size
            </Label>
            <Input
              id='ghost-batch-size'
              type='number'
              value={ghostDetectionBatchSize}
              onChange={(e) =>
                setGhostDetectionBatchSize(Number(e.target.value))
              }
              className='col-span-3'
            />
          </div>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='pagination-page-size' className='text-right'>
              Page Size
            </Label>
            <Select
              value={String(paginationPageSize)}
              onValueChange={(value) => setPaginationPageSize(Number(value))}
            >
              <SelectTrigger className='col-span-3'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_LIST.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='custom-stale-time' className='text-right'>
              Custom Stale Time (minutes)
            </Label>
            <Input
              id='custom-stale-time'
              type='number'
              value={customStaleTime ?? ''}
              onChange={(e) =>
                setCustomStaleTime(
                  e.target.value ? Number(e.target.value) : null
                )
              }
              className='col-span-3'
              placeholder='Disabled'
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
