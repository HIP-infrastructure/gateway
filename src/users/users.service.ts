import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { UserDto } from './dto/user.dto'

@Injectable()
export class UsersService {

	constructor(
		private readonly httpService: HttpService
	) {}
	
	private logger = new Logger('UsersService')


	async findOne(tokens: any, userid: string) {
		const headers = {
			...tokens,
			accept: 'application/json, text/plain, */*',
		}

		const response = this.httpService.get(
			`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/ocs/v1.php/cloud/users/${userid}`,
			{ headers }
		)

		const user = await firstValueFrom(response).then(r => {
			const data = r.data.ocs.data
			const nextData = (({
				id,
				lastLogin,
				email,
				displayname,
				groups,
			}: UserDto) => ({ 
				id, 
				lastLogin, 
				email, 
				displayName: displayname, 
				groups: groups.map(group => group.toLowerCase())
			}))(data)

			return nextData
		})

		return user
	}
}