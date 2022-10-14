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

	public async files(userId: string, path: string) {
		try {
			let relativePath
			if (/groupfolder/.test(path)) {
				const filePath = path.split('/').slice(2)
				const groupPath = await this.groupPath(filePath[0], userId)
				relativePath = `${groupPath}/${filePath.slice(1).join('/')}`
			} else {
				relativePath = `${userId}/files${path}`
			}

			const fsPath = `${process.env.PRIVATE_FILESYSTEM}/${relativePath}`
			const files = fs.readdirSync(fsPath, { withFileTypes: true })

			return Promise.resolve(
				files.map(file => ({
					name: file.name,
					parentPath: path,
					path: `${path === '/' ? '' : path}/${file.name}`,
					isDirectory: file.isDirectory(),
				}))
			)
		} catch (e) {
			this.logger.error(e)
			throw new BadRequestException('ENOTDIR: not a directory')
		}
	}

	private async groupPath(name: string, userId: string) {
		try {
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				userId
			)

			const path = groupFolders.find(
				g => g.label.toLowerCase() === name.toLowerCase()
			)?.path

			if (!path) {
				throw new BadRequestException('ENOTDIR: not a directory')
			}

			return path
		} catch (error) {
			this.logger.error(error)
			throw new BadRequestException('ENOTDIR: not a directory')
		}
	}
}
