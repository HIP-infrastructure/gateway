import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

import { GroupDto } from './dto/group.dto'

@Injectable()
export class GroupsService {
	constructor(private readonly httpService: HttpService) {}

  private logger = new Logger('UsersService')
 
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
				description:
					'Plus grande université francophone pluridisciplinaire, Aix-Marseille Université accueille 80 000 étudiant.e.s et 8 000 personnels sur 5 grands campus aux standards internationaux. ',
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
				description: 'Centre hospitalier universitaire vaudois',
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
				description:
					'Plus grande université francophone pluridisciplinaire, Aix-Marseille Université accueille 80 000 étudiant.e.s et 8 000 personnels sur 5 grands campus aux standards internationaux. ',
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
				description:
					"Hôpital Universitaire du Nord de l'Europe, un campus de recherche, de soins innovants et de formation",
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
				description:
					'Les HCL sont un centre hospitalier universitaire de 13 hôpitaux publics dans la métropole de Lyon. ',
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
				logo: null,
			},
			{
				label: 'OU-SSE',
				id: 'ou-sse',
				logo: null,
			},
			{
				label: 'PSMAR',
				id: 'psmar',
				logo: null,
			},
			{
				label: 'UCBL',
				id: 'ucbl',
				logo: null,
			},
			{
				label: 'UMCU',
				id: 'umcu',
				logo: null,
			},
		]
	}

	async findOne(tokens: any, groupid: string): Promise<GroupDto> {
		const headers = {
			...tokens,
			accept: 'application/json, text/plain, */*',
		}

		const response = this.httpService.get(
			`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}/ocs/v1.php/cloud/groups/${groupid}`,
			{ headers }
		)

		return firstValueFrom(response).then(r => r.data.ocs.data)
	}
}
