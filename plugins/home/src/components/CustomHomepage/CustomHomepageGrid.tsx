/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { ReactNode, useCallback, useMemo } from 'react';
import { Layout, Layouts, Responsive, WidthProvider } from 'react-grid-layout';
import {
  storageApiRef,
  useApi,
  getComponentData,
  useElementFilter,
  ElementCollection,
} from '@backstage/core-plugin-api';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  createStyles,
  Dialog,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import { compact } from 'lodash';
import useObservable from 'react-use/lib/useObservable';
import { ContentHeader, ErrorBoundary } from '@backstage/core-components';
import Typography from '@material-ui/core/Typography';
import { WidgetSettingsOverlay } from './WidgetSettingsOverlay';
import { AddWidgetDialog } from './AddWidgetDialog';
import { CustomHomepageButtons } from './CustomHomepageButtons';
import {
  CustomHomepageGridStateV1,
  CustomHomepageGridStateV1Schema,
  LayoutConfiguration,
  Widget,
  GridWidget,
  LayoutConfigurationSchema,
  WidgetSchema,
} from './types';
import { CardConfig } from '@backstage/plugin-home-react';

// eslint-disable-next-line new-cap
const ResponsiveGrid = WidthProvider(Responsive);

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    responsiveGrid: {
      '& .react-grid-item > .react-resizable-handle:after': {
        position: 'absolute',
        content: '""',
        borderStyle: 'solid',
        borderWidth: '0 0 20px 20px',
        borderColor: `transparent transparent ${theme.palette.primary.light} transparent`,
      },
    },
    contentHeaderBtn: {
      marginLeft: theme.spacing(2),
    },
    widgetWrapper: {
      overflow: 'hidden',
      '& > div[class*="MuiCard-root"]': {
        width: '100%',
        height: '100%',
      },
      '& div[class*="MuiCardContent-root"]': {
        overflow: 'auto',
      },
      '& + .react-grid-placeholder': {
        backgroundColor: theme.palette.primary.light,
      },
      '&.edit > :active': {
        cursor: 'move',
      },
    },
  }),
);

function useHomeStorage(
  defaultWidgets: GridWidget[],
): [GridWidget[], (value: GridWidget[]) => void] {
  const key = 'home';
  const storageApi = useApi(storageApiRef).forBucket('home.customHomepage');
  // TODO: Support multiple home pages
  const setWidgets = useCallback(
    (value: GridWidget[]) => {
      const grid: CustomHomepageGridStateV1 = {
        version: 1,
        pages: {
          default: value,
        },
      };
      storageApi.set(key, JSON.stringify(grid));
    },
    [key, storageApi],
  );
  const homeSnapshot = useObservable(
    storageApi.observe$<string>(key),
    storageApi.snapshot(key),
  );
  const widgets: GridWidget[] = useMemo(() => {
    if (homeSnapshot.presence === 'absent') {
      return defaultWidgets;
    }
    try {
      const grid: CustomHomepageGridStateV1 = JSON.parse(homeSnapshot.value!);
      return CustomHomepageGridStateV1Schema.parse(grid).pages.default;
    } catch (e) {
      return defaultWidgets;
    }
  }, [homeSnapshot, defaultWidgets]);

  return [widgets, setWidgets];
}

const convertConfigToDefaultWidgets = (
  config: LayoutConfiguration[],
  availableWidgets: Widget[],
): GridWidget[] => {
  const ret = config.map((conf, i) => {
    const c = LayoutConfigurationSchema.parse(conf);
    const name = React.isValidElement(c.component)
      ? getComponentData(c.component, 'core.extensionName')
      : (c.component as unknown as string);
    if (!name) {
      return null;
    }
    const widget = availableWidgets.find(w => w.name === name);
    if (!widget) {
      return null;
    }
    const widgetId = `${widget.name}__${i}${Math.random()
      .toString(36)
      .slice(2)}`;
    return {
      id: widgetId,
      layout: {
        i: widgetId,
        x: c.x,
        y: c.y,
        w: Math.min(widget.maxWidth ?? Number.MAX_VALUE, c.width),
        h: Math.min(widget.maxHeight ?? Number.MAX_VALUE, c.height),
        minW: widget.minWidth,
        maxW: widget.maxWidth,
        minH: widget.minHeight,
        maxH: widget.maxHeight,
        isDraggable: false,
        isResizable: false,
      },
      settings: {},
    };
  });
  return compact(ret);
};

const availableWidgetsFilter = (elements: ElementCollection) => {
  return elements
    .selectByComponentData({
      key: 'core.extensionName',
    })
    .getElements<Widget>()
    .flatMap(elem => {
      const config = getComponentData<CardConfig>(elem, 'home.widget.config');
      return [
        WidgetSchema.parse({
          component: elem,
          name: getComponentData<string>(elem, 'core.extensionName'),
          title: getComponentData<string>(elem, 'title'),
          description: getComponentData<string>(elem, 'description'),
          settingsSchema: config?.settings?.schema,
          width: config?.layout?.width?.defaultColumns,
          minWidth: config?.layout?.width?.minColumns,
          maxWidth: config?.layout?.width?.maxColumns,
          height: config?.layout?.height?.defaultRows,
          minHeight: config?.layout?.height?.minRows,
          maxHeight: config?.layout?.height?.maxRows,
        }),
      ];
    });
};

/**
 * Breakpoint options for <CustomHomepageGridProps/>
 *
 * @public
 */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Props customizing the <CustomHomepageGrid/> component.
 *
 * @public
 */
export type CustomHomepageGridProps = {
  /**
   * Children contain all widgets user can configure on their own homepage.
   */
  children?: ReactNode;
  /**
   * Default layout for the homepage before users have modified it.
   */
  config?: LayoutConfiguration[];
  /**
   * Height of grid row in pixels.
   * @defaultValue 60
   */
  rowHeight?: number;
  /**
   * Screen width in pixels for different breakpoints.
   * @defaultValue theme breakpoints
   */
  breakpoints?: Record<Breakpoint, number>;
  /**
   * Number of grid columns for different breakpoints.
   * @defaultValue \{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 \}
   */
  cols?: Record<Breakpoint, number>;
  /**
   * Grid container padding (x, y) in pixels for all or specific breakpoints.
   * @defaultValue [0, 0]
   * @example [10, 10]
   * @example \{ lg: [10, 10] \}
   */
  containerPadding?: [number, number] | Record<Breakpoint, [number, number]>;
  /**
   * Grid container margin (x, y) in pixels for all or specific breakpoints.
   * @defaultValue [0, 0]
   * @example [10, 10]
   * @example \{ lg: [10, 10] \}
   */
  containerMargin?: [number, number] | Record<Breakpoint, [number, number]>;
  /**
   * Maximum number of rows user can have in the grid.
   * @defaultValue unlimited
   */
  maxRows?: number;
  /**
   * Custom style for grid.
   */
  style?: React.CSSProperties;
  /**
   * Compaction type of widgets in the grid. This controls where widgets are moved in case
   * they are overlapping in the grid.
   */
  compactType?: 'vertical' | 'horizontal' | null;
  /**
   * Controls if widgets can overlap in the grid. If true, grid can be placed one over the other.
   * @defaultValue false
   */
  allowOverlap?: boolean;
  /**
   * Controls if widgets can collide with each other. If true, grid items won't change position when being dragged over.
   * @defaultValue false
   */
  preventCollision?: boolean;
};

/**
 * A component that allows customizing components in home grid layout.
 *
 * @public
 */
export const CustomHomepageGrid = (props: CustomHomepageGridProps) => {
  const styles = useStyles();
  const theme = useTheme();
  const availableWidgets = useElementFilter(
    props.children,
    availableWidgetsFilter,
    [props],
  );

  const defaultLayout = props.config
    ? convertConfigToDefaultWidgets(props.config, availableWidgets)
    : [];
  const [widgets, setWidgets] = useHomeStorage(defaultLayout);
  const [addWidgetDialogOpen, setAddWidgetDialogOpen] = React.useState(false);
  const editModeOn = widgets.find(w => w.layout.isResizable) !== undefined;
  const [editMode, setEditMode] = React.useState(editModeOn);
  const getWidgetByName = (name: string) => {
    return availableWidgets.find(widget => widget.name === name);
  };

  const getWidgetNameFromKey = (key: string) => {
    return key.split('__')[0];
  };

  const handleAdd = (widget: Widget) => {
    const widgetId = `${widget.name}__${widgets.length + 1}${Math.random()
      .toString(36)
      .slice(2)}`;

    setWidgets([
      ...widgets,
      {
        id: widgetId,
        layout: {
          i: widgetId,
          x: 0,
          y: Math.max(...widgets.map(w => w.layout.y + w.layout.h)) + 1,
          w: Math.min(widget.maxWidth ?? Number.MAX_VALUE, widget.width ?? 12),
          h: Math.min(widget.maxHeight ?? Number.MAX_VALUE, widget.height ?? 4),
          minW: widget.minWidth,
          maxW: widget.maxWidth,
          minH: widget.minHeight,
          maxH: widget.maxHeight,
          isResizable: editMode,
          isDraggable: editMode,
        },
        settings: {},
      },
    ]);
    setAddWidgetDialogOpen(false);
  };

  const handleRemove = (widgetId: string) => {
    setWidgets(widgets.filter(w => w.id !== widgetId));
  };

  const handleSettingsSave = (
    widgetId: string,
    widgetSettings: Record<string, any>,
  ) => {
    const idx = widgets.findIndex(w => w.id === widgetId);
    if (idx >= 0) {
      const widget = widgets[idx];
      widget.settings = widgetSettings;
      widgets[idx] = widget;
      setWidgets(widgets);
    }
  };

  const clearLayout = () => {
    setWidgets([]);
  };

  const changeEditMode = (mode: boolean) => {
    setEditMode(mode);
    setWidgets(
      widgets.map(w => {
        return {
          ...w,
          layout: { ...w.layout, isDraggable: mode, isResizable: mode },
        };
      }),
    );
  };

  const handleLayoutChange = (newLayout: Layout[], _: Layouts) => {
    if (editMode) {
      const newWidgets = newLayout.map(l => {
        const widget = widgets.find(w => w.id === l.i);
        return {
          ...widget,
          layout: l,
        } as GridWidget;
      });
      setWidgets(newWidgets);
    }
  };

  const handleRestoreDefaultConfig = () => {
    setWidgets(defaultLayout);
  };

  return (
    <>
      <ContentHeader title="">
        <CustomHomepageButtons
          editMode={editMode}
          numWidgets={widgets.length}
          clearLayout={clearLayout}
          setAddWidgetDialogOpen={setAddWidgetDialogOpen}
          changeEditMode={changeEditMode}
          defaultConfigAvailable={props.config !== undefined}
          restoreDefault={handleRestoreDefaultConfig}
        />
      </ContentHeader>
      <Dialog
        open={addWidgetDialogOpen}
        onClose={() => setAddWidgetDialogOpen(false)}
      >
        <AddWidgetDialog widgets={availableWidgets} handleAdd={handleAdd} />
      </Dialog>
      {!editMode && widgets.length === 0 && (
        <Typography variant="h5" align="center">
          No widgets added. Start by clicking the 'Add widget' button.
        </Typography>
      )}
      <ResponsiveGrid
        className={styles.responsiveGrid}
        measureBeforeMount
        compactType={props.compactType}
        style={props.style}
        allowOverlap={props.allowOverlap}
        preventCollision={props.preventCollision}
        draggableCancel=".overlayGridItem,.widgetSettingsDialog"
        containerPadding={props.containerPadding}
        margin={props.containerMargin}
        breakpoints={
          props.breakpoints ? props.breakpoints : theme.breakpoints.values
        }
        cols={
          props.cols ? props.cols : { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }
        }
        rowHeight={props.rowHeight ?? 60}
        onLayoutChange={handleLayoutChange}
        layouts={{ lg: widgets.map(w => w.layout) }}
      >
        {widgets.map((w: GridWidget) => {
          const l = w.layout;
          const widgetName = getWidgetNameFromKey(l.i);
          const widget = getWidgetByName(widgetName);
          if (!widget || !widget.component) {
            return null;
          }

          const widgetProps = {
            ...widget.component.props,
            ...(w.settings ?? {}),
          };

          return (
            <div
              key={l.i}
              className={`${styles.widgetWrapper} ${editMode && 'edit'}`}
            >
              <ErrorBoundary>
                <widget.component.type {...widgetProps} />
              </ErrorBoundary>
              {editMode && (
                <WidgetSettingsOverlay
                  id={l.i}
                  widget={widget}
                  handleRemove={handleRemove}
                  handleSettingsSave={handleSettingsSave}
                  settings={w.settings}
                />
              )}
            </div>
          );
        })}
      </ResponsiveGrid>
    </>
  );
};
