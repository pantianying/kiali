import * as React from 'react';
import { Button, ButtonVariant } from '@patternfly/react-core';
import { triggerRefresh } from "../../hooks/refresh";

type Props = {
  objectName: string;
  readOnly: boolean;
  canUpdate: boolean;
  onCancel: () => void;
  onUpdate: () => void;
  onReview: () => void;
  onRefresh: () => void;
  showSave: boolean;
  showReview: boolean;
  showOverview: boolean;
  overview: boolean;
  onOverview: () => void;
};

type State = {
  showConfirmModal: boolean;
};

class IstioActionButtons extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { showConfirmModal: false };
  }
  hideConfirmModal = () => {
    this.setState({ showConfirmModal: false });
  };
  render() {
    return (
      <>
        <span style={{ float: 'left', padding: '10px' }}>
          {this.props.showSave && (
            <span style={{ paddingRight: '5px' }}>
              <Button variant={ButtonVariant.primary} isDisabled={!this.props.canUpdate} onClick={this.props.onUpdate}>
                保存
              </Button>
            </span>
          )}
          {
            this.props.showReview && (
              <span style={{ paddingRight: '5px' }}>
               <Button variant={ButtonVariant.primary} onClick={this.props.onReview}>
                 提交审核
              </Button>
          </span>
            )
          }
          <span style={{ paddingRight: '5px' }}>
            <Button variant={ButtonVariant.secondary} onClick={this.handleRefresh}>
              重新加载
            </Button>
          </span>
          <span style={{ paddingRight: '5px' }}>
            <Button variant={ButtonVariant.secondary} onClick={this.props.onCancel}>
              {this.props.showSave ? '取消' : '关闭'}
            </Button>
          </span>
        </span>
        {this.props.showOverview && (
          <span style={{ float: 'right', padding: '10px' }}>
            <span style={{ paddingLeft: '5px' }}>
              <Button variant={ButtonVariant.link} onClick={this.props.onOverview}>
                {this.props.overview ? 'Close Overview' : 'Show Overview'}
              </Button>
            </span>
          </span>
        )}
      </>
    );
  }

  private handleRefresh = () => {
    this.props.onRefresh();
    triggerRefresh();
  };
}

export default IstioActionButtons;
