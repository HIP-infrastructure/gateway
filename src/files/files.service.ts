import { Injectable, Logger, HttpService } from '@nestjs/common'

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL
@Injectable()
export class FilesService {

	constructor(private readonly httpService: HttpService) { }

	private logger = new Logger('Files Service')

	async search(headersIn: any, term: string,): Promise<any> {

		const headers = {
			...headersIn,
			"accept": "application/json, text/plain, */*"
		}

		return this.httpService.get(`${NEXTCLOUD_URL}/ocs/v2.php/search/providers/files/search?term=${term}`,
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

}
