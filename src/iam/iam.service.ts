import { HttpService } from '@nestjs/axios'
import { HttpException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { catchError, firstValueFrom } from 'rxjs'
import { CacheService } from 'src/cache/cache.service'
import { Project } from 'src/projects/projects.service'

type AuthTokenResponse = {
	access_token: string
}

type Role = 'administrator' | 'member'

interface User {
	id: string
	mitreid: string
	username: string
	firstName: string
	lastName: string
	biography: string
	avatar: string
	active: boolean
}

export interface Group {
	name: string
	title: string
	description: string
	isPublic: boolean
}

export interface GroupLists {
	users: User[]
	units: any[]
	groups: Group[]
}

@Injectable()
export class IamService {
	private readonly logger = new Logger(IamService.name)
	private apiUrl: string
	private clientId: string
	private realm: string

	constructor(
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService
	) {
		this.apiUrl = this.configService.get<string>('iam.apiUrl')
		this.clientId = this.configService.get<string>('iam.clientId')
		this.realm = this.configService.get<string>('iam.realm')
	}

	private async getAuthToken() {
		this.logger.debug(`getAuthToken()`)

		try {
			const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
			const body = {
				grant_type: 'client_credentials',
				scope:
					'openid email roles team profile group',
				client_id: this.clientId,
				client_secret: this.configService.get<string>('iam.clientSecret')
			}
			const url = this.configService.get<string>('iam.clientUrl')

			const {
				data: { access_token }
			} = await firstValueFrom(
				this.httpService.post<AuthTokenResponse>(url, body, { headers }).pipe(
					catchError((error: any) => {
						this.logger.error(error)
						throw new HttpException(
							error.response.data.description,
							error.response.data.code
						)
					})
				)
			)

			return access_token
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}

	private async request(
		url: string,
		method: 'get' | 'post' | 'put' | 'delete',
		body?: {}
	): Promise<any> {
		this.logger.debug(`request(${url}, ${method}, ${JSON.stringify(body)})`)
		const token = await this.getAuthToken()
		const headers = { Authorization: `Bearer ${token}` }

		const catcher = catchError((error: any) => {
			this.logger.error(error)

			throw error
		})

		if (method === 'delete' || method === 'get') {
			return await firstValueFrom(
				this.httpService[method](url, { headers }).pipe(catcher)
			)
		}

		return await firstValueFrom(
			this.httpService[method](url, body ?? {}, { headers }).pipe(catcher)
		)
	}

	public async getGroups(root: string): Promise<Project[]> {
		this.logger.debug(`getGroups(${root})`)
		const url = `${this.apiUrl}/identity/groups/${root}?realm=${this.realm}`
		const { data } = await this.request(url, 'get', {})

		return data
	}

	public async getUser(username: string, root: string) {
		this.logger.debug(`getUser(${username})`)
		const url = `${this.apiUrl}/identity/projects/${root}/users/${username}?realm=${this.realm}`
		const { data } = await this.request(url, 'get', {})

		return data
	}

	public async getGroupListsByRole(
		groupName: string,
		role: Role
	): Promise<GroupLists> {
		this.logger.debug(`getGroupListsByRole(${groupName}, ${role})`)
		const url = `${this.apiUrl}/identity/groups/${groupName}/${role}`
		const { data } = await this.request(url, 'get', {})

		return data
	}

	public async getUserGroups(root, userName: string, role?: Role): Promise<Group[]> {
		this.logger.debug(`getUserGroups(${userName}, ${root})`)
		const baseUrl = `${this.apiUrl}/projects/${root}/users/${userName}?realm=${this.realm}`
		const url = role ? `${baseUrl}&role=${role}` : baseUrl
		const { data } = await this.request(url, 'get', {})
		this.logger.debug(`getUserGroups(url: ${url}, data: ${JSON.stringify(data)}`)

		return data
	}

	public async createRootContainerGroup(name: string, description: string) {
		this.logger.debug(`createRootContainerGroup(${name})`)

		const url = `${this.apiUrl}/identity/groupsroot?realm=${this.realm}`
		const body = { name, description }
		const { status } = await this.request(url, 'post', body)

		return { data: name, status }
	}

	public async createGroup(root: string, name: string, description: string, adminId?: string, isPublic: boolean = false) {
		this.logger.debug(`createGroup(${name})`)

		const url = `${this.apiUrl}/identity/groups?realm=${this.realm}`
		const body = { root, name, description, adminId, isPublic }
		const { status } = await this.request(url, 'post', body)

		return { data: name, status }
	}

	public async deleteGroup(root: string, name: string) {
		this.logger.debug(`deleteGroup(${name})`)
		const url = `${this.apiUrl}/identity/groups/${root}/${name}?realm=${this.realm}`

		const data = await this.request(url, 'delete')
		const { status } = data

		return { data: 'Success', status }
	}

	public async assignGroupToGroup(
		groupName1: string,
		role: Role,
		groupName2: string
	) {
		this.logger.debug(
			`assignGroupToGroup(${groupName1}, ${role}, ${groupName2})`
		)
		const url = `${this.apiUrl}/identity/groups/${groupName2}/${role}/groups/${groupName1}`
		const { status } = await this.request(url, 'put')

		return { data: 'Success', status }
	}

	public async addUserToGroup(userName: string, role: Role, root: string, groupName: string) {
		this.logger.debug(`addUserToGroup(${userName}, ${role}, ${groupName})`)
		const url = `${this.apiUrl}/identity/groups/${root}/${groupName}/${role}/users/${userName}?realm=${this.realm}`
		const { status } = await this.request(url, 'put', {})

		return { data: 'Success', status }
	}

	public async addUserToRootContainerGroup(userName: string, root: string,) {
		this.logger.debug(`addUserToGroup(${userName}, ${root})`)
		const url = `${this.apiUrl}/identity/groups/${root}/users/${userName}?realm=${this.realm}`
		const { status } = await this.request(url, 'put', {})

		return { data: 'Success', status }
	}

	public async removeUserFromGroup(
		userName: string,
		role: Role,
		root: string,
		groupName: string
	) {
		this.logger.debug(`removeUserFromGroup(${userName}, ${role}, ${groupName})`)
		const url = `${this.apiUrl}/identity/groups/${root}/${groupName}/${role}/users/${userName}?realm=${this.realm}`
		const { status } = await this.request(url, 'delete', {})

		return { data: 'Success', status }
	}

	public async getGroup(
		root: string,
		groupName: string
	): Promise<Project & { members: GroupLists; administrators: GroupLists }> {
		this.logger.debug(`getGroup(root: ${root}, groupName: ${groupName})`)

		const url = `${this.apiUrl}/identity/groups/${root}/${groupName}?realm=${this.realm}`
		const { data } = await this.request(url, 'get', {})

		this.logger.debug(`getGroup(url: ${url}, data: ${JSON.stringify(data)}`)
		return data
	}
}
