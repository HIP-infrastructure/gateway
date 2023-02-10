import { registerAs } from '@nestjs/config'

export default registerAs('ebrains', () => {
  return {
    clientUrl: process.env.EBRAINS_CLIENT_URL || 'https://iam-int.ebrains.eu',
    clientId: process.env.EBRAINS_CLIENT_ID || 'id',
    clientSecret: process.env.EBRAINS_CLIENT_SECRET || 'secret',
    apiUrl: process.env.EBRAINS_API_URL || 'https://wiki-int.ebrains.eu/rest/v1',
  }
})
