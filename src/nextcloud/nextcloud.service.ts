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

@Injectable()
export class NextcloudService {
	private readonly logger = new Logger('NextcloudService')

	async usersForGroup(groupid: string) {
		try {
			const args = ['group:list']
			const { code, message } = await this.spawnable(args)

			if (code !== 0) {
				this.logger.error(message)
				throw new InternalServerErrorException(message)
			}

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
	): Promise<{ code: number; message?: string }> => {
		const child = spawn('docker', [...OCC_DOCKER_ARGS, ...args, '--output=json'])
		let message = ''

		return new Promise(resolve => {
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
				resolve({ code, message })
			})
		})
	}
}
