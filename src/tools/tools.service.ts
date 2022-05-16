import { HttpService } from '@nestjs/axios'
import { HttpException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'

import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { GetBidsDatabaseDto } from './dto/get-bids-database.dto'
const userid = require('userid')


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

    private dataUser
    private dataUserId

    constructor(private readonly httpService: HttpService) {
        this.dataUser = process.env.DATA_USER
        const uid = parseInt(userid.uid(this.dataUser), 10)

        if (uid) this.dataUserId = uid
    }

    private logger = new Logger('ToolsService')

    public async getBIDSDatabases(owner: string, headersIn: any) {
        try {
            const headers = {
                ...headersIn,
                "accept": "application/json, text/plain, */*"
            }
            const s = await this.search(headersIn, PARTICIPANTS_FILE)

            const searchResults = s?.entries
            // console.log(searchResults)
            const participantPromises = searchResults.map(s => this.participantsWithPath(headers, s.attributes.path))
            const results = await Promise.allSettled(participantPromises)
            const participantSearchFiltered = results
                .map((p, i) => ({ p, i })) // keep indexes
                .filter(item => item.p.status === 'fulfilled')
                .filter(item => !/derivatives/.test(searchResults[item.i].attributes.path))
                .map(item => ({
                    participants: (item.p as PromiseFulfilledResult<Participant[]>).value,
                    searchResult: searchResults[item.i]
                }))

            const bidsDatabasesPromises = await participantSearchFiltered.map((ps) => this.getDatasetContent(`${ps.searchResult.attributes.path.replace(PARTICIPANTS_FILE, '')}/dataset_description.json`, headers))
            const bidsDatabasesResults = await Promise.allSettled(bidsDatabasesPromises)
            const bidsDatabases: BIDSDatabase[] = bidsDatabasesResults
                .reduce((arr, item, i) => [...arr, item.status === 'fulfilled' ? ({
                    ...((item as PromiseFulfilledResult<DataError>).value.data || (item as PromiseFulfilledResult<DataError>).value.error),
                    id: participantSearchFiltered[i].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
                    path: participantSearchFiltered[i].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
                    // ResourceUrl: participantSearchFiltered[i].searchResult.resourceUrl.split('&')[0],
                    Participants: participantSearchFiltered[i].participants
                }) : {}], [])

            return { data: bidsDatabases }
        } catch (e: unknown) {
            console.log(e)
            return { error: e }
        }
    }

    public async createBidsDatabase(createBidsDatabaseDto: CreateBidsDatabaseDto) {
        const { owner, path } = createBidsDatabaseDto
        const uniquId = Date.now() + Math.random()
        const tmpDir = `/tmp/${uniquId}`

        try {
            fs.mkdirSync(tmpDir, true)
            fs.writeFileSync(`${tmpDir}/db_create.json`, JSON.stringify(createBidsDatabaseDto))
        } catch (err) {
            console.error(err)
            throw new HttpException(err.message, err.status)
        }

        const created = await this.spawnable('docker',
            [
                'run',
                '-v',
                `${tmpDir}:/input`,
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files${path}:/output`,
                '-v',
                '/home/hipadmin/frontend/bids-converter/scripts:/scripts',
                'bids-converter',
                this.dataUser,
                this.dataUserId,
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
        const uniquId = Date.now() + Math.random()
        const tmpDir = `/tmp/${uniquId}`


        try {
            fs.mkdirSync(tmpDir, true)
            fs.writeFileSync(`${tmpDir}/sub_import.json`, JSON.stringify(createSubject))
        } catch (err) {
            console.error(err)
            throw new HttpException(err.message, err.status)
        }

        const created = await this.spawnable('docker',
            [
                'run',
                '-v',
                `${tmpDir}:/import-data`,
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
                '-v',
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files/${path}:/output`,
                '-v',
                '/home/hipadmin/frontend/bids-converter/scripts:/scripts',
                'bids-converter',
                this.dataUser,
                this.dataUserId,
                '--command=sub.import',
                '--input_data=/import-data/sub_import.json'
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
                '/home/hipadmin/frontend/bids-converter/scripts:/scripts',
                'bids-converter',
                this.dataUser,
                this.dataUserId,
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

    public async participants(headersIn: any, path: string, owner?: string) {
        const nextPath = `${path}/${PARTICIPANTS_FILE}`

        return this.participantsWithPath(headersIn, nextPath)
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
            `${this.dataUserId}:${this.dataUserId}`,
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

    private async participantsWithPath(headersIn: any, path: string, owner?: string) {
        try {
            const tsv = await this.getFileContent(path, headersIn)
            const [headers, ...rows] = tsv
                .trim()
                .split('\n')
                .map(r => r.split('\t'))

            const participants: Participant[] = rows.reduce((arr, row) => [
                ...arr,
                row.reduce((obj, item, i) =>
                    Object.assign(obj, ({ [headers[i].trim()]: item })), {})
            ], [])

            return participants
        } catch (e) {
            console.log(e)
            throw new HttpException(e.message, e.status)
        }
    }

    private async getDatasetContent(path: string, headersIn: any): Promise<DataError> {
        const response = await this.httpService.get(`${process.env.PRIVATE_WEBDAV_URL}/apps/hip/document/file?path=${path}`,
            { headers: headersIn })
            .toPromise()

        const data = response.data
        const cleaned = data.replace(/\\n/g, '').replace(/\\/g, '')

        try {
            return ({ data: JSON.parse(cleaned) })
        } catch (e) {
            console.log(e)
            return ({ error: e.message })
        }
    }

    private async getFileContent(path: string, headersIn: any): Promise<string> {
        try {
            const response = await this.httpService.get(`${process.env.PRIVATE_WEBDAV_URL}/apps/hip/document/file?path=${path}`,
                {
                    headers: headersIn
                })
                .toPromise()

            return await response.data
        } catch (e) {
            console.log(e)
            throw new HttpException(e.message, e.status)
        }

    }
}
