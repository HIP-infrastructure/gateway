import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, HttpException } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { UsersService } from 'src/users/users.service'

interface ISearch {
	name: string
	isPaginated: true
	entries: ISearchResult[]
}

interface ISearchResult {
	thumbnailUrl: string
	title: string
	subline: string
	resourceUrl: string
	icon: string
	rounded: boolean
	attributes: {
		fileId: string
		path: string
	}
}

export interface Participant {
	age?: string
	sex?: string
	[key: string]: string | number
}
export interface BIDSDatabase {
	Name?: string
	BIDSVersion?: string
	License?: string
	Authors?: string[]
	Acknowledgements?: string
	HowToAcknowledge?: string
	Funding?: string[]
	ReferencesAndLinks?: string[]
	DatasetDOI?: string
}

type DataError = {
	data?: Record<string, string>
	error?: Record<string, string>
}
const DATASET_DESCRIPTION = 'dataset_description.json'
@Injectable()
export class FilesService {
	constructor(
		private readonly httpService: HttpService,
		private readonly usersService: UsersService
	) {}

	private logger = new Logger('Files Service')

	public async search(
		tokens: { cookie: string, requesttoken: any },
		term: string
	): Promise<ISearch> {
		const headers = {
			...tokens,
			accept: 'application/json, text/plain, */*',
		}

		const response = this.httpService.get(
			`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/ocs/v2.php/search/providers/files/search?term=${term}&cursor=0&limit=100`,
			{ headers }
		)

		return firstValueFrom(response).then(r => r.data.ocs.data)
	}

	public async groupFolders(
		tokens: { cookie: string, requesttoken: any },
		userid
	): Promise<any> {
		const headers = {
			...tokens,
			accept: 'application/json, text/plain, */*',
		}

		const user = await this.usersService.findOne(tokens, userid)
		const response = this.httpService.get(
			`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/apps/groupfolders/folders?format=json`,
			{ headers }
		)

		const folders = await firstValueFrom(response).then(r => r.data.ocs.data)

		const groupArray = Object.values(folders).map(
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
	}
}
