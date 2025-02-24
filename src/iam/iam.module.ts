import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { IamService } from './iam.service'
import { CacheService } from 'src/cache/cache.service'
@Module({
	imports: [HttpModule],
	controllers: [],
	providers: [IamService, CacheService],
	exports: [IamModule]
})
export class IamModule {}
