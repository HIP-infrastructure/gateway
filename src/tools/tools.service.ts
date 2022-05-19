import { HttpService } from '@nestjs/axios'
import {
    HttpException,
    Injectable,
    InternalServerErrorException,
    Logger
} from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'

const userid = require('userid')
const { spawn } = require('child_process')
const fs = require('fs')

type DataError = {
    data?: Record<string, string>
    error?: Record<string, string>
}

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
    rounded: boolean
    attributes: {
        fileId: string
        path: string
    }
}

interface Group {
    id: number
    mount_point: string
    groups: object
    quota: number
    size: number
    acl: boolean
    manage: object
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
    private readonly logger = new Logger('ToolsService')
    private dataUser
    private dataUserId

    constructor(private readonly httpService: HttpService) {
        this.dataUser = process.env.DATA_USER
        const uid = parseInt(userid.uid(this.dataUser), 10)

        if (uid) this.dataUserId = uid
    }

    public async getBIDSDatabases(owner: string, headersIn: any) {
        try {
            const headers = {
                ...headersIn,
                accept: 'application/json, text/plain, */*',
            }
            const s = await this.search(headersIn, PARTICIPANTS_FILE)

            const searchResults = s?.entries
            // console.log(searchResults)
            const participantPromises = searchResults.map(s =>
                this.participantsWithPath(headers, s.attributes.path)
            )
            const results = await Promise.allSettled(participantPromises)
            const participantSearchFiltered = results
                .map((p, i) => ({ p, i })) // keep indexes
                .filter(item => item.p.status === 'fulfilled')
                .filter(
                    item => !/derivatives/.test(searchResults[item.i].attributes.path)
                )
                .map(item => ({
                    participants: (item.p as PromiseFulfilledResult<Participant[]>).value,
                    searchResult: searchResults[item.i],
                }))

            const bidsDatabasesPromises = participantSearchFiltered.map(ps =>
                this.getDatasetContent(
                    `${ps.searchResult.attributes.path.replace(
                        PARTICIPANTS_FILE,
                        ''
                    )}/dataset_description.json`,
                    headers
                )
            )
            const bidsDatabasesResults = await Promise.allSettled(
                bidsDatabasesPromises
            )
            const bidsDatabases: BIDSDatabase[] = bidsDatabasesResults.reduce(
                (arr, item, i) => [
                    ...arr,
                    item.status === 'fulfilled'
                        ? {
                            ...((item as PromiseFulfilledResult<DataError>).value.data ||
                                (item as PromiseFulfilledResult<DataError>).value.error),
                            id: participantSearchFiltered[
                                i
                            ].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
                            path: participantSearchFiltered[
                                i
                            ].searchResult.attributes.path.replace(PARTICIPANTS_FILE, '').substring(1),
                            resourceUrl: participantSearchFiltered[i].searchResult.resourceUrl.split('&')[0],
                            participants: participantSearchFiltered[i].participants,
                        }
                        : {},
                ],
                []
            )

            return { data: bidsDatabases }
        } catch (e: unknown) {
            console.log(e)
            return { error: e }
        }
    }

    public async createBidsDatabase(
        createBidsDatabaseDto: CreateBidsDatabaseDto, headers
    ) {
        const { owner, path } = createBidsDatabaseDto
        const uniquId = Date.now() + Math.random()
        const tmpDir = `/tmp/${uniquId}`

        try {
            fs.mkdirSync(tmpDir, true)
            fs.writeFileSync(
                `${tmpDir}/db_create.json`,
                JSON.stringify(createBidsDatabaseDto)
            )
        } catch (err) {
            console.error(err)
            throw new HttpException(err.message, err.status)
        }

        const dbMount = await this.filePath(headers, path, owner)
        const created = await this.spawnable('docker', [
            'run',
            '-v',
            `${tmpDir}:/input`,
            '-v',
            `${dbMount}:/output`,
            '-v',
            '/home/hipadmin/frontend/bids-converter/scripts:/scripts',
            'bids-converter',
            this.dataUser,
            this.dataUserId,
            '--command=db.create',
            '--input_data=/input/db_create.json',
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

    public async importSubject(createSubject: CreateSubjectDto, headers) {
        const { owner, path } = createSubject
        const uniquId = Date.now() + Math.random()
        const tmpDir = `/tmp/${uniquId}`

        try {
            fs.mkdirSync(tmpDir, true)
            fs.writeFileSync(
                `${tmpDir}/sub_import.json`,
                JSON.stringify(createSubject)
            )
        } catch (err) {
            console.error(err)
            throw new HttpException(err.message, err.status)
        }

        const dbMount = await this.filePath(headers, path, owner)
        const created = await this.spawnable('docker', [
            'run',
            '-v',
            `${tmpDir}:/import-data`,
            '-v',
            `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
            '-v',
            `${dbMount}:/output`,
            '-v',
            '/home/hipadmin/frontend/bids-converter/scripts:/scripts',
            'bids-converter',
            this.dataUser,
            this.dataUserId,
            '--command=sub.import',
            '--input_data=/import-data/sub_import.json',
        ])

        if (created === 0) {
            const scan = await this.scanFiles(owner)

            if (scan === 0) {
                return createSubject
            }
        }

        throw new InternalServerErrorException()
    }

    public async subEditClinical(
        editSubjectClinicalDto: EditSubjectClinicalDto,
        headers
    ) {
        // throw new HttpException('err.message', 501)
        let { owner, path } = editSubjectClinicalDto
        const uniquId = Date.now() + Math.random()
        const tmpDir = `/tmp/${uniquId}`

        try {
            fs.mkdirSync(tmpDir, true)
            fs.writeFileSync(
                `${tmpDir}/sub_edit_clinical.json`,
                JSON.stringify(editSubjectClinicalDto)
            )
        } catch (err) {
            console.error(err)
            throw new HttpException(err.message, err.status)
        }
 
        const dbMount = await this.filePath(headers, path, owner)
        const dockerCmd = [
            'run',
            '-v',
            `${tmpDir}:/import-data`,
            '-v',
            `${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
            '-v',
            `${dbMount}:/output`,
            '-v',
            '/home/hipadmin/frontend/bids-converter/scripts:/scripts',
            'bids-converter',
            this.dataUser,
            this.dataUserId,
            '--command=sub.edit.clinical',
            '--input_data=/import-data/sub_edit_clinical.json',
        ]

        const created = await this.spawnable('docker', dockerCmd)

        if (created === 0) {
            return editSubjectClinicalDto
        }

        throw new InternalServerErrorException()
    }

    public deleteSubject() { }

    public async participants(headersIn: any, path: string, owner?: string) {
        const nextPath = `${path}/${PARTICIPANTS_FILE}`

        return this.participantsWithPath(headersIn, nextPath)
    }

    public async search(headersIn: any, term: string): Promise<ISearch> {
        const headers = {
            ...headersIn,
            accept: 'application/json, text/plain, */*',
        }

        const response = this.httpService.get(
            `${process.env.PRIVATE_WEBDAV_URL}/ocs/v2.php/search/providers/files/search?term=${term}&cursor=0&limit=100`,
            { headers }
        )

        return firstValueFrom(response).then(r => r.data.ocs.data)
        // return response.pipe(
        // 	map(response => response.data.ocs.data),
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
            owner,
        ])

        return Promise.resolve(scanned)
    }

    private spawnable = (command, args): Promise<0 | 1> => {
        const child = spawn(command, args)

        return new Promise((resolve, reject) => {
            child.stdout.on('data', data => {
                console.log(`child stdout:\n${data}`)
            })

            child.stderr.on('data', data => {
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

    private async participantsWithPath(
        headersIn: any,
        path: string,
        owner?: string
    ) {
        try {
            const tsv = await this.getFileContent(path, headersIn)
            const [headers, ...rows] = tsv
                .trim()
                .split('\n')
                .map(r => r.split('\t'))

            const participants: Participant[] = rows.reduce(
                (arr, row) => [
                    ...arr,
                    row.reduce(
                        (obj, item, i) => Object.assign(obj, { [headers[i].trim()]: item }),
                        {}
                    ),
                ],
                []
            )

            return participants
        } catch (e) {
            console.log(e)
            throw new HttpException(e.message, e.status)
        }
    }

    private async getDatasetContent(
        path: string,
        headersIn: any
    ): Promise<DataError> {
        const response = this.httpService.get(
            `${process.env.PRIVATE_WEBDAV_URL}/apps/hip/document/file?path=${path}`,
            { headers: headersIn }
        )

        const data = await firstValueFrom(response).then(r => r.data)
        const cleaned = data.replace(/\\n/g, '').replace(/\\/g, '')

        try {
            return { data: JSON.parse(cleaned) }
        } catch (e) {
            console.log(e)
            return { error: e.message }
        }
    }

    /**
     * It takes a path and a set of headers, and returns the contents of the file at that path
     * @param {string} path - the path to the file you want to get
     * @param {any} headersIn - This is the headers that you need to pass to the webdav server.
     * @returns The file content
     */
    private getFileContent(path: string, headersIn: any): Promise<string> {
        try {
            const response = this.httpService.get(
                `${process.env.PRIVATE_WEBDAV_URL}/apps/hip/document/file?path=${path}`,
                {
                    headers: headersIn,
                }
            )

            return firstValueFrom(response).then(r => r.data)
        } catch (e) {
            console.log(e)
            throw new HttpException(e.message, e.status)
        }
    }

    /* A private method that is used to get the file path, either user based or for a group */
    private async filePath(headers: any, path: string, owner: string) {
        try {
            console.log({ path })

            const groups = await this.groups(headers)
            console.log({ groups })
            const rootPath = path.split('/')[0]
            const id = groups.find(g => g.mount_point === rootPath)?.id
            console.log({ rootPath, id })
            const dbMount = id ?
                `${process.env.PRIVATE_FILESYSTEM}/__groupfolders/${id}/${path.replace(`${rootPath}/`, '')}` :
                `${process.env.PRIVATE_FILESYSTEM}/${owner}/files/${path}`
            console.log({ path }, { rootPath }, { id }, { dbMount })

            return dbMount
        } catch (error) {
            console.log(error)
            throw new HttpException('Couldn\'t find path', error.status)
        }
    }

    /**
     * It makes a GET request to the Nextcloud API to get a list of groups
     * @param {any} headersIn - The headers that are passed in from the controller.
     * @returns An array of groups
     */
    private groups(headersIn: any): Promise<any> {
        console.log({ headersIn })

        try {
            const response = this.httpService.get(
                `${process.env.PRIVATE_WEBDAV_URL}/apps/groupfolders/folders?format=json`,
                {
                    headers: {
                        'OCS-APIRequest': true,
                        ...headersIn,
                    },
                }
            )

            return firstValueFrom(response).then(r => Object.values(r.data.ocs.data))
        } catch (e) {
            console.log(e)
            throw new HttpException(e.message, e.status)
        }
    }
}
