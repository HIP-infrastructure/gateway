import { registerAs } from '@nestjs/config'

export default registerAs('postgres', () => {
	return {
		type: 'postgres',
		host: process.env.POSTGRES_HOST || 'localhost',
		port: +process.env.POSTGRES_PORT || 5432,
		username: process.env.POSTGRES_USER || 'postgres',
		password: process.env.POSTGRES_PASSWORD || 'pass123',
		database: process.env.POSTGRES_DATABASE || 'postgres'
	}
})
