import { useState, useEffect } from 'react'
import {
  Grid,
  GridItem,
  Card,
  CardTitle,
  CardBody,
  Tooltip,
  TooltipPosition
} from '@patternfly/react-core'

import { getClusterList } from 'services/Api'
import { createIcon } from 'components/Health/Helper'
import { FAILURE, DEGRADED, HEALTHY } from 'types/Health'
import history from 'app/History';

const statusIconMap = {
  ok: HEALTHY,
  warn: DEGRADED,
  error: FAILURE
}

const Dashboard = () => {
  const [clusterList, setClusterList] = useState<Record<string, any>>([])

  useEffect(() => {
    getClusterList().then(response => {
      setClusterList(response.data || [])
    })
  }, [])

  const handleItemClick = (env) => {
    sessionStorage.setItem('mesh-env', env)
    const urlInfo = new URL(location.href)
    history.push(`/overview${urlInfo.search}`)
  }

  return (
    <Grid style={{ background: '#fff', padding: 10 }}>
      {
        clusterList.map(({ name, status }) => (
          <GridItem
            key={name}
            span={6}
            style={{ margin: 10, cursor: 'pointer' }}
            onClick={() => handleItemClick(name)}
          >
            <Card>
              <CardTitle style={{ fontSize: 16 }}>{name}集群</CardTitle>
              <CardBody>
                <Tooltip
                  position={TooltipPosition.auto}
                  content={status.tips}>
                  <span>
                    {createIcon(statusIconMap[status.flag])}
                    <span style={{ marginLeft: 10, fontSize: 14 }}>{status.value}</span>
                  </span>
                </Tooltip>
              </CardBody>
            </Card>
          </GridItem>
        ))
      }
    </Grid>
  )
}

export default Dashboard
