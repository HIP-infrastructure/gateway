import { registerAs } from '@nestjs/config'

export default registerAs('collab', () => {
	return {
		mountPoint: process.env.COLLAB_MOUNT || '/mnt/collab',
		suffix: process.env.COLLAB_SUFFIX || 'dev'
	}
})
