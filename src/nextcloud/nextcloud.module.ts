import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { NextcloudService } from './nextcloud.service'

@Module({
    imports: [HttpModule],
	controllers: [],
	providers: [ NextcloudService],
	exports: [NextcloudModule],
})
export class NextcloudModule {}
