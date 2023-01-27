import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { IamService } from './iam.service'
@Module({
	imports: [HttpModule],
	controllers: [],
	providers: [
		{
			provide: 'TOKEN',
			useValue: 'my-secret-token'
		},
		IamService
	],
	exports: [IamModule]
})
export class IamModule {}
