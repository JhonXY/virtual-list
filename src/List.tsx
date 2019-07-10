import * as React from 'react';
import Filler from './Filler';
import { getLocationItem, getScrollPercentage, getNodeHeight } from './util';

type RenderFunc<T> = (item: T) => React.ReactNode;

export interface ListProps<T> extends React.HTMLAttributes<any> {
  children: RenderFunc<T>;
  dataSource: T[];
  height?: number;
  itemHeight?: number;
  itemKey?: string;
  component?: string | React.FC<any> | React.ComponentClass<any>;
}

interface ListState {
  status: 'NONE' | 'MEASURE_START' | 'MEASURE_DONE';

  scrollTop: number | null;
  scrollPtg: number;
  itemIndex: number;
  itemOffsetPtg: number;
  startIndex: number;
  endIndex: number;
  /**
   * Calculated by `scrollTop`.
   * We cache in the state since if `dataSource` length change,
   * we need revert back to the located item index.
   */
  startItemTop: number;
}

/**
 * We use class component here since typescript can not support generic in function component
 *
 * Virtual list display logic:
 * 1. scroll / initialize trigger measure
 * 2. Get location item of current `scrollTop`
 * 3. [Render] Render visible items
 * 4. Get all the visible items height
 * 5. [Render] Update top item `margin-top` to fit the position
 */
class List<T> extends React.Component<ListProps<T>, ListState> {
  static defaultProps = {
    itemHeight: 15,
    dataSource: [],
  };

  state: ListState = {
    status: 'NONE',
    scrollTop: null,
    scrollPtg: 0,
    itemIndex: 0,
    itemOffsetPtg: 0,
    startIndex: 0,
    endIndex: 0,
    startItemTop: 0,
  };

  listRef = React.createRef<HTMLElement>();

  itemElements: { [index: number]: HTMLElement } = {};

  itemElementHeights: { [index: number]: number } = {};

  /**
   * Phase 1: Initial should sync with default scroll top
   */
  public componentDidMount() {
    this.listRef.current.scrollTop = 0;
    this.onScroll();
  }

  /**
   * Phase 4: Record used item height
   * Phase 5: Trigger re-render to use correct position
   */
  public componentDidUpdate(prevProps: ListProps<T>) {
    const { status, scrollPtg, startIndex, endIndex, itemIndex, itemOffsetPtg } = this.state;
    const { dataSource, itemKey } = this.props;

    if (status === 'MEASURE_START') {
      // Record here since measure item height will get warning in `render`
      for (let index = startIndex; index <= endIndex; index += 1) {
        const eleKey = this.getItemKey(index);
        this.itemElementHeights[eleKey] = getNodeHeight(this.itemElements[eleKey]);
      }

      // Calculate top visible item top offset
      const locatedItemHeight = this.itemElementHeights[this.getItemKey(itemIndex)] || 0;
      const locatedItemTop = scrollPtg * this.listRef.current.clientHeight;
      const locatedItemOffset = itemOffsetPtg * locatedItemHeight;
      const locatedItemMergedTop =
        this.listRef.current.scrollTop + locatedItemTop - locatedItemOffset;

      let startItemTop = locatedItemMergedTop;
      for (let index = itemIndex - 1; index >= startIndex; index -= 1) {
        startItemTop -= this.itemElementHeights[this.getItemKey(index)] || 0;
      }

      this.setState({ status: 'MEASURE_DONE', startItemTop });
    }

    // Re-calculate the scroll position align with the current visible item position
    if (prevProps.dataSource.length !== dataSource.length) {
      console.log('!!!!!!');
    }
  }

  /**
   * Phase 2: Trigger render since we should re-calculate current position.
   */
  public onScroll = () => {
    const { dataSource, height, itemHeight } = this.props;

    const { scrollTop } = this.listRef.current;

    // Skip if `scrollTop` not change to avoid shake
    if (scrollTop === this.state.scrollTop) {
      return;
    }

    const scrollPtg = getScrollPercentage(this.listRef.current);

    const { index, offsetPtg } = getLocationItem(scrollPtg, dataSource.length);
    const visibleCount = Math.ceil(height / itemHeight);

    const beforeCount = Math.ceil(scrollPtg * visibleCount);
    const afterCount = Math.ceil((1 - scrollPtg) * visibleCount);

    this.setState({
      status: 'MEASURE_START',
      scrollTop,
      scrollPtg,
      itemIndex: index,
      itemOffsetPtg: offsetPtg,
      startIndex: Math.max(0, index - beforeCount),
      endIndex: Math.min(dataSource.length - 1, index + afterCount),
    });
  };

  public getItemKey = (index: number) => {
    const { dataSource, itemKey } = this.props;
    const item = dataSource[index];
    return item && itemKey ? item[itemKey] : index;
  };

  /**
   * Phase 4: Render item and get all the visible items height
   */
  public renderChildren = (list: T[], startIndex: number, renderFunc: RenderFunc<T>) =>
    // We should measure rendered item height
    list.map((item, index) => {
      const node = renderFunc(item) as React.ReactElement;
      const eleIndex = startIndex + index;
      const eleKey = this.getItemKey(eleIndex);

      // Pass `key` and `ref` for internal measure
      return React.cloneElement(node, {
        key: eleKey,
        ref: (ele: HTMLElement) => {
          this.itemElements[eleKey] = ele;
        },
      });
    });

  public render() {
    const {
      style,
      component: Component = 'div',
      height,
      itemHeight,
      dataSource,
      children,
      itemKey,
      ...restProps
    } = this.props;

    const mergedStyle = {
      ...style,
      height,
      overflowY: 'auto',
      overflowAnchor: 'none',
    };

    // Render pure list if not set height or height is enough for all items
    if (height === undefined || dataSource.length * itemHeight <= height) {
      return (
        <Component style={mergedStyle} {...restProps}>
          <Filler height={height}>{this.renderChildren(dataSource, 0, children)}</Filler>
        </Component>
      );
    }

    const { status, startIndex, endIndex, startItemTop } = this.state;
    const contentHeight = dataSource.length * itemHeight;

    return (
      <Component style={mergedStyle} {...restProps} onScroll={this.onScroll} ref={this.listRef}>
        <Filler height={contentHeight} offset={status === 'MEASURE_DONE' ? startItemTop : 0}>
          {this.renderChildren(dataSource.slice(startIndex, endIndex + 1), startIndex, children)}
        </Filler>
      </Component>
    );
  }
}

export default List;
