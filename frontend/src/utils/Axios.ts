import axios from 'axios'

import { removeAuthToken } from './Token';
import { store } from '../store/ConfigStore';
import { LoginActions } from '../actions/LoginActions'

const instance = axios.create()

function successResponseInterceptor(response: Record<string, any>) {
  return response
}

function errorResponseInterceptor(err: Record<string, any>) {
  const error = {
    code: err.code,
    message: err.message || err.msg,
    status: err.response?.status,
    response: err.response,
  }

  if (error.response) {
    if (error.status === 401) {
      removeAuthToken()
      store.dispatch(LoginActions.forceUpdateAuthController());
    }
  }

  throw error
}

// add response interceptors
instance.interceptors.response.use(successResponseInterceptor, errorResponseInterceptor)

export default instance
