package handlers

import (
	"context"
	"fmt"
	"github.com/gorilla/mux"
	"github.com/kiali/kiali/business"
	"github.com/kiali/kiali/kubernetes"
	"github.com/kiali/kiali/log"
	"github.com/kiali/kiali/models"
	cache "github.com/patrickmn/go-cache"
	"io"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"net/http"
	"time"
)

// 缓存 加快结果返回，减少对集群的压力
var metricCache = cache.New(3*time.Minute, 5*time.Minute)

type clusterResponse struct {
	Name      string `json:"name"`
	UriPrefix string `json:"uriPrefix"`
	Status    struct {
		Flag  string `json:"flag"`
		Value string `json:"value"`
		Tips  string `json:"tips"`
	} `json:"status"`
}

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

type IstioConfigDetailsPreview struct {
	Namespace   models.Namespace `json:"namespace"`
	ObjectType  string           `json:"objectType"`
	Object      string           `json:"object"`
	PreviewData string           `json:"previewData"`
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

func IstioConfigQueryPreview(w http.ResponseWriter, r *http.Request) {
	params := mux.Vars(r)
	namespace := params["namespace"]
	objectType := params["object_type"]
	object := params["object"]

	if !business.GetIstioAPI(objectType) {
		RespondWithError(w, http.StatusBadRequest, "Object type not managed: "+objectType)
		return
	}

	istioConfigDetailPreview := IstioConfigDetailsPreview{}
	istioConfigDetailPreview.Namespace = models.Namespace{Name: namespace}
	istioConfigDetailPreview.ObjectType = objectType
	istioConfigDetailPreview.Object = object
	istioConfigDetailPreview.PreviewData = string(ReadReleasingConfigFile(object, namespace, objectType))
	audit(r, "QUERY PREVIEW on Namespace: "+namespace+" Type: "+objectType+" Name: "+object)
	RespondWithJSON(w, http.StatusOK, istioConfigDetailPreview)
}

func IstioConfigCreateOrUpdatePreview(w http.ResponseWriter, r *http.Request) {
	params := mux.Vars(r)
	namespace := params["namespace"]
	objectType := params["object_type"]
	object := params["object"]

	if !business.GetIstioAPI(objectType) {
		RespondWithError(w, http.StatusBadRequest, "Object type not managed: "+objectType)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Update request with bad update patch: "+err.Error())
	}
	if err != nil {
		handleErrorResponse(w, err)
		return
	}

	istioConfigDetailPreview := IstioConfigDetailsPreview{}
	istioConfigDetailPreview.Namespace = models.Namespace{Name: namespace}
	istioConfigDetailPreview.ObjectType = objectType
	istioConfigDetailPreview.Object = object
	istioConfigDetailPreview.PreviewData = string(body)
	err = WriteFile(object, namespace, objectType, body)
	if err != nil {
		handleErrorResponse(w, err)
		return
	}

	audit(r, "UPDATE PREVIEW on Namespace: "+namespace+" Type: "+objectType+" Name: "+object+" Patch: "+string(body))
	RespondWithJSON(w, http.StatusOK, istioConfigDetailPreview)
}

func getProxySyncMetric(ctx context.Context, namespace string, layer *business.Layer) *AdditionalMetric {
	// criteria := business.WorkloadCriteria{Namespace: namespace, IncludeIstioResources: true, IncludeHealth: true}
	podList, err := layer.Workload.GetPods(ctx, namespace, "")
	if err != nil {
		log.Errorf("failed to get workload list: %v", err)
		return nil
	}
	var proxySync = &AdditionalMetric{}
	proxySync.Name = "proxy配置同步"

	syncedProxiesNum := 0
	unSyncedProxiesNum := 0

	for _, p := range podList {
		if p.ProxyStatus == nil {
			continue
		}
		if !p.HasIstioSidecar() {
			continue
		}
		ps := layer.ProxyStatus.GetPodProxyStatus(namespace, p.Name)
		if ps == nil {
			log.Info("proxy status is nil", "namespace", namespace, "pod", p.Name)
			continue
		}
		if ps.IsSynced() {
			syncedProxiesNum++
		} else {
			unSyncedProxiesNum++
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

	var proxyMemory = AdditionalMetric{}
	cacheKey := "proxyMemory-" + namespace
	v, ok := metricCache.Get(cacheKey)
	if ok {
		proxyMemory = v.(AdditionalMetric)
		return &proxyMemory
	}

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
			if (float64(used) / float64(limit)) > 0.85 {
				proxyMemoryStatusWarn.Tips = proxyMemoryStatusWarn.Tips + fmt.Sprintf("podname: %v used/limit:%v/%v \n", p.Name, used/1024/1024, limit/1024/1024)
				warnN++
			} else {
				okN++
			}
		}
	}
	proxyMemoryStatusOk.Value = fmt.Sprintf("%v", okN)
	proxyMemoryStatusWarn.Value = fmt.Sprintf("%v", warnN)
	proxyMemoryStatusOk.Tips = fmt.Sprintf("%v个pod sidecar内存在合理范围内", okN)
	proxyMemoryStatusWarn.Tips = proxyMemoryStatusWarn.Tips + fmt.Sprintf("共%v个pod sidecar内存使用超过85%%", warnN)
	proxyMemory.Status = append(proxyMemory.Status, proxyMemoryStatusOk, proxyMemoryStatusWarn)

	metricCache.Set(cacheKey, proxyMemory, cache.DefaultExpiration)
	return &proxyMemory
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

	pre := clusterResponse{
		Name:      "pre",
		UriPrefix: "pre",
	}
	pre.Status.Flag = "ok"
	pre.Status.Value = "健康"
	pre.Status.Tips = "pre集群，预发集群"

	response = append(response, prod, hub, pre)
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

func UserTokenHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		RespondWithError(w, http.StatusBadRequest, "code is empty")
		return
	}
	token, err := getUserToken(code)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	RespondWithJSON(w, http.StatusOK, token)
}

func UserInfoHandler(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("Authorization")
	if token == "" {
		RespondWithError(w, http.StatusBadRequest, "token is empty")
		return
	}
	userInfo, err := getUserInfo(token)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if IsAdminUser(userInfo.Username) {
		userInfo.Identity = "administrator"
		userInfo.IdentityName = "管理员"
	} else {
		userInfo.Identity = "developer"
		userInfo.IdentityName = "普通开发者"
	}
	RespondWithJSON(w, http.StatusOK, userInfo)
}

func getPermissionsByUser(user, object, namespace string) (bool, bool, bool, bool) {
	var canCreate, canPatch, canDelete, canPreview bool
	if IsAdminUser(user) {
		canCreate, canPatch, canDelete, canPreview = true, true, true, true
		return canCreate, canPatch, canDelete, canPreview
	}
	if IsDeveloperUser(user) {
		canCreate, canPatch, canDelete, canPreview = false, false, false, true
		return canCreate, canPatch, canDelete, canPreview
	}

	canCreate, canPatch, canDelete, canPreview = false, false, false, false
	return canCreate, canPatch, canDelete, canPreview
}

func mergeUserPermissions(user *UserInfo, object, namespace string, permissions *models.ResourcePermissions) {
	canCreate, canPatch, canDelete, canPreview := getPermissionsByUser(user.Username, object, namespace)
	permissions.Create = canCreate && permissions.Create
	permissions.Update = canPatch && permissions.Update
	permissions.Delete = canDelete && permissions.Delete
	// 原来并没有preview权限，这里加上
	permissions.Preview = canPreview
	return
}
