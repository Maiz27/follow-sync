/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// React component that can accept props
type ComponentType<P = object> = React.ComponentType<P>;

// single tab
export type Tab<TProps extends Record<string, any> = Record<string, never>> = {
  id: string;
  label: string;
  component: ComponentType<TProps>;
  componentProps: TProps; // Make componentProps required, even if it's an empty object
};

type TabManagerProps<TTabs extends Tab<any>[]> = {
  tabs: TTabs;
  defaultValue?: string;
  tabsListClassName?: string;
  tabsContainerClassName?: string;
};

const TabManager = <TTabs extends Tab<any>[]>({
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
      className={tabsContainerClassName || 'h-full w-full'}
    >
      <TabsList
        className={
          tabsListClassName || 'grid h-full w-full grid-cols-2 lg:grid-cols-4'
        }
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          {React.createElement(tab.component, tab.componentProps)}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default TabManager;
