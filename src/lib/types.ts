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
	height_m: number | null;
	length_m: number | null;
	width_m: number | null;
	area_m2: number | null;
	size_source: 'parsed' | 'llm' | 'manual' | null;
	county: string | null;
	municipality: string | null;
	has_photo: boolean;
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

export type PhotoFilter = 'all' | 'with' | 'without';

export type BlockFilters = {
	minScore: number;
	minHeight: number;
	minArea: number;
	sources: BlockSource[];
	municipality: string;
	photoFilter: PhotoFilter;
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
	| 'height_m'
	| 'area_m2'
	| 'county'
	| 'municipality'
	| 'has_photo'
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
			height_m?: number | null;
			length_m?: number | null;
			width_m?: number | null;
			area_m2?: number | null;
			size_source?: 'parsed' | 'llm' | 'manual' | null;
			county?: string | null;
			municipality?: string | null;
			has_photo?: boolean;
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
