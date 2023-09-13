import * as React from 'react'
import { Router, withRouter } from 'react-router-dom'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'

import history from './History'
import NavigationContainer from '../components/Nav/Navigation'
import * as API from '../services/Api'
import { KialiDispatch } from '../types/Redux'
import { UserSettingsActions } from '../actions/UserSettingsActions'

interface BaseRouterReduxProps {
  setUserInfo:(info:Record<string, any>)=>void
}

type BaseRouterProps = BaseRouterReduxProps & {
};

const Navigator = withRouter(NavigationContainer);

class BaseRouter extends React.Component<BaseRouterProps> {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    API.getUserInfo().then((res: Record<string, any>) => {
      this.props.setUserInfo(res.data)
    })
  }


  render() {
    return (
      <Router history={history}>
        <Navigator/>
      </Router>
    )
  }
}

const mapStateToProps = () => ({

});

const mapDispatchToProps = (dispatch: KialiDispatch) => ({
  setUserInfo: bindActionCreators(UserSettingsActions.setUserInfo, dispatch),
});


const BaseRouterContainer = connect(mapStateToProps, mapDispatchToProps)(BaseRouter);

export default BaseRouterContainer;
