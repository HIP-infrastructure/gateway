import { registerAs } from '@nestjs/config'

export default registerAs('collab', () => {
  return {
    authBackendUsername: process.env.COLLAB_AUTHBACKEND_USERNAME || 'backend',
    authBackendPassword: process.env.COLLAB_AUTHBACKEND_PASSWORD || 'password',
    authBackendUrl: process.env.COLLAB_FS_AUTH_BACKEND_URL || '',
    authFSUrl: process.env.COLLAB_FS_URL || '',
    authDockerFsCert: process.env.COLLAB_DOCKERFS_CERT || '',
  }
})
