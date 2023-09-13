import * as React from 'react';
import {PersistGate} from 'redux-persist/lib/integration/react';
import {Provider} from 'react-redux';
import {Router, withRouter} from 'react-router-dom';
import * as Visibility from 'visibilityjs';
import {GlobalActions} from '../actions/GlobalActions';
import NavigationContainer from '../components/Nav/Navigation';
import {persistor, store} from '../store/ConfigStore';
import AuthenticationControllerContainer from './AuthenticationController';
import history from './History';
import InitializingScreen from './InitializingScreen';
import StartupInitializer from './StartupInitializer';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/themes/light-border.css';
import 'react-datepicker/dist/react-datepicker.css';

Visibility.change((_e, state) => {
  // There are 3 states, visible, hidden and prerender, consider prerender as hidden.
  // https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilityState
  if (state === 'visible') {
    store.dispatch(GlobalActions.setPageVisibilityVisible());
  } else {
    store.dispatch(GlobalActions.setPageVisibilityHidden());
  }
});
if (Visibility.hidden()) {
  store.dispatch(GlobalActions.setPageVisibilityHidden());
} else {
  store.dispatch(GlobalActions.setPageVisibilityVisible());
}

type AppState = {
  isInitialized: boolean;
};

class App extends React.Component<{}, AppState> {
  private protectedArea: React.ReactNode;

  constructor(props: {}) {
    super(props);
    this.state = {
      isInitialized: false
    };

    const Navigator = withRouter(NavigationContainer);
    this.protectedArea = (
      <Router history={history}>
        <Navigator />
      </Router>
    );
  }

  render() {
    return (
      <Provider store={store}>
        <PersistGate loading={<InitializingScreen />} persistor={persistor}>
          {this.state.isInitialized ? (
            <AuthenticationControllerContainer
              publicAreaComponent={() => null}
              protectedAreaComponent={this.protectedArea}
            />
          ) : (
            <StartupInitializer onInitializationFinished={this.initializationFinishedHandler} />
          )}
        </PersistGate>
      </Provider>
    );
  }

  private initializationFinishedHandler = () => {
    this.setState({ isInitialized: true });
  };
}

export default App;
