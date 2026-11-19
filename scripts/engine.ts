/**
 * The one DeepEpisteme engine instance this repository uses.
 *
 * The engine is pinned by commit in package.json and holds no module state:
 * everything it answers is closed over the deployment below. The deployment is
 * Tunisia's own parameters and vocabulary, loaded the same way the local
 * bindings in scripts/dates.ts and scripts/schema.ts are configured: from
 * data/parameters.yaml, with the vocabularies scripts/schema.ts declares.
 *
 * The canonical projection and hash (engine.canonical) and the YAML splicer
 * (engine.splicer) are reached through this instance, so a second engine built
 * from different parameters cannot quietly appear beside them. The engine
 * instance is the one scripts/test-engine-conformance.ts runs through its
 * contract, so a bad bump fails CI before anything here answers differently.
 */
import { fileURLToPath } from 'node:url';
import { createEngine, type Deployment, type Engine } from 'deepepisteme';
import { loadParameters } from './parameters.ts';
import {
	AgreementKind,
	EDGE_DIRECTION,
	INFLUENCE_CHANNELS,
	InstitutionType,
	Layer,
	PlaceKind,
	RegionKind,
	RelationshipType
} from './schema.ts';

/** Tunisia's parameters, loaded once per process from data/parameters.yaml. */
export const parameters = loadParameters(
	fileURLToPath(new URL('../data/parameters.yaml', import.meta.url))
);

/**
 * Tunisia as a deployment. The engine holds no configuration of its own, so
 * every value below comes from data/parameters.yaml or from a vocabulary that
 * scripts/schema.ts already declares.
 */
export const deployment: Deployment = {
	name: parameters.jurisdiction.name,
	time: parameters.time,
	translatedLocales: ['fr', 'ar'],
	sourceLanguages: ['ar', 'fr', 'en'],
	gazette: parameters.jurisdiction.gazette,
	registry: parameters.jurisdiction.registry,
	bbox: parameters.jurisdiction.bbox,
	/** The strict form of these labels is REVIEWER_LABEL in scripts/schema.ts. */
	reviewerLabels: ['maintainer', 'Initial compilation', 'JORT verification pass'],
	index: parameters.index,
	vocabulary: {
		layers: [...Layer.options],
		institutionTypes: [...InstitutionType.options],
		relationshipTypes: [...RelationshipType.options],
		edgeDirection: EDGE_DIRECTION,
		influenceChannels: [...INFLUENCE_CHANNELS],
		agreementKinds: [...AgreementKind.options],
		placeKinds: [...PlaceKind.options],
		regionKinds: [...RegionKind.options]
	},
	/** The matcher's word lists move with the matcher (slice 5). */
	matcher: { particles: [], functionWords: [], splittablePrefixes: [] }
};

/** The one engine. Nothing else in this tree may call createEngine. */
export const engine: Engine = createEngine(deployment);
