import { HttpException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { GetBidsDatabaseDto } from './dto/get-bids-database.dto'
const { spawn } = require('child_process')
const fs = require('fs')

@Injectable()
export class ToolsService {

    async getBIDSDatabase(getBidsDatabaseDto: GetBidsDatabaseDto) {
        const { owner } = getBidsDatabaseDto

        try {
            fs.writeFileSync('/tmp/db_get.json', JSON.stringify(getBidsDatabaseDto))
        } catch (err) {
            console.error(err)
        }

        const get = await this.spawnable('docker',
            [
                'run',
                '-v',
                '/tmp:/input',
                '-v',
                `/tmp:/output`,
                '-v',
                '/Users/guspuhle/workdir/hip/frontend/bids-converter/scripts:/scripts',
                'bids-converter',
                '--command=db.get',
                '--input_data=/input/db_get.json',
                '--output_file=/output/output.json '
            ])

        if (get === 0) {
            const dbInfo = await fs.readFileSync(`/tmp/output.json`, 'utf8')

            return JSON.parse(dbInfo)
        }

        throw new InternalServerErrorException()
    }

    async createBidsDatabase(createBidsDatabaseDto: CreateBidsDatabaseDto) {

        const { owner } = createBidsDatabaseDto

        try {
            fs.writeFileSync('/tmp/db_create.json', JSON.stringify(createBidsDatabaseDto))
        } catch (err) {
            console.error(err)
        }

        const created = await this.spawnable('docker',
            [
                'run',
                '-v',
                '/tmp:/input',
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/output`,
                '-v',
                '/Users/guspuhle/workdir/hip/frontend/bids-converter/scripts:/scripts',
                'bids-converter',
                '--command=db.create',
                '--input_data=/input/db_create.json'
            ])

        if (created === 0) {
            const scan = await this.scanFiles(owner)

            if (scan === 0) {
                return createBidsDatabaseDto
            }
        }

        throw new InternalServerErrorException()
    }

    getSubject() { }

    async importSubject(createSubject: CreateSubjectDto) {

        const { owner } = createSubject

        try {
            fs.writeFileSync(`${process.env.PRIVATE_FILESYSTEM}/${owner}/files/sub_import.json`, JSON.stringify(createSubject))
        } catch (err) {
            throw new HttpException(err.message, err.status)
            console.error(err)
        }

        const created = await this.spawnable('docker',
            [
                'run',
                '-v',
                '/tmp:/importation_directory',
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/output`,
                '-v',
                '/Users/guspuhle/workdir/hip/frontend/bids-converter/scripts:/scripts',
                'bids-converter',
                '--command=sub.import',
                '--input_data=/input/sub_import.json'
            ])

        if (created === 0) {
            const scan = await this.scanFiles(owner)

            if (scan === 0) {
                return createSubject
            }
        }

        throw new InternalServerErrorException()

    }

    deleteSubject() { }


    private async scanFiles(owner: string): Promise<0 | 1> {
        const scanned = await this.spawnable('docker', [
            'exec',
            '--user',
            'www-data',
            'nextcloud-docker_app_1',
            'php',
            'occ',
            'files:scan',
            owner])

        return Promise.resolve(scanned)
    }

    private spawnable = (command, args): Promise<0 | 1> => {
        const child = spawn(command, args)

        return new Promise((resolve, reject) => {

            child.stdout.on('data', (data) => {
                console.log(`child stdout:\n${data}`)
            })

            child.stderr.on('data', (data) => {
                console.error(`child stderr:\n${data}`)
                return reject(data)
            })

            child.on('error', error => {
                return reject(error)
            })


            child.on('close', code => {
                // console.log('closed with code', code)
                if (code === 0) resolve(code)
            })
        })
    }

}
