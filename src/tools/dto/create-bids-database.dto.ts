export class CreateBidsDatabaseDto {
    readonly owner: string
    readonly database: string
    readonly DatasetDescJSON: {
        readonly Name: string
        readonly BIDSVersion: string
        readonly License: string
        readonly Authors: string[]
        readonly Acknowledgements: string
        readonly Funding: string
        readonly ReferencesAndLinks: string
        readonly DatasetDOI: string
    }
}
