export class GetBidsDatabaseDto {
    readonly owner: string
    readonly dataset: string
    readonly path: string
    readonly BIDS_definitions: string[]
}
