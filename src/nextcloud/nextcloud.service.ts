const { spawn } = require('child_process')
import { HttpService } from '@nestjs/axios'
import {
	HttpException,
	HttpStatus,
	Injectable,
	Logger,
	UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { firstValueFrom } from 'rxjs'

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
	lastLogin: string
	groups?: string[]
	enabled: boolean
}

interface NCUser {
	user_id: string
	display_name: string
	email: string
	cloud_id: string
	enabled: boolean
	groups: string[]
	quota: string
	storage: {
		free: number
		used: number
		total: number
		relative: number
		quota: number
	}
	last_seen: string
	user_directory: string
	backend: 'Database'
}

interface GroupFolder {
	id: number
	label: string
	path: string
}

interface NCGroups {
	[key: string]: string[]
}
interface NCGroupFolder {
	id: number
	mount_point: string
	groups: NCGroups
	quota: number
	size: number
	acl: boolean
	manage: {
		type: 'user'
		id: string
		displayname: string
	}
}

@Injectable()
export class NextcloudService {
	private readonly logger = new Logger('NextcloudService')

	constructor(private readonly httpService: HttpService) {}

	public async user(userid: string): Promise<User> {
		try {
			const args = ['user:info', userid]
			const message = await this.spawnable(args)
			const user: NCUser = JSON.parse(message)

			return {
				id: user.user_id,
				displayName: user.display_name,
				email: user.email,
				lastLogin: user.last_seen,
				groups: user.groups,
				enabled: user.enabled,
			}
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	public async usersForGroup(groupid: string): Promise<string[]> {
		try {
			const args = ['group:list']
			const message = await this.spawnable(args)
			const groups: NCGroups = JSON.parse(message)

			return groups[groupid] || []
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	/**
	 * It makes a GET request to the Nextcloud API to get a list of foldergroups
	 * filtered by the user's groups.
	 * @returns An array of groups
	 */

	public async groupFoldersForUserId(userid: string): Promise<GroupFolder[]> {
		try {
			const user = await this.user(userid)
			const groupFolders: NCGroupFolder[] = await this.groupFolders()

			const groupArray = Object.values(groupFolders).map(
				({ id, acl, mount_point, groups }) => ({
					id,
					label: mount_point,
					acl,
					groups: Object.keys(groups).map(group => group.toLowerCase()),
				})
			)

			return groupArray
				.filter(g => !g.acl)
				.filter(g => g.groups.some(group => user.groups.includes(group)))
				.map(({ id, label }) => ({ id, label, path: `__groupfolders/${id}` }))
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	public async userSettings(userid: string, settings: string): Promise<string> {
		try {
			const args = ['user:setting', userid, settings || '']
			const message = await this.spawnable(args)

			return JSON.parse(message)
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	public async scanUserFiles(userid: string): Promise<string> {
		try {
			const args = ['files:scan', userid]
			const message = await this.spawnable(args)

			return message
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	/*
	 * path is the relative path to the user's home directory eg: path: myFolder (in data/nicedexter/files/myFolder)
	 */

	public async scanPath(userid: string, path: string): Promise<string> {
		try {
			const ncPath = `${userid}/files/${path}`
			const args = ['files:scan', '--path', ncPath]
			const message = await this.spawnable(args)

			return message
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	public async validate(req: Request): Promise<string> {
		try {
			const { cookie, requesttoken }: any = req.headers

			if (!cookie || !requesttoken) {
				throw new UnauthorizedException()
			}

			const headers = {
				cookie,
				requesttoken,
				accept: 'application/json, text/plain, */*',
				'content-type': 'application/json',
			}

			const response = this.httpService.put(
				`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/apps/user_status/heartbeat`,
				{ status: 'online' },
				{ headers }
			)
			const { userId } = await firstValueFrom(response).then(r => {
				return r.data
			})

			if (!userId) {
				throw new UnauthorizedException()
			}

			return userId
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	private async groupFolders(): Promise<NCGroupFolder[]> {
		try {
			const args = ['groupfolders:list']
			const message = await this.spawnable(args)
			const groupFolders: NCGroupFolder[] = JSON.parse(message)

			return groupFolders
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	private spawnable = (args: string[]): Promise<string> => {
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
