import { RedisModule } from '@liaoliaots/nestjs-redis';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import postgresConfig from './config/db.postgres.config';
import redisConfig from './config/db.redis.config';
import ebrains from './config/api.iam-ebrains.config';
import collab from './config/collab.config';
import instance from './config/instance.config';
import { FilesModule } from './files/files.module';
import { GroupsModule } from './groups/groups.module';
import { NextcloudModule } from './nextcloud/nextcloud.module';
import { RemoteAppModule } from './remote-app/remote-app.module';
import { ToolsModule } from './tools/tools.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { IamEbrainsModule } from './iam-ebrains/iam-ebrains.module';
import { WarmupService } from './warmup/warmup.service';
import { ProjectsService } from './projects/projects.service'
import { HttpModule } from '@nestjs/axios'
import { CacheService } from './cache/cache.service'
import { ToolsService } from './tools/tools.service'
import { NextcloudService } from './nextcloud/nextcloud.service'
import { IamEbrainsService } from './iam-ebrains/iam-ebrains.service'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ['.env'],
			load: [collab, ebrains, postgresConfig, redisConfig, instance],
		}),
		FilesModule,
		RemoteAppModule,
		ScheduleModule.forRoot(),
		RedisModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				config: {
					url: config.get('REDIS_HOST'),
					name: config.get('REDIS_NAME'),
					db: config.get('REDIS_DATABASE')
				}
			}),
		}),
		// TypeOrmModule.forRootAsync({
		// 	inject: [ConfigService],
		// 	useFactory: (config: ConfigService) => ({
		// 		...config.get('postgres'),
		// 		autoLoadEntities: true,
		// 		synchronize: false,
		// 	}),
		// }),
		ToolsModule,
		UsersModule,
		GroupsModule,
		NextcloudModule,
		ProjectsModule,
		IamEbrainsModule,
		HttpModule
	],
	controllers: [AppController],
	providers: [CacheService, IamEbrainsService, NextcloudService, ConfigService, ToolsService, ProjectsService, WarmupService],
})
export class AppModule { }
