import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
const fs = require('fs')
const path = require('path')

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
export interface BIDSDataset {
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

@Injectable()
export class FilesService {
	constructor(
		private readonly httpService: HttpService,
		private readonly nextcloudService: NextcloudService
	) {}

	private logger = new Logger('Files Service')

	public async search(
		tokens: { cookie: string; requesttoken: any },
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

	public files(userId: string, path: string) {
		try {
			const fsPath = `${process.env.PRIVATE_FILESYSTEM}/${userId}/files${path}`
			const files = fs.readdirSync(fsPath, { withFileTypes: true })

			return files.map(file => ({
				name: file.name,
				parentPath: path,
				path: `${path === '/' ? '' : path}/${file.name}`,
				size: file.size,
				isDirectory: file.isDirectory(),
			}))
		} catch (e) {
			this.logger.error(e)
			throw new BadRequestException('ENOTDIR: not a directory')
		}
	}

	private async filePath(path: string, userId: string) {
		try {
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				userId
			)

			const rootPath = path.split('/')[0]
			const id = groupFolders.find(g => g.label === rootPath)?.id

			const nextPath = id
				? `/__groupfolders/${id}/${path.replace(`${rootPath}/`, '')}`
				: `/${userId}/files/${path}`

			return `${process.env.PRIVATE_FILESYSTEM}/${nextPath}`
		} catch (error) {
			this.logger.error(error)
			// throw new InternalServerErrorException(
			// 	"Couldn't find a path for the file"
			// )
		}
	}
}
