import { HttpService, Injectable, Logger } from '@nestjs/common'

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

interface Participant {
	age?: string
	sex?: string
	[key: string]: string | number
}
export interface BIDSDatabase {
	id: string
	path: string
	resourceUrl: string
	Name?: string
	BIDSVersion?: string
	Licence?: string
	Authors?: string[]
	Acknowledgements?: string
	HowToAcknowledge?: string
	Funding?: string[]
	ReferencesAndLinks?: string[]
	DatasetDOI?: string
	[key: string]: any
	participants?: Participant[]
}

type DataError = { data?: Record<string, string>; error?: Record<string, string> }
@Injectable()
export class FilesService {

	constructor(private readonly httpService: HttpService) { }

	private logger = new Logger('Files Service')

	public async search(headersIn: any, term: string,): Promise<ISearch> {
		const headers = {
			...headersIn,
			"accept": "application/json, text/plain, */*"
		}
		// firstValueFrom
		// https://stackoverflow.com/questions/34190375/how-can-i-await-on-an-rx-observable
		return this.httpService.get(`${process.env.PRIVATE_WEBDAV_URL}/ocs/v2.php/search/providers/files/search?term=${term}&cursor=0&limit=100`,
			{
				headers
			})
			.toPromise()
			.then((data) => {
				return data.data.ocs.data
			})
	}

	getFiles(path) {
		return
	}

	public async getBids(headersIn: any) {
		const PARTICIPANTS_FILE = 'participants.tsv'

		try {
			const headers = {
				...headersIn,
				"accept": "application/json, text/plain, */*"
			}

			const s = await this.search(headersIn, PARTICIPANTS_FILE)
			
			const searchResults = s?.entries
			console.log(searchResults)
			const participantPromises = searchResults.map(s => this.readBIDSParticipants(s.attributes.path, headers))
			const results = await Promise.allSettled(participantPromises)
			const participantSearchFiltered = results
				.map((p, i) => ({ p, i })) // keep indexes
				.filter(item => item.p.status === 'fulfilled')
				.filter(item => !/derivatives/.test(searchResults[item.i].attributes.path))
				.map(item => ({
					participants: (item.p as PromiseFulfilledResult<Participant[]>).value,
					searchResult: searchResults[item.i]
				}))

				
			const bidsDatabasesPromises = await participantSearchFiltered.map((ps) => this.getDatasetContent(`${ps.searchResult.attributes.path.replace(PARTICIPANTS_FILE, '')}/dataset_description.json`, headers))
			const bidsDatabasesResults = await Promise.allSettled(bidsDatabasesPromises)
			const bidsDatabases: BIDSDatabase[] = bidsDatabasesResults
				.reduce((arr, item, i) => [...arr, item.status === 'fulfilled' ? ({
					...((item as PromiseFulfilledResult<DataError>).value.data || (item as PromiseFulfilledResult<DataError>).value.error),
					id: participantSearchFiltered[i].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
					Path: participantSearchFiltered[i].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
					ResourceUrl: participantSearchFiltered[i].searchResult.resourceUrl.split('&')[0],
					Participants: participantSearchFiltered[i].participants
				}) : {}], [])

			return { data: bidsDatabases }
		} catch (e: unknown) {
			console.log(e)
			return { error: e }
		}
	}

	public async createBids(headersIn: any, path: string, data: BIDSDatabase) {
		console.log(data)
		const response = await this.httpService.post(`${process.env.PRIVATE_WEBDAV_URL}/apps/hip/document/createBids?path=${path}`,
			data,
			{ headers: headersIn })
			.toPromise()

		console.log("response.data", response.data)

		return await response.data
	}

	async getFileContent(path: string, headersIn: any): Promise<string> {
		const response = await this.httpService.get(`${process.env.PRIVATE_WEBDAV_URL}/apps/hip/document/file?path=${path}`,
			{ headers: headersIn })
			.toPromise()

		return await response.data
	}

	async getDatasetContent(path: string, headersIn: any): Promise<DataError> {
		const response = await this.httpService.get(`${process.env.PRIVATE_WEBDAV_URL}/apps/hip/document/file?path=${path}`,
			{ headers: headersIn })
			.toPromise()

		const data = response.data
		const cleaned = data.replace(/\\n/g, '').replace(/\\/g, '')

		try {
			return ({ data: JSON.parse(cleaned) })
		} catch (e) {
			return ({ error: e.message })
		}
	}

	async readBIDSParticipants(path: string, headersIn: any) {
		const tsv = await this.getFileContent(path, headersIn)
		const [headers, ...rows] = tsv
			.trim()
			.split('\n')
			.map(r => r.split('\t'))

		const participants: Participant[] = rows.reduce((arr, row) => [
			...arr,
			row.reduce((obj, item, i) => Object.assign(obj, ({ [headers[i].trim()]: item })), {})
		], [])

		return participants
	}

}
