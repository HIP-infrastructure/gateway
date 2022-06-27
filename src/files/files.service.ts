import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, HttpException } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
const fs = require('fs')

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
	rounded: boolean,
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

type DataError = { data?: Record<string, string>; error?: Record<string, string> }
const DATASET_DESCRIPTION = 'dataset_description.json'
@Injectable()
export class FilesService {

	constructor(private readonly httpService: HttpService) { }

	private logger = new Logger('Files Service')

	public async search(headersIn: any, term: string,): Promise<ISearch> {
		const headers = {
			...headersIn,
			"accept": "application/json, text/plain, */*"
		}

		const response = this.httpService.get(`${process.env.PRIVATE_WEBDAV_URL}/ocs/v2.php/search/providers/files/search?term=${term}&cursor=0&limit=100`,
			{ headers }
		)

		return firstValueFrom(response).then(r => r.data.ocs.data)
	}
}
