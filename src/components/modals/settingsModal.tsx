import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';
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
import { useGistStore } from '@/lib/store/gist';
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
import { LuTrash2, LuX } from 'react-icons/lu';
import { useIgnoreList } from '@/lib/hooks/useIgnoreList';
import { useIgnoreStore } from '@/lib/store/ignore';

const SettingsModal = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const { modal, closeModal } = useModalsStore();
  const duplicateGistCount = useGistStore((state) => state.duplicateGistCount);
  const {
    showAvatars,
    paginationPageSize,
    customStaleTime,
    setShowAvatars,
    setPaginationPageSize,
    setCustomStaleTime,
    saveSettings,
  } = useSettingsStore();
  const { persistChanges, cleanupDuplicateCaches } = useCacheManager();
  const { ignoredLogins, unignore } = useIgnoreList();
  const [ignoreInput, setIgnoreInput] = useState('');
  const sortedIgnored = [...ignoredLogins].sort();

  const handleAddIgnored = () => {
    const login = ignoreInput.trim().replace(/^@/, '');
    // GitHub logins: alphanumerics and single hyphens, up to 39 chars.
    if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login)) {
      toast.error('Enter a valid GitHub username.');
      return;
    }
    useIgnoreStore.getState().ignore(login);
    setIgnoreInput('');
    persistChanges().catch((error) =>
      toast.warning(
        toUserMessage(error, 'Added, but saving the ignore list failed.')
      )
    );
  };
  const [staleTimeInput, setStaleTimeInput] = useState(
    customStaleTime === null ? '' : String(customStaleTime)
  );
  const isStaleTimeValid =
    staleTimeInput.trim() === '' ||
    (Number.isInteger(Number(staleTimeInput)) && Number(staleTimeInput) >= 1);

  const handleStaleTimeChange = (value: string) => {
    setStaleTimeInput(value);
    if (value.trim() === '') {
      setCustomStaleTime(null);
    } else if (Number.isInteger(Number(value)) && Number(value) >= 1) {
      setCustomStaleTime(Number(value));
    }
  };
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const handleSave = async () => {
    if (!isAuthenticated) {
      toast.error('You must be signed in to save settings.');
      return;
    }
    setIsSaving(true);
    try {
      await saveSettings(persistChanges);
      toast.success('Settings saved.');
      closeModal();
    } catch (error) {
      toast.error(toUserMessage(error, 'Failed to save settings.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    setIsCleaningDuplicates(true);
    try {
      await cleanupDuplicateCaches();
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  return (
    <Dialog open={modal?.type === 'settings'} onOpenChange={closeModal}>
      <DialogContent className='max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your Follow Sync experience.
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
          <div className='grid grid-cols-4 items-center gap-x-4 gap-y-1'>
            <Label
              htmlFor='custom-stale-time'
              className='col-span-2 text-right'
            >
              Stale Time (minutes)
            </Label>
            <Input
              id='custom-stale-time'
              type='number'
              inputMode='numeric'
              min={1}
              step={1}
              value={staleTimeInput}
              onChange={(e) => handleStaleTimeChange(e.target.value)}
              aria-describedby='custom-stale-time-help'
              aria-invalid={!isStaleTimeValid}
              className='col-span-2'
              placeholder='Adaptive'
            />
            <p
              id='custom-stale-time-help'
              className='col-span-4 text-xs text-muted-foreground'
            >
              Optional. Overrides the adaptive cache lifetime, which is 15 min,
              3 h, 12 h, or manual-only for networks up to 2K, 10K, 50K, and
              over 50K connections. Leave empty to use it.
            </p>
            {!isStaleTimeValid && (
              <p role='alert' className='col-span-4 text-xs text-destructive'>
                Enter a whole number of minutes (1 or more), or leave it empty.
              </p>
            )}
          </div>
          <div className='grid gap-2 rounded-md border p-4'>
            <p className='text-sm font-medium' id='ignored-accounts-label'>
              Ignored accounts
            </p>
            <p className='text-xs text-muted-foreground'>
              Never suggested in the One-Way lists and never bulk-selected. You
              can also ignore someone from the ⋯ menu on their card.
            </p>
            {sortedIgnored.length === 0 ? (
              <p className='text-xs text-muted-foreground'>None yet.</p>
            ) : (
              <ul
                aria-labelledby='ignored-accounts-label'
                className='flex max-h-32 flex-wrap gap-2 overflow-y-auto'
              >
                {sortedIgnored.map((login) => (
                  <li
                    key={login}
                    className='flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs'
                  >
                    @{login}
                    <button
                      type='button'
                      className='cursor-pointer rounded-sm opacity-70 hover:opacity-100'
                      aria-label={`Stop ignoring @${login}`}
                      onClick={() => unignore(login)}
                    >
                      <LuX />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className='flex gap-2'
              onSubmit={(e) => {
                e.preventDefault();
                handleAddIgnored();
              }}
            >
              <Input
                value={ignoreInput}
                onChange={(e) => setIgnoreInput(e.target.value)}
                placeholder='username'
                aria-label='Username to ignore'
                className='h-8'
              />
              <Button
                type='submit'
                size='sm'
                variant='outline'
                disabled={!ignoreInput.trim()}
              >
                Ignore
              </Button>
            </form>
          </div>
          <div className='grid gap-2 rounded-md border p-4'>
            <div className='flex items-center justify-between gap-4'>
              <div>
                <p className='text-sm font-medium'>Duplicate cache gists</p>
                <p className='text-xs text-muted-foreground'>
                  {duplicateGistCount > 0
                    ? `${duplicateGistCount} duplicate cache gist(s) detected. Cleanup deletes only non-canonical cache gists.`
                    : 'No duplicate cache gists detected.'}
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                onClick={handleCleanupDuplicates}
                disabled={duplicateGistCount === 0 || isCleaningDuplicates}
                className={isCleaningDuplicates ? 'animate-pulse' : ''}
              >
                <LuTrash2 />
                {isCleaningDuplicates ? 'Cleaning...' : 'Clean Up'}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={isSaving || !isAuthenticated || !isStaleTimeValid}
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
