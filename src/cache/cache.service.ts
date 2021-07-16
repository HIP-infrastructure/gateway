import { Injectable } from '@nestjs/common';
import { RedisService } from 'nestjs-redis';

@Injectable()
export class CacheService {
  private client: any;
  constructor(private redisService: RedisService) {
    this.getClient();
  }

  private async getClient() {
    this.client = await this.redisService.getClient();
  }
  /**
   * @Description: Encapsulate the method of setting redis cache
   * @Param key {String} key value
   * @Param value {String} key value
   * @Param seconds {Number} Expiration time
   * @return: Promise<any>
   */

  public async set(key: string, value: any, seconds?: number): Promise<any> {
    value = JSON.stringify(value);
    if (!this.client) {
      await this.getClient();
    }
    if (!seconds) {
      await this.client.set(key, value);
    } else {
      await this.client.set(key, value, 'EX', seconds);
    }
  }
  /**
   * @Description: Set to get the value in the redis cache
   * @param key {String}
   */

  public async get(key: string): Promise<any> {
    if (!this.client) {
      await this.getClient();
    }

    const data = await this.client.get(key);

    if (data) {
      return JSON.parse(data);
    } else {
      return null;
    }
  }
  /**
   * @Description: Delete redis cache data according to key
   * @param key {String}
   * @return:
   */

  public async del(key: string): Promise<any> {
    if (!this.client) {
      await this.getClient();
    }

    await this.client.del(key);
  }
  /**
   * @Description: Clear the redis cache
   * @param {type}
   * @return:
   */

  public async flushall(): Promise<any> {
    if (!this.client) {
      await this.getClient();
    }

    await this.client.flushall();
  }
}
