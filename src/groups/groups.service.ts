import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

import { GroupDto } from './dto/group.dto'

@Injectable()
export class GroupsService {
	constructor(private readonly httpService: HttpService) {}

	private logger = new Logger('GroupsService')

	findAll() {
		return [
			{
				label: 'AMU-NS',
				id: 'amu-ns',
				pi: 'Dr. Olivier David',
				email: 'olivier.DAVID@univ-amu.fr',
				country: 'France',
				city: 'Marseille',
				logo: 'media/amu-tng__logo.jpeg',
				description: 'Aix-Marseille University',
				website: 'https://www.univ-amu.fr/',
				socialnetwork: {
					twitter: 'https://twitter.com/univamu',
					youtube: 'https://www.youtube.com/channel/UCqAJ4nmwJdjEweR1cNYPbmA',
					facebook: 'https://www.facebook.com/aixmarseilleuniversite/',
					linkedin: 'https://www.linkedin.com/school/aix-marseille-university/',
					researchgate:
						'https://www.researchgate.net/institution/Aix-Marseille-University',
				},
			},
			{
				label: 'CHUV',
				id: 'chuv',
				pi: 'Professor Philippe Ryvlin',
				email: 'philipperyvlin@gmail.com',
				country: 'Switzerland',
				city: 'Lausanne',
				logo: 'media/chuv__logo.png',
				description: 'Centre Hospitalier Universitaire de Lausanne (CHUV)',
				website: 'https://www.chuv.ch/',
				socialnetwork: {
					twitter: 'https://twitter.com/CHUVLausanne',
					instagram: 'https://www.instagram.com/chuvlausanne/',
					facebook: 'https://www.facebook.com/CHUVLausanne',
					linkedin: 'https://www.linkedin.com/company/chuv/',
				},
			},
			{
				label: 'AMU-TNG',
				id: 'amu-tng',
				pi: 'Dr. Viktor Jirsa',
				email: 'Viktor.JIRSA@univ-amu.fr',
				country: 'France',
				city: 'Marseille',
				logo: 'media/amu-tng__logo.jpeg',
				description: 'Aix-Marseille University',
				website: 'https://www.univ-amu.fr/',
				socialnetwork: {
					twitter: 'https://twitter.com/univamu',
					youtube: 'https://www.youtube.com/channel/UCqAJ4nmwJdjEweR1cNYPbmA',
					facebook: 'https://www.facebook.com/aixmarseilleuniversite/',
					linkedin: 'https://www.linkedin.com/school/aix-marseille-university/',
					researchgate:
						'https://www.researchgate.net/institution/Aix-Marseille-University',
				},
			},
			{
				label: 'APHM',
				id: 'aphm',
				pi: 'Professor Fabrice Bartolomei',
				email: 'fabrice.bartolomei@ap-hm.fr',
				country: 'France',
				city: 'Marseille',
				logo: 'media/amu-tng__logo.jpeg',
				description: 'University Hospitals of Marseille, Epilepsy Dpt.',
				website: 'https://www.univ-amu.fr/',
				socialnetwork: {
					twitter: 'https://twitter.com/univamu',
					youtube: 'https://www.youtube.com/channel/UCqAJ4nmwJdjEweR1cNYPbmA',
					facebook: 'https://www.facebook.com/aixmarseilleuniversite/',
					linkedin: 'https://www.linkedin.com/school/aix-marseille-university/',
					researchgate:
						'https://www.researchgate.net/institution/Aix-Marseille-University',
				},
			},
			{
				label: 'CHRU-LILLE',
				id: 'chru-lille',
				pi: 'Professor Philippe Derambure',
				country: 'France',
				city: 'Lille',
				logo: 'media/chru-lille__logo.png',
				description: 'CHRU LILLE, Epilepsy Unit',
				website: 'https://www.chu-lille.fr/',
				socialnetwork: {
					youtube: 'https://www.youtube.com/channel/UCvB81CdUUKNpaGCTaJFkNVQ',
					instagram: 'https://www.instagram.com/chulille/',
					twitter: 'https://twitter.com/CHU_Lille',
					facebook: 'https://www.facebook.com/chulille',
				},
			},
			{
				label: 'CHU-LION',
				id: 'chu-lion',
				pi: 'Professor Alexis Arzimanoglou',
				email: 'aarzimanoglou@orange.fr',
				country: 'France',
				city: 'Lyon',
				logo: 'media/chu-lion__logo.png',
				description: 'Hospices Civils de Lyon (GHE-HCL)',
				website: 'https://www.chu-lille.fr/',
				socialnetwork: {
					youtube: 'https://www.youtube.com/ChudeLyon',
					instagram: 'https://www.instagram.com/hospicescivilslyon/',
					twitter: 'https://twitter.com/chudelyon',
					facebook: 'https://www.facebook.com/CHUdeLyon/',
					linkedin: 'https://www.linkedin.com/company/hospices-civils-de-lyon/',
				},
			},
			{
				label: 'FNUSA',
				id: 'fnusa',
				pi: 'Professor Milan Brazdil',
				email: 'milan.brazdil@fnusa.cz',
				country: 'Czech Republic',
				city: 'BRNO',
				logo: 'media/fnusa__logo.png',
				description: "St. Anne's University Hospital Czech Republic",
				website: 'https://www.fnusa.cz/en/hp/',
			},
			{
				label: 'HUS',
				id: 'hus',
				pi: 'Professor Eeeva-Liisa Metsähonkala',
				email: 'eeva-liisa.metsahonkala@hus.fi',
				country: 'Finland',
				city: 'Helsinki',
				logo: 'media/hus__logo.png',
				description:
					'Helsinki University Hospital (HUS), Hospital District of Helsinki and Uusimaa',
				website: 'https://www.hus.fi/en',
				socialnetwork: {
					youtube: 'https://www.youtube.com/channel/UChHLhcahbu3iv-2rN7Rg6Sw',
					instagram: 'https://www.instagram.com/hus_sairaala/',
					twitter: 'https://twitter.com/HUS_fi',
					facebook: 'https://www.facebook.com/HUS.fi',
					linkedin: 'https://www.linkedin.com/company/huslinkedin/',
				},
			},
			{
				label: 'OU-SSE',
				id: 'ou-sse',
				pi: 'Professor Morten Lossius',
				email: 'mortenl@ous-hf.no',
				country: 'Norway',
				city: 'Oslo',
				logo: 'media/ou-sse__logo.png',
				description:
					'The Norwegian National Unit for Epilepsy, Oslo universitetssykehus',
				website: 'https://oslo-universitetssykehus.no/',
				socialnetwork: {
					youtube: 'https://www.youtube.com/channel/UCRkdLJ014TTOXh8r8k6SciA',
					instagram: 'https://www.instagram.com/oushf/',
					twitter: 'https://twitter.com/oslounivsykehus',
					facebook: 'https://www.facebook.com/oslouniversitetssykehus',
					linkedin:
						'https://www.linkedin.com/company/oslo-universitetssykehus/',
				},
			},
			{
				label: 'PSMAR',
				id: 'psmar',
				pi: 'Professor Rodrigo Rocamora Zuniga',
				email: 'rrocamora@psmar.cat',
				country: 'Spain',
				city: 'Barcelona',
				logo: 'media/psmar__logo.png',
				description: 'Hospital del Mar-Parc de Salut Mar',
				website: 'https://www.parcdesalutmar.cat/en/',
				socialnetwork: {
					youtube: 'https://www.youtube.com/HospitaldelMarIMAS',
					instagram: 'https://www.instagram.com/hospitaldelmar/?hl=es',
					twitter: 'https://twitter.com/hospitaldelmar',
					linkedin:
						'https://www.linkedin.com/company/hospital-del-mar--parc-de-salut-mar/?originalSubdomain=es',
				},
			},
			{
				label: 'UCBL',
				id: 'ucbl',
				pi: 'Dr. Jean-Philippe Lachaux ',
				email: '',
				country: 'France',
				city: 'Lyon',
				logo: 'media/lyon1__logo.png',
				description: 'Université Claude Bernard Lyon 1',
				website: 'https://www.univ-lyon1.fr/',
				socialnetwork: {
					youtube: 'https://www.youtube.com/UnivLyon1',
					instagram: 'https://www.instagram.com/univlyon1/',
					twitter: 'https://twitter.com/UnivLyon1',
					facebook: 'https://www.facebook.com/UnivLyon1',
				},
			},
			{
				label: 'UMCU',
				id: 'umcu',
				pi: 'Professor Kees Braun',
				email: 'K.Braun@umcutrecht.nl',
				country: 'Netherlands',
				city: 'Utrecht',
				logo: 'media/umcu__logo.png',
				description:
					'University Medical Center Utrecht (Brain Center Rudolf Magnus)',
				website: 'https://www.umcutrecht.nl/en/',
			},
		]
	}

	async findOne(tokens: any, groupid: string): Promise<GroupDto> {
		return this.findOne2(tokens, groupid)
	}

	async findOne1(tokens: any, groupid: string): Promise<GroupDto> {
		const headers = {
			...tokens,
				'OCS-APIRequest': true,
			accept: 'application/json, text/plain, */*',
		}

		const response = this.httpService.get(
			`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/ocs/v1.php/cloud/groups/${groupid}`,
			{ headers }
		)

		return firstValueFrom(response).then(r => r.data.ocs.data)
	}

	async findOne2(tokens: any, groupid: string): Promise<any> {
		try {
			const headers = {
				...tokens,
				'OCS-APIRequest': true,
				accept: 'application/json, text/plain, */*',
			}

			const response = this.httpService.get(
				`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/apps/hip/api/groupusers?groupId=${groupid}`,
				{ headers }
			)

			return firstValueFrom(response).then(r => {
				this.logger.debug(r.data)
				return r.data
			})
		} catch (error) {
			this.logger.debug({ error })
			throw new HttpException(
				error.message,
				error.status ?? HttpStatus.BAD_REQUEST
			)
		}
	}
}
