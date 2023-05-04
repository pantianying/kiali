package business

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	networking_v1beta1 "istio.io/client-go/pkg/apis/networking/v1beta1"
	security_v1beta "istio.io/client-go/pkg/apis/security/v1beta1"
	core_v1 "k8s.io/api/core/v1"
	meta_v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	"github.com/kiali/kiali/config"
	"github.com/kiali/kiali/kubernetes"
	"github.com/kiali/kiali/kubernetes/kubetest"
	"github.com/kiali/kiali/models"
	"github.com/kiali/kiali/tests/data"
	"github.com/kiali/kiali/tests/testutils/validations"
)

func TestGetNamespaceValidations(t *testing.T) {
	assert := assert.New(t)
	require := require.New(t)
	conf := config.NewConfig()
	config.Set(conf)

	vs := mockCombinedValidationService(t, fakeIstioConfigList(),
		[]string{"details.test.svc.cluster.local", "product.test.svc.cluster.local", "product2.test.svc.cluster.local", "customer.test.svc.cluster.local"}, "test", fakePods())

	validations, err := vs.GetValidations(context.TODO(), kubernetes.HomeClusterName, "test", "", "")
	require.NoError(err)
	assert.NotEmpty(validations)
	assert.True(validations[models.IstioValidationKey{ObjectType: "virtualservice", Namespace: "test", Name: "product-vs"}].Valid)
}

func TestGetAllValidations(t *testing.T) {
	assert := assert.New(t)
	conf := config.NewConfig()
	config.Set(conf)

	vs := mockCombinedValidationService(t, fakeIstioConfigList(),
		[]string{"details.test.svc.cluster.local", "product.test.svc.cluster.local", "product2.test.svc.cluster.local", "customer.test.svc.cluster.local"}, "test", fakePods())

	validations, _ := vs.GetValidations(context.TODO(), kubernetes.HomeClusterName, "", "", "")
	assert.NotEmpty(validations)
	assert.True(validations[models.IstioValidationKey{ObjectType: "virtualservice", Namespace: "test", Name: "product-vs"}].Valid)
}

func TestGetIstioObjectValidations(t *testing.T) {
	assert := assert.New(t)
	conf := config.NewConfig()
	config.Set(conf)

	vs := mockCombinedValidationService(t, fakeIstioConfigList(),
		[]string{"details.test.svc.cluster.local", "product.test.svc.cluster.local", "customer.test.svc.cluster.local"}, "test", fakePods())

	validations, _, _ := vs.GetIstioObjectValidations(context.TODO(), kubernetes.HomeClusterName, "test", "virtualservices", "product-vs")

	assert.NotEmpty(validations)
}

func TestGatewayValidation(t *testing.T) {
	assert := assert.New(t)
	conf := config.NewConfig()
	config.Set(conf)

	v := mockMultiNamespaceGatewaysValidationService(t)
	validations, _, _ := v.GetIstioObjectValidations(context.TODO(), kubernetes.HomeClusterName, "test", "gateways", "first")
	assert.NotEmpty(validations)
}

func TestFilterExportToNamespacesVS(t *testing.T) {
	assert := assert.New(t)
	conf := config.NewConfig()
	config.Set(conf)

	var currentIstioObjects []*networking_v1beta1.VirtualService
	vs1to3 := loadVirtualService("vs_bookinfo1_to_2_3.yaml", t)
	currentIstioObjects = append(currentIstioObjects, vs1to3)
	vs1tothis := loadVirtualService("vs_bookinfo1_to_this.yaml", t)
	currentIstioObjects = append(currentIstioObjects, vs1tothis)
	vs2to1 := loadVirtualService("vs_bookinfo2_to_1.yaml", t)
	currentIstioObjects = append(currentIstioObjects, vs2to1)
	vs2tothis := loadVirtualService("vs_bookinfo2_to_this.yaml", t)
	currentIstioObjects = append(currentIstioObjects, vs2tothis)
	vs3to2 := loadVirtualService("vs_bookinfo3_to_2.yaml", t)
	currentIstioObjects = append(currentIstioObjects, vs3to2)
	vs3toall := loadVirtualService("vs_bookinfo3_to_all.yaml", t)
	currentIstioObjects = append(currentIstioObjects, vs3toall)
	v := mockEmptyValidationService()
	filteredVSs := v.filterVSExportToNamespaces("bookinfo", currentIstioObjects)
	var expectedVS []*networking_v1beta1.VirtualService
	expectedVS = append(expectedVS, vs1tothis)
	expectedVS = append(expectedVS, vs2to1)
	expectedVS = append(expectedVS, vs3toall)
	filteredKeys := []string{}
	for _, vs := range filteredVSs {
		filteredKeys = append(filteredKeys, fmt.Sprintf("%s/%s", vs.Name, vs.Namespace))
	}
	expectedKeys := []string{}
	for _, vs := range expectedVS {
		expectedKeys = append(expectedKeys, fmt.Sprintf("%s/%s", vs.Name, vs.Namespace))
	}
	assert.EqualValues(filteredKeys, expectedKeys)
}

func TestGetVSReferences(t *testing.T) {
	assert := assert.New(t)
	conf := config.NewConfig()
	config.Set(conf)

	vs := mockCombinedValidationService(t, fakeIstioConfigList(), []string{}, "test", fakePods())

	_, referencesMap, err := vs.GetIstioObjectValidations(context.TODO(), kubernetes.HomeClusterName, "test", kubernetes.VirtualServices, "product-vs")
	references := referencesMap[models.IstioReferenceKey{ObjectType: "virtualservice", Namespace: "test", Name: "product-vs"}]

	// Check Service references
	assert.Nil(err)
	assert.NotNil(references)
	assert.NotEmpty(references.ServiceReferences)
	assert.Len(references.ServiceReferences, 2)
	assert.Equal(references.ServiceReferences[0].Name, "product")
	assert.Equal(references.ServiceReferences[0].Namespace, "test")
	assert.Equal(references.ServiceReferences[1].Name, "product2")
	assert.Equal(references.ServiceReferences[1].Namespace, "test")
}

func TestGetVSReferencesNotExisting(t *testing.T) {
	assert := assert.New(t)
	conf := config.NewConfig()
	config.Set(conf)

	vs := mockCombinedValidationService(t, fakeEmptyIstioConfigList(), []string{}, "test", fakePods())

	_, referencesMap, err := vs.GetIstioObjectValidations(context.TODO(), kubernetes.HomeClusterName, "wrong", "virtualservices", "wrong")
	references := referencesMap[models.IstioReferenceKey{ObjectType: "wrong", Namespace: "wrong", Name: "product-vs"}]

	assert.Nil(err)
	assert.Nil(references)
}

func mockMultiNamespaceGatewaysValidationService(t *testing.T) IstioValidationsService {
	fakeIstioObjects := []runtime.Object{
		&core_v1.ConfigMap{ObjectMeta: meta_v1.ObjectMeta{Name: "istio", Namespace: "istio-system"}},
	}
	for _, p := range fakeNamespaces() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range fakePolicies() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range FakeDepSyncedWithRS() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range FakeRSSyncedWithPods() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range fakePods().Items {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range fakeMeshPolicies() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}

	k8s := kubetest.NewFakeK8sClient(fakeIstioObjects...)
	cache := SetupBusinessLayer(t, k8s, *config.NewConfig())
	cache.SetRegistryStatus(&kubernetes.RegistryStatus{
		Configuration: &kubernetes.RegistryConfiguration{
			Gateways: append(getGateway("first", "test"), getGateway("second", "test2")...),
		},
	})

	k8sclients := make(map[string]kubernetes.ClientInterface)
	k8sclients[kubernetes.HomeClusterName] = k8s
	return IstioValidationsService{k8s: k8s, businessLayer: NewWithBackends(k8sclients, k8sclients, nil, nil)}
}

func mockCombinedValidationService(t *testing.T, istioConfigList *models.IstioConfigList, services []string, namespace string, podList *core_v1.PodList) IstioValidationsService {
	fakeIstioObjects := []runtime.Object{
		&core_v1.ConfigMap{ObjectMeta: meta_v1.ObjectMeta{Name: "istio", Namespace: "istio-system"}},
		&core_v1.Namespace{ObjectMeta: meta_v1.ObjectMeta{Name: "wrong"}},
	}
	for _, p := range fakeMeshPolicies() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range fakePolicies() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range fakeCombinedServices(services, "test") {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range FakeDepSyncedWithRS() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range fakeNamespaces() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range FakeRSSyncedWithPods() {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}
	for _, p := range fakePods().Items {
		fakeIstioObjects = append(fakeIstioObjects, p.DeepCopyObject())
	}

	setupGlobalMeshConfig()

	k8s := kubetest.NewFakeK8sClient(fakeIstioObjects...)

	cache := SetupBusinessLayer(t, k8s, *config.NewConfig())
	cache.SetRegistryStatus(&kubernetes.RegistryStatus{
		Services: data.CreateFakeMultiRegistryServices(services, "test", "*"),
		Configuration: &kubernetes.RegistryConfiguration{
			Gateways:               istioConfigList.Gateways,
			DestinationRules:       istioConfigList.DestinationRules,
			VirtualServices:        istioConfigList.VirtualServices,
			ServiceEntries:         istioConfigList.ServiceEntries,
			Sidecars:               istioConfigList.Sidecars,
			WorkloadEntries:        istioConfigList.WorkloadEntries,
			RequestAuthentications: istioConfigList.RequestAuthentications,
		},
	})

	k8sclients := make(map[string]kubernetes.ClientInterface)
	k8sclients[kubernetes.HomeClusterName] = k8s
	return IstioValidationsService{k8s: k8s, businessLayer: NewWithBackends(k8sclients, k8sclients, nil, nil)}
}

func mockEmptyValidationService() IstioValidationsService {
	k8s := new(kubetest.K8SClientMock)
	k8s.MockIstio()
	k8s.On("IsOpenShift").Return(false)
	k8s.On("IsGatewayAPI").Return(false)
	k8s.On("IsMaistraApi").Return(false)
	k8sclients := make(map[string]kubernetes.ClientInterface)
	k8sclients[kubernetes.HomeClusterName] = k8s
	return IstioValidationsService{k8s: k8s, businessLayer: NewWithBackends(k8sclients, k8sclients, nil, nil)}
}

func fakeEmptyIstioConfigList() *models.IstioConfigList {
	return &models.IstioConfigList{}
}

func fakeIstioConfigList() *models.IstioConfigList {
	istioConfigList := models.IstioConfigList{}

	istioConfigList.VirtualServices = []*networking_v1beta1.VirtualService{
		data.AddHttpRoutesToVirtualService(data.CreateHttpRouteDestination("product", "v1", -1),
			data.AddTcpRoutesToVirtualService(data.CreateTcpRoute("product2", "v1", -1),
				data.CreateEmptyVirtualService("product-vs", "test", []string{"product"}))),
	}

	istioConfigList.DestinationRules = []*networking_v1beta1.DestinationRule{
		data.AddSubsetToDestinationRule(data.CreateSubset("v1", "v1"), data.CreateEmptyDestinationRule("test", "product-dr", "product")),
		data.CreateEmptyDestinationRule("test", "customer-dr", "customer"),
	}

	istioConfigList.Gateways = append(getGateway("first", "test"), getGateway("second", "test2")...)

	return &istioConfigList
}

func fakeMeshPolicies() []*security_v1beta.PeerAuthentication {
	return []*security_v1beta.PeerAuthentication{
		data.CreateEmptyMeshPeerAuthentication("default", nil),
		data.CreateEmptyMeshPeerAuthentication("test", nil),
	}
}

func fakePolicies() []*security_v1beta.PeerAuthentication {
	return []*security_v1beta.PeerAuthentication{
		data.CreateEmptyPeerAuthentication("default", "bookinfo", nil),
		data.CreateEmptyPeerAuthentication("test", "foo", nil),
	}
}

func fakeNamespaces() []core_v1.Namespace {
	return []core_v1.Namespace{
		{
			ObjectMeta: meta_v1.ObjectMeta{
				Name: "test",
			},
		},
		{
			ObjectMeta: meta_v1.ObjectMeta{
				Name: "test2",
			},
		},
	}
}

func fakeCombinedServices(services []string, namespace string) []core_v1.Service {
	items := []core_v1.Service{}

	for _, service := range services {
		items = append(items, core_v1.Service{
			ObjectMeta: meta_v1.ObjectMeta{
				Name:      service,
				Namespace: namespace,
				Labels: map[string]string{
					"app":     service,
					"version": "v1",
				},
			},
		})
	}
	return items
}

func fakePods() *core_v1.PodList {
	return &core_v1.PodList{
		Items: []core_v1.Pod{
			{
				ObjectMeta: meta_v1.ObjectMeta{
					Name: "reviews-12345-hello",
					Labels: map[string]string{
						"app":     "reviews",
						"version": "v2",
					},
				},
			},
			{
				ObjectMeta: meta_v1.ObjectMeta{
					Name: "reviews-54321-hello",
					Labels: map[string]string{
						"app":     "reviews",
						"version": "v1",
					},
				},
			},
		},
	}
}

func getGateway(name, namespace string) []*networking_v1beta1.Gateway {
	return []*networking_v1beta1.Gateway{
		data.AddServerToGateway(data.CreateServer([]string{"valid"}, 80, "http", "http"),
			data.CreateEmptyGateway(name, namespace, map[string]string{
				"app": "real",
			})),
	}
}

func loadVirtualService(file string, t *testing.T) *networking_v1beta1.VirtualService {
	loader := yamlFixtureLoaderFor(file)
	err := loader.Load()
	if err != nil {
		t.Error("Error loading test data.")
	}
	return loader.GetResources().VirtualServices[0]
}

func yamlFixtureLoaderFor(file string) *validations.YamlFixtureLoader {
	path := fmt.Sprintf("../tests/data/validations/exportto/cns/%s", file)
	return &validations.YamlFixtureLoader{Filename: path}
}
