export type BlockSource = 'fornsok' | 'user';

export type Block = {
	id: string;
	source: BlockSource;
	fornsok_id: string | null;
	name: string;
	description: string | null;
	lamningstyp: string | null;
	egenskapsvarde: string | null;
	lat: number;
	lng: number;
	climb_score: number | null;
	score_rationale: string | null;
	county: string | null;
	municipality: string | null;
	created_by: string | null;
	created_at: string;
	updated_at?: string;
};

export type Photo = {
	id: string;
	block_id: string;
	user_id: string;
	storage_path: string;
	caption: string | null;
	created_at: string;
};

export type Profile = {
	id: string;
	display_name: string | null;
	created_at: string;
};

export type BlockFilters = {
	minScore: number;
	sources: BlockSource[];
	municipality: string;
};

/** Slim marker payload for viewport queries (no long text fields). */
export type BlockMarker = Pick<
	Block,
	| 'id'
	| 'source'
	| 'fornsok_id'
	| 'name'
	| 'lamningstyp'
	| 'egenskapsvarde'
	| 'lat'
	| 'lng'
	| 'climb_score'
	| 'county'
	| 'municipality'
>;

export type MapBBox = {
	west: number;
	south: number;
	east: number;
	north: number;
};

type Tables = {
	blocks: {
		Row: Block;
		Insert: {
			id?: string;
			source: BlockSource;
			fornsok_id?: string | null;
			name: string;
			description?: string | null;
			lamningstyp?: string | null;
			egenskapsvarde?: string | null;
			lat: number;
			lng: number;
			climb_score?: number | null;
			score_rationale?: string | null;
			county?: string | null;
			municipality?: string | null;
			created_by?: string | null;
			created_at?: string;
			updated_at?: string;
		};
		Update: Partial<Tables['blocks']['Insert']>;
		Relationships: [];
	};
	photos: {
		Row: Photo;
		Insert: {
			id?: string;
			block_id: string;
			user_id: string;
			storage_path: string;
			caption?: string | null;
			created_at?: string;
		};
		Update: Partial<Tables['photos']['Insert']>;
		Relationships: [];
	};
	profiles: {
		Row: Profile;
		Insert: {
			id: string;
			display_name?: string | null;
			created_at?: string;
		};
		Update: Partial<Tables['profiles']['Insert']>;
		Relationships: [];
	};
};

export type Database = {
	public: {
		Tables: Tables;
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: {
			block_source: BlockSource;
		};
		CompositeTypes: Record<string, never>;
	};
};
