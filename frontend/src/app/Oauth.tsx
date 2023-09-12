import * as React from 'react'
import { Spin } from 'antd'

import * as API from '../services/Api'
import { getMicroAppConfig } from '../utils/Micro'
import { setAuthToken } from '../utils/Token'

interface OAuthProps {
  forceUpdate: () => void
}

class OAuth extends React.Component<OAuthProps> {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this.authorize()
  }

  async authorize() {
    const microAppConfig = getMicroAppConfig()
    if (!microAppConfig) return
    const { getCode } = microAppConfig
    getCode((code) => {
        API.getToken({ code }).then((res: Record<string, any>) => {
          setAuthToken(res.data.accessToken)
          this.props.forceUpdate()
        })
      },
    )
  }

  render() {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
      }}>
        <Spin tip="登录中..." size="large">
          <div style={{ width: '100px' }}/>
        </Spin>
      </div>
    )
  }
}

export default OAuth
