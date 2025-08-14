import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type Tab = {
  id: string;
  label: string;
  component: React.ReactNode;
};

type TabManagerProps<TTabs extends Tab[]> = {
  tabs: TTabs;
  defaultValue?: string;
  tabsListClassName?: string;
  tabsContainerClassName?: string;
};

const TabManager = <TTabs extends Tab[]>({
  tabs,
  defaultValue,
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
      defaultValue={initialDefaultValue}
      className={cn('h-full w-full max-w-full', tabsContainerClassName)}
    >
      <div className='inline-flex h-14 w-full justify-center overflow-x-auto bg-muted md:h-auto'>
        <TabsList
          className={cn(
            'flex-wrap justify-center gap-2 overflow-y-visible px-2 lg:w-full lg:flex-nowrap lg:justify-evenly lg:gap-0 lg:px-0',
            tabsListClassName
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
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
