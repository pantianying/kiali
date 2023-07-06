package handlers

import (
	"context"
	"fmt"
	"github.com/gorilla/mux"
	"github.com/kiali/kiali/business"
	"github.com/kiali/kiali/kubernetes"
	"github.com/kiali/kiali/log"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"net/http"
)

//var (
//	metricApi *metricsclientset.Clientset
//	k8sApi    *kube.Clientset
//)
//
//func init() {
//	cfg, err := kubernetes.ConfigClient()
//	if err != nil {
//		log.Errorf("failed to get k8s config: %v", err)
//	}
//	metricClient, err := metricsclientset.NewForConfig(cfg)
//	if err != nil {
//		log.Errorf("failed to get metrics client: %v", err)
//	}
//	metricApi = metricClient
//
//	k8sClient, err := kube.NewForConfig(cfg)
//	if err != nil {
//		log.Errorf("failed to get k8s client: %v", err)
//	}
//	k8sApi = k8sClient
//}

type AdditionalMetricResponse struct {
	AdditionalMetric []AdditionalMetric `json:"additionalMetric"`
}

type AdditionalMetric struct {
	Name   string      `json:"name"`
	Status []StatusStu `json:"status"`
}

type StatusStu struct {
	Flag  string `json:"flag,omitempty"`
	Value string `json:"value,omitempty"`
	Tips  string `json:"tips,omitempty"`
	Link  string `json:"link,omitempty"`
}

func AdditionalMetricHandler(w http.ResponseWriter, r *http.Request) {
	params := mux.Vars(r)
	namespace := params["namespace"]
	var response AdditionalMetricResponse
	b, err := getBusiness(r)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Services initialization error: "+err.Error())
		return
	}
	proxySync := getProxySyncMetric(r.Context(), namespace, b)
	if proxySync != nil {
		response.AdditionalMetric = append(response.AdditionalMetric, *proxySync)
	}
	proxyMemory := getProxyMemoryMetric(r.Context(), namespace)
	if proxyMemory != nil {
		response.AdditionalMetric = append(response.AdditionalMetric, *proxyMemory)
	}

	RespondWithJSON(w, http.StatusOK, response)
}

func getProxySyncMetric(ctx context.Context, namespace string, layer *business.Layer) *AdditionalMetric {
	criteria := business.WorkloadCriteria{Namespace: namespace, IncludeIstioResources: true, IncludeHealth: true}
	list, err := layer.Workload.GetWorkloadList(ctx, criteria)
	if err != nil {
		log.Errorf("failed to get workload list: %v", err)
		return nil
	}
	var proxySync = &AdditionalMetric{}
	proxySync.Name = "proxy配置同步"

	syncedProxiesNum := 0
	unSyncedProxiesNum := 0
	for _, workload := range list.Workloads {
		if workload.Health.WorkloadStatus == nil {
			continue
		}
		if workload.IstioSidecar {
			fmt.Printf("%s %v: %+v\n", workload.Name, workload.IstioSidecar, workload.Health.WorkloadStatus)
			if workload.Health.WorkloadStatus.SyncedProxies > 0 {
				syncedProxiesNum = syncedProxiesNum + int(workload.Health.WorkloadStatus.SyncedProxies)
			}
			if workload.Health.WorkloadStatus.SyncedProxies >= 0 && workload.Health.WorkloadStatus.SyncedProxies != workload.Health.WorkloadStatus.DesiredReplicas {
				log.Warningf("workload %s has %d/%d proxies synced", workload.Name, workload.Health.WorkloadStatus.SyncedProxies, workload.Health.WorkloadStatus.DesiredReplicas)
				unSyncedProxiesNum = unSyncedProxiesNum + int(workload.Health.WorkloadStatus.DesiredReplicas-workload.Health.WorkloadStatus.SyncedProxies)
			}
		}
	}
	var syncedProxiesStatus StatusStu
	syncedProxiesStatus.Flag = "ok"
	syncedProxiesStatus.Value = fmt.Sprintf("%d", syncedProxiesNum)
	syncedProxiesStatus.Tips = fmt.Sprintf("%v proxy synced", syncedProxiesNum)
	syncedProxiesStatus.Link = "https://www.kiali.io/documentation/latest/observability/health/#proxy-sync"
	proxySync.Status = append(proxySync.Status, syncedProxiesStatus)
	if unSyncedProxiesNum != 0 {
		var unSyncedProxiesStatus StatusStu
		unSyncedProxiesStatus.Flag = "error"
		unSyncedProxiesStatus.Value = fmt.Sprintf("%d", unSyncedProxiesNum)
		unSyncedProxiesStatus.Tips = fmt.Sprintf("%v proxy unsynced", unSyncedProxiesNum)
		unSyncedProxiesStatus.Link = "https://www.kiali.io/documentation/latest/observability/health/#proxy-sync"
		proxySync.Status = append(proxySync.Status, unSyncedProxiesStatus)
	}
	return proxySync
}

func getProxyMemoryMetric(ctx context.Context, namespace string) *AdditionalMetric {
	var proxyMemory = &AdditionalMetric{}
	proxyMemory.Name = "proxy内存情况"
	var proxyMemoryStatusOk = StatusStu{
		Flag: "ok",
	}
	var proxyMemoryStatusWarn = StatusStu{
		Flag: "warn",
	}
	podList, err := business.GetkialiCache().GetPods(namespace, "")
	if err != nil {
		log.Errorf("failed to get pod list: %v", err)
		return nil
	}
	okN, warnN := 0, 0
	for _, p := range podList {
		ok1, limit := proxyMemoryLimit(ctx, business.GetkialiCache().GetClient(), p.Namespace, p.Name)
		ok2, used := proxyMemoryUsed(ctx, business.GetkialiCache().GetClient(), p.Namespace, p.Name)
		if ok2 && ok1 {
			if (float64(used) / float64(limit)) > 0.9 {
				proxyMemoryStatusWarn.Tips = proxyMemoryStatusWarn.Tips + fmt.Sprintf("podname: %v used/limit:%v/%v \n", p.Name, used, limit)
				warnN++
			} else {
				okN++
			}
		}
	}
	proxyMemoryStatusOk.Value = fmt.Sprintf("%v", okN)
	proxyMemoryStatusWarn.Value = fmt.Sprintf("%v", warnN)
	proxyMemoryStatusOk.Tips = fmt.Sprintf("%v个pod sidecar内存在合理范围内", okN)
	proxyMemoryStatusWarn.Tips = proxyMemoryStatusWarn.Tips + fmt.Sprintf("共%v个pod sidecar内存使用超过90%", warnN)
	proxyMemory.Status = append(proxyMemory.Status, proxyMemoryStatusOk, proxyMemoryStatusWarn)
	return proxyMemory
}

type clusterResponse struct {
	Name      string `json:"name"`
	UriPrefix string `json:"uriPrefix"`
	Status    struct {
		Flag  string `json:"flag"`
		Value string `json:"value"`
		Tips  string `json:"tips"`
	} `json:"status"`
}

func ClusterList(w http.ResponseWriter, r *http.Request) {
	var response []clusterResponse
	prod := clusterResponse{
		Name:      "prod",
		UriPrefix: "prod",
	}
	prod.Status.Flag = "ok"
	prod.Status.Value = "健康"
	prod.Status.Tips = "业务生产集群"

	hub := clusterResponse{
		Name:      "hub",
		UriPrefix: "hub",
	}
	hub.Status.Flag = "ok"
	hub.Status.Value = "健康"
	hub.Status.Tips = "hub集群，dna、监控所在集群"

	response = append(response, prod, hub)
	RespondWithJSON(w, http.StatusOK, response)
}

func proxyMemoryUsed(ctx context.Context, c *kubernetes.K8SClient, namespace, podName string) (bool, int64) {
	metric, err := c.GetMetricApi().MetricsV1beta1().PodMetricses(namespace).Get(ctx, podName, v1.GetOptions{})
	if err != nil {
		log.Errorf("failed to get pod metrics: %v", err)
		return false, 0
	}
	for _, c := range metric.Containers {
		if c.Name == "istio-proxy" {
			return true, c.Usage.Memory().Value()
		}
	}
	return false, 0
}

func proxyMemoryLimit(ctx context.Context, c *kubernetes.K8SClient, namespace, podName string) (bool, int64) {
	pod, err := c.GetK8sApi().CoreV1().Pods(namespace).Get(ctx, podName, v1.GetOptions{})
	if err != nil {
		log.Errorf("failed to get pod: %v", err)
		return false, 0
	}
	for _, c := range pod.Spec.Containers {
		if c.Name == "istio-proxy" {
			return true, c.Resources.Limits.Memory().Value()
		}
	}
	return false, 0
}
