import * as React from 'react';
import { Prompt, RouteComponentProps } from 'react-router-dom';
import { connect } from 'react-redux'
import { message } from 'antd'

import {
  aceOptions,
  IstioConfigDetails,
  IstioConfigId,
  safeDumpOptions
} from '../../types/IstioConfigDetails';
import * as AlertUtils from '../../utils/AlertUtils';
import * as API from '../../services/Api';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-eclipse';
import {
  HelpMessage,
  ObjectReference,
  ObjectValidation,
  ServiceReference,
  ValidationMessage,
  WorkloadReference
} from '../../types/IstioObjects';
import {
  AceValidations,
  jsYaml,
  parseHelpAnnotations,
  parseKialiValidations,
  parseLine,
  parseYamlValidations
} from '../../types/AceValidations';
import IstioActionDropdown from '../../components/IstioActions/IstioActionsDropdown';
import { RenderComponentScroll } from '../../components/Nav/Page';
import './IstioConfigDetailsPage.css';
import { default as IstioActionButtonsContainer } from '../../components/IstioActions/IstioActionsButtons';
import history from '../../app/History';
import { Paths } from '../../config';
import { getIstioObject, mergeJsonPatch } from '../../utils/IstioConfigUtils';
import { style } from 'typestyle';
import ParameterizedTabs, { activeTab } from '../../components/Tab/Tabs';
import {
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  Tab
} from '@patternfly/react-core';
import { dicIstioType } from '../../types/IstioConfigList';
import { showInMessageCenter } from '../../utils/IstioValidationUtils';
import { AxiosError } from 'axios';
import RefreshContainer from "../../components/Refresh/Refresh";
import IstioConfigOverview from './IstioObjectDetails/IstioConfigOverview';
import { Annotation } from 'react-ace/types';
import RenderHeaderContainer from "../../components/Nav/Page/RenderHeader";
import {ErrorMsg} from "../../types/ErrorMsg";
import ErrorSection from "../../components/ErrorSection/ErrorSection";
import { KialiAppState } from '../../store/Store'

// Enables the search box for the ACEeditor
require('ace-builds/src-noconflict/ext-searchbox');

const rightToolbarStyle = style({
  zIndex: 500
});

const editorDrawer = style({
  margin: '0'
});

type ReduxProps = {
  userInfo?: Record<string, any> | null
};

interface IstioConfigDetailsState {
  previewIstioData?: Record<string, any>;
  istioObjectDetails?: IstioConfigDetails;
  istioValidations?: ObjectValidation;
  originalIstioObjectDetails?: IstioConfigDetails;
  originalIstioValidations?: ObjectValidation;
  isModified: boolean;
  isRemoved: boolean;
  yamlModified?: string;
  yamlValidations?: AceValidations;
  currentTab: string;
  isExpanded: boolean;
  selectedEditorLine?: string;
  error?: ErrorMsg;
}

const tabName = 'list';
const paramToTab: { [key: string]: number } = {
  yaml: 0,
  preview: 1,
};

const jumpTab = (tabKey: string)=>{
  const urlParams = new URLSearchParams('');
  urlParams.set(tabName, tabKey);
  history.push(history.location.pathname + '?' + urlParams.toString());
}

class IstioConfigDetailsPage extends React.Component<ReduxProps & RouteComponentProps<IstioConfigId>, IstioConfigDetailsState> {
  aceEditorRef: React.RefObject<AceEditor>;
  drawerRef: React.RefObject<IstioConfigDetailsPage>;
  promptTo: string;
  timerId: number;

  constructor(props: RouteComponentProps<IstioConfigId>) {
    super(props);
    this.state = {
      isModified: false,
      isRemoved: false,
      currentTab: activeTab(tabName, this.defaultTab()),
      isExpanded: false
    };
    this.aceEditorRef = React.createRef();
    this.drawerRef = React.createRef();
    this.promptTo = '';
    this.timerId = -1;
  }

  defaultTab() {
    return 'yaml';
  }

  objectTitle() {
    let title: string = '';
    if (this.state.istioObjectDetails) {
      const objectType = dicIstioType[this.props.match.params.objectType];
      const methodName = objectType.charAt(0).toLowerCase() + objectType.slice(1);
      const object = this.state.istioObjectDetails[methodName];
      if (object) {
        title = object.metadata.name;
      }
    }
    return title;
  }

  fetchPreviewIstioObjectDetails = () => {
    const props = this.props.match.params
    API.getPreviewIstioConfigDetail(props.namespace, props.objectType, props.object, true).then((res) => {
      this.setState({
        previewIstioData: res.data,
      })
    })
  }

  fetchIstioObjectDetails = () => {
    this.fetchIstioObjectDetailsFromProps(this.props.match.params);
  };

  newIstioObjectPromise = (props: IstioConfigId, validate: boolean) => {
    return API.getIstioConfigDetail(props.namespace, props.objectType, props.object, validate);
  };

  fetchIstioObjectDetailsFromProps = (props: IstioConfigId) => {
    const promiseConfigDetails = this.newIstioObjectPromise(props, true);

    // Note that adapters/templates are not supported yet for validations
    promiseConfigDetails
      .then(resultConfigDetails => {
        this.setState(
          {
            istioObjectDetails: resultConfigDetails.data,
            originalIstioObjectDetails: resultConfigDetails.data,
            istioValidations: resultConfigDetails.data.validation,
            originalIstioValidations: resultConfigDetails.data.validation,
            isModified: false,
            isExpanded: this.isExpanded(resultConfigDetails.data),
            yamlModified: '',
            currentTab: activeTab(tabName, this.defaultTab())
          },
          () => this.resizeEditor()
        );
      })
      .catch(error => {
        const msg : ErrorMsg = {title: 'No Istio object is selected', description: this.props.match.params.object +" is not found in the mesh"};
        this.setState({
          isRemoved: true,
          error: msg
        });
        AlertUtils.addError(
          `Could not fetch Istio object type [${props.objectType}] name [${props.object}] in namespace [${props.namespace}].`,
          error
        );
      });
  };

  componentDidMount() {
    this.fetchIstioObjectDetails();
    this.fetchPreviewIstioObjectDetails();
  }

  componentDidUpdate(prevProps: RouteComponentProps<IstioConfigId>, prevState: IstioConfigDetailsState): void {
    // This will ask confirmation if we want to leave page on pending changes without save
    if (this.state.isModified) {
      window.onbeforeunload = () => true;
    } else {
      window.onbeforeunload = null;
    }
    // This will reset the flag to prevent ask multiple times the confirmation to leave with unsaved changed
    this.promptTo = '';
    // Hack to force redisplay of annotations after update
    // See https://github.com/securingsincity/react-ace/issues/300
    if (this.aceEditorRef.current) {
      const editor = this.aceEditorRef.current!['editor'];

      // tslint:disable-next-line
      editor.onChangeAnnotation();

      // Fold status and/or managedFields fields
      const { startRow, endRow } = this.getFoldRanges(this.fetchYaml());
      if (!this.state.isModified) {
        editor.session.foldAll(startRow, endRow, 0);
      }
    }

    const active = activeTab(tabName, this.defaultTab());
    if (this.state.currentTab !== active) {
      this.setState({ currentTab: active });
    }

    if (!this.propsMatch(prevProps)) {
      this.fetchIstioObjectDetailsFromProps(this.props.match.params);
    }

    if (this.state.istioValidations && this.state.istioValidations !== prevState.istioValidations) {
      showInMessageCenter(this.state.istioValidations);
    }
  }

  propsMatch(prevProps: RouteComponentProps<IstioConfigId>) {
    return (
      this.props.match.params.namespace === prevProps.match.params.namespace &&
      this.props.match.params.object === prevProps.match.params.object &&
      this.props.match.params.objectType === prevProps.match.params.objectType
    );
  }

  componentWillUnmount() {
    // Reset ask confirmation flag
    window.onbeforeunload = null;
    window.clearInterval(this.timerId);
  }

  backToList = () => {
    // Back to list page
    history.push(`/${Paths.ISTIO}?namespaces=${this.props.match.params.namespace}`);
  };

  canDelete = () => {
    return this.state.istioObjectDetails !== undefined && this.state.istioObjectDetails.permissions.delete;
  };

  canUpdate = () => {
    return this.state.istioObjectDetails !== undefined && this.state.istioObjectDetails.permissions.update;
  };

  onCancel = () => {
    this.backToList();
  };

  onDelete = () => {
    API.deleteIstioConfigDetail(
      this.props.match.params.namespace,
      this.props.match.params.objectType,
      this.props.match.params.object
    )
      .then(() => this.backToList())
      .catch(error => {
        AlertUtils.addError('Could not delete IstioConfig details.', error);
      });
  };

  injectGalleyError = (error: AxiosError): AceValidations => {
    const msg: string[] = API.getErrorString(error).split(':');
    const errMsg: string = msg.slice(1, msg.length).join(':');
    const anno: Annotation = {
      column: 0,
      row: 0,
      text: errMsg,
      type: 'error'
    };

    return { annotations: [anno], markers: [] };
  };

  resizeEditor = () => {
    if (this.aceEditorRef.current) {
      // The Drawer has an async animation that needs a timeout before to resize the editor
      setTimeout(() => {
        const editor = this.aceEditorRef.current!['editor'];
        editor.resize(true);
      }, 250);
    }
  };

  onDrawerToggle = () => {
    this.setState(
      prevState => {
        return {
          isExpanded: !prevState.isExpanded
        };
      },
      () => this.resizeEditor()
    );
  };

  onDrawerClose = () => {
    this.setState(
      {
        isExpanded: false
      },
      () => this.resizeEditor()
    );
  };

  onEditorChange = (value: string) => {
    this.setState({
      isModified: true,
      yamlModified: value,
      istioValidations: undefined,
      yamlValidations: parseYamlValidations(value)
    });
  };

  fetchYaml = () => {
    if (this.state.isModified) {
      return this.state.yamlModified;
    }
    const istioObject = getIstioObject(this.state.istioObjectDetails);
    return istioObject ? jsYaml.safeDump(istioObject, safeDumpOptions) : '';
  };

  getStatusMessages = (istioConfigDetails?: IstioConfigDetails): ValidationMessage[] => {
    const istioObject = getIstioObject(istioConfigDetails);
    return istioObject && istioObject.status && istioObject.status.validationMessages
      ? istioObject.status.validationMessages
      : ([] as ValidationMessage[]);
  };

  // Not all Istio types have an overview card
  hasOverview = (): boolean => {
    return true;
  };

  objectReferences = (istioConfigDetails?: IstioConfigDetails): ObjectReference[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.references?.objectReferences || ([] as ObjectReference[]);
  };

  serviceReferences = (istioConfigDetails?: IstioConfigDetails): ServiceReference[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.references?.serviceReferences || ([] as ServiceReference[]);
  };

  workloadReferences = (istioConfigDetails?: IstioConfigDetails): ServiceReference[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.references?.workloadReferences || ([] as WorkloadReference[]);
  };

  helpMessages = (istioConfigDetails?: IstioConfigDetails): HelpMessage[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.help || ([] as HelpMessage[]);
  };

  // Aux function to calculate rows for 'status' and 'managedFields' which are typically folded
  getFoldRanges = (yaml: string | undefined): any => {
    let range = {
      startRow: -1,
      endRow: -1
    };

    if (!!yaml) {
      const ylines = yaml.split('\n');
      ylines.forEach((line: string, i: number) => {
        // Counting spaces to check managedFields, yaml is always processed with that structure so this is safe
        if (line.startsWith('status:') || line.startsWith('  managedFields:')) {
          if (range.startRow === -1) {
            range.startRow = i;
          } else if (range.startRow > i) {
            range.startRow = i;
          }
        }
        if (line.startsWith('spec:') && range.startRow !== -1) {
          range.endRow = i;
        }
      });
    }

    return range;
  };

  isExpanded = (istioConfigDetails?: IstioConfigDetails) => {
    let isExpanded = false;
    if (istioConfigDetails) {
      isExpanded = this.showCards(
        this.objectReferences(istioConfigDetails).length > 0,
        this.getStatusMessages(istioConfigDetails)
      );
    }
    return isExpanded;
  };

  showCards = (refPresent: boolean, istioStatusMsgs: ValidationMessage[]): boolean => {
    return refPresent || this.hasOverview() || istioStatusMsgs.length > 0;
  };

  onCursorChange = (e: any) => {
    const line = parseLine(this.fetchYaml(), e.cursor.row);
    this.setState({ selectedEditorLine: line });
  };

  renderYAMLEditor = () => {
    const yamlSource = this.fetchYaml();
    const istioStatusMsgs = this.getStatusMessages(this.state.istioObjectDetails);

    const objectReferences = this.objectReferences(this.state.istioObjectDetails);
    const serviceReferences = this.serviceReferences(this.state.istioObjectDetails);
    const workloadReferences = this.workloadReferences(this.state.istioObjectDetails);
    const helpMessages = this.helpMessages(this.state.istioObjectDetails);

    const refPresent = objectReferences.length > 0;
    const showCards = this.showCards(refPresent, istioStatusMsgs);
    let editorValidations: AceValidations = {
      markers: [],
      annotations: []
    };
    if (!this.state.isModified) {
      editorValidations = parseKialiValidations(yamlSource, this.state.istioValidations);
    } else {
      if (this.state.yamlValidations) {
        editorValidations.markers = this.state.yamlValidations.markers;
        editorValidations.annotations = this.state.yamlValidations.annotations;
      }
    }

    const helpAnnotations = parseHelpAnnotations(yamlSource, helpMessages);
    helpAnnotations.forEach(ha => editorValidations.annotations.push(ha));

    const panelContent = (
      <DrawerPanelContent>
        <DrawerHead>
          <div>
            {showCards && (
              <>
                {this.state.istioObjectDetails && (
                  <IstioConfigOverview
                    istioObjectDetails={this.state.istioObjectDetails}
                    istioValidations={this.state.istioValidations}
                    namespace={this.state.istioObjectDetails.namespace.name}
                    statusMessages={istioStatusMsgs}
                    objectReferences={objectReferences}
                    serviceReferences={serviceReferences}
                    workloadReferences={workloadReferences}
                    helpMessages={helpMessages}
                    selectedLine={this.state.selectedEditorLine}
                  />
                )}
              </>
            )}
          </div>
          <DrawerActions>
            <DrawerCloseButton onClick={this.onDrawerClose} />
          </DrawerActions>
        </DrawerHead>
      </DrawerPanelContent>
    );

    const editor = this.state.istioObjectDetails ? (
      <div style={{ width: '100%' }}>
        <AceEditor
          ref={this.aceEditorRef}
          mode="yaml"
          theme="eclipse"
          onChange={this.onEditorChange}
          height={'var(--kiali-yaml-editor-height)'}
          width={'100%'}
          className={'istio-ace-editor'}
          wrapEnabled={true}
          readOnly={!Boolean(this.state.istioObjectDetails?.permissions.update) && !Boolean(this.state.istioObjectDetails?.permissions.preview)}
          setOptions={aceOptions}
          value={this.state.istioObjectDetails ? yamlSource : undefined}
          annotations={editorValidations.annotations}
          markers={editorValidations.markers}
          onCursorChange={this.onCursorChange}
        />
      </div>
    ) : null;

    const onUpdate = () => {
      jsYaml.safeLoadAll(this.state.yamlModified, (objectModified: object) => {
        const jsonPatch = JSON.stringify(
          mergeJsonPatch(objectModified, getIstioObject(this.state.istioObjectDetails))
        ).replace(new RegExp('"(,null)+]', 'g'), '"]');
        API.updateIstioConfigDetail(
          this.props.match.params.namespace,
          this.props.match.params.objectType,
          this.props.match.params.object,
          jsonPatch
        )
          .then(() => {
            message.success('保存成功')
            this.fetchIstioObjectDetails();
            this.fetchPreviewIstioObjectDetails();
          })
          .catch(error => {
            message.error('Could not update IstioConfig details.');
            this.setState({
              yamlValidations: this.injectGalleyError(error)
            });
          });
      });
    };

    const onPreview = () => {
      jsYaml.safeLoadAll(this.state.yamlModified, (objectModified: object) => {
        const jsonPatch = JSON.stringify(
          mergeJsonPatch(objectModified, getIstioObject(this.state.istioObjectDetails))
        ).replace(new RegExp('"(,null)+]', 'g'), '"]');
        API.updatePreviewIstioConfigDetail(
          this.props.match.params.namespace,
          this.props.match.params.objectType,
          this.props.match.params.object,
          jsonPatch
        )
          .then(() => {
            message.success('提交审核成功')
            this.fetchPreviewIstioObjectDetails(); //  更新待审核的信息
            this.setState({ // 先修正修改状态
              isModified: false,
              yamlModified: '',
            },()=>{  // 修正后跳转，否则会有提示
              jumpTab('preview')
              this.setState({
                currentTab: 'preview'
              })
            })
          })
          .catch(error => {
            message.error('Could not update Preview IstioConfig details.', error);
            this.setState({
              yamlValidations: this.injectGalleyError(error)
            });
          });
      });
    };

    const onRefresh = () => {
      let refresh = true;
      if (this.state.isModified) {
        refresh = window.confirm('You have unsaved changes, are you sure you want to refresh ?');
      }
      if (refresh) {
        this.fetchIstioObjectDetails();
      }
    };

    const onCancel = () => {
      this.backToList();
    };

    return (
      <div className={`object-drawer ${editorDrawer}`}>
        {showCards ? (
          <Drawer isExpanded={this.state.isExpanded} isInline={true}>
            <DrawerContent panelContent={showCards ? panelContent : undefined}>
              <DrawerContentBody>{editor}</DrawerContentBody>
            </DrawerContent>
          </Drawer>
        ) : (
          editor
        )}
        {this.renderActionButtons({
          showOverview: showCards,
          showPreview: true,
          onUpdate,
          onPreview,
          onRefresh,
          onCancel,
        })}
      </div>
    );
  };

  renderPreviewEditor = () => {
    const yamlSource = this.state.previewIstioData ? jsYaml.safeDump(this.state.previewIstioData, safeDumpOptions) : ''

    let editorValidations: AceValidations = {
      markers: [],
      annotations: []
    };

    const helpAnnotations = parseHelpAnnotations(yamlSource, []);
    helpAnnotations.forEach(ha => editorValidations.annotations.push(ha));

    const editor = this.state.istioObjectDetails ? (
      <div style={{ width: '100%' }}>
        <AceEditor
          mode="yaml"
          theme="eclipse"
          height={'var(--kiali-yaml-editor-height)'}
          width={'100%'}
          className={'istio-ace-editor'}
          wrapEnabled={true}
          readOnly={true}
          setOptions={aceOptions}
          value={yamlSource ? yamlSource : undefined}
          annotations={editorValidations.annotations}
          markers={editorValidations.markers}
        />
      </div>
    ) : null;

    const onUpdate = () => {
      const jsonPatch = JSON.stringify(
        mergeJsonPatch(this.state.previewIstioData as object, getIstioObject(this.state.istioObjectDetails))
      ).replace(new RegExp('"(,null)+]', 'g'), '"]');
      API.updateIstioConfigDetail(
        this.props.match.params.namespace,
        this.props.match.params.objectType,
        this.props.match.params.object,
        jsonPatch
      )
        .then(() => {
          message.success('保存成功')
          this.fetchIstioObjectDetails();
          this.fetchPreviewIstioObjectDetails();
          jumpTab('yaml')
          this.setState({
            currentTab: 'yaml'
          })
        })
        .catch(error => {
          message.error('Could not update IstioConfig details.');
          this.setState({
            yamlValidations: this.injectGalleyError(error)
          });
        });

    }

    const onPreview = () => {

    }

    const onRefresh = () => {
      this.fetchPreviewIstioObjectDetails()
    };

    const onCancel = () => {
      this.backToList();
    };

    return (
      <div className={`object-drawer ${editorDrawer}`}>
        {editor}
        {this.renderActionButtons({
          showOverview: false,
          showPreview: false,
          onUpdate,
          onPreview,
          onRefresh,
          onCancel,
        })}
      </div>
    );
  };

  renderActionButtons = ({ showOverview, showPreview, onUpdate, onPreview, onRefresh, onCancel }) => {
    return (
      <IstioActionButtonsContainer
        objectName={this.props.match.params.object}
        readOnly={!this.canUpdate()}
        canUpdate={this.canUpdate()}
        onCancel={onCancel}
        onUpdate={onUpdate}
        onPreview={onPreview}
        onRefresh={onRefresh}
        showSave={Boolean(this.state.istioObjectDetails?.permissions.update)}
        showPreview={showPreview && Boolean(this.state.istioObjectDetails?.permissions.preview)}
        showOverview={showOverview}
        overview={this.state.isExpanded}
        onOverview={this.onDrawerToggle}
      />
    );
  };

  renderActions = () => {
    const canDelete =
      this.state.istioObjectDetails !== undefined &&
      this.state.istioObjectDetails.permissions.delete &&
      !this.state.isRemoved;
    const istioObject = getIstioObject(this.state.istioObjectDetails);

    return (
      <span className={rightToolbarStyle}>
        <IstioActionDropdown
          objectKind={istioObject ? istioObject.kind : undefined}
          objectName={this.props.match.params.object}
          canDelete={canDelete}
          onDelete={this.onDelete}
        />
      </span>
    );
  };

  render() {
    return (
      <>
        <RenderHeaderContainer
          location={this.props.location}
          rightToolbar={<RefreshContainer id="config_details_refresh" hideLabel={true} />}
          actionsToolbar={!this.state.error ? this.renderActions() : undefined}
        />
        {this.state.error && (
          <ErrorSection error={this.state.error} />
        )}
        {!this.state.error && (
          <>
            <ParameterizedTabs
              id="basic-tabs"
              className="istio-config-details-page"
              onSelect={tabValue => {
                this.setState({ currentTab: tabValue });
              }}
              tabMap={paramToTab}
              tabName={tabName}
              defaultTab={this.defaultTab()}
              activeTab={this.state.currentTab}
              mountOnEnter={false}
              unmountOnExit={true}
            >
              {
                <div
                  style={{
                    zIndex: 9,
                    position: 'absolute',
                    top: 10,
                    right: 20,
                    color: 'rgb(43, 154, 243)',
                  }}>
                  {this.props.userInfo?.identityName ? `当前角色：${this.props.userInfo?.identityName}` : ''}
                </div>

              }
              <Tab key="istio-yaml" title={`YAML ${this.state.isModified ? ' * ' : ''}`} eventKey={0}>
                <RenderComponentScroll>{this.renderYAMLEditor()}</RenderComponentScroll>
              </Tab>
              <Tab key="istio-preview" title='待发布' eventKey={1}>
                <RenderComponentScroll>{this.renderPreviewEditor()}</RenderComponentScroll>
              </Tab>
            </ParameterizedTabs>
          </>
        )}
        <Prompt
          message={location => {
            if (this.state.isModified) {
              // Check if Prompt is invoked multiple times
              if (this.promptTo === location.pathname) {
                return true;
              }
              this.promptTo = location.pathname;
              return 'You have unsaved changes, are you sure you want to leave?';
            }
            return true;
          }}
        />
      </>
    );
  }
}

const mapStateToProps = (state: KialiAppState): ReduxProps => ({
  userInfo: state.userSettings.userInfo,
});

const IstioConfigDetailsPageContainer = connect(mapStateToProps)(IstioConfigDetailsPage);
export default IstioConfigDetailsPageContainer;
