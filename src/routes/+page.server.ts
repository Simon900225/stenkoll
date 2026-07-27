import type { PageServerLoad } from './$types';
import { queryMunicipalities } from '$lib/server/blocks';

export const load: PageServerLoad = async ({ cookies }) => {
	const { municipalities, usingSeedData } = await queryMunicipalities(cookies);
	return { municipalities, usingSeedData };
};
