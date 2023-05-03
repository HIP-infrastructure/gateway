import { registerAs } from '@nestjs/config'

export default registerAs('redis', () => {
  return {
    type: 'redis',
    host: process.env.REDIS_HOST || '127.0.0.1',
    name: process.env.REDIS_NAME || 'containers',
    db: +process.env.REDIS_DATABASE || 1
  }
})
