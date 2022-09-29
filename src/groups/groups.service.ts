import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

import { GroupDto } from './dto/group.dto'

@Injectable()
export class GroupsService {
	constructor(private readonly httpService: HttpService) {}

	private logger = new Logger('GroupsService')

	async findOne(tokens: any, groupid: string): Promise<GroupDto> {
		return this.findOne2(tokens, groupid)
	}

	async findOne1(tokens: any, groupid: string): Promise<GroupDto> {
		const headers = {
			...tokens,
				'OCS-APIRequest': true,
			accept: 'application/json, text/plain, */*',
		}

		const response = this.httpService.get(
			`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/ocs/v1.php/cloud/groups/${groupid}`,
			{ headers }
		)

		return firstValueFrom(response).then(r => r.data.ocs.data)
	}

	async findOne2(tokens: any, groupid: string): Promise<any> {
		try {
			const headers = {
				...tokens,
				'OCS-APIRequest': true,
				accept: 'application/json, text/plain, */*',
			}

			const response = this.httpService.get(
				`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/apps/hip/api/groupusers?groupId=${groupid}`,
				{ headers }
			)

			return firstValueFrom(response).then(r => {
				this.logger.debug(r.data)
				return r.data
			})
		} catch (error) {
			this.logger.debug({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}
}
