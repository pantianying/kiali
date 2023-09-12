/**
 * @description 获取主应用配置
 * @returns {null|object}
 */
export function getMicroAppConfig() {
  if (window.$wujie && window.__POWERED_BY_WUJIE__) {
    return window.$wujie.props || {}
  }
  return null
}
