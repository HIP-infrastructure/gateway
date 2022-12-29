import { RedisModule } from '@liaoliaots/nestjs-redis'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
// import { TypeOrmModule } from '@nestjs/typeorm'
import { AppController } from './app.controller'
// import postgresConfig from './config/db.postgres.config'
import redisConfig from './config/db.redis.config'
import { FilesModule } from './files/files.module'
import { GroupsModule } from './groups/groups.module'
import { NextcloudModule } from './nextcloud/nextcloud.module'
import { RemoteAppModule } from './remote-app/remote-app.module'
import { ToolsModule } from './tools/tools.module'
import { UsersModule } from './users/users.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ['.env'],
			load: [postgresConfig, redisConfig],
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
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				...config.get('postgres'),
				autoLoadEntities: true,
				synchronize: false,
			}),
		}),
		ToolsModule,
		UsersModule,
		GroupsModule,
		NextcloudModule,
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule { }
