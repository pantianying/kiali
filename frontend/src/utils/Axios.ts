import axios from 'axios'

import { removeAuthToken } from './Token';
import { store } from '../store/ConfigStore';
import { LoginActions } from '../actions/LoginActions'
import { GlobalActions } from '../actions/GlobalActions'

const instance = axios.create()

const openshift_token: string | null = (function () {
  const urlParams = new URLSearchParams(document.location.search);
  return urlParams.get('oauth_token');
}());

const getIsLoadingState = () => {
  const state = store.getState();
  return state && state.globalState.loadingCounter > 0;
};

const decrementLoadingCounter = () => {
  if (getIsLoadingState()) {
    store.dispatch(GlobalActions.decrementLoadingCounter());
  }
};


function beforeRequestInterceptor(request: Record<string, any>) {
  // dispatch an action to turn spinner on
  store.dispatch(GlobalActions.incrementLoadingCounter());

  // Set OpenShift token, if available.
  if (openshift_token) {
    request.headers.Authorization = `Bearer ${openshift_token}`;
  }

  return request;
}

function errorRequestInterceptor(error: Record<string, any>) {
  console.log(error);
  return Promise.reject(error);
}

function successResponseInterceptor(response: Record<string, any>) {
  decrementLoadingCounter();
  return response
}

function errorResponseInterceptor(err: Record<string, any>) {
  // The response was rejected, turn off the spinning
  const error = {
    code: err.code,
    message: err.message || err.msg,
    status: err.response?.status,
    response: err.response,
  }

  decrementLoadingCounter();

  if (error.response) {
    if (error.status === 401) {
      removeAuthToken()
      // store.dispatch(LoginActions.sessionExpired());
      store.dispatch(LoginActions.forceUpdateAuthController());
    }
  }

  return Promise.reject(error);
}

// add request interceptors
instance.interceptors.request.use(beforeRequestInterceptor, errorRequestInterceptor)

// add response interceptors
instance.interceptors.response.use(successResponseInterceptor, errorResponseInterceptor)

export default instance
