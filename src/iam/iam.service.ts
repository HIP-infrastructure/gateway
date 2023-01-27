import { HttpService } from '@nestjs/axios'
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common'
import { AxiosError, AxiosResponse } from 'axios'
import { catchError, firstValueFrom } from 'rxjs'

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

interface Group {
	name: string
	title: string
	description: string
	acceptMembershipRequest: boolean
}

interface GroupLists {
	users: User[]
	units: any[]
	groups: Group[]
}

@Injectable()
export class IamService {
	private readonly logger = new Logger(IamService.name)

	private readonly iamClientUrl = process.env.IAM_CLIENT_URL || '';
	private readonly iamClientId = process.env.IAM_CLIENT_ID || '';
	private readonly iamClientSecret = process.env.IAM_CLIENT_SECRET || '';
	private readonly eBrainsApiUrl = process.env.EBRAINS_API_URL || '';

	constructor(
		private readonly httpService: HttpService,
		@Inject('TOKEN') private token: string // private readonly configService: ConfigService
	) {}

	private async getAuthToken() {
		this.logger.debug(`getAuthToken()`)

		const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
		const body = {
			grant_type: 'client_credentials',
			scope:
				'openid email roles team profile group clb.wiki.read clb.wiki.write',
			client_id: this.iamClientId,
			client_secret: this.iamClientSecret
		}
		const {
			data: { access_token }
		} = await firstValueFrom(
			this.httpService
				.post<AuthTokenResponse>(this.iamClientUrl, body, { headers })
				.pipe(
					catchError((error: AxiosError) => {
						this.logger.error(error)
						throw new HttpException(error.response.data, error.response.status)
					})
				)
		)

		return access_token
	}

	private async request(
		url: string,
		method: 'get' | 'post' | 'put' | 'delete',
		body?: {}
	): Promise<AxiosResponse<any, any>> {
		const token = await this.getAuthToken()
		const headers = { Authorization: `Bearer ${token}` }

		if (method === 'delete' || method === 'get') {
			return await firstValueFrom(
				this.httpService[method](url, { headers }).pipe(
					catchError((error: AxiosError) => {
						this.logger.error(error)
						console.log(error)
						throw new HttpException(error.response.data, error.response.status)
					})
				)
			)
		}
        
		return await firstValueFrom(
			this.httpService[method](url, body ?? {}, { headers }).pipe(
				catchError((error: AxiosError) => {
					this.logger.error(error)
					console.log(error)
					throw new HttpException(error.response.data, error.response.status)
				})
			)
		)
	}

	private async getGroupInfo(groupName: string) {
		this.logger.debug(`getGroup(${groupName})`)
		const url = `${this.eBrainsApiUrl}/identity/groups/${groupName}`
		const { data } = await this.request(url, 'get', {})

		return data
	}

	private async getGroupListsByRole(groupName: string, role: Role) {
		this.logger.debug(`getGroupListsByRole(${groupName}, ${role})`)
		const url = `${this.eBrainsApiUrl}/identity/groups/${groupName}/${role}`
		const { data } = await this.request(url, 'get', {})

		return data
	}

	public async createGroup(name: string) {
		this.logger.debug(`createGroup(${name})`)
		const url = `${this.eBrainsApiUrl}/identity/groups`
		const body = {
			name,
			title: 'Test Group created from service account',
			description: 'Everything is in the title'
		}
		const response = await this.request(url, 'post', body)

		return { data: 'Success', status: response.status }
	}

	public async deleteGroup(name: string) {
		this.logger.debug(`deleteGroup(${name})`)
		const url = `${this.eBrainsApiUrl}/identity/groups/${name}`
		const response = await this.request(url, 'delete')

		return { data: 'Success', status: response.status }
	}

	public async assignGroupToGroup(
		groupName1: string,
		role: Role,
		groupName2: string
	) {
		this.logger.debug(
			`assignGroupToGroup(${groupName1}, ${role}, ${groupName2})`
		)
		const url = `${this.eBrainsApiUrl}/identity/groups/${groupName1}/${role}/groups/${groupName2}`
		const response = await this.request(url, 'put')

		return { data: 'Success', status: response.status }
	}

	public async addUserToGroup(groupName: string, role: Role, userName: string) {
		this.logger.debug(`addUserToGroup(${groupName}, ${role}, ${userName})`)
		const url = `${this.eBrainsApiUrl}/identity/groups/${groupName}/${role}/users/${userName}`
		const response = await this.request(url, 'put', {})

		return { data: 'Success', status: response.status }
	}

	public async removeUserFromGroup(
		groupName: string,
		role: Role,
		userName: string
	) {
		this.logger.debug(`removeUserFromGroup(${groupName}, ${role}, ${userName})`)
		const url = `${this.eBrainsApiUrl}/identity/groups/${groupName}/${role}/users/${userName}`
		const response = await this.request(url, 'delete', {})

		return { data: 'Success', status: response.status }
	}

	public async getGroup(groupName: string) {
		this.logger.debug(`getEverythingInGroup(${groupName})`)

		const group = await this.getGroupInfo(groupName)
		const groupList = await this.getGroupListsByRole(groupName, 'member')
		const groupListAdmin = await this.getGroupListsByRole(
			groupName,
			'administrator'
		)

		return {
			...group,
			members: groupList,
			administrators: groupListAdmin
		}
	}
}
