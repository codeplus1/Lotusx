/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultRecord } from '../types/vault';

export type SearchScope = 'domain_or_title' | 'domain' | 'title' | 'all';

export interface ISearchService {
  search(
    records: VaultRecord[],
    query: string,
    categoryFilter?: string,
    tagFilter?: string,
    scope?: SearchScope
  ): VaultRecord[];
  extractDomain(url?: string): string;
  filterByDomainOrTitle(
    records: VaultRecord[],
    query: string,
    categoryFilter?: string,
    tagFilter?: string
  ): VaultRecord[];
}

export class SearchService implements ISearchService {
  /**
   * Extracts clean hostname/domain from a website URL, removing protocol, port, paths, and www prefix.
   */
  extractDomain(url?: string): string {
    if (!url) return '';
    const trimmed = url.trim().toLowerCase();
    try {
      const withProtocol =
        trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? trimmed
          : `https://${trimmed}`;
      const parsed = new URL(withProtocol);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return trimmed
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .split('/')[0]
        .split('?')[0]
        .split('#')[0]
        .split(':')[0];
    }
  }

  /**
   * Filters records strictly by website domain or account title in real-time.
   */
  filterByDomainOrTitle(
    records: VaultRecord[],
    query: string,
    categoryFilter?: string,
    tagFilter?: string
  ): VaultRecord[] {
    const trimmed = query.trim().toLowerCase();
    const queryDomain = this.extractDomain(trimmed);

    return records.filter((rec) => {
      // Category filter
      if (categoryFilter && categoryFilter !== 'all') {
        if (categoryFilter === 'favorites') {
          if (!rec.favorite) return false;
        } else if (rec.category !== categoryFilter) {
          return false;
        }
      }

      // Tag filter
      if (tagFilter && !rec.tags?.some((t) => t.toLowerCase() === tagFilter.toLowerCase())) {
        return false;
      }

      // Query filter
      if (!trimmed) return true;

      // 1. Account Title matching
      const titleMatch = Boolean(rec.title?.toLowerCase().includes(trimmed));

      // 2. Website Domain matching
      const recDomain = this.extractDomain(rec.website);
      const rawWebsite = rec.website?.toLowerCase() || '';

      const domainMatch = Boolean(
        (recDomain && (
          recDomain.includes(trimmed) ||
          (queryDomain && recDomain.includes(queryDomain)) ||
          trimmed.includes(recDomain)
        )) ||
        (rawWebsite && (
          rawWebsite.includes(trimmed) ||
          (queryDomain && rawWebsite.includes(queryDomain))
        ))
      );

      return titleMatch || domainMatch;
    });
  }

  /**
   * Performs an in-memory search across unlocked records without writing unencrypted indexes to disk.
   */
  search(
    records: VaultRecord[],
    query: string,
    categoryFilter?: string,
    tagFilter?: string,
    scope: SearchScope = 'all'
  ): VaultRecord[] {
    const trimmed = query.trim().toLowerCase();
    const queryDomain = this.extractDomain(trimmed);

    return records.filter((rec) => {
      // Category filter
      if (categoryFilter && categoryFilter !== 'all') {
        if (categoryFilter === 'favorites') {
          if (!rec.favorite) return false;
        } else if (rec.category !== categoryFilter) {
          return false;
        }
      }

      // Tag filter
      if (tagFilter && !rec.tags?.some((t) => t.toLowerCase() === tagFilter.toLowerCase())) {
        return false;
      }

      // Query filter
      if (!trimmed) return true;

      const titleMatch = Boolean(rec.title?.toLowerCase().includes(trimmed));
      const recDomain = this.extractDomain(rec.website);
      const rawWebsite = rec.website?.toLowerCase() || '';
      const domainMatch = Boolean(
        (recDomain && (
          recDomain.includes(trimmed) ||
          (queryDomain && recDomain.includes(queryDomain)) ||
          trimmed.includes(recDomain)
        )) ||
        (rawWebsite && (
          rawWebsite.includes(trimmed) ||
          (queryDomain && rawWebsite.includes(queryDomain))
        ))
      );

      if (scope === 'domain_or_title') {
        return titleMatch || domainMatch;
      }
      if (scope === 'title') {
        return titleMatch;
      }
      if (scope === 'domain') {
        return domainMatch;
      }

      // Default 'all': checks title, domain, username, website, category, and category-specific non-secret metadata
      const userMatch = Boolean(
        rec.username?.toLowerCase().includes(trimmed) ||
          rec.email?.toLowerCase().includes(trimmed) ||
          rec.bankName?.toLowerCase().includes(trimmed) ||
          rec.issuingBank?.toLowerCase().includes(trimmed) ||
          rec.cardholderName?.toLowerCase().includes(trimmed) ||
          rec.accountHolderName?.toLowerCase().includes(trimmed) ||
          rec.identityDetails?.fullName?.toLowerCase().includes(trimmed) ||
          rec.identityDetails?.documentType?.toLowerCase().includes(trimmed) ||
          rec.wifiDetails?.ssid?.toLowerCase().includes(trimmed)
      );
      const categoryMatch = Boolean(rec.category?.toLowerCase().includes(trimmed));

      return titleMatch || domainMatch || userMatch || categoryMatch;
    });
  }
}

export const searchService = new SearchService();
