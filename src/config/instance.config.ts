import { registerAs } from '@nestjs/config'

export default registerAs('instance', () => {
	return {
		hostname: process.env.HOSTNAME || 'hip.local',
		logLevel: process.env.LOG_LEVEL || 'debug',
		pollingInterval: process.env.POLLING_INTERVAL || 5,
		dataUser: process.env.DATA_USER || 'www-data',
	}
})
