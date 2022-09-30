const { spawn } = require('child_process')
import { join } from 'path'
import {
	BadRequestException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common'

const OCC_DOCKER_ARGS = [
	'exec',
	'--user',
	'www-data:www-data',
	'cron',
	'php',
	'occ',
]

export interface User {
	id: string
	displayName?: string | null
	email?: string | null
	lastLogin: number
	groups?: string[]
}

@Injectable()
export class NextcloudService {
	private readonly logger = new Logger('NextcloudService')

	async user(userid: string): Promise<User> {
		try {
			const args = ['user:info', userid]
			const message = await this.spawnable(args)
			const user = JSON.parse(message)

			return {
				id: user.user_id,
				displayName: user.display_name,
				email: user.email,
				lastLogin: user.last_seen,
				groups: user.groups
			}

		} catch (error) {}
	}

	async usersForGroup(groupid: string): Promise<string[]> {
		try {
			const args = ['group:list']
			const message = await this.spawnable(args)
			const jsonMessage = JSON.parse(message)
			const users = jsonMessage[groupid]

			return users || []
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	private spawnable = (
		args: string[]
	): Promise<string> => {
		const child = spawn('docker', [
			...OCC_DOCKER_ARGS,
			...args,
			'--output=json',
		])
		let message = ''

		return new Promise((resolve, reject) => {
			child.stdout.setEncoding('utf8')
			child.stdout.on('data', data => {
				message += data.toString()
			})

			child.stderr.setEncoding('utf8')
			child.stderr.on('data', data => {
				message += data.toString()
			})

			child.on('error', data => {
				message += data.toString()
			})

			child.on('close', code => {
				if (code === 1) {
					reject({ status: HttpStatus.INTERNAL_SERVER_ERROR, message })
				}

				resolve(message)
			})
		})
	}
}
