const AUTH_TOKEN = 'kiali-auth-token'

export const getAuthToken = () => {
  return localStorage.getItem(AUTH_TOKEN)
}

export const setAuthToken = (value) => {
  localStorage.setItem(AUTH_TOKEN, value)
}

export const removeAuthToken = () => {
  localStorage.removeItem(AUTH_TOKEN)
}
