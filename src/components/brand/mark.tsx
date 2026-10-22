import { cn } from '@/lib/utils';

/**
 * The Follow Sync symbol ("Nodes"): two accounts, each sending a follow toward
 * the other. Cropped to the drawn bounds of the 256 master (branding/), so the
 * mark fills its box. The outgoing arrow takes the text colour; the returning
 * arrow carries the brand accent unless `mono` is set.
 */
export const BrandMark = ({
  className,
  mono = false,
  ...props
}: React.SVGProps<SVGSVGElement> & { mono?: boolean }) => (
  <svg
    viewBox='32 48 192 160'
    fill='currentColor'
    aria-hidden='true'
    focusable='false'
    className={cn('h-[1em] w-[1.2em]', className)}
    {...props}
  >
    <path
      data-part='out'
      d='M32 48 H88 V62 H168 V48 L216 76 L168 104 V90 H88 V104 H32 Z'
    />
    <path
      data-part='back'
      className={mono ? undefined : 'fill-brand'}
      d='M224 208 H168 V194 H88 V208 L40 180 L88 152 V166 H168 V152 H224 Z'
    />
  </svg>
);
