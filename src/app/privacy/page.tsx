import fs from 'fs/promises';
import path from 'path';
import ReactMarkdown from 'react-markdown';
import { getPageMetadata } from '@/lib/utils';

export const metadata = getPageMetadata('privacy');

const PrivacyPage = async () => {
  const markdownPath = path.join(process.cwd(), 'public', 'privacy.md');
  const content = await fs.readFile(markdownPath, 'utf-8');

  return (
    <div className='container mx-auto max-w-4xl px-4 py-12'>
      <div className='mx-auto prose max-w-none prose-invert'>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

export default PrivacyPage;
