import fs from 'fs/promises';
import path from 'path';
import ReactMarkdown from 'react-markdown';
import { Heading } from '@/components/utils/heading';
import { getPageMetadata } from '@/lib/utils';

export const metadata = getPageMetadata('terms');

const TermsPage = async () => {
  const markdownPath = path.join(process.cwd(), 'public', 'terms.md');
  const content = await fs.readFile(markdownPath, 'utf-8');

  return (
    <div className='container mx-auto max-w-4xl px-4 py-12'>
      <Heading Tag='h1' className='mb-8 text-center'>
        Terms of Service
      </Heading>
      <div className='prose prose-invert mx-auto max-w-none'>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

export default TermsPage;
