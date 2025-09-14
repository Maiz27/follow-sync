import React, { useState } from 'react';
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
import { Button } from '../ui/button';
import { PAGE_SIZE_LIST } from '@/lib/constants';
import { LuInfo } from 'react-icons/lu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '../ui/hover-card';

const SettingsModal = () => {
  const [isSaving, setIsSaving] = useState(false);
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
    setIsSaving(true);
    await saveSettings(accessToken, persistChanges);
    setIsSaving(false);
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
            <Label htmlFor='show-avatars' className='col-span-2 text-right'>
              Show Avatars
            </Label>
            <Switch
              id='show-avatars'
              checked={showAvatars}
              onCheckedChange={setShowAvatars}
              className='col-span-2'
            />
          </div>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='ghost-batch-size' className='col-span-2 text-right'>
              Ghost Batch Size
            </Label>
            <Input
              id='ghost-batch-size'
              type='number'
              value={ghostDetectionBatchSize}
              onChange={(e) =>
                setGhostDetectionBatchSize(Number(e.target.value))
              }
              className='col-span-2'
            />
          </div>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label
              htmlFor='pagination-page-size'
              className='col-span-2 text-right'
            >
              Page Size
            </Label>
            <Select
              value={String(paginationPageSize)}
              onValueChange={(value) => setPaginationPageSize(Number(value))}
            >
              <SelectTrigger className='col-span-2'>
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
            <Label
              htmlFor='custom-stale-time'
              className='col-span-2 text-right'
            >
              Stale Time (minutes)
              <HoverCard>
                <HoverCardTrigger>
                  <Button variant='link'>
                    <LuInfo />
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent>
                  <p className='col-span-4 text-xs text-muted-foreground'>
                    Overrides the default adaptive caching. By default, cache
                    stale time is 15min, 3hr, 12hr, and NEVER based on network
                    size; 2K, 10K, 50K, and 50K+ connections, respectively.
                  </p>
                </HoverCardContent>
              </HoverCard>
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
              className='col-span-2'
              placeholder='Disabled'
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className={isSaving ? 'animate-pulse' : ''}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
