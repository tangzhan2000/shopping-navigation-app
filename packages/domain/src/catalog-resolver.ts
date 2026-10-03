import type {
  CatalogCandidate,
  CatalogResolveRequest,
  CatalogResolveResponse,
  CanonicalProduct,
  Offer,
  ProductVariant,
  SourceListing,
} from '@shopping-navigation/contracts';
import { classifyVariantMatch, validateCanonicalProduct } from './catalog-matching.js';

export interface FixtureCatalogEntry {
  readonly product: CanonicalProduct;
  readonly variant: ProductVariant;
  readonly listing: SourceListing;
  readonly offer?: Offer;
  readonly requiredAttributes: readonly string[];
  readonly exactQueries: readonly string[];
}

export interface CatalogResolver {
  resolve(request: CatalogResolveRequest): CatalogResolveResponse;
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');

export function createFixtureCatalogResolver(entries: readonly FixtureCatalogEntry[], now = new Date('2026-10-01T00:05:00.000Z')): CatalogResolver {
  return {
    resolve(request) {
      const query = normalize(request.query ?? '');
      const url = request.url?.trim();
      if ((!query && !url) || request.country !== 'CN' || request.currency !== 'CNY' || !Number.isInteger(request.quantity) || request.quantity < 1) {
        throw new Error('Catalog resolve requires a query or URL and a valid CN/CNY quantity');
      }
      const sourceIds = request.sourceIds?.length ? [...request.sourceIds] : ['fixture-shop-a'];
      const candidates: CatalogCandidate[] = [];
      for (const entry of entries) {
        if (!sourceIds.includes(entry.listing.sourceId)) continue;
        validateCanonicalProduct(entry.product);
        if (entry.variant.productId !== entry.product.productId || entry.listing.variantId !== entry.variant.variantId) continue;
        if (url && entry.listing.url !== url) continue;
        if (query && url === undefined && !entry.exactQueries.some((alias) => normalize(alias) === query)
          && !normalize(`${entry.product.brand ?? ''} ${entry.product.title} ${Object.values(entry.variant.attributes).join(' ')}`).includes(query)) continue;
        const explicitlyIdentified = (query && entry.exactQueries.some((alias) => normalize(alias) === query)) || (url && entry.listing.url === url);
        const requested: ProductVariant = {
          variantId: 'requested', productId: entry.product.productId,
          attributes: Object.fromEntries(entry.requiredAttributes.map((key) => [key, explicitlyIdentified ? entry.variant.attributes[key] ?? '' : ''])),
          identifiers: {},
        };
        const evidence = classifyVariantMatch({ requested, candidate: entry.variant, requiredAttributes: entry.requiredAttributes });
        const offer = explicitlyIdentified && entry.offer && entry.offer.variantId === entry.variant.variantId && entry.offer.listingId === entry.listing.listingId
          && entry.offer.sourceId === entry.listing.sourceId && entry.offer.price.evidenceId === entry.offer.evidenceId ? entry.offer : undefined;
        const priceState = offer?.price.priceState ?? 'unknown';
        const fresh = offer ? Date.parse(offer.price.expiresAt) >= now.getTime() : false;
        candidates.push({
          candidateId: entry.variant.variantId,
          product: entry.product,
          variant: entry.variant,
          listing: entry.listing,
          matchLevel: evidence.level,
          reasons: explicitlyIdentified ? evidence.reasons : ['Catalog entry is not an exact recognized query or URL'],
          missingAttributes: evidence.missingAttributes,
          evidenceIds: [...entry.product.evidenceIds, ...(offer ? [offer.evidenceId] : [])],
          ...(offer === undefined ? {} : { offer }),
          priceState: fresh ? priceState : 'stale',
        });
      }
      candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
      return { candidates, queriedSourceIds: sourceIds, ...(candidates.length ? {} : { notice: 'No evidence-backed catalog candidate was found' }) };
    },
  };
}
