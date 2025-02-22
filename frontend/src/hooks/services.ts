import * as React from 'react';
import { CancelablePromise } from '../utils/CancelablePromises';
import * as API from '../services/Api';
import { DurationInSeconds, TimeInMilliseconds } from '../types/Common';
import { ServiceDetailsInfo } from '../types/ServiceInfo';
import { getGatewaysAsList, PeerAuthentication } from '../types/IstioObjects';
import { AxiosError } from 'axios';
import { DecoratedGraphNodeData, NodeType } from '../types/Graph';
import * as AlertUtils from '../utils/AlertUtils';
import { useState } from 'react';

export function useServiceDetail(
  namespace: string,
  serviceName: string,
  cluster?: string | undefined,
  duration?: DurationInSeconds,
  updateTime?: TimeInMilliseconds
) {
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [fetchError, setFetchError] = React.useState<AxiosError | null>(null);

  const [serviceDetails, setServiceDetails] = React.useState<ServiceDetailsInfo | null>(null);
  const [gateways, setGateways] = React.useState<string[] | null>(null);
  const [peerAuthentications, setPeerAuthentications] = React.useState<PeerAuthentication[] | null>(null);

  React.useEffect(() => {
    if (namespace.length === 0 || serviceName.length === 0) {
      return;
    }

    setIsLoading(true); // Mark as loading
    let getDetailPromise = API.getServiceDetail(namespace, serviceName, false, cluster, duration);
    let getGwPromise = API.getAllIstioConfigs([], ['gateways'], false, '', '', cluster);
    let getPeerAuthsPromise = API.getIstioConfig(namespace, ['peerauthentications'], false, '', '');

    const allPromise = new CancelablePromise(Promise.all([getDetailPromise, getGwPromise, getPeerAuthsPromise]));
    allPromise.promise
      .then(results => {
        setServiceDetails(results[0]);
        setGateways(
          Object.values(results[1].data)
            .map(nsCfg => getGatewaysAsList(nsCfg.gateways))
            .flat()
            .sort()
        );
        setPeerAuthentications(results[2].data.peerAuthentications);
        setFetchError(null);
        setIsLoading(false);
      })
      .catch(error => {
        if (error.isCanceled) {
          return;
        }
        setFetchError(error);
        setIsLoading(false);
      });

    return function () {
      // Cancel the promise, just in case there is still some ongoing request
      // after the component is unmounted.
      allPromise.cancel();
      setIsLoading(false);

      // Reset state
      setServiceDetails(null);
      setGateways(null);
      setPeerAuthentications(null);
    };
  }, [namespace, serviceName, cluster, duration, updateTime]);

  return [serviceDetails, gateways, peerAuthentications, isLoading, fetchError] as const;
}

export function useServiceDetailForGraphNode(
  node: DecoratedGraphNodeData,
  loadFlag: boolean,
  duration?: DurationInSeconds,
  updateTime?: TimeInMilliseconds
) {
  const [nodeNamespace, setNodeNamespace] = useState<string>('');
  const [nodeSvcName, setNodeSvcName] = useState<string>('');
  const [usedDuration, setUsedDuration] = useState<DurationInSeconds | undefined>(undefined);
  const [usedUpdateTime, setUsedUpdateTime] = useState<TimeInMilliseconds | undefined>(undefined);

  React.useEffect(() => {
    if (!loadFlag) {
      return;
    }

    const localSvc = node.nodeType === NodeType.SERVICE && node.service && !node.isServiceEntry ? node.service : '';

    setNodeNamespace(node.namespace);
    setNodeSvcName(localSvc);
    setUsedDuration(duration);
    setUsedUpdateTime(updateTime);
  }, [loadFlag, node, duration, updateTime]);

  const result = useServiceDetail(nodeNamespace, nodeSvcName, node.cluster, usedDuration, usedUpdateTime);

  const fetchError = result[4];
  React.useEffect(() => {
    if (fetchError !== null) {
      AlertUtils.addError('Could not fetch Service Details.', fetchError);
    }
  }, [fetchError]);

  return result;
}
