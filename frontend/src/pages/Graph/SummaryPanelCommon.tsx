import * as React from 'react';
import { style } from 'typestyle';
import { NodeType, SummaryPanelPropType, Protocol, DecoratedGraphNodeData, BoxByType } from '../../types/Graph';
import { IstioMetricsOptions, Reporter, Direction } from '../../types/MetricsOptions';
import * as API from '../../services/Api';
import * as M from '../../types/Metrics';
import { Response } from '../../services/Api';
import { decoratedNodeData } from 'components/CytoscapeGraph/CytoscapeGraphUtils';
import { PFColors } from 'components/Pf/PfColors';
import { KialiIcon } from 'config/KialiIcon';

export enum NodeMetricType {
  APP = 1,
  WORKLOAD = 2,
  SERVICE = 3,
  AGGREGATE = 4,
  CLUSTER = 5,
  NAMESPACE = 6
}

export const summaryBodyTabs = style({
  padding: '10px 15px 0 15px'
});

export const summaryHeader: React.CSSProperties = {
  backgroundColor: PFColors.White
};

export const summaryPanelWidth = '25em';

export const summaryPanel = style({
  backgroundColor: PFColors.White,
  fontSize: 'var(--graph-side-panel--font-size)',
  height: '100%',
  margin: 0,
  minWidth: summaryPanelWidth,
  overflowY: 'scroll',
  padding: 0,
  position: 'relative',
  width: summaryPanelWidth
});

export const summaryFont: React.CSSProperties = {
  fontSize: 'var(--graph-side-panel--font-size)'
};

export const summaryTitle = style({
  fontWeight: 'bolder',
  marginBottom: '5px',
  textAlign: 'left'
});

export const hr = () => {
  return <hr style={{ margin: '10px 0' }} />;
};

export const shouldRefreshData = (prevProps: SummaryPanelPropType, nextProps: SummaryPanelPropType) => {
  return (
    // Verify the time of the last request
    prevProps.queryTime !== nextProps.queryTime ||
    // Check if going from no data to data
    (!prevProps.data.summaryTarget && nextProps.data.summaryTarget) ||
    // Check if the target changed
    prevProps.data.summaryTarget !== nextProps.data.summaryTarget
  );
};

export const getNodeMetricType = (nodeData: DecoratedGraphNodeData): NodeMetricType => {
  switch (nodeData.nodeType) {
    case NodeType.AGGREGATE:
      return NodeMetricType.AGGREGATE;
    case NodeType.APP:
      // treat versioned app like a workload to narrow to the specific version
      return nodeData.workload ? NodeMetricType.WORKLOAD : NodeMetricType.APP;
    case NodeType.BOX:
      switch (nodeData.isBox) {
        case BoxByType.APP:
          return NodeMetricType.APP;
        case BoxByType.CLUSTER:
          return NodeMetricType.CLUSTER;
        case BoxByType.NAMESPACE:
        default:
          return NodeMetricType.NAMESPACE;
      }
    case NodeType.SERVICE:
      return NodeMetricType.SERVICE;
    default:
      // treat UNKNOWN as a workload with name="unknown"
      return NodeMetricType.WORKLOAD;
  }
};

export const getNodeMetrics = (
  nodeMetricType: NodeMetricType,
  node: any,
  props: SummaryPanelPropType,
  filters: Array<string>,
  direction: Direction,
  reporter: Reporter,
  requestProtocol?: string,
  quantiles?: Array<string>,
  byLabels?: Array<string>
): Promise<Response<M.IstioMetricsMap>> => {
  const nodeData = decoratedNodeData(node);
  const options: IstioMetricsOptions = {
    queryTime: props.queryTime,
    duration: props.duration,
    step: props.step,
    rateInterval: props.rateInterval,
    filters: filters,
    quantiles: quantiles,
    byLabels: byLabels,
    direction: direction,
    reporter: reporter,
    requestProtocol: requestProtocol
  };

  switch (nodeMetricType) {
    case NodeMetricType.AGGREGATE:
      return API.getAggregateMetrics(nodeData.namespace, nodeData.aggregate!, nodeData.aggregateValue!, options);
    case NodeMetricType.APP:
      return API.getAppMetrics(nodeData.namespace, nodeData.app!, options);
    case NodeMetricType.SERVICE:
      return API.getServiceMetrics(nodeData.namespace, nodeData.service!, options);
    case NodeMetricType.WORKLOAD:
      return API.getWorkloadMetrics(nodeData.namespace, nodeData.workload!, options, nodeData.cluster);
    default:
      return Promise.reject(new Error(`Unknown NodeMetricType: ${nodeMetricType}`));
  }
};

export const mergeMetricsResponses = (
  promises: Promise<Response<M.IstioMetricsMap>>[]
): Promise<Response<M.IstioMetricsMap>> => {
  return Promise.all(promises).then(responses => {
    const metrics: M.IstioMetricsMap = {};
    responses.forEach(r => {
      Object.keys(r.data).forEach(k => {
        metrics[k] = r.data[k];
      });
    });
    return {
      data: metrics
    };
  });
};

export const getFirstDatapoints = (metric?: M.Metric[]): M.Datapoint[] => {
  return metric && metric.length > 0 ? metric[0].datapoints : [];
};

export const getDatapoints = (
  metrics: M.Metric[] | undefined,
  comparator: (metric: M.Labels, protocol?: Protocol) => boolean,
  protocol?: Protocol
): M.Datapoint[] => {
  let dpsMap = new Map<number, M.Datapoint>();
  if (metrics) {
    for (let i = 0; i < metrics.length; ++i) {
      const ts = metrics[i];
      if (comparator(ts.labels, protocol)) {
        // Sum values, because several metrics can satisfy the comparator
        // E.g. with multiple active namespaces and node being an outsider, we need to sum datapoints for every active namespace
        ts.datapoints.forEach(dp => {
          const val = Number(dp[1]);
          if (!isNaN(val)) {
            const current = dpsMap.get(dp[0]);
            dpsMap.set(dp[0], current ? [dp[0], current[1] + val] : [dp[0], val]);
          }
        });
      }
    }
  }
  return Array.from(dpsMap.values());
};

export const renderNoTraffic = (protocol?: string) => {
  return (
    <>
      <div>
        <KialiIcon.Info /> No {protocol ? protocol : ''} traffic logged.
      </div>
    </>
  );
};

export const getTitle = (title: string): React.ReactFragment => {
  switch (title) {
    case NodeType.AGGREGATE:
      title = 'Operation';
      break;
    case NodeType.APP:
      title = 'Application';
      break;
    case NodeType.SERVICE:
      title = 'Service';
      break;
    case NodeType.WORKLOAD:
      title = 'Workload';
      break;
  }
  return (
    <div className={summaryTitle}>
      {title}
      <br />
    </div>
  );
};
