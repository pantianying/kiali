package handlers

import (
	"fmt"
	"github.com/gorilla/mux"
	"github.com/kiali/kiali/business"
	"net/http"
)

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
	// Get business layer
	b, err := getBusiness(r)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Services initialization error: "+err.Error())
		return
	}
	criteria := business.WorkloadCriteria{Namespace: namespace, IncludeIstioResources: false, IncludeHealth: false}
	list, err := b.Workload.GetWorkloadList(r.Context(), criteria)
	if err != nil {
		return
	}
	var proxySync AdditionalMetric
	proxySync.Name = "proxy sync"

	syncedProxiesNum := 0
	unSyncedProxiesNum := 0
	for _, workload := range list.Workloads {
		if workload.Health.WorkloadStatus.SyncedProxies != 0 {
			syncedProxiesNum = syncedProxiesNum + int(workload.Health.WorkloadStatus.SyncedProxies)
		}
		if workload.Health.WorkloadStatus.SyncedProxies != workload.Health.WorkloadStatus.DesiredReplicas {
			unSyncedProxiesNum = unSyncedProxiesNum + int(workload.Health.WorkloadStatus.DesiredReplicas-workload.Health.WorkloadStatus.SyncedProxies)
		}
	}
	var syncedProxiesStatus StatusStu
	syncedProxiesStatus.Flag = "syncedProxies"
	syncedProxiesStatus.Value = fmt.Sprintf("%d", syncedProxiesNum)
	syncedProxiesStatus.Tips = "The number of proxies that have been synced"
	syncedProxiesStatus.Link = "https://www.kiali.io/documentation/latest/observability/health/#proxy-sync"
	proxySync.Status = append(proxySync.Status, syncedProxiesStatus)
	var unSyncedProxiesStatus StatusStu
	unSyncedProxiesStatus.Flag = "unSyncedProxies"
	unSyncedProxiesStatus.Value = fmt.Sprintf("%d", syncedProxiesNum)
	unSyncedProxiesStatus.Tips = "The number of proxies that have not been synced"
	unSyncedProxiesStatus.Link = "https://www.kiali.io/documentation/latest/observability/health/#proxy-sync"
	response.AdditionalMetric = append(response.AdditionalMetric, proxySync)
	RespondWithJSON(w, http.StatusOK, response)
}
