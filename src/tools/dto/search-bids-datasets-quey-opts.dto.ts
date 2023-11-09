export class SearchBidsDatasetsQueryOptsDto {
	owner: string
	textQuery: string | undefined
	filterPaths: boolean | undefined
	ageRange: number[] | undefined
	participantsCountRange: number[] | undefined
	datatypes: string[] | undefined
	page: number | undefined
	nbOfResults: number | undefined
	indexType?: 'personal' | 'public'
}
