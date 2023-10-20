import { registerAs } from '@nestjs/config'

export default registerAs('public', () => {
  return {
    mountPoint: process.env.PUBLIC_MOUNT || '/mnt/public',
  }
})
