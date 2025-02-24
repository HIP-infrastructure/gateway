import { Injectable, Logger } from '@nestjs/common'
import { InjectRedis } from '@liaoliaots/nestjs-redis'
import Redis from 'ioredis'

@Injectable()
export class CacheService {
	private readonly logger = new Logger('CacheService')

	constructor(@InjectRedis() private readonly client: Redis) {}

	/**
	 * @Description: Encapsulate the method of setting redis cache
	 * @Param key {String} key value
	 * @Param value {String} key value
	 * @Param seconds {Number} Expiration time
	 * @return: Promise<any>
	 */

	public async set(key: string, value: any, seconds?: number): Promise<any> {
		const jsonString = JSON.stringify(value)
		if (!seconds) {
			await this.client.set(key, jsonString)
		} else {
			await this.client.set(key, jsonString, 'EX', seconds)
		}
	}
	/**
	 * @Description: Set to get the value in the redis cache
	 * @param key {String}
	 */

	public async get(key: string): Promise<any> {
		const data = await this.client.get(key)

		if (data) {
			return JSON.parse(data)
		} else {
			return null
		}
	}

	/**
	 * @Description: Delete redis cache data according to key
	 * @param key {String}
	 * @return:
	 */

	public async del(key: string): Promise<any> {
		await this.client.del(key)
	}

	/**
	 * @Description: Add the specified members to the set stored at key.
	 * @param key {String}
	 * @Param value {String} key value
	 * @return: Promise<any>
	 */

	public async sadd(key: string, value: any): Promise<any> {
		await this.client.sadd(key, value)
	}

	/**
	 * @Description: Returns all the members of the set value stored at key.
	 * @param key {String}
	 * @return: Promise<any>
	 */

	public async smembers(key: string): Promise<any[]> {
		return await this.client.smembers(key)
	}

	/**
	 * @Description: Remove the specified members from the set stored at key.
	 * @param key {String}
	 * @return:
	 */

	public async srem(key: string, value: any): Promise<any> {
		await this.client.srem(key, value)
	}

	/**
	 * @Description: Clear the redis cache
	 * @param {type}
	 * @return:
	 */

	public async flushall(): Promise<any> {
		await this.client.flushall()
	}
}
