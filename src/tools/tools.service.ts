import { firstValueFrom } from 'rxjs'

import { mappings } from '../mappings/datasets_mapping.json'

import { HttpService } from '@nestjs/axios'
import {
	BadRequestException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common'
import { Client, RequestParams, ApiResponse } from '@elastic/elasticsearch'

import { GroupFolder, NextcloudService } from 'src/nextcloud/nextcloud.service'
import { BidsGetSubjectDto } from './dto/bids-get-subject.dto'
import { CreateBidsDatasetDto } from './dto/create-bids-dataset.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { BidsGetDatasetDto } from './dto/get-bids-dataset.dto'
import { CreateBidsDatasetParticipantsTsvDto } from './dto/create-bids-dataset-participants-tsv.dto'
import { writeFileSync } from 'fs'
// import { Dataset } from './entities/dataset.entity'

const userIdLib = require('userid')
const { spawn } = require('child_process')
const fs = require('fs')
const papa = require('papaparse')
const path = require('path')

type DataError = {
	data?: Record<string, string>
	error?: Record<string, string>
}

const NC_SEARCH_PATH = '/ocs/v2.php/search/providers/files/search'
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
export interface BIDSDataset {
	id?: string
	version?: number
	Name?: string
	BIDSVersion?: string
	License?: string
	Authors?: string[]
	Acknowledgements?: string
	HowToAcknowledge?: string
	Funding?: string[]
	ReferencesAndLinks?: string[]
	DatasetDOI?: string
	Path?: string
	Owner?: string
	Groups?: GroupFolder[]
	CreationDate?: Date
	LastModificationDate?: Date
}

const editScriptCmd = ['-v', `${process.env.BIDS_SCRIPTS}:/scripts`]

const isFulfilled = <T>(
	p: PromiseSettledResult<T>
): p is PromiseFulfilledResult<T> => p.status === 'fulfilled'

@Injectable()
export class ToolsService {
	private readonly logger = new Logger('ToolsService')
	private dataUser: string
	private dataUserId
	private elastic_client: Client
	private readonly es_index_datasets =
		process.env.ELASTICSEARCH_BIDS_DATASETS_INDEX

	constructor(
		private readonly httpService: HttpService,
		private readonly nextcloudService: NextcloudService
	) {
		this.dataUser = process.env.DATA_USER
		const uid = parseInt(userIdLib.uid(this.dataUser), 10)

		if (uid) this.dataUserId = uid

		// create a new client to our elasticsearch node
		const es_opt = {
			node: `${process.env.ELASTICSEARCH_URL}`,
		}
		this.elastic_client = new Client(es_opt)
	}

	// public async getBIDSDatasets({ cookie }) {
	// 	try {
	// 		const s = await this.search(cookie, PARTICIPANTS_FILE)
	// 		const searchResults = s?.entries
	// 		const participantPromises = searchResults.map(r =>
	// 			this.participantsWithPath(r.attributes.path, cookie)
	// 		)
	// 		const results = await Promise.allSettled(participantPromises)
	// 		const participantSearchFiltered = results
	// 			.map((p, i) => ({ p, i })) // keep indexes
	// 			.filter(item => item.p.status === 'fulfilled')
	// 			.filter(
	// 				item => !/derivatives/.test(searchResults[item.i].attributes.path)
	// 			)
	// 			.map(item => ({
	// 				participants: (item.p as PromiseFulfilledResult<Participant[]>).value,
	// 				searchResult: searchResults[item.i],
	// 			}))
	// 		const bidsDatasetsPromises = participantSearchFiltered.map(ps =>
	// 			this.getDatasetContent(
	// 				`${ps.searchResult.attributes.path.replace(
	// 					PARTICIPANTS_FILE,
	// 					''
	// 				)}/${DATASET_DESCRIPTION}`,
	// 				cookie
	// 			)
	// 		)
	// 		const bidsDatasetsResults = await Promise.allSettled(bidsDatasetsPromises)
	// 		const bidsDatasets: BIDSDataset[] = bidsDatasetsResults.reduce(
	// 			(arr, item, i) => [
	// 				...arr,
	// 				item.status === 'fulfilled'
	// 					? {
	// 							...(item.value.data || item.value.error),
	// 							id: participantSearchFiltered[
	// 								i
	// 							].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
	// 							path: participantSearchFiltered[i].searchResult.attributes.path
	// 								.replace(PARTICIPANTS_FILE, '')
	// 								.substring(1),
	// 							resourceUrl:
	// 								participantSearchFiltered[i].searchResult.resourceUrl.split(
	// 									'&'
	// 								)[0],
	// 							participants: participantSearchFiltered[i].participants,
	// 					  }
	// 					: {},
	// 			],
	// 			[]
	// 		)

	// 		return bidsDatasets
	// 	} catch (e) {
	// 		this.logger.error(e)
	// 		throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
	// 	}
	// }

	public async genBIDSDatasetsIndexedContent(owner: string, paths: string[]) {
		try {
			const bidsGetDatasetsDto = paths.map(path => {
				const bidsGetDatasetDto = new BidsGetDatasetDto()
				bidsGetDatasetDto.owner = owner
				bidsGetDatasetDto.path = path
				return bidsGetDatasetDto
			})
			const bidsDatasets = await this.getDatasetsIndexedContent(
				bidsGetDatasetsDto
			)
			return bidsDatasets
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async sendElasticSearchDatasetsBulk(bidsDatasets: BIDSDataset[]) {
		// create body for elasticsearch bulk to index the datasets
		const body = bidsDatasets.flatMap((dataset: BIDSDataset) => [
			{
				index: {
					_index: this.es_index_datasets,
					_id: dataset.id,
				},
			},
			dataset,
		])
		// index the datasets
		const { body: bulkResponse } = await this.elastic_client.bulk({
			refresh: true,
			body,
		})
		if (bulkResponse.errors) {
			this.logger.error('Errors for (re)indexing datasets')
			for (let it of bulkResponse.items) {
				if (it.index.status === 400)
					this.logger.error(JSON.stringify(it.index, null, 4))
			}
		}
		// count indexed data
		const { body: count } = await this.elastic_client.count({
			index: this.es_index_datasets,
		})
		this.logger.debug({ count })
	}

	public async addNewBIDSDatasetIndexedContents(
		owner: string,
		datasetRelPaths: string[]
	) {
		// generate content to index of each dataset not indexed
		const bidsDatasets = await this.genBIDSDatasetsIndexedContent(
			owner,
			datasetRelPaths
		)
		const ownerGroups = await this.nextcloudService.groupFoldersForUserId(owner)

		// Generate initial dataset ID
		let { datasetId, datasetIdNum } = await this.generateDatasetId(owner)
		for (let index in bidsDatasets) {
			bidsDatasets[index].Path = await this.filePath(
				datasetRelPaths[index],
				owner
			)
			bidsDatasets[index].Owner = owner
			bidsDatasets[index].Groups = ownerGroups
			bidsDatasets[index].CreationDate = new Date()
			// use autogenerated dataset id
			bidsDatasets[index].id = datasetId
			bidsDatasets[index].version = 1
			// generate id for next dataset
			datasetIdNum++
			;({ datasetId, datasetIdNum } = await this.generateDatasetId(
				owner,
				datasetIdNum
			))
		}
		// create and send elasticsearch bulk to index the datasets
		await this.sendElasticSearchDatasetsBulk(bidsDatasets)
		return bidsDatasets
	}

	public async addNewGroupBIDSDatasetIndexedContents(
		owner: string,
		datasetRelPaths: string[],
		datasetIds: string[]
	) {
		// generate content to index of each dataset not indexed
		const bidsDatasets = await this.genBIDSDatasetsIndexedContent(
			owner,
			datasetRelPaths
		)
		const ownerGroups = await this.nextcloudService.groupFoldersForUserId(owner)
		for (let index in bidsDatasets) {
			bidsDatasets[index].Path = await this.filePath(
				datasetRelPaths[index],
				owner
			)
			bidsDatasets[index].Owner = owner
			bidsDatasets[index].Groups = ownerGroups
			bidsDatasets[index].CreationDate = new Date()
			bidsDatasets[index].LastModificationDate =
				bidsDatasets[index].CreationDate
			bidsDatasets[index].id = datasetIds[index]
			bidsDatasets[index].version = 1
		}
		// create and send elasticsearch bulk to index the datasets
		await this.sendElasticSearchDatasetsBulk(bidsDatasets)
		return bidsDatasets
	}

	public async updateBIDSDatasetIndexedContents(
		owner: string,
		datasetRelPaths: string[],
		datasetIds: string[]
	) {
		// generate content to index of each dataset not indexed
		const bidsDatasets = await this.genBIDSDatasetsIndexedContent(
			owner,
			datasetRelPaths
		)
		/* 
		const ownerGroups = await this.nextcloudService.groupFoldersForUserId(
			owner
		)
		*/
		for (let index in bidsDatasets) {
			bidsDatasets[index].Path = await this.filePath(
				datasetRelPaths[index],
				owner
			)
			// bidsDatasets[index].Owner = owner
			// bidsDatasets[index].Groups = ownerGroups
			bidsDatasets[index].LastModificationDate = new Date()
			bidsDatasets[index].id = datasetIds[index]
			bidsDatasets[index].version = 1
		}
		// create and send elasticsearch bulk to index the datasets
		await this.sendElasticSearchDatasetsBulk(bidsDatasets)
		return bidsDatasets
	}

	public splitPrivateGroupDatasetsNotIndexed(
		filteredFoundDatasetsNotIndexed: string[],
		filteredFoundDatasetNamesNotIndexed: string[],
		groupFolders: GroupFolder[]
	) {
		let foundPrivateDatasetsNotIndexed: string[] = []
		let foundGroupDatasetsNotIndexed: string[] = []
		let foundPrivateDatasetNamesNotIndexed: string[] = []
		let foundGroupDatasetNamesNotIndexed: string[] = []
		for (let index in filteredFoundDatasetsNotIndexed) {
			// Update the lists of datasets found in private and group space
			let isContainedInGroupFolder = false
			for (let groupFolder of groupFolders) {
				if (
					filteredFoundDatasetsNotIndexed[index].includes(groupFolder.label)
				) {
					this.logger.log(
						`groupDatasetFound: ${filteredFoundDatasetsNotIndexed[index]}`
					)
					isContainedInGroupFolder = true
					break
				}
			}
			if (isContainedInGroupFolder) {
				foundGroupDatasetsNotIndexed.push(
					filteredFoundDatasetsNotIndexed[index]
				)
				foundGroupDatasetNamesNotIndexed.push(
					filteredFoundDatasetNamesNotIndexed[index]
				)
			} else {
				foundPrivateDatasetsNotIndexed.push(
					filteredFoundDatasetsNotIndexed[index]
				)
				foundPrivateDatasetNamesNotIndexed.push(
					filteredFoundDatasetNamesNotIndexed[index]
				)
			}
		}
		return {
			foundPrivateDatasetsNotIndexed,
			foundPrivateDatasetNamesNotIndexed,
			foundGroupDatasetsNotIndexed,
			foundGroupDatasetNamesNotIndexed,
		}
	}

	public extractAndSplitPrivateGroupDatasetsNotIndexed(
		foundDatasets: any[],
		foundDatasetPaths: string[],
		foundDatasetIDs: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		// find all datasets that are not indexed yet
		const foundDatasetsNotIndexed = foundDatasetPaths.map((val, index) => {
			if (
				foundDatasetIDs[index] === null &&
				foundRenamedDatasetIDs[index] === null
			)
				return val
		})
		this.logger.debug({ foundDatasetsNotIndexed })
		// get content of dataset_description.json for all datasets that are not indexed yet
		const foundDatasetNamesNotIndexed = foundDatasets.map((val, index) => {
			if (
				foundDatasetIDs[index] === null &&
				foundRenamedDatasetIDs[index] === null
			) {
				this.logger.debug(JSON.stringify(foundDatasets[index], null, 4))
				return foundDatasets[index].Name
			}
		})
		// this.logger.debug({ foundDatasetNamesNotIndexed })
		// filter null
		const filteredFoundDatasetsNotIndexed = foundDatasetsNotIndexed.flatMap(f =>
			f ? [f] : []
		)
		const filteredFoundDatasetNamesNotIndexed =
			foundDatasetNamesNotIndexed.flatMap(f => (f ? [f] : []))

		// split private datasets own by the user and datasets in user group folders
		const {
			foundPrivateDatasetsNotIndexed,
			foundPrivateDatasetNamesNotIndexed,
			foundGroupDatasetsNotIndexed,
			foundGroupDatasetNamesNotIndexed,
		} = this.splitPrivateGroupDatasetsNotIndexed(
			filteredFoundDatasetsNotIndexed,
			filteredFoundDatasetNamesNotIndexed,
			groupFolders
		)

		return {
			foundPrivateDatasetsNotIndexed,
			foundPrivateDatasetNamesNotIndexed,
			foundGroupDatasetsNotIndexed,
			foundGroupDatasetNamesNotIndexed,
		}
	}

	public extractAndSplitPrivateGroupDatasetsDuplicated(
		foundDuplicatedDatasetPaths: string[],
		groupFolders: GroupFolder[]
	) {
		// filter null from the list of duplicate path
		const filteredFoundDatasetsDuplicated = foundDuplicatedDatasetPaths.flatMap(
			f => (f ? [f] : [])
		)
		// differentiate private datasets own by the user and datasets in user group folders
		let foundPrivateDatasetsDuplicated: string[] = []
		let foundGroupDatasetsDuplicated: string[] = []
		for (let index in filteredFoundDatasetsDuplicated) {
			// Update the lists of datasets found in private and group space
			let isContainedInGroupFolder = false
			for (let groupFolder of groupFolders) {
				if (
					filteredFoundDatasetsDuplicated[index].includes(groupFolder.label)
				) {
					this.logger.log(
						`groupDatasetFound: ${filteredFoundDatasetsDuplicated[index]}`
					)
					isContainedInGroupFolder = true
					break
				}
			}
			if (isContainedInGroupFolder) {
				foundGroupDatasetsDuplicated.push(
					filteredFoundDatasetsDuplicated[index]
				)
			} else {
				foundPrivateDatasetsDuplicated.push(
					filteredFoundDatasetsDuplicated[index]
				)
			}
		}
		return { foundPrivateDatasetsDuplicated, foundGroupDatasetsDuplicated }
	}

	public extractAndSplitPrivateGroupRenamedDatasets(
		foundDatasetPaths: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		// find all dataset paths which has changed
		const foundRenamedDatasets = foundDatasetPaths.map((val, index) => {
			if (foundRenamedDatasetIDs[index]) return val
		})
		this.logger.debug({ foundRenamedDatasets })
		// filter null in foundRenamedDatasets
		const filteredFoundRenamedDatasets = foundRenamedDatasets.flatMap(f =>
			f ? [f] : []
		)
		// filter null in foundRenamedDatasetIDs
		const filteredFoundRenamedDatasetIDs = foundRenamedDatasetIDs.flatMap(f =>
			f ? [f] : []
		)
		// differentiate private datasets own by the user and datasets in user group folders
		let foundPrivateRenamedDatasets = Object.assign(
			[],
			filteredFoundRenamedDatasets
		)
		let foundGroupRenamedDatasets: string[] = []
		let foundPrivateRenamedDatasetIDs = Object.assign(
			[],
			filteredFoundRenamedDatasetIDs
		)
		let foundGroupRenamedDatasetIDs: string[] = []
		foundPrivateRenamedDatasets.forEach((item, index) => {
			// Update the lists of datasets found in private and group spaces
			for (let groupFolder of groupFolders) {
				if (foundPrivateRenamedDatasets[index].includes(groupFolder.label)) {
					this.logger.log(
						`groupDatasetFound: ${foundPrivateRenamedDatasets[index]}`
					)
					foundPrivateRenamedDatasets.splice(index, 1)
					foundGroupRenamedDatasets.push(item)
					foundPrivateRenamedDatasetIDs.splice(index, 1)
					foundGroupRenamedDatasetIDs.push(item)
					break
				}
			}
		})
		return {
			foundPrivateRenamedDatasets,
			foundPrivateRenamedDatasetIDs,
			foundGroupRenamedDatasets,
			foundGroupRenamedDatasetIDs,
		}
	}

	public async parseSearchDatasetsResultsForRefresh(
		owner: string,
		searchDatasetsResults: any[]
	) {
		// get list of found dataset paths
		const foundDatasetPaths = searchDatasetsResults.map(r => {
			const path = `${r.attributes.path
				.replace('/' + PARTICIPANTS_FILE, '')
				.substring(1)}`
			return path
		})

		// extract dataset_description.json content for each dataset found
		let foundDatasets = []
		for (let index in foundDatasetPaths) {
			const dataset_desc_abspath = await this.filePath(
				foundDatasetPaths[index] + '/' + DATASET_DESCRIPTION,
				owner
			)
			const dataset = await this.readJsonFile(dataset_desc_abspath)
			foundDatasets.push(dataset)
		}

		// find IDs of datasets existing in the index
		let foundDatasetIDs: string[] = []
		let foundDatasetPathsWithIDs: string[] = []
		for (const index in foundDatasetPaths) {
			const datasetPath = await this.filePath(foundDatasetPaths[index], owner)
			const datasetPathQuery = `Path:"${datasetPath}"`
			/* this.logger.debug(
				`Text query to search dataset in index: ${datasetPathQuery}`
			) */
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			searchResults.length > 0
				? foundDatasetIDs.push(searchResults[0]._id)
				: foundDatasetIDs.push(null)
			searchResults.length > 0
				? foundDatasetPathsWithIDs.push(searchResults[0]._source.Path)
				: foundDatasetPathsWithIDs.push(null)
		}

		// find IDs of datasets with name existing in the index in the case of
		// (1) a dataset with changed path and (2) a dataset copy
		let foundRenamedDatasetIDs: string[] = []
		// let foundDuplicatedDatasetPaths: string[] = []
		for (const index in foundDatasets) {
			let datasetPathQuery = `"${foundDatasets[index].Name}"`
			/*
			const dataset_desc = {
				Name: foundDatasets[index].Name,
				BIDSVersion: foundDatasets[index].BIDSVersion,
				License: foundDatasets[index].License,
				Authors: foundDatasets[index].Authors,
				Acknowledgements: foundDatasets[index].Acknowledgements,
				HowToAcknowledge: foundDatasets[index].HowToAcknowledge,
				Funding: foundDatasets[index].Funding,
				ReferencesAndLinks: foundDatasets[index].ReferencesAndLinks,
				DatasetDOI: foundDatasets[index].DatasetDOI,
			} 
			let datasetPathQuery: string = ''
			for (
				var keys = Object.keys(dataset_desc), i = 0, end = keys.length;
				i < end;
				i++
			) {
				var key = keys[i]
				var value = dataset_desc[key] ? dataset_desc[key] : ''
				i === end - 1
					? (datasetPathQuery += `${key}:"${value}"`)
					: (datasetPathQuery += `${key}:"${value}" AND `)
			} 
			this.logger.debug(
				`Text query to search dataset in index: ${datasetPathQuery}`
			)
			*/
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			if (searchResults.length > 0) {
				if (!foundDatasetIDs.includes(searchResults[0]._id)) {
					foundRenamedDatasetIDs.push(searchResults[0]._id)
					// foundDuplicatedDatasetPaths.push(null)
				} else {
					foundRenamedDatasetIDs.push(null)
					/* 
					if (!foundDatasetPathsWithIDs.includes(searchResults[0]._Path)) {
						foundDuplicatedDatasetPaths.push(searchResults[0]._Path)
					} else {
						foundDuplicatedDatasetPaths.push(null)
					} 
					*/
				}
			} else {
				foundRenamedDatasetIDs.push(null)
				// foundDuplicatedDatasetPaths.push(null)
			}
		}
		return {
			foundDatasets,
			foundDatasetPaths,
			foundDatasetIDs,
			foundRenamedDatasetIDs,
			// foundDuplicatedDatasetPaths,
		}
	}

	private async filterGroupDatasetsNotIndexed(
		owner: string,
		foundGroupDatasetsNotIndexed: string[],
		foundGroupDatasetNamesNotIndexed: string[]
	) {
		// get id of indexed dataset existing in the user private space
		// with same name
		const datasetNameQueries: string[] = foundGroupDatasetNamesNotIndexed.map(
			value => `Name:"${value}"`
		)
		/* this.logger.debug(
			`Query array of names to search dataset in index: ${datasetNameQueries}`
		) */
		let groupDatasetIDsToBeAdded: string[] = []
		let groupDatasetPathsToBeAdded: string[] = []
		let index = 0
		for (let indexQuery in datasetNameQueries) {
			this.logger.debug(datasetNameQueries[indexQuery])
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetNameQueries[indexQuery]
			)
			// In case there is a result with a dataset owned by the user (e.g. <userID>_*)
			if (searchResults.length > 0 && searchResults[0]._id.includes(owner)) {
				this.logger.log(searchResults[0]._id)
				this.logger.log(searchResults[0]._source.Path)
				const datasetNum = searchResults[0]._id.split('_')[1]
				const folderName = foundGroupDatasetsNotIndexed[index].split('/')[0]
				const groupDatasetId = folderName + '_' + datasetNum
				groupDatasetIDsToBeAdded.push(groupDatasetId)
				groupDatasetPathsToBeAdded.push(foundGroupDatasetsNotIndexed[index])
			}
			index++
		}
		this.logger.log({ groupDatasetIDsToBeAdded })
		this.logger.log({ groupDatasetPathsToBeAdded })
		return { groupDatasetIDsToBeAdded, groupDatasetPathsToBeAdded }
	}

	private async handleBidsDatasetsNotIndexed(
		owner: string,
		foundDatasets: any[],
		foundDatasetPaths: string[],
		foundDatasetIDs: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		let addedBidsDatasets: BIDSDataset[] = []
		let addedGroupBidsDatasets: BIDSDataset[] = []
		if (foundDatasetPaths.length > 0) {
			this.logger.debug('Handle indexing of datasets not already indexed...')
			// extract datasets that are not indexed and return separately the lists
			// of datasets contained in the user private space and the user group
			const {
				foundPrivateDatasetsNotIndexed,
				// foundPrivateDatasetNamesNotIndexed,
				foundGroupDatasetsNotIndexed,
				foundGroupDatasetNamesNotIndexed,
			} = this.extractAndSplitPrivateGroupDatasetsNotIndexed(
				foundDatasets,
				foundDatasetPaths,
				foundDatasetIDs,
				foundRenamedDatasetIDs,
				groupFolders
			)
			// generate and index content of every private dataset not indexed
			if (foundPrivateDatasetsNotIndexed.length > 0) {
				this.logger.warn('Add the following private datasets to the index:')
				this.logger.debug({ foundPrivateDatasetsNotIndexed })
				addedBidsDatasets = await this.addNewBIDSDatasetIndexedContents(
					owner,
					foundPrivateDatasetsNotIndexed
				)
			}
			// generate and index content of every group dataset not indexed
			// for which a private dataset with the same same has already been indexed
			if (foundGroupDatasetsNotIndexed.length > 0) {
				this.logger.warn('Add the following group datasets to the index:')
				this.logger.debug({ foundGroupDatasetsNotIndexed })
				const { groupDatasetIDsToBeAdded, groupDatasetPathsToBeAdded } =
					await this.filterGroupDatasetsNotIndexed(
						owner,
						foundGroupDatasetsNotIndexed,
						foundGroupDatasetNamesNotIndexed
					)
				if (groupDatasetIDsToBeAdded.length > 0)
					addedGroupBidsDatasets =
						await this.addNewGroupBIDSDatasetIndexedContents(
							owner,
							groupDatasetPathsToBeAdded,
							groupDatasetIDsToBeAdded
						)
			}
		} else {
			this.logger.debug('No existing dataset found!')
		}
		return { addedBidsDatasets, addedGroupBidsDatasets }
	}

	private async handleBidsDatasetsRenamed(
		owner: string,
		foundDatasetPaths: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		let renamedBidsDatasets: BIDSDataset[] = []
		let renamedGroupBidsDatasets: BIDSDataset[] = []
		if (foundDatasetPaths.length > 0) {
			this.logger.debug(
				'Handle reindexing of datasets for which the path changed...'
			)
			// extract indexed datasets for which path has changed and return separately the lists
			// of dataset paths and IDs contained in the user private space and the user group
			const {
				foundPrivateRenamedDatasets,
				foundPrivateRenamedDatasetIDs,
				foundGroupRenamedDatasets,
				foundGroupRenamedDatasetIDs,
			} = this.extractAndSplitPrivateGroupRenamedDatasets(
				foundDatasetPaths,
				foundRenamedDatasetIDs,
				groupFolders
			)
			// update indexed content of every private dataset for which path has changed
			if (foundPrivateRenamedDatasets.length > 0) {
				this.logger.warn('Update the following indexed private dataset path:')
				this.logger.warn({
					foundPrivateRenamedDatasets,
					foundPrivateRenamedDatasetIDs,
				})
				renamedBidsDatasets = await this.updateBIDSDatasetIndexedContents(
					owner,
					foundPrivateRenamedDatasets,
					foundPrivateRenamedDatasetIDs
				)
			}
			// update indexed content of every dataset that has been moved to a group folder
			if (foundGroupRenamedDatasets.length > 0) {
				this.logger.warn('Update the following indexed group dataset path:')
				this.logger.warn({
					foundGroupRenamedDatasets,
					foundGroupRenamedDatasetIDs,
				})
				/* renamedGroupBidsDatasets = await this.updateBIDSDatasetIndexedContents(
					owner,
					foundGroupRenamedDatasets,
					foundGroupRenamedDatasetIDs
				) */
			}
		} else {
			this.logger.debug('No existing dataset found!')
		}
		return { renamedBidsDatasets, renamedGroupBidsDatasets }
	}

	private async handleBidsDatasetsDeleted(owner: string) {
		let deletedBidsDatasets: { index: any; id: any }[] = []
		// rerun search for dataset with updated path
		const searchIndexedResults = await this.searchBidsDatasets(owner)
		// extract absolute path of each dataset
		const foundIndexedDatasetPaths = searchIndexedResults.map(
			dataset => dataset._source.Path
		)
		if (foundIndexedDatasetPaths.length > 0) {
			// find all datasets that are indexed but for which the path does not exist anymore
			const deletedBidsDatasetPaths = foundIndexedDatasetPaths.map(absPath => {
				if (!fs.existsSync(absPath)) return absPath
			})
			// filter null
			const filteredDeletedBidsDatasetPaths = deletedBidsDatasetPaths.flatMap(
				f => (f ? [f] : [])
			)
			if (filteredDeletedBidsDatasetPaths.length > 0) {
				this.logger.debug(
					'Deleting index for the following unexisting paths:',
					{ filteredDeletedBidsDatasetPaths }
				)
				deletedBidsDatasets = await this.deleteBIDSDatasets(
					owner,
					filteredDeletedBidsDatasetPaths
				)
			}
		}
		return deletedBidsDatasets
	}

	public async refreshBIDSDatasetsIndex(
		owner: string,
		{ cookie, requesttoken }: any
	) {
		// TODO: Index shared datasets appearing in both private and group folders
		try {
			// make all the files are discovered by nextcloud
			await this.nextcloudService.scanUserFiles(owner)
			// 1. Get list of existing datasets and the list of indexed dataset ids
			// get list of BIDS datasets (folder name) present in the file system (accessible by user)
			const s = await this.search(cookie, PARTICIPANTS_FILE)
			const searchDatasetsResults = s?.entries

			// get the list of datasets already indexed in the root of the user private space
			// let searchIndexedResults = await this.searchBidsDatasets(owner)

			// extract lists of (1) all found dataset paths, (2) dataset IDs with corresponding path,
			// (3) dataset IDs with corresponding name but with changed path
			const {
				foundDatasets,
				foundDatasetPaths,
				foundDatasetIDs,
				foundRenamedDatasetIDs,
				//				foundDuplicatedDatasetPaths,
			} = await this.parseSearchDatasetsResultsForRefresh(
				owner,
				searchDatasetsResults
			)

			// Get list of group folders to later differentiate datasets contained in a group folder
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				owner
			)

			// 2. Handle indexing of datasets not already indexed
			const { addedBidsDatasets, addedGroupBidsDatasets } =
				await this.handleBidsDatasetsNotIndexed(
					owner,
					foundDatasets,
					foundDatasetPaths,
					foundDatasetIDs,
					foundRenamedDatasetIDs,
					groupFolders
				)

			/*
			// 3. Handle indexing of dataset duplicates not indexed
			 			let duplicatedBidsDatasets: BIDSDataset[] = []
			if (foundDatasetPaths.length > 0) {
				this.logger.debug('Handle indexing of new duplicated datasets...')
				// extract datasets that are not indexed and return separately the lists
				// of datasets contained in the user private space and the user group
				const { foundPrivateDatasetsDuplicated, foundGroupDatasetsDuplicated } =
					this.extractAndSplitPrivateGroupDatasetsDuplicated(
						foundDuplicatedDatasetPaths
					)
				this.logger.debug('Detected new duplicated datasets in user group:', {
					foundGroupDatasetsDuplicated,
				})
				// generate and index content of every new dataset copy
				if (foundPrivateDatasetsDuplicated.length > 0) {
					this.logger.warn(
						'Add the following new duplicated dataset to the index:'
					)
					this.logger.debug({ foundPrivateDatasetsDuplicated })
					duplicatedBidsDatasets = await this.addNewBIDSDatasetIndexedContents(
						owner,
						foundPrivateDatasetsDuplicated
					)
				}
			} else {
				this.logger.debug('No existing dataset found!')
				return []
			} 
			*/
			// 3. Handle reindexing of datasets for which the path changed
			const { renamedBidsDatasets, renamedGroupBidsDatasets } =
				await this.handleBidsDatasetsRenamed(
					owner,
					foundDatasetPaths,
					foundRenamedDatasetIDs,
					groupFolders
				)

			// 4. Delete any indexed dataset that does not exist anymore
			const deletedBIDSDatasets = await this.handleBidsDatasetsDeleted(owner)

			return { addedBidsDatasets, renamedBidsDatasets, deletedBIDSDatasets }
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async createBIDSDatasetsIndex() {
		try {
			// create index for datasets if not existing
			const exists = await this.elastic_client.indices.exists({
				index: this.es_index_datasets,
			})

			if (exists.body === false) {
				try {
					const create = await this.elastic_client.indices.create({
						index: this.es_index_datasets,
						body: {
							mappings,
						},
					})
					this.logger.debug(`New index ${this.es_index_datasets} created`)
					this.logger.debug(JSON.stringify(create.body, null, 2))
					return create.body
				} catch (error) {
					this.logger.warn(
						`Failed to create index ${this.es_index_datasets}...`
					)
					this.logger.warn(JSON.stringify(error))
				}
			} else {
				this.logger.warn(
					`SKIP: Index ${this.es_index_datasets} already exists...`
				)
				return exists.body
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async deleteBIDSDatasetsIndex() {
		try {
			// delete index for datasets only if it exists
			const exists = await this.elastic_client.indices.exists({
				index: this.es_index_datasets,
			})

			if (exists.body === true) {
				try {
					const del = await this.elastic_client.indices.delete({
						index: this.es_index_datasets,
					})
					this.logger.debug(`Index ${this.es_index_datasets} deleted`)
					this.logger.debug(JSON.stringify(del.body, null, 2))
					return del.body
				} catch (error) {
					this.logger.warn(
						`Failed to create index ${this.es_index_datasets}...`
					)
					this.logger.warn(JSON.stringify(error))
				}
			} else {
				this.logger.warn(
					`SKIP: Index was not deleted because ${this.es_index_datasets} does not exist...`
				)
				return exists.body
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async indexBIDSDataset(owner: string, path: string, id: string) {
		try {
			// get a list of dataset indexed content
			const bidsGetDatasetDto = new BidsGetDatasetDto()
			bidsGetDatasetDto.owner = owner
			bidsGetDatasetDto.path = path
			this.logger.debug({ bidsGetDatasetDto })

			const bidsDataset = await this.createDatasetIndexedContent(
				bidsGetDatasetDto
			)

			// find the dataset index to be deleted
			const datasetPathQuery = `Path:"${path}"`
			this.logger.debug(
				`Text query to search deleted dataset: ${datasetPathQuery}`
			)
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			this.logger.log({ searchResults })
			if (searchResults.length > 0) {
				const currentDataset = searchResults[0]
				this.logger.debug('Update a currently indexed dataset')
				this.logger.debug({ currentDataset })
				bidsDataset.Owner = currentDataset._source.Owner
				bidsDataset.Groups = currentDataset._source.Groups
				bidsDataset.CreationDate = currentDataset._source.CreationDate
				// TODO: Update modif date only if modification(s) occured
				bidsDataset.LastModificationDate = new Date()
				bidsDataset.id = currentDataset._source.id
				bidsDataset.version = currentDataset._source.version++
			} else {
				this.logger.debug('Create a new dataset')
				bidsDataset.Owner = owner
				bidsDataset.Groups = await this.nextcloudService.groupFoldersForUserId(
					owner
				)
				bidsDataset.CreationDate = new Date()
				bidsDataset.LastModificationDate = bidsDataset.CreationDate
				// autogenerate dataset id if needed
				if (id) {
					bidsDataset.id = id
				} else {
					const { datasetId } = await this.generateDatasetId(owner)
					bidsDataset.id = datasetId
				}
				bidsDataset.version = 1
			}
			bidsDataset.Path = path

			// create and send elasticsearch bulk to index the dataset
			await this.sendElasticSearchDatasetsBulk([bidsDataset])

			return bidsDataset
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async deleteBIDSDataset(owner: string, path: string) {
		try {
			// find the dataset index to be deleted
			const datasetPathQuery = `Path:"${path}"`
			this.logger.debug(
				`Text query to search deleted dataset: ${datasetPathQuery}`
			)
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			if (searchResults.length > 0) {
				const dataset = searchResults[0]
				// delete the document with id related to the dataset
				const datasetID = {
					index: dataset._index,
					id: dataset._id,
				}
				const { body: deleteResponse } = await this.elastic_client.delete(
					datasetID
				)
				if (deleteResponse.errors) {
					this.logger.error(`Errors for deleting dataset ${dataset._id}!`)
					this.logger.error(JSON.stringify(deleteResponse))
				} else {
					this.logger.debug(`Dataset ${dataset._id} successfully deleted!`)
					this.logger.debug(JSON.stringify(deleteResponse))
				}

				return datasetID
			} else {
				throw new Error('No dataset found in elasticsearch to be deleted')
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async deleteBIDSDatasets(owner: string, paths: string[]) {
		const deletedBidsDatasetsPromises = paths.map(path => {
			return this.deleteBIDSDataset(owner, path)
		})

		const deletedBidsDatasets = (
			await Promise.allSettled(deletedBidsDatasetsPromises)
		)
			.filter(isFulfilled)
			.map(p => p.value)
		return deletedBidsDatasets
	}

	private async filterBidsDatasetsAccessibleByUser(
		owner: string,
		foundDatasets: any[]
	) {
		// get user group folder names
		const ownerGroups = await this.nextcloudService.groupFoldersForUserId(owner)
		// filter only private datasets own by the user
		let foundAccessibleDatasets = []
		foundDatasets.forEach(dataset => {
			if (dataset._id.includes(`${owner}_`)) {
				foundAccessibleDatasets.push(dataset)
			} else {
				for (let ownerGroup of ownerGroups) {
					if (dataset._id.includes(`${ownerGroup.label}_`)) {
						foundAccessibleDatasets.push(dataset)
					}
				}
			}
		})
		return foundAccessibleDatasets
	}

	public async searchBidsDatasets(
		owner: string = 'all',
		textQuery: string = '*',
		ageRange: number[] = [0, 100],
		participantsCountRange: number[] = [0, 200],
		datatypes: string[] = ['*'],
		page: number = 1,
		nbOfResults: number = 200
	) {
		try {
			// determine index to start based on pagination
			const indexFrom = (page - 1) * nbOfResults
			// define the elastic search query
			let queryObj: {} = {
				bool: {
					must: [
						{
							query_string: {
								query: textQuery,
								allow_leading_wildcard: true,
								analyze_wildcard: true,
							},
						},
						{
							range: {
								AgeMin: { gte: ageRange[0] },
							},
						},
						{
							range: {
								AgeMax: { lte: ageRange[1] },
							},
						},
						{
							range: {
								ParticipantsCount: { gte: participantsCountRange[0] },
							},
						},
						{
							range: {
								ParticipantsCount: {
									lte:
										participantsCountRange[1] < 200
											? participantsCountRange[1]
											: 10000,
								},
							},
						},
					],
				},
			}
			// add terms query only if a non empty list of datatypes is provided
			if (datatypes.length > 0 && !datatypes.includes('*')) {
				queryObj['bool']['must'].push({
					terms: {
						DataTypes: datatypes,
					},
				})
			}
			// define search query in JSON format expected by elasticsearch
			const query_params: RequestParams.Search = {
				index: `${this.es_index_datasets}`,
				body: {
					from: indexFrom,
					size: nbOfResults,
					query: queryObj,
				},
			}
			// perform and return the search query
			const foundDatasets = await this.elastic_client
				.search(query_params)
				.then((result: ApiResponse) => {
					// this.logger.debug(JSON.stringify(result.body.hits, null, 4))
					return result.body.hits.hits
				})

			if (owner !== 'all') {
				// filter only datasets accessible by the user
				return await this.filterBidsDatasetsAccessibleByUser(
					owner,
					foundDatasets
				)
			} else {
				return foundDatasets
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async getDatasetsCount() {
		// define count query in JSON format expected by elasticsearch
		const count_params: RequestParams.Count = {
			index: `${this.es_index_datasets}`,
			body: {
				// you can count based on specific query or remove body at all
				query: { match_all: {} },
			},
		}

		// perform and return the search query
		return this.elastic_client
			.count(count_params)
			.then(res => {
				return res.body.count
			})
			.catch(err => {
				this.logger.error({ err })
			})
	}

	private createDatasetIdString(
		id: number,
		begin: string,
		size: number
	): string {
		let datasetId: string = id.toString()
		while (datasetId.length < size) datasetId = '0' + datasetId
		datasetId = begin + datasetId
		return datasetId
	}

	public async generateDatasetId(owner: string, datasetIdNum: number = null) {
		try {
			// get number of datasets indexed in elasticsearch
			const nbOfDatasets = await this.getDatasetsCount()

			let searchIndexedResults = []
			let datasetIDs = []
			if (nbOfDatasets > 0) {
				// get a list of dataset ids (<=> folder name) already indexed
				searchIndexedResults = await this.searchBidsDatasets('all')
				// extract ids of indexed datasets
				datasetIDs = searchIndexedResults.map(dataset => dataset._id)
			}

			// generate a first if using either the provided initial value or
			// the # of indexed datasets + 1
			datasetIdNum = datasetIdNum ? datasetIdNum : nbOfDatasets + 1
			let datasetId: string = this.createDatasetIdString(
				datasetIdNum,
				`${owner}_ds`,
				6
			)

			// test if the first autogenerated dataset id exists
			// if not, it increments until it find a new id that
			// does not exist
			while (true) {
				this.logger.debug({ datasetId })
				if (datasetIDs.length === 0 || !datasetIDs.includes(datasetId)) {
					this.logger.debug('Id does not exist yet and is returned!')
					break
				} else {
					this.logger.debug('Id does exist and being incremented...')
					datasetIdNum += 1
					datasetId = this.createDatasetIdString(datasetIdNum, `${owner}_ds`, 6)
				}
			}
			return { datasetId, datasetIdNum }
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async createBidsDataset(createBidsDatasetDto: CreateBidsDatasetDto) {
		const { owner, parent_path } = createBidsDatasetDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			// Generate dataset's id and containing directory name
			const { datasetId } = await this.generateDatasetId(owner)
			createBidsDatasetDto.dataset_dirname = datasetId.split('_')[1]
			// Create the json to be passed with the request
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/dataset.create.json`,
				JSON.stringify(createBidsDatasetDto)
			)

			// Resolve absolute path of dataset's parent directory
			const dsParentPath = await this.filePath(parent_path, owner)

			const cmd1 = [
				'run',
				'-v',
				`${tmpDir}:/input`,
				'-v',
				`${dsParentPath}:/output`,
			]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=dataset.create',
				'--input_data=/input/dataset.create.json',
			]

			const command = [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			if (code === 0) {
				// Make the new dataset discovered by Nextcloud
				await this.nextcloudService.scanPath(owner, parent_path)
				// Index the dataset
				await this.indexBIDSDataset(
					owner,
					`${dsParentPath}${createBidsDatasetDto.dataset_dirname}`,
					datasetId
				)

				return createBidsDatasetDto
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				error.message,
				error.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	async getSubject(bidsGetSubjectDto: BidsGetSubjectDto) {
		const {
			// owner,
			path,
		} = bidsGetSubjectDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/sub_get.json`,
				JSON.stringify(bidsGetSubjectDto)
			)

			// Create an empty output JSON file with correct ownership
			const output_file = `${tmpDir}/sub_info.json`
			let empty_content = {}
			fs.writeFileSync(output_file, JSON.stringify(empty_content))

			fs.chown(output_file, this.dataUserId, this.dataUserId, err => {
				if (err) {
					throw err
				}
			})

			// const dbPath = await this.filePath(path, owner)

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, '-v', `${path}:/output`]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.get',
				'--input_data=/input/sub_get.json',
				'--output_file=/input/sub_info.json',
			]

			const command = [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			const errorMatching =
				/IndexError: Could not find the subject in the BIDS dataset./.test(
					message
				)

			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				const sub = fs.readFileSync(`${tmpDir}/sub_info.json`, 'utf-8')
				return JSON.parse(sub)
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				error.message,
				error.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	public async importSubject(createSubject: CreateSubjectDto) {
		const { owner, dataset_path } = createSubject
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			// retrieve the index used for the dataset
			const datasetPathQuery = `Path:"${dataset_path}"`
			this.logger.debug(
				`Text query to retrieve dataset ID: ${datasetPathQuery}`
			)
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			const datasetID = searchResults[0].id

			// FIXME: replace by all settled
			const filePathes = createSubject.files.map(file =>
				this.filePath(file.path, owner)
			)
			const pathes = await Promise.all(filePathes)

			const nextCreateSubject = {
				...createSubject,
				files: createSubject.files.map((file, i) => ({
					...file,
					path: pathes[i],
				})),
			}

			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/sub.import.json`,
				JSON.stringify(nextCreateSubject)
			)

			const volumes = nextCreateSubject.files.reduce(
				(p, file) => [...p, '-v', `${file.path}:${file.path}`],
				[]
			)

			const command = [
				'run',
				// '-v',
				// '/home/guspuhle/workdir/hip/frontend/bids-tools/scripts:/scripts',
				'-v',
				`${tmpDir}:/import-data`,
				...volumes,
				'-v',
				`${dataset_path}:/output`,
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.import',
				'--input_data=/import-data/sub.import.json',
			]

			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			const errorMatching =
				/does not match/.test(message) ||
				// /does not exist/.test(message) ||  // Appears when success with "dataset_description.json does not exist"
				/not imported/.test(message)

			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				await this.nextcloudService.scanPath(owner, dataset_path)
				await this.indexBIDSDataset(owner, dataset_path, datasetID)
				return nextCreateSubject
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (err) {
			this.logger.error(err)
			throw new HttpException(
				err.message,
				err.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	private async bidsValidate(dbPath: string) {
		// docker run -ti --rm -v /path/to/data:/data:ro bids/validator /data
		const dockerParams = [
			'run',
			'-v',
			`${dbPath}:/output`,
			'bids/validator',
			'/data',
		]

		return this.spawnable('docker', dockerParams)
	}

	public async subEditClinical(editSubjectClinicalDto: EditSubjectClinicalDto) {
		let { owner, path } = editSubjectClinicalDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/sub_edit_clinical.json`,
				JSON.stringify(editSubjectClinicalDto)
			)

			const dbPath = await this.filePath(path, owner)

			const cmd1 = [
				'run',
				'-v',
				`${tmpDir}:/import-data`,
				'-v',
				`${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
				'-v',
				`${dbPath}:/output`,
			]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.edit.clinical',
				'--input_data=/import-data/sub_edit_clinical.json',
			]

			const command = [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))
			const { code, message } = await this.spawnable('docker', command)

			if (code === 0) {
				return editSubjectClinicalDto
			}

			throw new InternalServerErrorException(message)
		} catch (err) {
			this.logger.error(err)
			throw new HttpException(err.message, err.status)
		}
	}

	public deleteSubject() {}

	public async participants(path: string, { cookie }: any) {
		const nextPath = `${path}${PARTICIPANTS_FILE}`

		return this.participantsWithPath(nextPath, cookie)
	}

	private async participantsWithPath(path: string, cookie: any) {
		try {
			const tsv = await this.getFileContent(path, cookie)
			const [tsvheaders, ...rows] = tsv
				.trim()
				.split('\n')
				.map(r => r.split('\t'))

			const participants: Participant[] = rows.reduce(
				(arr, row) => [
					...arr,
					row.reduce(
						(obj, item, i) =>
							Object.assign(obj, { [tsvheaders[i].trim()]: item }),
						{}
					),
				],
				[]
			)

			return participants
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status)
		}
	}

	/**
	 * A public method that is used to create / update participants.[tsv|json] files
	 * of a BIDS dataset.
	 * */
	public async writeBIDSDatasetParticipantsTSV(
		datasetPath: string,
		createBidsDatasetParticipantsTsvDto: CreateBidsDatasetParticipantsTsvDto
	) {
		try {
			this.logger.debug({ datasetPath })
			this.logger.debug({ createBidsDatasetParticipantsTsvDto })
			// Transform JSON object to TSV formatted string
			const participantsTSVString = papa.unparse(
				createBidsDatasetParticipantsTsvDto.Participants,
				{
					quotes: false, //or array of booleans
					quoteChar: '"',
					escapeChar: '"',
					delimiter: '\t',
					header: true,
					newline: '\r\n',
					skipEmptyLines: false, //other option is 'greedy', meaning skip delimiters, quotes, and whitespace.
					columns: null, //or array of strings
				}
			)
			this.logger.debug({ participantsTSVString })
			// Write TSV string to file
			const tsvFilepath = path.join(datasetPath, PARTICIPANTS_FILE)
			writeFileSync(tsvFilepath, participantsTSVString)
			this.logger.debug(`${tsvFilepath} has been successfully written!`)
		} catch (error) {
			throw new Error(error)
		}
	}

	public async search(cookie: any, term: string): Promise<ISearch> {
		try {
			const response = this.httpService.get(
				`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}${NC_SEARCH_PATH}?term=${term}&cursor=0&limit=100`,
				{ headers: { cookie } }
			)

			return firstValueFrom(response).then(r => r.data.ocs.data)
		} catch (error) {
			this.logger.error(error)
			throw new InternalServerErrorException()
		}
	}

	private spawnable = (
		command,
		args
	): Promise<{ code: number; message?: string }> => {
		const child = spawn(command, args)
		let message = ''

		return new Promise(resolve => {
			child.stdout.setEncoding('utf8')
			child.stdout.on('data', data => {
				message += data.toString()
			})

			child.stderr.setEncoding('utf8')
			child.stderr.on('data', data => {
				message += data.toString()
			})

			child.on('error', data => {
				message += data.toString()
			})

			child.on('close', code => {
				resolve({ code, message })
			})
		})
	}

	private async getDatasetContent(
		path: string,
		cookie: any
	): Promise<DataError> {
		try {
			const userId = cookie.match(/nc_username=(.*;)/)[1].split(';')[0]
			const filePath = await this.filePath(path, userId)

			return new Promise((resolve, reject) => {
				fs.readFile(filePath, 'utf8', function (err, data) {
					if (err) {
						reject(err)
					}
					if (typeof data !== 'string') return { data: null }
					const cleaned = data.replace(/\\n/g, '').replace(/\\/g, '')
					resolve({ data: JSON.parse(cleaned) })
				})
			})
		} catch (e) {
			this.logger.error(e)
			return { error: e.message }
		}
	}

	/**
	 * It takes a path and a set of headers, and returns the JSON-formatted content summary of the
	 * BIDS dataset at that path, later used for dataset indexing.
	 * @param {BidsGetDatasetDto} bidsGetDatasetDto - object storing the owner and path to the dataset you want to get
	 * @param {any} headers - This is the headers that you need to pass to the webdav server.
	 * @returns The file content
	 */
	private async createDatasetIndexedContent(
		bidsGetDatasetDto: BidsGetDatasetDto
	): Promise<BIDSDataset> {
		const {
			// owner,
			path,
		} = bidsGetDatasetDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/dataset_get.json`,
				JSON.stringify(bidsGetDatasetDto)
			)

			// Create an empty output JSON file with correct ownership
			const output_file = `${tmpDir}/dataset_info.json`
			let empty_content = {}
			fs.writeFileSync(output_file, JSON.stringify(empty_content))

			fs.chown(output_file, this.dataUserId, this.dataUserId, err => {
				if (err) {
					throw err
				}
			})

			// Set paths and command to be run
			// const dsPath = await this.filePath(path, owner)

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, '-v', `${path}:/output`]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=dataset.get',
				'--input_data=/input/dataset_get.json',
				'--output_file=/input/dataset_info.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			// Run the bids-tool docker image with the defined command
			const { code, message } = await this.spawnable('docker', command)

			// Handle output and error(s)
			const errorMatching = /IndexError: Could not find the BIDS dataset./.test(
				message
			)
			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				// Extract resulting JSON content if the run succeeds
				const sub = fs.readFileSync(`${tmpDir}/dataset_info.json`, 'utf-8')
				return JSON.parse(sub)
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				error.message,
				error.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	/**
	 * It takes a path and a set of headers, and returns the JSON-formatted content summary of the
	 * BIDS dataset at that path, later used for dataset indexing.
	 * @param {BidsGetDatasetDto} bidsGetDatasetDto - object storing the owner and path to the dataset you want to get
	 * @returns The file content
	 */
	private async getDatasetsIndexedContent(
		bidsGetDatasetsDto: BidsGetDatasetDto[]
	): Promise<BIDSDataset[]> {
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			// FIXME: replace by all settled
			const filePathes = bidsGetDatasetsDto.map(dataset => {
				return this.filePath(dataset.path, dataset.owner)
			})
			const pathes = await Promise.all(filePathes)

			const nextGetDatasets = {
				...bidsGetDatasetsDto,
				datasets: bidsGetDatasetsDto.map((dataset, i) => ({
					...dataset,
					path: pathes[i],
				})),
			}

			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/datasets_get.json`,
				JSON.stringify(nextGetDatasets)
			)

			const volumes = nextGetDatasets.datasets.reduce(
				(p, dataset) => [...p, '-v', `${dataset.path}:${dataset.path}`],
				[]
			)

			// Create an empty output JSON file with correct ownership
			const output_file = `${tmpDir}/datasets_info.json`
			let empty_content = {}
			fs.writeFileSync(output_file, JSON.stringify(empty_content))

			fs.chown(output_file, this.dataUserId, this.dataUserId, err => {
				if (err) {
					throw err
				}
			})

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, ...volumes]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=datasets.get',
				'--input_data=/input/datasets_get.json',
				'--output_file=/input/datasets_info.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			// Run the bids-tool docker image with the defined command
			const { code, message } = await this.spawnable('docker', command)

			// Handle output and error(s)
			const errorMatching =
				/IndexError: Could not get the content of the BIDS datasets for indexing./.test(
					message
				)
			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				// Extract resulting JSON content if the run succeeds
				const sub = fs.readFileSync(`${tmpDir}/datasets_info.json`, 'utf-8')
				return JSON.parse(sub)
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				error.message,
				error.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	/**
	 * It takes a path and a set of headers, and returns the contents of the file at that path
	 * @param {string} path - the path to the file you want to get
	 * @param {any} headers - This is the headers that you need to pass to the webdav server.
	 * @returns The file content
	 */
	private async getFileContent(path: string, cookie: any): Promise<string> {
		try {
			const userId = cookie.match(/nc_username=(.*;)/)[1].split(';')[0]
			const filePath = await this.filePath(path, userId)

			return new Promise((resolve, reject) => {
				fs.readFile(filePath, 'utf8', function (err, data) {
					if (err) {
						reject(err)
					}
					resolve(data)
				})
			})
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status)
		}
	}

	/* A private method that is used to get the file path, either user based or for a group */
	private async filePath(path: string, userId: string) {
		try {
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				userId
			)

			let rootPath = path.split('/')[0]
			const id = groupFolders.find(g => g.label === rootPath)?.id
			rootPath = rootPath + '/'

			const nextPath = id
				? `${
						process.env.PRIVATE_FILESYSTEM
				  }/__groupfolders/${id}/${path.replace(rootPath, '')}`
				: `${process.env.PRIVATE_FILESYSTEM}/${userId}/files/${path}`

			return nextPath
		} catch (error) {
			this.logger.error(error)
			throw new InternalServerErrorException(
				"Couldn't find a path for the file"
			)
		}
	}

	/* A private method that is used to read a JSON file and parse its content */
	private async readJsonFile(path: string) {
		return JSON.parse(fs.readFileSync(path))
	}
}
