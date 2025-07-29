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
      className={cn('h-full w-full', tabsContainerClassName)}
    >
      <TabsList
        className={cn(
          'grid h-full w-full grid-cols-2 lg:grid-cols-4',
          tabsListClassName
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          {tab.component}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default TabManager;
