import { HttpService } from '@nestjs/axios'
import { HttpException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
// import { AxiosError, AxiosResponse } from 'axios'
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
	acceptMembershipRequest: boolean
}

export interface GroupLists {
	users: User[]
	units: any[]
	groups: Group[]
}

@Injectable()
export class IamEbrainsService {
	private readonly logger = new Logger(IamEbrainsService.name)
	private apiUrl: string
	private clientId: string

	constructor(
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService
	) {
		this.apiUrl = this.configService.get<string>('iam.apiUrl')
		this.clientId = this.configService.get<string>('iam.clientId')
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
		// const headers = { 'Authorization': 'Basic ' }

		this.logger.log(headers, url, body)
		const catcher = catchError((error: any) => {
			this.logger.error(error)

			throw error

			// throw new HttpException(
			// 	error.response.data.description, 
			// 	error.response.data.code
			// )
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

	private async getGroupInfo(groupName: string): Promise<Project> {
		this.logger.debug(`getGroupInfo(${groupName})`)
		const url = `${this.apiUrl}/identity/groups/${groupName}?realm=hip`
		const { data } = await this.request(url, 'get', {})


		console.log(JSON.stringify(data, null, 2))

		return data
	}

	public async getGroups(): Promise<Project[]> {
		this.logger.debug(`getGroups()`)
		const url = `${this.apiUrl}/identity/groups?realm=hip`
		const { data } = await this.request(url, 'get', {})


		console.log(JSON.stringify(data, null, 2))

		return data
	}

	public async getUser(username: string) {
		this.logger.debug(`getUser(${username})`)
		const url = `${this.apiUrl}/identity/users/${username}?realm=hip`
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

	public async getUserGroups(userName: string, role?: Role): Promise<Group[]> {
		this.logger.debug(`getUserGroups(${userName})`)
		// const baseUrl = `${this.apiUrl}/identity/groups?username=${userName}`
		const baseUrl = `${this.apiUrl}/projects/users/${userName}?realm=hip`
		const url = role ? `${baseUrl}&role=${role}` : baseUrl
		const { data } = await this.request(url, 'get', {})

		return data
	}

	public async createGroup(name: string, title: string, description: string, adminId?: string) {
		this.logger.debug(`createGroup(${name})`)

		// sanitize name
		const projectName = `${name.replace(/[^a-zA-Z0-9]+/g, '-')}`

		const url = `${this.apiUrl}/identity/groups?realm=hip`
		const body = { name: projectName, description, adminId }
		console.log(body)
		const { status } = await this.request(url, 'post', body)

		return { data: projectName, status }
	}

	public async deleteGroup(name: string) {
		this.logger.debug(`deleteGroup(${name})`)
		const url = `${this.apiUrl}/identity/groups/${name}?realm=hip`

		const data = await this.request(url, 'delete')
		const { status } = data
		console.log({ data })
		console.log({ status })

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

	public async addUserToGroup(userName: string, role: Role, groupName: string) {
		this.logger.debug(`addUserToGroup(${userName}, ${role}, ${groupName})`)
		const url = `${this.apiUrl}/identity/groups/${groupName}/${role}/users/${userName}?realm=hip`
		const { status } = await this.request(url, 'put', {})

		return { data: 'Success', status }
	}

	public async removeUserFromGroup(
		userName: string,
		role: Role,
		groupName: string
	) {
		this.logger.debug(`removeUserFromGroup(${userName}, ${role}, ${groupName})`)
		const url = `${this.apiUrl}/identity/groups/${groupName}/${role}/users/${userName}?realm=hip`
		const { status } = await this.request(url, 'delete', {})

		return { data: 'Success', status }
	}

	public async getGroup(
		groupName: string
	): Promise<Project & { members: GroupLists; administrators: GroupLists }> {
		const group: any = await this.getGroupInfo(groupName)

		// const groupList = await this.getGroupListsByRole(groupName, 'member')
		// const groupListAdmin = await this.getGroupListsByRole(
		// 	groupName,
		// 	'administrator'
		// )

		return group

		// return {
		// 	...group,
		// 	members: groupList,
		// 	administrators: {
		// 		...groupListAdmin,
		// 		users: groupListAdmin.users.filter(u => !/service-account/.test(u.username))
		// 	}
		// }
	}
}
