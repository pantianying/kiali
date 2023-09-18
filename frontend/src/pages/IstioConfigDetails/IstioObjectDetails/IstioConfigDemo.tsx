import {
  Modal,
  ModalVariant,
  Stack,
  StackItem,
  Title,
  TitleSizes
} from '@patternfly/react-core';
import * as React from 'react';
import { Fragment } from 'react'
import AceEditor from 'react-ace'

import { aceOptions, safeDumpOptions } from '../../../types/IstioConfigDetails'
import { AceValidations, jsYaml, parseHelpAnnotations } from '../../../types/AceValidations'

interface IstioConfigHelpProps {
  list: Record<string, any>[];
}

interface IstioConfigHelpState {
  selectItem: Record<string, any> | null;
}

class IstioConfigDemo extends React.Component<IstioConfigHelpProps, IstioConfigHelpState> {

  constructor(props) {
    super(props)
    this.state = {
      selectItem: null
    }
  }

  handleItemClick = (data) => {
    this.setState({
      selectItem: data
    })
  }

  handleModalClose = () => {
    this.setState({
      selectItem: null
    })
  }

  renderEditor() {
    const yamlSource = this.state.selectItem?.config ? jsYaml.safeDump(this.state.selectItem.config, safeDumpOptions) : ''

    let editorValidations: AceValidations = {
      markers: [],
      annotations: []
    };

    const helpAnnotations = parseHelpAnnotations(yamlSource, []);
    helpAnnotations.forEach(ha => editorValidations.annotations.push(ha));

    return (
        <AceEditor
          mode="yaml"
          theme="eclipse"
          height='600px'
          width={'100%'}
          className={'istio-ace-editor'}
          wrapEnabled={true}
          readOnly={true}
          setOptions={aceOptions}
          value={yamlSource ? yamlSource : undefined}
          annotations={editorValidations.annotations}
          markers={editorValidations.markers}
        />
    )
  }

  render() {
    return (
      <>
        <Stack>
          <StackItem>
            <Title headingLevel="h4" size={TitleSizes.lg} style={{ paddingBottom: '10px' }}>
              配置Demo
            </Title>
          </StackItem>
          {
            this.props.list.map((item) => (
              <Fragment key={item.demoName}>
                <StackItem onClick={() => this.handleItemClick(item)}>
                  <Title
                    headingLevel="h5"
                    size={TitleSizes.md}
                    style={{
                      color: 'rgb(43, 154, 243)',
                      cursor: 'pointer',
                      marginBottom: 8,
                    }}>
                    {item.demoName}
                  </Title>
                </StackItem>
              </Fragment>
            ))
          }
        </Stack>

        <Modal
          variant={ModalVariant.small}
          isOpen={Boolean(this.state.selectItem)}
          onClose={this.handleModalClose}
          title={this.state.selectItem?.demoName || 'demo配置'}>
          {
            this.renderEditor()
          }
        </Modal>
      </>
    );
  }
}

export default IstioConfigDemo;
