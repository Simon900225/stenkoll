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
	/** Community override; when set, shown on the map instead of climb_score. */
	user_score: number | null;
	score_rationale: string | null;
	height_m: number | null;
	length_m: number | null;
	width_m: number | null;
	area_m2: number | null;
	size_source: 'parsed' | 'llm' | 'manual' | null;
	county: string | null;
	municipality: string | null;
	has_photo: boolean;
	/** Community flag: boulder is developed / established. */
	developed: boolean;
	/** Who last set user_score (null when cleared). */
	user_score_by?: string | null;
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
	| 'user_score'
	| 'height_m'
	| 'area_m2'
	| 'county'
	| 'municipality'
	| 'has_photo'
	| 'developed'
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
			user_score?: number | null;
			score_rationale?: string | null;
			height_m?: number | null;
			length_m?: number | null;
			width_m?: number | null;
			area_m2?: number | null;
			size_source?: 'parsed' | 'llm' | 'manual' | null;
			county?: string | null;
			municipality?: string | null;
			has_photo?: boolean;
			developed?: boolean;
			user_score_by?: string | null;
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
		Functions: {
			set_block_user_score: {
				Args: { p_block_id: string; p_score: number | null };
				Returns: Block;
			};
			set_block_developed: {
				Args: { p_block_id: string; p_developed: boolean };
				Returns: Block;
			};
		};
		Enums: {
			block_source: BlockSource;
		};
		CompositeTypes: Record<string, never>;
	};
};
