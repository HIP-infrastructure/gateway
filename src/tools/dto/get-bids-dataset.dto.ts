export class GetBidsDatabaseDto {
    readonly owner: string
    readonly database: string
    readonly path: string
    readonly BIDS_definitions: string[]
}
