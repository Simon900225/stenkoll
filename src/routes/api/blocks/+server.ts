import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	bboxFromSearchParams,
	filtersFromSearchParams,
	queryViewportBlocks
} from '$lib/server/blocks';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const bbox = bboxFromSearchParams(url.searchParams);
	if (!bbox) {
		error(400, 'Query params west, south, east, north are required (finite numbers).');
	}

	const filters = filtersFromSearchParams(url.searchParams);
	const result = await queryViewportBlocks(cookies, bbox, filters);
	return json(result);
};
