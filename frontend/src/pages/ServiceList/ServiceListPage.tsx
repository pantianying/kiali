import * as React from 'react';
import * as FilterHelper from '../../components/FilterList/FilterHelper';
import { RenderContent } from '../../components/Nav/Page';
import * as ServiceListFilters from './FiltersAndSorts';
import * as FilterComponent from '../../components/FilterList/FilterComponent';
import { ServiceList, ServiceListItem } from '../../types/ServiceList';
import { DurationInSeconds } from '../../types/Common';
import Namespace from '../../types/Namespace';
import { PromisesRegistry } from '../../utils/CancelablePromises';
import { namespaceEquals } from '../../utils/Common';
import { SortField } from '../../types/SortFilters';
import { ActiveFiltersInfo, ActiveTogglesInfo } from '../../types/Filters';
import { FilterSelected, StatefulFilters, Toggles } from '../../components/Filters/StatefulFilters';
import * as API from '../../services/Api';
import { ObjectValidation, Validations } from '../../types/IstioObjects';
import VirtualList from '../../components/VirtualList/VirtualList';
import { KialiAppState } from '../../store/Store';
import { activeNamespacesSelector, durationSelector } from '../../store/Selectors';
import DefaultSecondaryMasthead from '../../components/DefaultSecondaryMasthead/DefaultSecondaryMasthead';
import { connect } from 'react-redux';
import TimeDurationContainer from '../../components/Time/TimeDurationComponent';
import { sortIstioReferences } from '../AppList/FiltersAndSorts';
import { validationKey } from '../../types/IstioConfigList';
import { ServiceHealth } from '../../types/Health';
import RefreshNotifier from '../../components/Refresh/RefreshNotifier';
import { isMultiCluster } from 'config';

type ServiceListPageState = FilterComponent.State<ServiceListItem>;

type ReduxProps = {
  duration: DurationInSeconds;
  activeNamespaces: Namespace[];
};

type ServiceListPageProps = ReduxProps & FilterComponent.Props<ServiceListItem>;

class ServiceListPageComponent extends FilterComponent.Component<
  ServiceListPageProps,
  ServiceListPageState,
  ServiceListItem
> {
  private promises = new PromisesRegistry();
  private initialToggles = ServiceListFilters.getAvailableToggles();

  constructor(props: ServiceListPageProps) {
    super(props);
    const prevCurrentSortField = FilterHelper.currentSortField(ServiceListFilters.sortFields);
    const prevIsSortAscending = FilterHelper.isCurrentSortAscending();
    this.state = {
      listItems: [],
      currentSortField: prevCurrentSortField,
      isSortAscending: prevIsSortAscending
    };
  }

  componentDidMount() {
    this.updateListItems();
  }

  componentDidUpdate(prevProps: ServiceListPageProps, _prevState: ServiceListPageState, _snapshot: any) {
    const prevCurrentSortField = FilterHelper.currentSortField(ServiceListFilters.sortFields);
    const prevIsSortAscending = FilterHelper.isCurrentSortAscending();
    if (
      !namespaceEquals(this.props.activeNamespaces, prevProps.activeNamespaces) ||
      this.props.duration !== prevProps.duration ||
      this.state.currentSortField !== prevCurrentSortField ||
      this.state.isSortAscending !== prevIsSortAscending
    ) {
      this.setState({
        currentSortField: prevCurrentSortField,
        isSortAscending: prevIsSortAscending
      });
      this.updateListItems();
    }
  }

  componentWillUnmount() {
    this.promises.cancelAll();
  }

  sortItemList(services: ServiceListItem[], sortField: SortField<ServiceListItem>, isAscending: boolean) {
    // Chain promises, as there may be an ongoing fetch/refresh and sort can be called after UI interaction
    // This ensures that the list will display the new data with the right sorting
    return ServiceListFilters.sortServices(services, sortField, isAscending);
  }

  updateListItems() {
    this.promises.cancelAll();

    const activeFilters: ActiveFiltersInfo = FilterSelected.getSelected();
    const activeToggles: ActiveTogglesInfo = Toggles.getToggles();
    const namespacesSelected = this.props.activeNamespaces.map(item => item.name);

    if (namespacesSelected.length !== 0) {
      this.fetchServices(namespacesSelected, activeFilters, activeToggles, this.props.duration);
    } else {
      this.setState({ listItems: [] });
    }
  }

  getServiceItem(data: ServiceList, rateInterval: number): ServiceListItem[] {
    if (data.services) {
      return data.services.map(service => ({
        name: service.name,
        istioSidecar: service.istioSidecar,
        istioAmbient: service.istioAmbient,
        namespace: data.namespace.name,
        cluster: service.cluster,
        health: ServiceHealth.fromJson(data.namespace.name, service.name, service.health, {
          rateInterval: rateInterval,
          hasSidecar: service.istioSidecar,
          hasAmbient: service.istioAmbient
        }),
        validation: this.getServiceValidation(service.name, data.namespace.name, data.validations),
        additionalDetailSample: service.additionalDetailSample,
        labels: service.labels || {},
        ports: service.ports || {},
        istioReferences: sortIstioReferences(service.istioReferences, true),
        kialiWizard: service.kialiWizard,
        serviceRegistry: service.serviceRegistry
      }));
    }
    return [];
  }

  fetchServices(namespaces: string[], filters: ActiveFiltersInfo, toggles: ActiveTogglesInfo, rateInterval: number) {
    const health = toggles.get('health') ? 'true' : 'false';
    const istioResources = toggles.get('istioResources') ? 'true' : 'false';
    const onlyDefinitions = toggles.get('configuration') ? 'false' : 'true'; // !configuration => onlyDefinitions
    const servicesPromises = namespaces.map(ns =>
      API.getServices(ns, {
        health: health,
        istioResources: istioResources,
        rateInterval: String(rateInterval) + 's',
        onlyDefinitions: onlyDefinitions
      })
    );

    this.promises
      .registerAll('services', servicesPromises)
      .then(responses => {
        let serviceListItems: ServiceListItem[] = [];
        responses.forEach(response => {
          serviceListItems = serviceListItems.concat(this.getServiceItem(response.data, rateInterval));
        });
        return ServiceListFilters.filterBy(serviceListItems, filters);
      })
      .then(serviceListItems => {
        this.promises.cancel('sort');
        this.setState({
          listItems: this.sortItemList(serviceListItems, this.state.currentSortField, this.state.isSortAscending)
        });
      })
      .catch(err => {
        if (!err.isCanceled) {
          this.handleAxiosError('Could not fetch services list', err);
        }
      });
  }

  getServiceValidation(name, namespace: string, validations: Validations): ObjectValidation | undefined {
    const type = 'service'; // Using 'service' directly is disallowed
    if (validations[type] && validations[type][validationKey(name, namespace)]) {
      return validations[type][validationKey(name, namespace)];
    }
    return undefined;
  }

  render() {
    const hiddenColumns = isMultiCluster() ? ([] as string[]) : ['cluster'];
    Toggles.getToggles().forEach((v, k) => {
      if (!v) {
        hiddenColumns.push(k);
      }
    });

    return (
      <>
        <RefreshNotifier onTick={this.updateListItems} />
        <div style={{ backgroundColor: '#fff' }}>
          <DefaultSecondaryMasthead
            rightToolbar={
              <TimeDurationContainer key={'DurationDropdown'} id="service-list-duration-dropdown" disabled={false} />
            }
          />
        </div>
        <RenderContent>
          <VirtualList rows={this.state.listItems} hiddenColumns={hiddenColumns}>
            <StatefulFilters
              initialFilters={ServiceListFilters.availableFilters}
              initialToggles={this.initialToggles}
              onFilterChange={this.onFilterChange}
              onToggleChange={this.onFilterChange}
            />
          </VirtualList>
        </RenderContent>
      </>
    );
  }
}

const mapStateToProps = (state: KialiAppState) => ({
  activeNamespaces: activeNamespacesSelector(state),
  duration: durationSelector(state)
});

const ServiceListPage = connect(mapStateToProps)(ServiceListPageComponent);
export default ServiceListPage;
