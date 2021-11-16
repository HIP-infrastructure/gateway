import { HttpService, Injectable, Logger } from '@nestjs/common'

export const httpService = new HttpService()

@Injectable()
export class BIDSService {

    constructor() { }

    private readonly logger = new Logger('BIDSService')

    async convert(data: Record<string | number, unknown>) {
        this.logger.log(JSON.stringify(data, null, 2), 'convert')

        return await httpService
            .post(`http://bids-converter:4001/convert`, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .toPromise()
            .then(response => response.data)
            .catch(e => e.message)
    }
}
