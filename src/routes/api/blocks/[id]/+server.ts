import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryBlockById } from '$lib/server/blocks';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const block = await queryBlockById(cookies, params.id);
	if (!block) error(404, 'Blocket hittades inte');
	return json(block);
};
