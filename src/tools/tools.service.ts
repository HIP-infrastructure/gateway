import { HttpService } from '@nestjs/axios'
import { HttpException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'

import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { GetBidsDatabaseDto } from './dto/get-bids-database.dto'

const { spawn } = require('child_process')
const fs = require('fs')

type DataError = { data?: Record<string, string>; error?: Record<string, string> }

const DATASET_DESCRIPTION = 'dataset_description.json'
const PARTICIPANTS_FILE = 'participants.tsv'
interface ISearch {
    name: string
    isPaginated: true
    entries: ISearchResult[]
}

interface ISearchResult {
    thumbnailUrl: string
    title: string
    subline: string
    resourceUrl: string
    icon: string
    rounded: boolean,
    attributes: {
        fileId: string
        path: string
    }
}
export interface Participant {
    age?: string
    sex?: string
    [key: string]: string | number
}
export interface BIDSDatabase {
    Name?: string
    BIDSVersion?: string
    Licence?: string
    Authors?: string[]
    Acknowledgements?: string
    HowToAcknowledge?: string
    Funding?: string[]
    ReferencesAndLinks?: string[]
    DatasetDOI?: string
}

@Injectable()
export class ToolsService {

    constructor(private readonly httpService: HttpService) { }

    private logger = new Logger('ToolsService')

    // public async getBIDSDatabase(getBidsDatabaseDto: GetBidsDatabaseDto) {
    //     const { owner, path } = getBidsDatabaseDto

    //     try {
    //         fs.writeFileSync('/tmp/db_get.json', JSON.stringify(getBidsDatabaseDto))
    //     } catch (err) {
    //         console.error(err)
    //     }

    //     const get = await this.spawnable('docker',
    //         [
    //             'run',
    //             '-v',
    //             '/tmp:/input',
    //             '-v',
    //             `/tmp:/output`,
    //             '-v',
    //             '/Users/guspuhle/workdir/hip/frontend/bids-converter/scripts:/scripts',
    //             'bids-converter',
    //             '--command=db.get',
    //             '--input_data=/input/db_get.json',
    //             '--output_file=/output/output.json '
    //         ])

    //     if (get === 0) {
    //         const dbInfo = await fs.readFileSync(`/tmp/output.json`, 'utf8')

    //         return JSON.parse(dbInfo)
    //     }

    //     throw new InternalServerErrorException()
    // }

    public async getBIDSDatabases(owner: string, headersIn: any) {
        try {
            // console.time('getBIDSDatabases')
            const headers = {
                ...headersIn,
                "accept": "application/json, text/plain, */*"
            }
            const s = await this.search(headersIn, DATASET_DESCRIPTION)

            const searchResults = s?.entries.filter(s => !/derivatives/.test(s.subline))
            // console.timeLog('getBIDSDatabases', searchResults.map(s => s.title))
            const bidsDatabasesPromises = await searchResults.map((ps) =>
                this.getDatasetContent(`${ps.attributes.path}`, owner))
            const bidsDatabasesResults = await Promise.allSettled(bidsDatabasesPromises)
            // console.timeLog('getBIDSDatabases', 'bidsDatabasesResults')
            const bidsDatabases: BIDSDatabase[] = bidsDatabasesResults
                .reduce((arr, item, i) => [...arr, item.status === 'fulfilled' ? ({
                    ...((item as PromiseFulfilledResult<DataError>).value.data || (item as PromiseFulfilledResult<DataError>).value.error),
                    path: searchResults[i].attributes.path.replace(`/${DATASET_DESCRIPTION}`, '')
                }) : {}], [])
            // console.timeEnd('getBIDSDatabases')
            // const s = await this.search(headersIn, PARTICIPANTS_FILE)
            // const searchResults = s?.entries.filter(s => !/derivatives/.test(s.subline))

            // const participantPromises = searchResults.map(s => this.readBIDSParticipants(s.attributes.path, headers))
            // const results = await Promise.allSettled(participantPromises)
            // const participantSearchFiltered = results
            // 	.map((p, i) => ({ p, i })) // keep indexes
            // 	.filter(item => item.p.status === 'fulfilled')
            // 	.map(item => ({
            // 		participants: (item.p as PromiseFulfilledResult<Participant[]>).value,
            // 		searchResult: searchResults[item.i]
            // 	}))


            // const bidsDatabasesPromises = await participantSearchFiltered.map((ps) => this.getDatasetContent(`${ps.searchResult.attributes.path.replace(PARTICIPANTS_FILE, '')}/dataset_description.json`, headers))
            // const bidsDatabasesResults = await Promise.allSettled(bidsDatabasesPromises)
            // const bidsDatabases: BIDSDatabase[] = bidsDatabasesResults
            // 	.reduce((arr, item, i) => [...arr, item.status === 'fulfilled' ? ({
            // 		...((item as PromiseFulfilledResult<DataError>).value.data || (item as PromiseFulfilledResult<DataError>).value.error),
            // 		id: participantSearchFiltered[i].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
            // 		Path: participantSearchFiltered[i].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
            // 		ResourceUrl: participantSearchFiltered[i].searchResult.resourceUrl.split('&')[0],
            // 		Participants: participantSearchFiltered[i].participants
            // 	}) : {}], [])

            return { data: bidsDatabases }
        } catch (e: unknown) {
            console.log(e)
            return { error: e }
        }
    }

    public async createBidsDatabase(createBidsDatabaseDto: CreateBidsDatabaseDto) {
        const { owner, path } = createBidsDatabaseDto
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
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files${path}:/output`,
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

    public async importSubject(createSubject: CreateSubjectDto) {
        const { owner, path } = createSubject

        console.log([
            'run',
            '-v',
            `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
            '-v',
            `${process.env.PRIVATE_FILESYSTEM}/${owner}/files/${path}:/output`,
            '-v',
            '/Users/guspuhle/workdir/hip/frontend/bids-converter/scripts:/scripts',
            'bids-converter',
            '--command=sub.import',
            '--input_data=/input/sub_import.json'
        ].join(' '))


        try {
            fs.writeFileSync(`${process.env.PRIVATE_FILESYSTEM}/${owner}/files/sub_import.json`, JSON.stringify(createSubject))
        } catch (err) {
            console.error(err)
            throw new HttpException(err.message, err.status)
        }

        const created = await this.spawnable('docker',
            [
                'run',
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files/${path}:/output`,
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

    public async editClinical(editSubjectClinicalDto: EditSubjectClinicalDto) {
        const { owner, path } = editSubjectClinicalDto

        try {
            fs.writeFileSync(`${process.env.PRIVATE_FILESYSTEM}/${owner}/files/sub_edit_clinical.json`, JSON.stringify(editSubjectClinicalDto))
        } catch (err) {
            console.error(err)
            throw new HttpException(err.message, err.status)
        }

        const created = await this.spawnable('docker',
            [
                'run',
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files${path}:/output`,
                '-v',
                '/Users/guspuhle/workdir/hip/frontend/bids-converter/scripts:/scripts',
                'bids-converter',
                '--command=sub.edit.clinical',
                '--input_data=/input/sub_edit_clinical.json'
            ])


        if (created === 0) {
            const scan = await this.scanFiles(owner)

            if (scan === 0) {
                return editSubjectClinicalDto
            }
        }

        throw new InternalServerErrorException()
    }

    public deleteSubject() { }

    public async participants(headersIn: any, path: string, owner: string) {
        const nextPath = `${process.env.PRIVATE_FILESYSTEM}/${owner}/files${path}/${PARTICIPANTS_FILE}`
        console.log(nextPath)
        try {
            const data = fs.readFileSync(nextPath, 'utf-8')
            const [headers, ...rows] = data
                .trim()
                .split('\n')
                .map(r => r.split('\t'))

            const participants: Participant[] = rows.reduce((arr, row) => [
                ...arr,
                row.reduce((obj, item, i) => Object.assign(obj, ({ [headers[i].trim()]: item })), {})
            ], [])

            return participants
        } catch (e) {
            throw new HttpException(e.message, e.status)
        }
    }

    public async search(headersIn: any, term: string,): Promise<ISearch> {
        const headers = {
            ...headersIn,
            "accept": "application/json, text/plain, */*"
        }

        const response = this.httpService.get(`${process.env.PRIVATE_WEBDAV_URL}/ocs/v2.php/search/providers/files/search?term=${term}&cursor=0&limit=100`,
            { headers }
        )

        return firstValueFrom(response).then(r => r.data.ocs.data)
        // .pipe(
        // 	map(response => response.data),
        // 	catchError(e => {
        // 		throw new HttpException(e.response.data, e.response.status)
        // 	})
        // )
    }

    private async scanFiles(owner: string): Promise<0 | 1> {
        const scanned = await this.spawnable('docker', [
            'exec',
            '--user',
            'www-data',
            'nextcloud-docker-app-1',
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
                console.log(`child stderr:\n${data}`)
                // return reject(data)
            })

            child.on('error', error => {
                console.log(`child stderr:\n${error}`)
                // return reject(error)
            })


            child.on('close', code => {
                // console.log('closed with code', code)
                if (code === 0) resolve(code)

                else reject(code)
            })
        })
    }

    private async getDatasetContent(path: string, owner: string): Promise<DataError> {
        console.time(path)
        const nextPath = `${process.env.PRIVATE_FILESYSTEM}/${owner}/files${path}`
        try {
            const data = fs.readFileSync(nextPath, 'utf-8')
            const cleaned = data.replace(/\\n/g, '').replace(/\\/g, '')
            console.timeEnd(path)
            try {
                return ({ data: JSON.parse(cleaned) })
            } catch (e) {
                console.log(e.message)
                // throw new HttpException(e.message, e.status)

                return ({ error: e })
            }
        } catch (err) {
            console.error(err)
        }
    }
}
