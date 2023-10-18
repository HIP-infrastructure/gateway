const { spawn } = require('child_process')
import { HttpService } from '@nestjs/axios'
import {
	HttpException,
	HttpStatus,
	Injectable,
	Logger,
	UnauthorizedException
} from '@nestjs/common'
import { Request } from 'express'
import { firstValueFrom } from 'rxjs'

const OCC_DOCKER_ARGS = [
	'exec',
	'--user',
	'www-data:www-data',
	'cron',
	'php',
	'occ'
]

const LOGGED_IN_PATH = '/apps/hip/api/isloggedin'
const USER_ID_PATH = '/apps/hip/api/uid'

export interface User {
	id: string
	displayName?: string | null
	email?: string | null
	lastLogin: string
	groups?: string[]
	enabled: boolean
}

export interface NCUser {
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

export interface GroupFolder {
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

	// This takes a request object and checks if the user is logged in
	public async authenticate(req: Request): Promise<boolean> {
		this.logger.debug(`authenticate`)
		try {
			const { cookie, requesttoken }: any = req.headers
			if (!cookie || !requesttoken) {
				throw new UnauthorizedException()
			}

			const url = `${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}${LOGGED_IN_PATH}`
			const response = this.httpService.get(url, {
				headers: {
					cookie,
					requesttoken,
					accept: 'application/json, text/plain, */*',
					'content-type': 'application/json'
				}
			})

			const isLoggedIn = await firstValueFrom(response).then(r => {
				return r.data
			})

			return isLoggedIn
		} catch (error) {
			this.logger.error(` ${error.status} ${error.message}`)
			throw new UnauthorizedException()
		}
	}

	public async users(): Promise<User[]> {
		this.logger.debug(`users`)
		try {
			const args = ['user:list', '-i']
			const message = await this.spawnable(args)
			const ncusers = JSON.parse(message)
			const users = Object.keys(ncusers).map(k => {
				const user = ncusers[k]
				return {
					id: user.user_id,
					displayName: user.display_name,
					email: user.email,
					lastLogin: user.last_seen,
					groups: user.groups,
					enabled: user.enabled
				}
			})//.filter(u => u.groups.length > 1)

			return users || []
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	// This takes a request object and returns the user id
	public async authUserIdFromRequest(req: Request): Promise<string> {
		this.logger.debug(`authUserIdFromRequest`)
		try {
			const { cookie, requesttoken }: any = req.headers
			if (!cookie || !requesttoken) {
				this.logger.debug(`nextcloud uid: ${cookie} ${requesttoken}`)
				throw new UnauthorizedException()
			}

			const url = `${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}${USER_ID_PATH}`
			// this.logger.debug(`authUserIdFromRequest: ${url}`)
			const response = this.httpService.get(url, {
				headers: {
					cookie,
					requesttoken,
					accept: 'application/json, text/plain, */*',
					'content-type': 'application/json'
				}
			})

			const uid = await firstValueFrom(response).then(r => {
				// this.logger.debug(`authUserIdFromRequest: ${r.data}`)

				return r.data
			})

			return uid
		} catch (error) {
			this.logger.error(` ${error.status} ${error.message}`)
			throw new UnauthorizedException()
		}
	}

	public async user(
		userid: string,
		isOwner: boolean = false
	): Promise<User & Partial<NCUser>> {
		this.logger.debug(`user ${userid}, ${isOwner}`)
		try {
			const args = ['user:info', userid]
			const message = await this.spawnable(args)
			const user: NCUser = JSON.parse(message)

			const nextUser = {
				id: user.user_id,
				displayName: user.display_name,
				email: user.email,
				lastLogin: user.last_seen,
				groups: user.groups,
				enabled: user.enabled
			}

			if (isOwner)
				return {
					...nextUser,
					storage: user.storage,
					quota: user.quota
				}

			return nextUser
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	public async usersForGroup(groupid: string): Promise<string[]> {
		this.logger.debug(`usersForGroup ${groupid}`)
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
		this.logger.debug(`groupFoldersForUserId ${userid}`)
		try {
			const user = await this.user(userid)
			const groupFolders: NCGroupFolder[] = await this.groupFolders()

			const groupArray = Object.values(groupFolders).map(
				({ id, acl, mount_point, groups }) => ({
					id,
					label: mount_point,
					acl,
					groups: Object.keys(groups).map(group => group.toLowerCase())
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
		this.logger.debug(`userSettings ${userid}`)
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
		this.logger.debug(`scanUserFiles ${userid}`)
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
		this.logger.debug(`scanPath ${userid}`)
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

	public async oidcGroupsForUser(userId: string): Promise<string[]> {
		this.logger.debug(`oidcGroupsForUser ${userId}`)
		const groupMapping = await this.groupMapping()
		const user = await this.user(userId, true)
		const { groups } = user

		const iodcGroups = Object.entries(groupMapping).reduce((p, [k, v]) => {
			if (groups.includes(v)) {
				return [...p, k]
			}

			return p
		}, [])

		return iodcGroups
	}

	private async groupFolders(): Promise<NCGroupFolder[]> {
		// console.trace(`groupFolders`)
		this.logger.debug(`groupFolders`)
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

	private async groupMapping(): Promise<Record<string, string>> {
		this.logger.debug(`groupMapping`)
		try {
			const args = ['config:app:get', 'sociallogin', 'custom_providers']
			const message = await this.spawnable(args)
			const customProviders = JSON.parse(JSON.parse(message))
			const groupMapping = customProviders['custom_oidc'][0]['groupMapping']

			return groupMapping
		} catch (error) {
			this.logger.error({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}

	private spawnable = (args: string[]): Promise<string> => {
		const cmd = [...OCC_DOCKER_ARGS, ...args, '--output=json']
		this.logger.debug(`spawnable docker ${cmd.join(' ')}`)

		const child = spawn('docker', cmd)
		let message = ''

		return new Promise((resolve, reject) => {
			child.stdout.setEncoding('utf8')
			child.stdout.on('data', data => {
				message += data.toString()
			})

			child.stderr.setEncoding('utf8')
			child.stderr.on('data', data => {
				this.logger.error(`stderr: ${data}`)
				// Log but don't reject, as it's often just a warning
				// message += data.toString()
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
