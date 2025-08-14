import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LuStar } from 'react-icons/lu';
import Link from 'next/link';
import { GITHUB_REPO_URL } from '@/lib/constants';

interface StarRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StarRepoModal = ({ isOpen, onClose }: StarRepoModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Like the app? Star it on GitHub!</DialogTitle>
          <DialogDescription>
            If you find this app useful, please consider starring it on GitHub.
            It helps to support the project and motivates me to add new
            features.
          </DialogDescription>
        </DialogHeader>
        <div className='flex justify-end gap-4 py-4'>
          <Button variant='outline' onClick={onClose}>
            Later
          </Button>
          <Link
            href={GITHUB_REPO_URL}
            target='_blank'
            rel='noopener noreferrer'
          >
            <Button>
              <LuStar />
              Star on GitHub
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StarRepoModal;
