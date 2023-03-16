import { registerAs } from '@nestjs/config'

export default registerAs('collab', () => {
  return {
    mountPoint: process.env.COLLAB_MOUNT || '/mnt/collab',
  }
})
