import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type Tab = {
  id: string;
  label: React.ReactNode;
  component: React.ReactNode;
};

type TabManagerProps<TTabs extends Tab[]> = {
  tabs: TTabs;
  defaultValue?: string;
  /** Controlled active tab (e.g. mirrored in the URL). */
  value?: string;
  onValueChange?: (value: string) => void;
  tabsListClassName?: string;
  tabsContainerClassName?: string;
};

const TabManager = <TTabs extends Tab[]>({
  tabs,
  defaultValue,
  value,
  onValueChange,
  tabsListClassName,
  tabsContainerClassName,
}: TabManagerProps<TTabs>) => {
  const initialDefaultValue =
    defaultValue || (tabs.length > 0 ? tabs[0].id : undefined);

  if (!initialDefaultValue) {
    console.warn('TabManager: No tabs provided, cannot set a default value.');
    return null;
  }

  return (
    <Tabs
      defaultValue={value === undefined ? initialDefaultValue : undefined}
      value={value}
      onValueChange={onValueChange}
      className={cn('h-full w-full max-w-full min-w-0', tabsContainerClassName)}
    >
      {/* Scrolls horizontally on narrow screens instead of wrapping into a
          fixed-height bar that clipped the second row. */}
      <div className='w-full min-w-0 overflow-x-auto rounded-lg bg-muted'>
        <TabsList
          className={cn(
            'h-auto w-max min-w-full flex-nowrap justify-start gap-1 px-1 py-1 lg:justify-evenly',
            tabsListClassName
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className='flex-none py-1.5 lg:flex-1'
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          {tab.component}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default TabManager;
