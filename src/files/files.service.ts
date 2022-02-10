import { Injectable, Logger, HttpService } from '@nestjs/common'

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL

interface Participant {
	[key: string]: string | number
}
interface ISearch {
	name: string;
	isPaginated: true
	entries: ISearchResult[]
}

interface ISearchResult {
	thumbnailUrl: string;
	title: string;
	subline: string;
	resourceUrl: string;
	icon: string;
	rounded: boolean,
	attributes: {
		fileId: string;
		path: string;
	}
}

export interface BIDSDatabase {
	path?: string;
	resourceUrl?: string;
	participants?: Participant[];
	description?: { [key: string]: string | number }
}

export interface BIDSSubject {
	id?: string;
	database?: BIDSDatabase;
	path?: string;
	participant?: Participant
}

@Injectable()
export class FilesService {

	constructor(private readonly httpService: HttpService) { }

	private logger = new Logger('Files Service')

	async search(headersIn: any, term: string,): Promise<any> {
		const headers = {
			...headersIn,
			"accept": "application/json, text/plain, */*"
		}
		// firstValueFrom
		// https://stackoverflow.com/questions/34190375/how-can-i-await-on-an-rx-observable
		return this.httpService.get(`${NEXTCLOUD_URL}/ocs/v2.php/search/providers/files/search?term=${term}&cursor=0&limit=100`,
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

	async getBids(headersIn: any,) {
		const headers = {
			...headersIn,
			"accept": "application/json, text/plain, */*"
		}

		const s = await this.search(headersIn, 'participants.tsv')
		const searchResults = s?.entries
		const participantPromises = searchResults.map(s => this.readBIDSParticipants(s.attributes.path, headers))
		const results = await Promise.allSettled(participantPromises)
		const participants = results
			.map((r, i) => ({
				...r,
				path: searchResults[i].attributes.path.replace('participants.tsv', ''),
				resourceUrl: searchResults[i].resourceUrl.split('&')[0]
			}))
			.filter(result => result.status === 'fulfilled')
		const bidsDatabasesPromises = await participants.map(p => this.getFileContent(`${p.path}/dataset_description.json`, headers))
		const bresults = await Promise.allSettled(bidsDatabasesPromises)


		const bidsDatabases = bresults.map((db, i) => {
			return db.status === 'fulfilled' ? ({
				path: participants[i].path,
				resourceUrl: participants[i].resourceUrl,
				description: (() => {
					try {
						return JSON.parse((db as PromiseFulfilledResult<any>)?.value.replace(/\\n/g, ''))
					} catch (e) {
						return e.message
					}

				})(),
				participants: (participants[i] as PromiseFulfilledResult<Participant>)?.value
			}) : ({})
		})

		return bidsDatabases
	}

	async getFileContent(path: string, headersIn: any): Promise < string > {
	const response = await this.httpService.get(`${NEXTCLOUD_URL}/apps/hip/document/file?path=${path}`,
		{
			headers: headersIn
		})
		.toPromise()

		return await response.data
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
