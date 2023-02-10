import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { IamEbrainsService } from './iam-ebrains.service'
import { CacheService } from 'src/cache/cache.service';
@Module({
	imports: [HttpModule],
	controllers: [],
	providers: [
		IamEbrainsService,
		CacheService
	],
	exports: [EbrainsModule]
})
export class EbrainsModule {}
