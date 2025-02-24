import { registerAs } from '@nestjs/config'

export default registerAs('iam', () => {
	return {
		clientUrl: process.env.IAM_CLIENT_URL || 'https://iam-int.ebrains.eu',
		clientId: process.env.IAM_CLIENT_ID || 'id',
		clientSecret: process.env.IAM_CLIENT_SECRET || 'secret',
		apiUrl: process.env.IAM_API_URL || 'https://wiki-int.ebrains.eu/rest/v1',
		platformAdmins: process.env.PLATFORM_ADMINS?.split(',') || [],
		realm: process.env.IAM_REALM || 'dev'
	}
})
